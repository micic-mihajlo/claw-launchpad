import { serve } from "@hono/node-server";
import { Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { SecretBox } from "./lib/crypto.js";
import { createAuthState } from "./lib/auth.js";
import {
  AuthChoice,
  DeploymentConfig,
  DeploymentSecrets,
  DeploymentsStore,
} from "./lib/deployments-store.js";
import { DeploymentsWorker } from "./lib/deployments-worker.js";
import { ConvexMirrorClient } from "./lib/convex-mirror.js";

const DISCORD_BASE_URL = "https://discord.com/api/v10";

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
    throw new Error("Invalid DNS label");
  }
  return candidate;
}

function jsonError(c: any, status: number, message: string, details?: unknown) {
  return c.json(
    {
      ok: false,
      error: message,
      ...(details !== undefined ? { details } : {}),
    },
    status,
  );
}

async function discordRequest<T>(token: string, path: string): Promise<{ ok: true; data: T } | { ok: false; status: number; data: unknown }> {
  const res = await fetch(`${DISCORD_BASE_URL}${path}`, {
    headers: {
      authorization: `Bot ${token}`,
    },
  });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    return { ok: false, status: res.status, data };
  }

  return { ok: true, data: data as T };
}

const deploymentsDbPath =
  process.env.DEPLOYMENTS_DB_PATH || path.join(process.cwd(), ".clawpad", "deployments.db");
const deploymentKey = process.env.DEPLOYMENTS_ENCRYPTION_KEY || "";
const workerEnabled = process.env.DEPLOY_WORKER_ENABLED !== "false";
const workerIntervalMs = Number.parseInt(process.env.DEPLOY_WORKER_INTERVAL_MS || "2500", 10);
const workerLeaseMs = Number.parseInt(process.env.DEPLOY_WORKER_LEASE_MS || "45000", 10);
const provisionerSshPublicKeyPath = process.env.PROVISIONER_SSH_PUBLIC_KEY_PATH || "";
const provisionerSshPrivateKeyPath = process.env.PROVISIONER_SSH_PRIVATE_KEY_PATH || "";
const convexSyncEnabled = process.env.CONVEX_SYNC_ENABLED === "true";
const convexSyncTimeoutMs = Number.parseInt(process.env.CONVEX_SYNC_TIMEOUT_MS || "8000", 10);
const convexUrl = process.env.CONVEX_URL || "";
const convexDeployKey = process.env.CONVEX_DEPLOY_KEY || "";
const authState = createAuthState();

const convexMirror = new ConvexMirrorClient({
  enabled: convexSyncEnabled,
  url: convexUrl,
  deployKey: convexDeployKey,
  timeoutMs: convexSyncTimeoutMs,
});

const deploymentsStore = new DeploymentsStore(deploymentsDbPath, {
  onDeploymentChanged: async (deployment) => {
    await convexMirror.syncDeploymentSnapshot(deployment);
  },
  onEventAppended: async (event) => {
    await convexMirror.appendDeploymentEvent(event);
  },
});

let secretBox: SecretBox | null = null;
const controlPlaneIssues: string[] = [];
if (!deploymentKey) {
  controlPlaneIssues.push("DEPLOYMENTS_ENCRYPTION_KEY missing");
} else {
  try {
    secretBox = new SecretBox(deploymentKey);
  } catch (error) {
    controlPlaneIssues.push(error instanceof Error ? error.message : String(error));
  }
}

let provisionerKeyReady = false;
if (!provisionerSshPublicKeyPath) {
  controlPlaneIssues.push("PROVISIONER_SSH_PUBLIC_KEY_PATH missing");
} else {
  const resolved = path.resolve(provisionerSshPublicKeyPath);
  if (!fs.existsSync(resolved)) {
    controlPlaneIssues.push(`PROVISIONER_SSH_PUBLIC_KEY_PATH does not exist: ${resolved}`);
  } else {
    provisionerKeyReady = true;
  }
}

let deploymentsWorker: DeploymentsWorker | null = null;
if (workerEnabled && secretBox && provisionerKeyReady) {
  deploymentsWorker = new DeploymentsWorker({
    store: deploymentsStore,
    secretBox,
    leaseMs: workerLeaseMs,
    intervalMs: workerIntervalMs,
    provisionConfig: {
      sshPublicKeyPath: provisionerSshPublicKeyPath,
      sshPrivateKeyPath: provisionerSshPrivateKeyPath || undefined,
    },
  });
  deploymentsWorker.start();
}

type AppVars = { Variables: { userId: string } };
const app = new Hono<AppVars>();

app.onError((error, c) => {
  console.error("Unhandled API error", error);
  return jsonError(c, 500, "Internal server error");
});

app.notFound((c) => jsonError(c, 404, "Not found"));

app.use(
  "*",
  cors({
    origin: process.env.WEB_ORIGIN || "http://localhost:5173",
    allowHeaders: ["content-type", "authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    maxAge: 600,
  }),
);

const requireAuth: MiddlewareHandler<{ Variables: { userId: string } }> = async (c, next) => {
  if (!authState.enabled) {
    c.set("userId", authState.defaultUserId);
    await next();
    return;
  }

  if (!authState.ready) {
    return jsonError(c, 503, "Authentication unavailable", authState.issues);
  }

  const userId = await authState.resolveUserId(c.req.header("authorization") ?? null);
  if (!userId) {
    return jsonError(c, 401, "Unauthorized", "Missing or invalid Authorization bearer token");
  }

  c.set("userId", userId);
  await next();
};

app.use("/v1/connectors/*", requireAuth);
app.use("/v1/deployments", requireAuth);
app.use("/v1/deployments/*", requireAuth);

app.get("/health", (c) => c.json({ ok: true }));

app.get("/v1/control-plane/health", (c) => {
  return c.json({
    ok: true,
    controlPlaneReady: controlPlaneIssues.length === 0,
    workerEnabled,
    workerRunning: Boolean(deploymentsWorker),
    issues: controlPlaneIssues,
    auth: {
      enabled: authState.enabled,
      ready: authState.ready,
      issues: authState.issues,
    },
    convexSync: {
      enabled: convexMirror.enabled,
      ready: convexMirror.ready,
      issues: convexMirror.issues,
    },
  });
});

app.post("/v1/connectors/discord/test", async (c) => {
  const body = await c.req.json().catch(() => null);
  const schema = z.object({
    token: z.string().min(1),
    guildId: z.string().min(1).optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return jsonError(c, 400, "Invalid body", parsed.error.flatten());
  }

  const token = parsed.data.token.trim();
  const me = await discordRequest<{ id: string; username: string; discriminator?: string; bot?: boolean }>(
    token,
    "/users/@me",
  );
  if (!me.ok) {
    const status = me.status === 401 ? 401 : 400;
    return jsonError(c, status, "Discord token invalid", me.data);
  }

  let guild: { ok: boolean; status?: number; data?: unknown } | null = null;
  if (parsed.data.guildId) {
    const guildRes = await discordRequest<{ id: string; name: string }>(token, `/guilds/${parsed.data.guildId}`);
    guild = guildRes.ok
      ? { ok: true, data: guildRes.data }
      : { ok: false, status: guildRes.status, data: guildRes.data };
  }

  // NOTE: For bots, user id is typically the application client_id.
  const clientId = me.data.id;
  const permissions = 68608; // View Channels + Send Messages + Read Message History
  const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=${permissions}`;

  return c.json({
    ok: true,
    bot: me.data,
    inviteUrl,
    ...(guild ? { guild } : {}),
  });
});

app.post("/v1/connectors/discord/guild-channels", async (c) => {
  const body = await c.req.json().catch(() => null);
  const schema = z.object({
    token: z.string().min(1),
    guildId: z.string().min(1).regex(/^[0-9]+$/, "guildId must be a numeric Discord snowflake"),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return jsonError(c, 400, "Invalid body", parsed.error.flatten());
  }

  const token = parsed.data.token.trim();
  const channels = await discordRequest<
    Array<{ id: string; name: string; type: number; parent_id?: string | null; position?: number }>
  >(token, `/guilds/${parsed.data.guildId}/channels`);

  if (!channels.ok) {
    const status = channels.status === 401 ? 401 : 400;
    return jsonError(c, status, "Failed to list guild channels", channels.data);
  }

  const allowedTypes = new Set([0, 5, 15]);
  const normalized = channels.data
    .filter((ch) => allowedTypes.has(ch.type))
    .map((ch) => ({
      id: ch.id,
      name: ch.name,
      type: ch.type,
      parentId: ch.parent_id ?? null,
      position: typeof ch.position === "number" ? ch.position : null,
    }))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  return c.json({ ok: true, channels: normalized });
});

const deploymentCreateSchema = z.object({
  provider: z.literal("hetzner").default("hetzner"),
  name: z.string().min(1),
  serverType: z.string().min(1).default("cx23"),
  image: z.string().min(1).default("ubuntu-24.04"),
  location: z.string().min(1).default("nbg1"),
  hetznerApiToken: z.string().min(1),
  tailscaleAuthKey: z.string().min(1),
  tailscaleHostname: z.string().min(1).optional(),
  authChoice: z
    .enum(["skip", "minimax-api", "anthropic-api-key", "openai-api-key"] satisfies [AuthChoice, ...AuthChoice[]])
    .default("skip"),
  minimaxApiKey: z.string().min(1).optional(),
  anthropicApiKey: z.string().min(1).optional(),
  openaiApiKey: z.string().min(1).optional(),
  discordBotToken: z.string().min(1).optional(),
  discordGroupPolicy: z.enum(["open", "allowlist", "disabled"]).default("allowlist"),
  discordGuildId: z.string().regex(/^\d+$/).optional(),
  discordChannelIds: z.array(z.string().regex(/^\d+$/)).optional(),
  billingRef: z.string().max(128).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

app.post("/v1/deployments", async (c) => {
  const userId = c.get("userId");
  if (!secretBox) {
    return jsonError(c, 503, "Control plane not configured", controlPlaneIssues);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = deploymentCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(c, 400, "Invalid body", parsed.error.flatten());
  }

  if (!provisionerKeyReady) {
    return jsonError(
      c,
      503,
      "Server missing PROVISIONER_SSH_PUBLIC_KEY_PATH; cannot create deployable jobs",
      controlPlaneIssues,
    );
  }

  const payload = parsed.data;
  let normalizedName: string;
  let normalizedTailscaleHostname: string | undefined;
  try {
    normalizedName = toRfc1123Label(payload.name);
    normalizedTailscaleHostname = payload.tailscaleHostname
      ? toRfc1123Label(payload.tailscaleHostname)
      : undefined;
  } catch {
    return jsonError(
      c,
      400,
      "Invalid name or tailscaleHostname. Use 1-63 chars: lowercase letters, digits, hyphen.",
    );
  }
  const discordGroupPolicy = payload.discordBotToken ? payload.discordGroupPolicy : "disabled";
  const discordChannelIds = Array.from(new Set((payload.discordChannelIds ?? []).map((id) => id.trim())));

  if (payload.authChoice === "minimax-api" && !payload.minimaxApiKey) {
    return jsonError(c, 400, "minimaxApiKey is required when authChoice=minimax-api");
  }
  if (payload.authChoice === "anthropic-api-key" && !payload.anthropicApiKey) {
    return jsonError(c, 400, "anthropicApiKey is required when authChoice=anthropic-api-key");
  }
  if (payload.authChoice === "openai-api-key" && !payload.openaiApiKey) {
    return jsonError(c, 400, "openaiApiKey is required when authChoice=openai-api-key");
  }

  if (payload.discordBotToken && discordGroupPolicy === "allowlist") {
    if (!payload.discordGuildId) {
      return jsonError(c, 400, "discordGuildId is required when discordGroupPolicy=allowlist");
    }
    if (discordChannelIds.length === 0) {
      return jsonError(c, 400, "discordChannelIds is required when discordGroupPolicy=allowlist");
    }
  }

  const deploymentId = crypto.randomUUID();
  const config: DeploymentConfig = {
    name: normalizedName,
    serverType: payload.serverType,
    image: payload.image,
    location: payload.location,
    tailscaleHostname: normalizedTailscaleHostname,
    authChoice: payload.authChoice,
    discordGroupPolicy,
    discordGuildId: payload.discordGuildId,
    discordChannelIds: payload.discordBotToken ? discordChannelIds : undefined,
  };

  const secrets: DeploymentSecrets = {
    hetznerApiToken: payload.hetznerApiToken,
    tailscaleAuthKey: payload.tailscaleAuthKey,
    minimaxApiKey: payload.minimaxApiKey,
    anthropicApiKey: payload.anthropicApiKey,
    openaiApiKey: payload.openaiApiKey,
    discordBotToken: payload.discordBotToken,
  };

  const deployment = deploymentsStore.createDeployment({
    id: deploymentId,
    provider: "hetzner",
    ownerUserId: userId,
    name: normalizedName,
    config,
    secretsEncrypted: secretBox.encryptObject(secrets),
    metadata: payload.metadata,
    billingRef: payload.billingRef,
  });

  return c.json({
    ok: true,
    deployment,
  });
});

app.get("/v1/deployments", (c) => {
  const userId = c.get("userId");
  const limit = Number.parseInt(String(c.req.query("limit") || "50"), 10);
  const offset = Number.parseInt(String(c.req.query("offset") || "0"), 10);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 200)) : 50;
  const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;
  return c.json({
    ok: true,
    deployments: deploymentsStore.listPublic(userId, safeLimit, safeOffset),
  });
});

app.get("/v1/deployments/:id", (c) => {
  const userId = c.get("userId");
  const deployment = deploymentsStore.getPublicForOwner(userId, c.req.param("id"));
  if (!deployment) {
    return jsonError(c, 404, "Deployment not found");
  }
  const events = deploymentsStore.listEvents(deployment.id, 200);
  return c.json({
    ok: true,
    deployment,
    events,
  });
});

app.post("/v1/deployments/:id/cancel", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => null);
  const schema = z.object({
    reason: z.string().max(256).optional(),
  });
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return jsonError(c, 400, "Invalid body", parsed.error.flatten());
  }

  const deployment = deploymentsStore.requestCancel(userId, c.req.param("id"), parsed.data.reason);
  if (!deployment) {
    return jsonError(c, 404, "Deployment not found");
  }
  return c.json({ ok: true, deployment });
});

app.post("/v1/deployments/:id/retry", (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  try {
    const deployment = deploymentsStore.retryDeployment(userId, id);
    if (!deployment) {
      return jsonError(c, 404, "Deployment not found");
    }
    return c.json({ ok: true, deployment });
  } catch (error) {
    return jsonError(c, 409, error instanceof Error ? error.message : String(error));
  }
});

const port = Number.parseInt(process.env.PORT || "8788", 10);
serve({ fetch: app.fetch, port });

process.on("SIGINT", () => {
  deploymentsWorker?.stop();
  deploymentsStore.close();
});

process.on("SIGTERM", () => {
  deploymentsWorker?.stop();
  deploymentsStore.close();
});
