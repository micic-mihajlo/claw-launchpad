import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type AuthChoice = "skip" | "minimax-api" | "anthropic-api-key" | "openai-api-key";
export type DiscordGroupPolicy = "open" | "allowlist" | "disabled";
export type DeploymentStatus = "pending" | "provisioning" | "running" | "failed" | "canceled";
export type DeploymentTask = "provision" | "destroy" | null;

export type DeploymentConfig = {
  name: string;
  serverType: string;
  image: string;
  location: string;
  tailscaleHostname?: string;
  authChoice: AuthChoice;
  discordGroupPolicy: DiscordGroupPolicy;
  discordGuildId?: string;
  discordChannelIds?: string[];
};

export type DeploymentSecrets = {
  hetznerApiToken: string;
  tailscaleAuthKey: string;
  minimaxApiKey?: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  discordBotToken?: string;
};

type DeploymentRow = {
  id: string;
  provider: string;
  name: string;
  owner_user_id: string;
  status: DeploymentStatus;
  active_task: DeploymentTask;
  config_json: string;
  secrets_encrypted: string;
  metadata_json: string | null;
  billing_ref: string | null;
  server_id: number | null;
  server_name: string | null;
  server_ip: string | null;
  ssh_key_id: number | null;
  gateway_token_encrypted: string | null;
  tailnet_url: string | null;
  cancel_requested_at: string | null;
  error_message: string | null;
  lease_owner: string | null;
  lease_expires_at: number | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type DeploymentPublic = {
  id: string;
  provider: string;
  name: string;
  ownerUserId: string;
  status: DeploymentStatus;
  activeTask: DeploymentTask;
  config: DeploymentConfig;
  metadata: Record<string, unknown>;
  billingRef: string | null;
  resources: {
    serverId: number | null;
    serverName: string | null;
    serverIp: string | null;
    sshKeyId: number | null;
  };
  tailnetUrl: string | null;
  cancelRequestedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type DeploymentEvent = {
  id: number;
  deploymentId: string;
  type: string;
  message: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type DeploymentInternal = DeploymentPublic & {
  secretsEncrypted: string;
  gatewayTokenEncrypted: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: number | null;
};

export type DeploymentsStoreHooks = {
  onDeploymentChanged?: (deployment: DeploymentPublic) => void | Promise<void>;
  onEventAppended?: (event: DeploymentEvent) => void | Promise<void>;
};

function nowIso() {
  return new Date().toISOString();
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function hasOwn(o: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, key);
}

export class DeploymentsStore {
  readonly #db: Database.Database;
  readonly #hooks: DeploymentsStoreHooks;

  constructor(dbPath: string, hooks: DeploymentsStoreHooks = {}) {
    const absolutePath = path.resolve(dbPath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    this.#db = new Database(absolutePath);
    this.#db.pragma("journal_mode = WAL");
    this.#db.pragma("foreign_keys = ON");
    this.#hooks = hooks;
    this.#init();
  }

  #init() {
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS deployments (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        name TEXT NOT NULL,
        owner_user_id TEXT NOT NULL DEFAULT 'system',
        status TEXT NOT NULL CHECK(status IN ('pending','provisioning','running','failed','canceled')),
        active_task TEXT NULL CHECK(active_task IN ('provision','destroy')),
        config_json TEXT NOT NULL,
        secrets_encrypted TEXT NOT NULL,
        metadata_json TEXT NULL,
        billing_ref TEXT NULL,
        server_id INTEGER NULL,
        server_name TEXT NULL,
        server_ip TEXT NULL,
        ssh_key_id INTEGER NULL,
        gateway_token_encrypted TEXT NULL,
        tailnet_url TEXT NULL,
        cancel_requested_at TEXT NULL,
        error_message TEXT NULL,
        lease_owner TEXT NULL,
        lease_expires_at INTEGER NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT NULL,
        completed_at TEXT NULL
      );

      CREATE TABLE IF NOT EXISTS deployment_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deployment_id TEXT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        payload_json TEXT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status, active_task, created_at);
      CREATE INDEX IF NOT EXISTS idx_deployments_cancel ON deployments(cancel_requested_at);
      CREATE INDEX IF NOT EXISTS idx_deployments_lease ON deployments(lease_expires_at);
      CREATE INDEX IF NOT EXISTS idx_deployments_owner_user_id ON deployments(owner_user_id);
      CREATE INDEX IF NOT EXISTS idx_deployment_events_deployment ON deployment_events(deployment_id, id DESC);
    `);

    const columns = this.#db.prepare("PRAGMA table_info(deployments)").all() as Array<{ name: string }>;
    const hasOwnerUserId = columns.some((column) => column.name === "owner_user_id");
    if (!hasOwnerUserId) {
      this.#db.exec(`
        ALTER TABLE deployments ADD COLUMN owner_user_id TEXT NOT NULL DEFAULT 'system';
      `);
      this.#db.exec(`
        CREATE INDEX IF NOT EXISTS idx_deployments_owner_user_id ON deployments(owner_user_id);
      `);
    }
  }

  close() {
    this.#db.close();
  }

  #notifyDeploymentChanged(deployment: DeploymentPublic) {
    if (!this.#hooks.onDeploymentChanged) return;
    void Promise.resolve(this.#hooks.onDeploymentChanged(deployment)).catch((error) => {
      console.error("DeploymentsStore onDeploymentChanged hook failed", error);
    });
  }

  #notifyDeploymentChangedById(deploymentId: string) {
    const deployment = this.getPublic(deploymentId);
    if (!deployment) return;
    this.#notifyDeploymentChanged(deployment);
  }

  #notifyEventAppended(event: DeploymentEvent) {
    if (!this.#hooks.onEventAppended) return;
    void Promise.resolve(this.#hooks.onEventAppended(event)).catch((error) => {
      console.error("DeploymentsStore onEventAppended hook failed", error);
    });
  }

  #insertEvent(
    deploymentId: string,
    type: string,
    message: string,
    payload?: Record<string, unknown>,
    createdAt = nowIso(),
  ): DeploymentEvent {
    const result = this.#db
      .prepare(
        `
      INSERT INTO deployment_events (
        deployment_id, type, message, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `,
      )
      .run(
        deploymentId,
        type,
        message,
        payload ? JSON.stringify(payload) : null,
        createdAt,
      );

    return {
      id: Number(result.lastInsertRowid),
      deploymentId,
      type,
      message,
      payload: payload ?? {},
      createdAt,
    };
  }

  #toPublic(row: DeploymentRow): DeploymentPublic {
    return {
      id: row.id,
      provider: row.provider,
      name: row.name,
      ownerUserId: row.owner_user_id,
      status: row.status,
      activeTask: row.active_task,
      config: parseJson<DeploymentConfig>(row.config_json, {
        name: row.name,
        serverType: "cx23",
        image: "ubuntu-24.04",
        location: "nbg1",
        authChoice: "skip",
        discordGroupPolicy: "allowlist",
      }),
      metadata: parseJson<Record<string, unknown>>(row.metadata_json, {}),
      billingRef: row.billing_ref,
      resources: {
        serverId: row.server_id,
        serverName: row.server_name,
        serverIp: row.server_ip,
        sshKeyId: row.ssh_key_id,
      },
      tailnetUrl: row.tailnet_url,
      cancelRequestedAt: row.cancel_requested_at,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
    };
  }

  #toInternal(row: DeploymentRow): DeploymentInternal {
    return {
      ...this.#toPublic(row),
      secretsEncrypted: row.secrets_encrypted,
      gatewayTokenEncrypted: row.gateway_token_encrypted,
      leaseOwner: row.lease_owner,
      leaseExpiresAt: row.lease_expires_at,
    };
  }

  #getRow(id: string): DeploymentRow | null {
    return (
      (this.#db
        .prepare(
          `
      SELECT * FROM deployments WHERE id = ?
    `,
        )
        .get(id) as DeploymentRow | undefined) ?? null
    );
  }

  getInternal(id: string): DeploymentInternal | null {
    const row = this.#getRow(id);
    if (!row) return null;
    return this.#toInternal(row);
  }

  getPublic(id: string): DeploymentPublic | null {
    const row = this.#getRow(id);
    if (!row) return null;
    return this.#toPublic(row);
  }

  getPublicForOwner(ownerUserId: string, id: string): DeploymentPublic | null {
    const row = this.#getRowForOwner(ownerUserId, id);
    if (!row) return null;
    return this.#toPublic(row);
  }

  listPublic(ownerUserId: string, limit = 50, offset = 0): DeploymentPublic[] {
    const rows = this.#db
      .prepare(
        `
      SELECT * FROM deployments
      WHERE owner_user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `,
      )
      .all(ownerUserId, limit, offset) as DeploymentRow[];
    return rows.map((row) => this.#toPublic(row));
  }

  listPublicAll(limit = 50, offset = 0): DeploymentPublic[] {
    const rows = this.#db
      .prepare(
        `
      SELECT * FROM deployments
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `,
      )
      .all(limit, offset) as DeploymentRow[];
    return rows.map((row) => this.#toPublic(row));
  }

  #getRowForOwner(ownerUserId: string, id: string): DeploymentRow | null {
    return (
      (this.#db
        .prepare(
          `
      SELECT * FROM deployments WHERE id = ? AND owner_user_id = ?
    `,
        )
        .get(id, ownerUserId) as DeploymentRow | undefined) ?? null
    );
  }

  listEvents(deploymentId: string, limit = 200): DeploymentEvent[] {
    const rows = this.#db
      .prepare(
        `
      SELECT id, deployment_id, type, message, payload_json, created_at
      FROM deployment_events
      WHERE deployment_id = ?
      ORDER BY id DESC
      LIMIT ?
    `,
      )
      .all(deploymentId, limit) as Array<{
      id: number;
      deployment_id: string;
      type: string;
      message: string;
      payload_json: string | null;
      created_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      deploymentId: row.deployment_id,
      type: row.type,
      message: row.message,
      payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
      createdAt: row.created_at,
    }));
  }

  appendEvent(
    deploymentId: string,
    type: string,
    message: string,
    payload?: Record<string, unknown>,
  ): DeploymentEvent {
    const event = this.#insertEvent(deploymentId, type, message, payload);
    this.#notifyEventAppended(event);
    return event;
  }

  createDeployment(input: {
    id: string;
    provider: "hetzner";
    ownerUserId: string;
    name: string;
    config: DeploymentConfig;
    secretsEncrypted: string;
    metadata?: Record<string, unknown>;
    billingRef?: string;
  }): DeploymentPublic {
    const createdAt = nowIso();
    this.#db
      .prepare(
      `
      INSERT INTO deployments (
        id, provider, name, owner_user_id, status, active_task, config_json, secrets_encrypted,
        metadata_json, billing_ref, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'pending', NULL, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        input.id,
        input.provider,
        input.name,
        input.ownerUserId,
        JSON.stringify(input.config),
        input.secretsEncrypted,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.billingRef ?? null,
        createdAt,
        createdAt,
      );

    this.appendEvent(input.id, "deployment.created", "Deployment created and queued", {
      provider: input.provider,
      name: input.name,
    });

    const created = this.getPublic(input.id);
    if (!created) {
      throw new Error("Failed to read deployment after create");
    }
    this.#notifyDeploymentChanged(created);
    return created;
  }

  requestCancel(ownerUserId: string, id: string, reason?: string): DeploymentPublic | null {
    const existing = this.#getRowForOwner(ownerUserId, id);
    if (!existing) return null;

    if (existing.status === "canceled") {
      return this.#toPublic(existing);
    }
    if (existing.status === "failed") {
      return this.#toPublic(existing);
    }

    const updatedAt = nowIso();
    const canceledAt = nowIso();
    if (existing.status === "pending") {
      const row = this.#db
        .prepare(
      `
        UPDATE deployments
        SET
          status = 'canceled',
          active_task = NULL,
          cancel_requested_at = COALESCE(cancel_requested_at, ?),
          error_message = NULL,
          lease_owner = NULL,
          lease_expires_at = NULL,
          completed_at = ?,
          updated_at = ?
        WHERE id = ? AND owner_user_id = ?
        RETURNING *
      `,
        )
        .get(canceledAt, canceledAt, updatedAt, id, ownerUserId) as DeploymentRow | undefined;
      if (row) {
        this.appendEvent(id, "deployment.canceled", "Deployment canceled before provisioning started", {
          reason: reason ?? "cancel requested",
        });
        const deployment = this.#toPublic(row);
        this.#notifyDeploymentChanged(deployment);
        return deployment;
      }
      return this.getPublic(id);
    }

    const row = this.#db
      .prepare(
      `
      UPDATE deployments
      SET
        cancel_requested_at = COALESCE(cancel_requested_at, ?),
        updated_at = ?
      WHERE id = ? AND owner_user_id = ? AND status IN ('running', 'provisioning')
      RETURNING *
    `,
      )
      .get(canceledAt, updatedAt, id, ownerUserId) as DeploymentRow | undefined;
    if (!row) {
      return this.getPublic(id);
    }

    this.appendEvent(id, "deployment.cancel.requested", "Cancel requested; cleanup will be attempted", {
      status: row.status,
      reason: reason ?? "cancel requested",
    });
    const deployment = this.#toPublic(row);
    this.#notifyDeploymentChanged(deployment);
    return deployment;
  }

  retryDeployment(ownerUserId: string, id: string): DeploymentPublic | null {
    const existing = this.#getRowForOwner(ownerUserId, id);
    if (!existing) return null;
    if (!["failed", "canceled"].includes(existing.status)) {
      throw new Error("Only failed or canceled deployments can be retried");
    }
    if (existing.server_id || existing.ssh_key_id) {
      throw new Error("Cannot retry while provider resources are still attached");
    }

    const updatedAt = nowIso();
    const row = this.#db
      .prepare(
      `
      UPDATE deployments
      SET
        status = 'pending',
        active_task = NULL,
        error_message = NULL,
        cancel_requested_at = NULL,
        lease_owner = NULL,
        lease_expires_at = NULL,
        started_at = NULL,
        completed_at = NULL,
        tailnet_url = NULL,
        gateway_token_encrypted = NULL,
        updated_at = ?
      WHERE id = ? AND owner_user_id = ?
      RETURNING *
    `,
      )
      .get(updatedAt, id, ownerUserId) as DeploymentRow | undefined;
    if (!row) {
      return this.getPublic(id);
    }

    this.appendEvent(id, "deployment.retried", "Deployment moved back to pending");
    const deployment = this.#toPublic(row);
    this.#notifyDeploymentChanged(deployment);
    return deployment;
  }

  recoverExpiredProvisionLeases(nowMs = Date.now()) {
    const staleRows = this.#db
      .prepare(
        `
      SELECT * FROM deployments
      WHERE
        status = 'provisioning'
        AND active_task = 'provision'
        AND lease_expires_at IS NOT NULL
        AND lease_expires_at < ?
    `,
      )
      .all(nowMs) as DeploymentRow[];

    if (staleRows.length === 0) return;

    const pendingEventNotifications: DeploymentEvent[] = [];
    const tx = this.#db.transaction((rows: DeploymentRow[]) => {
      const updatedAt = nowIso();
      for (const row of rows) {
        if (row.server_id || row.ssh_key_id || row.cancel_requested_at) {
          this.#db
            .prepare(
              `
            UPDATE deployments
            SET
              active_task = 'destroy',
              lease_owner = NULL,
              lease_expires_at = NULL,
              updated_at = ?,
              error_message = COALESCE(error_message, ?)
            WHERE id = ?
          `,
            )
            .run(
              updatedAt,
              "Worker lease expired during provisioning; scheduling cleanup",
              row.id,
            );
          pendingEventNotifications.push(
            this.#insertEvent(
              row.id,
              "deployment.recovered.destroy_queued",
              "Worker lease expired; queued cleanup to avoid orphaned resources",
              undefined,
              updatedAt,
            ),
          );
        } else {
          this.#db
            .prepare(
              `
            UPDATE deployments
            SET
              status = 'failed',
              active_task = NULL,
              lease_owner = NULL,
              lease_expires_at = NULL,
              completed_at = ?,
              updated_at = ?,
              error_message = ?
            WHERE id = ?
          `,
            )
            .run(
              updatedAt,
              updatedAt,
              "Worker lease expired before resources were attached",
              row.id,
            );
          pendingEventNotifications.push(
            this.#insertEvent(
              row.id,
              "deployment.failed",
              "Worker lease expired before provisioning completed",
              undefined,
              updatedAt,
            ),
          );
        }
      }
    });
    tx(staleRows);
    for (const event of pendingEventNotifications) {
      this.#notifyEventAppended(event);
    }
    for (const row of staleRows) {
      this.#notifyDeploymentChangedById(row.id);
    }
  }

  leaseNextDestroyJob(workerId: string, leaseMs: number): DeploymentInternal | null {
    const updatedAt = nowIso();
    const nowMs = Date.now();
    const leaseExpiresAt = nowMs + leaseMs;

    const row = this.#db
      .prepare(
        `
      UPDATE deployments
      SET
        status = 'provisioning',
        active_task = 'destroy',
        lease_owner = ?,
        lease_expires_at = ?,
        updated_at = ?,
        started_at = COALESCE(started_at, ?)
      WHERE id = (
        SELECT id FROM deployments
        WHERE (
          (status = 'running' AND cancel_requested_at IS NOT NULL)
          OR (status = 'provisioning' AND active_task = 'destroy')
        )
        AND (lease_owner IS NULL OR lease_expires_at IS NULL OR lease_expires_at < ?)
        ORDER BY COALESCE(cancel_requested_at, updated_at) ASC
        LIMIT 1
      )
      RETURNING *
    `,
      )
      .get(workerId, leaseExpiresAt, updatedAt, updatedAt, nowMs) as DeploymentRow | undefined;

    if (!row) return null;
    if (row.status === "provisioning" && row.active_task === "destroy") {
      this.appendEvent(row.id, "deployment.destroy.started", "Cleanup job leased by worker", {
        workerId,
      });
    }
    const deployment = this.#toInternal(row);
    this.#notifyDeploymentChanged(deployment);
    return deployment;
  }

  leaseNextProvisionJob(workerId: string, leaseMs: number): DeploymentInternal | null {
    const updatedAt = nowIso();
    const leaseExpiresAt = Date.now() + leaseMs;
    const row = this.#db
      .prepare(
        `
      UPDATE deployments
      SET
        status = 'provisioning',
        active_task = 'provision',
        lease_owner = ?,
        lease_expires_at = ?,
        updated_at = ?,
        started_at = COALESCE(started_at, ?)
      WHERE id = (
        SELECT id FROM deployments
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 1
      )
      RETURNING *
    `,
      )
      .get(workerId, leaseExpiresAt, updatedAt, updatedAt) as DeploymentRow | undefined;
    if (!row) return null;
    this.appendEvent(row.id, "deployment.provision.started", "Provisioning job leased by worker", {
      workerId,
    });
    const deployment = this.#toInternal(row);
    this.#notifyDeploymentChanged(deployment);
    return deployment;
  }

  renewLease(id: string, workerId: string, leaseMs: number): boolean {
    const updatedAt = nowIso();
    const leaseExpiresAt = Date.now() + leaseMs;
    const result = this.#db
      .prepare(
        `
      UPDATE deployments
      SET lease_expires_at = ?, updated_at = ?
      WHERE id = ? AND status = 'provisioning' AND lease_owner = ?
    `,
      )
      .run(leaseExpiresAt, updatedAt, id, workerId);
    return result.changes > 0;
  }

  releaseLease(id: string, workerId: string): boolean {
    const updatedAt = nowIso();
    const result = this.#db
      .prepare(
        `
      UPDATE deployments
      SET lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
      WHERE id = ? AND lease_owner = ?
    `,
      )
      .run(updatedAt, id, workerId);
    return result.changes > 0;
  }

  isCancelRequested(id: string): boolean {
    const row = this.#db
      .prepare(
        `
      SELECT cancel_requested_at FROM deployments WHERE id = ?
    `,
      )
      .get(id) as { cancel_requested_at: string | null } | undefined;
    return Boolean(row?.cancel_requested_at);
  }

  updateResourceState(
    id: string,
    workerId: string,
    patch: {
      serverId?: number | null;
      serverName?: string | null;
      serverIp?: string | null;
      sshKeyId?: number | null;
      tailnetUrl?: string | null;
      gatewayTokenEncrypted?: string | null;
    },
  ): DeploymentInternal | null {
    const current = this.#getRow(id);
    if (!current) return null;
    if (current.status !== "provisioning" || current.lease_owner !== workerId) return null;

    const nextServerId = hasOwn(patch, "serverId") ? patch.serverId ?? null : current.server_id;
    const nextServerName = hasOwn(patch, "serverName") ? patch.serverName ?? null : current.server_name;
    const nextServerIp = hasOwn(patch, "serverIp") ? patch.serverIp ?? null : current.server_ip;
    const nextSshKeyId = hasOwn(patch, "sshKeyId") ? patch.sshKeyId ?? null : current.ssh_key_id;
    const nextTailnetUrl = hasOwn(patch, "tailnetUrl") ? patch.tailnetUrl ?? null : current.tailnet_url;
    const nextGatewayTokenEncrypted = hasOwn(patch, "gatewayTokenEncrypted")
      ? patch.gatewayTokenEncrypted ?? null
      : current.gateway_token_encrypted;

    const updatedAt = nowIso();
    const row = this.#db
      .prepare(
        `
      UPDATE deployments
      SET
        server_id = ?,
        server_name = ?,
        server_ip = ?,
        ssh_key_id = ?,
        tailnet_url = ?,
        gateway_token_encrypted = ?,
        updated_at = ?
      WHERE id = ? AND status = 'provisioning' AND lease_owner = ?
      RETURNING *
    `,
      )
      .get(
        nextServerId,
        nextServerName,
        nextServerIp,
        nextSshKeyId,
        nextTailnetUrl,
        nextGatewayTokenEncrypted,
        updatedAt,
        id,
        workerId,
      ) as DeploymentRow | undefined;

    if (!row) return null;
    const deployment = this.#toInternal(row);
    this.#notifyDeploymentChanged(deployment);
    return deployment;
  }

  markRunning(
    id: string,
    workerId: string,
    payload: {
      serverId: number;
      serverName: string;
      serverIp: string;
      sshKeyId: number | null;
      tailnetUrl: string | null;
      gatewayTokenEncrypted: string;
    },
  ): DeploymentPublic | null {
    const updatedAt = nowIso();
    const row = this.#db
      .prepare(
        `
      UPDATE deployments
      SET
        status = 'running',
        active_task = NULL,
        server_id = ?,
        server_name = ?,
        server_ip = ?,
        ssh_key_id = ?,
        tailnet_url = ?,
        gateway_token_encrypted = ?,
        error_message = NULL,
        cancel_requested_at = NULL,
        lease_owner = NULL,
        lease_expires_at = NULL,
        updated_at = ?
      WHERE id = ?
        AND status = 'provisioning'
        AND active_task = 'provision'
        AND lease_owner = ?
      RETURNING *
    `,
      )
      .get(
        payload.serverId,
        payload.serverName,
        payload.serverIp,
        payload.sshKeyId,
        payload.tailnetUrl,
        payload.gatewayTokenEncrypted,
        updatedAt,
        id,
        workerId,
      ) as DeploymentRow | undefined;
    if (!row) return null;
    this.appendEvent(id, "deployment.running", "Provisioning completed successfully", {
      serverId: payload.serverId,
      serverIp: payload.serverIp,
      tailnetUrl: payload.tailnetUrl,
    });
    const deployment = this.#toPublic(row);
    this.#notifyDeploymentChanged(deployment);
    return deployment;
  }

  markCanceledFromProvisioning(id: string, workerId: string): DeploymentPublic | null {
    const updatedAt = nowIso();
    const row = this.#db
      .prepare(
        `
      UPDATE deployments
      SET
        status = 'canceled',
        active_task = NULL,
        error_message = NULL,
        lease_owner = NULL,
        lease_expires_at = NULL,
        server_id = NULL,
        server_name = NULL,
        server_ip = NULL,
        ssh_key_id = NULL,
        tailnet_url = NULL,
        gateway_token_encrypted = NULL,
        completed_at = ?,
        updated_at = ?
      WHERE id = ?
        AND status = 'provisioning'
        AND active_task = 'provision'
        AND lease_owner = ?
      RETURNING *
    `,
      )
      .get(updatedAt, updatedAt, id, workerId) as DeploymentRow | undefined;
    if (!row) return null;
    this.appendEvent(id, "deployment.canceled", "Provisioning canceled and resources cleaned up");
    const deployment = this.#toPublic(row);
    this.#notifyDeploymentChanged(deployment);
    return deployment;
  }

  markCanceledFromDestroy(id: string, workerId: string): DeploymentPublic | null {
    const updatedAt = nowIso();
    const row = this.#db
      .prepare(
        `
      UPDATE deployments
      SET
        status = 'canceled',
        active_task = NULL,
        error_message = NULL,
        lease_owner = NULL,
        lease_expires_at = NULL,
        server_id = NULL,
        server_name = NULL,
        server_ip = NULL,
        ssh_key_id = NULL,
        tailnet_url = NULL,
        gateway_token_encrypted = NULL,
        completed_at = ?,
        updated_at = ?
      WHERE id = ?
        AND status = 'provisioning'
        AND active_task = 'destroy'
        AND lease_owner = ?
      RETURNING *
    `,
      )
      .get(updatedAt, updatedAt, id, workerId) as DeploymentRow | undefined;
    if (!row) return null;
    this.appendEvent(id, "deployment.canceled", "Cleanup completed; deployment canceled");
    const deployment = this.#toPublic(row);
    this.#notifyDeploymentChanged(deployment);
    return deployment;
  }

  markFailed(id: string, workerId: string, errorMessage: string): DeploymentPublic | null {
    const updatedAt = nowIso();
    const row = this.#db
      .prepare(
        `
      UPDATE deployments
      SET
        status = 'failed',
        active_task = NULL,
        error_message = ?,
        lease_owner = NULL,
        lease_expires_at = NULL,
        completed_at = ?,
        updated_at = ?
      WHERE id = ?
        AND status = 'provisioning'
        AND lease_owner = ?
      RETURNING *
    `,
      )
      .get(errorMessage, updatedAt, updatedAt, id, workerId) as DeploymentRow | undefined;
    if (!row) return null;
    this.appendEvent(id, "deployment.failed", "Deployment failed", {
      error: errorMessage,
    });
    const deployment = this.#toPublic(row);
    this.#notifyDeploymentChanged(deployment);
    return deployment;
  }
}
