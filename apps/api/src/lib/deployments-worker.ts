import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SecretBox } from "./crypto.js";
import {
  DeploymentConfig,
  DeploymentInternal,
  DeploymentSecrets,
  DeploymentsStore,
} from "./deployments-store.js";
import { HetznerClient } from "./hetzner-client.js";
import { buildRemoteBootstrapScript } from "./remote-script.js";
import { run, runOrThrow } from "./sh.js";

type ProvisioningResult = {
  serverId: number;
  serverName: string;
  serverIp: string;
  sshKeyId: number | null;
  tailnetUrl: string | null;
  gatewayToken: string;
};

type CleanupResult = {
  cleanedServer: boolean;
  cleanedSshKey: boolean;
  cleanupErrors: string[];
};

type DeploymentProvisionConfig = {
  sshPublicKeyPath: string;
  sshPrivateKeyPath?: string;
};

function toRfc1123Label(value: string): string {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");

  const sliced = normalized.slice(0, 63).replace(/-+$/, "");
  const candidate = sliced || "openclaw";
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(candidate)) {
    return "openclaw";
  }
  return candidate;
}

function shellEscape(value: string): string {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function sshOptions(privateKeyPath?: string): string[] {
  const options = [
    "-o",
    "StrictHostKeyChecking=no",
    "-o",
    "UserKnownHostsFile=/dev/null",
    "-o",
    "BatchMode=yes",
  ];
  if (privateKeyPath) {
    options.push("-i", privateKeyPath, "-o", "IdentitiesOnly=yes");
  }
  return options;
}

function isHetznerNotFound(error: unknown): boolean {
  return Number((error as any)?.statusCode || 0) === 404;
}

async function waitForSsh(ip: string, privateKeyPath?: string, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await run([
      "ssh",
      ...sshOptions(privateKeyPath),
      "-o",
      "ConnectTimeout=5",
      `root@${ip}`,
      "true",
    ]);
    if (res.code === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 2_500));
  }
  throw new Error(`Timeout waiting for SSH on ${ip}`);
}

async function detectTailnetUrl(ip: string, privateKeyPath?: string): Promise<string | null> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const res = await run([
      "ssh",
      ...sshOptions(privateKeyPath),
      `root@${ip}`,
      "tailscale status --json",
    ]);
    if (res.code !== 0) {
      await new Promise((resolve) => setTimeout(resolve, 2_500));
      continue;
    }

    try {
      const parsed = JSON.parse(res.stdout) as any;
      const self = parsed?.Self;
      const dns = typeof self?.DNSName === "string" ? String(self.DNSName) : "";
      const host = dns ? dns.replace(/\.$/, "") : Array.isArray(self?.TailscaleIPs) ? self.TailscaleIPs[0] : null;
      if (host) {
        return `https://${host}/`;
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 2_500));
  }
  return null;
}

class CancelRequestedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CancelRequestedError";
  }
}

export class DeploymentsWorker {
  readonly #store: DeploymentsStore;
  readonly #secretBox: SecretBox;
  readonly #workerId: string;
  readonly #leaseMs: number;
  readonly #intervalMs: number;
  readonly #provisionConfig: DeploymentProvisionConfig;
  #timer: NodeJS.Timeout | null = null;
  #tickRunning = false;

  constructor(params: {
    store: DeploymentsStore;
    secretBox: SecretBox;
    leaseMs: number;
    intervalMs: number;
    provisionConfig: DeploymentProvisionConfig;
  }) {
    this.#store = params.store;
    this.#secretBox = params.secretBox;
    this.#leaseMs = params.leaseMs;
    this.#intervalMs = params.intervalMs;
    this.#provisionConfig = params.provisionConfig;
    this.#workerId = `worker-${process.pid}-${crypto.randomUUID()}`;
  }

  start() {
    if (this.#timer) return;
    this.#timer = setInterval(() => {
      void this.tick();
    }, this.#intervalMs);
    this.#timer.unref();
    void this.tick();
  }

  stop() {
    if (!this.#timer) return;
    clearInterval(this.#timer);
    this.#timer = null;
  }

  async tick() {
    if (this.#tickRunning) return;
    this.#tickRunning = true;
    try {
      this.#store.recoverExpiredProvisionLeases();

      const destroyJob = this.#store.leaseNextDestroyJob(this.#workerId, this.#leaseMs);
      if (destroyJob) {
        await this.#handleDestroyJob(destroyJob);
        return;
      }

      const provisionJob = this.#store.leaseNextProvisionJob(this.#workerId, this.#leaseMs);
      if (provisionJob) {
        await this.#handleProvisionJob(provisionJob);
      }
    } finally {
      this.#tickRunning = false;
    }
  }

  async #assertNotCanceled(id: string) {
    if (this.#store.isCancelRequested(id)) {
      throw new CancelRequestedError("Cancel requested");
    }
  }

  async #heartbeat(id: string) {
    const ok = this.#store.renewLease(id, this.#workerId, this.#leaseMs);
    if (!ok) {
      throw new Error("Lost worker lease");
    }
  }

  async #handleProvisionJob(job: DeploymentInternal) {
    this.#store.appendEvent(job.id, "deployment.provision.progress", "Starting provisioning orchestration", {
      workerId: this.#workerId,
    });

    let cleanup: CleanupResult | null = null;
    let canceled = false;

    try {
      const secrets = this.#secretBox.decryptObject<DeploymentSecrets>(job.secretsEncrypted);
      const result = await this.#provisionOne(job, secrets);
      await this.#heartbeat(job.id);
      await this.#assertNotCanceled(job.id);

      const gatewayTokenEncrypted = this.#secretBox.encryptObject({
        gatewayToken: result.gatewayToken,
      });
      const marked = this.#store.markRunning(job.id, this.#workerId, {
        serverId: result.serverId,
        serverName: result.serverName,
        serverIp: result.serverIp,
        sshKeyId: result.sshKeyId,
        tailnetUrl: result.tailnetUrl,
        gatewayTokenEncrypted,
      });
      if (!marked) {
        throw new Error("Failed to transition deployment to running");
      }
      return;
    } catch (error) {
      canceled = error instanceof CancelRequestedError || this.#store.isCancelRequested(job.id);
      const baseMessage = error instanceof Error ? error.message : String(error);
      this.#store.appendEvent(
        job.id,
        "deployment.provision.error",
        canceled ? "Provisioning interrupted by cancellation" : "Provisioning failed; attempting cleanup",
        { error: baseMessage },
      );

      const current = this.#store.getInternal(job.id);
      if (!current) return;

      try {
        const secrets = this.#secretBox.decryptObject<DeploymentSecrets>(current.secretsEncrypted);
        cleanup = await this.#cleanupResources(current, secrets);
      } catch (cleanupError) {
        cleanup = {
          cleanedServer: false,
          cleanedSshKey: false,
          cleanupErrors: [cleanupError instanceof Error ? cleanupError.message : String(cleanupError)],
        };
      }

      const cleanupSummary = cleanup.cleanupErrors.length
        ? `; cleanup errors: ${cleanup.cleanupErrors.join(" | ")}`
        : "";
      const finalMessage = `${baseMessage}${cleanupSummary}`;

      if (cleanup.cleanedServer || cleanup.cleanedSshKey) {
        this.#store.updateResourceState(job.id, this.#workerId, {
          serverId: cleanup.cleanedServer ? null : undefined,
          serverName: cleanup.cleanedServer ? null : undefined,
          serverIp: cleanup.cleanedServer ? null : undefined,
          tailnetUrl: cleanup.cleanedServer ? null : undefined,
          gatewayTokenEncrypted: cleanup.cleanedServer ? null : undefined,
          sshKeyId: cleanup.cleanedSshKey ? null : undefined,
        });
      }

      if (canceled && cleanup.cleanupErrors.length === 0) {
        const canceledState = this.#store.markCanceledFromProvisioning(job.id, this.#workerId);
        if (canceledState) {
          return;
        }
      }

      this.#store.markFailed(job.id, this.#workerId, finalMessage);
    }
  }

  async #handleDestroyJob(job: DeploymentInternal) {
    this.#store.appendEvent(job.id, "deployment.destroy.progress", "Starting cleanup orchestration", {
      workerId: this.#workerId,
    });

    try {
      const secrets = this.#secretBox.decryptObject<DeploymentSecrets>(job.secretsEncrypted);
      const cleanup = await this.#cleanupResources(job, secrets);
      if (cleanup.cleanupErrors.length > 0) {
        throw new Error(cleanup.cleanupErrors.join(" | "));
      }

      if (cleanup.cleanedServer || cleanup.cleanedSshKey) {
        this.#store.updateResourceState(job.id, this.#workerId, {
          serverId: cleanup.cleanedServer ? null : undefined,
          serverName: cleanup.cleanedServer ? null : undefined,
          serverIp: cleanup.cleanedServer ? null : undefined,
          tailnetUrl: cleanup.cleanedServer ? null : undefined,
          gatewayTokenEncrypted: cleanup.cleanedServer ? null : undefined,
          sshKeyId: cleanup.cleanedSshKey ? null : undefined,
        });
      }

      const canceled = this.#store.markCanceledFromDestroy(job.id, this.#workerId);
      if (!canceled) {
        throw new Error("Failed to transition deployment to canceled after cleanup");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#store.markFailed(job.id, this.#workerId, message);
    }
  }

  async #provisionOne(job: DeploymentInternal, secrets: DeploymentSecrets): Promise<ProvisioningResult> {
    const config = job.config;
    const sshPublicKey = fs.readFileSync(path.resolve(this.#provisionConfig.sshPublicKeyPath), "utf8").trim();
    if (!sshPublicKey.startsWith("ssh-")) {
      throw new Error("PROVISIONER_SSH_PUBLIC_KEY_PATH does not contain a valid SSH public key");
    }

    if (!secrets.hetznerApiToken) {
      throw new Error("Missing Hetzner API token");
    }
    if (!secrets.tailscaleAuthKey) {
      throw new Error("Missing Tailscale auth key");
    }

    const client = new HetznerClient(secrets.hetznerApiToken);
    const sshKeyName = `clawpad-${os.hostname()}-${Date.now()}-${job.id.slice(0, 8)}`;
    const gatewayToken = crypto.randomBytes(32).toString("hex");
    const tailscaleHostname = toRfc1123Label(config.tailscaleHostname ?? config.name);

    await this.#assertNotCanceled(job.id);
    await this.#heartbeat(job.id);

    this.#store.appendEvent(job.id, "deployment.provision.progress", "Creating temporary Hetzner SSH key");
    const sshKey = await client.createSshKey({ name: sshKeyName, public_key: sshPublicKey });
    await this.#heartbeat(job.id);
    this.#store.updateResourceState(job.id, this.#workerId, {
      sshKeyId: sshKey.ssh_key.id,
    });

    await this.#assertNotCanceled(job.id);
    this.#store.appendEvent(job.id, "deployment.provision.progress", "Creating Hetzner server");
    const create = await client.createServer({
      name: config.name,
      server_type: config.serverType,
      image: config.image,
      location: config.location,
      ssh_keys: [sshKey.ssh_key.id],
      start_after_create: true,
      public_net: { enable_ipv4: true, enable_ipv6: true },
      labels: { "managed-by": "claw-launchpad", deployment_id: job.id },
    });

    await this.#heartbeat(job.id);
    this.#store.updateResourceState(job.id, this.#workerId, {
      serverId: create.server.id,
      serverName: create.server.name,
    });

    const actionId = create.action?.id;
    if (actionId) {
      await this.#store.updateResourceState(job.id, this.#workerId, {
        serverId: create.server.id,
        serverName: create.server.name,
      });
      await client.waitForAction(actionId, { timeoutMs: 180_000 });
      await this.#heartbeat(job.id);
    }

    await this.#assertNotCanceled(job.id);
    this.#store.appendEvent(job.id, "deployment.provision.progress", "Waiting for server networking");
    const latest = await client.getServer(create.server.id);
    const ip = latest.server.public_net?.ipv4?.ip;
    if (!ip) {
      throw new Error("No ipv4 assigned yet");
    }
    this.#store.updateResourceState(job.id, this.#workerId, {
      serverIp: ip,
    });
    await this.#heartbeat(job.id);

    this.#store.appendEvent(job.id, "deployment.provision.progress", "Waiting for SSH to become available");
    await waitForSsh(ip, this.#provisionConfig.sshPrivateKeyPath);
    await this.#heartbeat(job.id);
    await this.#assertNotCanceled(job.id);

    const script = buildRemoteBootstrapScript({
      gatewayPort: 18789,
      gatewayBind: "loopback",
      tailscaleMode: "serve",
      authChoice: config.authChoice,
      discordBotToken: secrets.discordBotToken,
      discordGroupPolicy: config.discordGroupPolicy,
      discordGuildId: config.discordGuildId,
      discordChannelIds: config.discordChannelIds,
    });
    const tmpScriptPath = path.join(os.tmpdir(), `clawpad-bootstrap-${Date.now()}-${job.id}.sh`);
    fs.writeFileSync(tmpScriptPath, script, { mode: 0o700 });

    try {
      this.#store.appendEvent(job.id, "deployment.provision.progress", "Copying bootstrap script");
      await runOrThrow([
        "scp",
        ...sshOptions(this.#provisionConfig.sshPrivateKeyPath),
        tmpScriptPath,
        `root@${ip}:/root/clawpad-bootstrap.sh`,
      ]);

      await this.#heartbeat(job.id);
      await this.#assertNotCanceled(job.id);

      const env: Record<string, string> = {
        OPENCLAW_GATEWAY_TOKEN: gatewayToken,
        TAILSCALE_AUTH_KEY: secrets.tailscaleAuthKey,
        TAILSCALE_HOSTNAME: tailscaleHostname,
      };
      if (secrets.minimaxApiKey) env.MINIMAX_API_KEY = secrets.minimaxApiKey;
      if (secrets.anthropicApiKey) env.ANTHROPIC_API_KEY = secrets.anthropicApiKey;
      if (secrets.openaiApiKey) env.OPENAI_API_KEY = secrets.openaiApiKey;
      if (secrets.discordBotToken) env.DISCORD_BOT_TOKEN = secrets.discordBotToken;

      const exportPrefix = Object.entries(env)
        .map(([key, value]) => `${key}=${shellEscape(value)}`)
        .join(" ");

      this.#store.appendEvent(job.id, "deployment.provision.progress", "Running bootstrap script");
      const bootstrapRes = await run([
        "ssh",
        ...sshOptions(this.#provisionConfig.sshPrivateKeyPath),
        `root@${ip}`,
        `${exportPrefix} bash /root/clawpad-bootstrap.sh`,
      ]);
      if (bootstrapRes.code !== 0) {
        throw new Error(
          `bootstrap script failed (${bootstrapRes.code}): ${bootstrapRes.stderr || bootstrapRes.stdout}`,
        );
      }

      await this.#heartbeat(job.id);
      await this.#assertNotCanceled(job.id);
    } finally {
      try {
        fs.unlinkSync(tmpScriptPath);
      } catch {
        // no-op
      }
    }

    const tailnetUrl = await detectTailnetUrl(ip, this.#provisionConfig.sshPrivateKeyPath);
    this.#store.updateResourceState(job.id, this.#workerId, {
      tailnetUrl,
    });

    return {
      serverId: create.server.id,
      serverName: create.server.name,
      serverIp: ip,
      sshKeyId: sshKey.ssh_key.id,
      tailnetUrl,
      gatewayToken,
    };
  }

  async #cleanupResources(job: DeploymentInternal, secrets: DeploymentSecrets): Promise<CleanupResult> {
    const cleanupErrors: string[] = [];
    let cleanedServer = false;
    let cleanedSshKey = false;

    if (!secrets.hetznerApiToken) {
      return {
        cleanedServer: false,
        cleanedSshKey: false,
        cleanupErrors: ["Missing Hetzner API token for cleanup"],
      };
    }

    const client = new HetznerClient(secrets.hetznerApiToken);
    if (job.resources.serverId) {
      try {
        const deletion = await client.deleteServer(job.resources.serverId);
        const actionId = deletion.action?.id;
        if (actionId) {
          await client.waitForAction(actionId, { timeoutMs: 180_000 });
        }
        cleanedServer = true;
        this.#store.appendEvent(job.id, "deployment.destroy.progress", "Hetzner server deleted", {
          serverId: job.resources.serverId,
        });
      } catch (error) {
        if (isHetznerNotFound(error)) {
          cleanedServer = true;
        } else {
          cleanupErrors.push(`delete server: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    if (job.resources.sshKeyId) {
      try {
        await client.deleteSshKey(job.resources.sshKeyId);
        cleanedSshKey = true;
        this.#store.appendEvent(job.id, "deployment.destroy.progress", "Temporary SSH key deleted", {
          sshKeyId: job.resources.sshKeyId,
        });
      } catch (error) {
        if (isHetznerNotFound(error)) {
          cleanedSshKey = true;
        } else {
          cleanupErrors.push(`delete ssh key: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    return {
      cleanedServer,
      cleanedSshKey,
      cleanupErrors,
    };
  }
}
