import { serve } from "@hono/node-server";
import { Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type Stripe from "stripe";
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
import { BillingStore } from "./lib/billing-store.js";
import { loadBillingPlans, plansMap } from "./lib/billing-plans.js";
import { StripeBillingClient } from "./lib/stripe-billing.js";

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

type HttpError = Error & {
  statusCode?: number;
  details?: unknown;
};

function createHttpError(statusCode: number, message: string, details?: unknown): HttpError {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  if (details !== undefined) {
    error.details = details;
  }
  return error;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort((a, b) => a.localeCompare(b));
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function requestHash(value: unknown): string {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function asStringId(value: string | { id?: string } | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && typeof value.id === "string") return value.id;
  return null;
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
const billingDbPath =
  process.env.BILLING_DB_PATH || path.join(process.cwd(), ".clawpad", "billing.db");
const deploymentKey = process.env.DEPLOYMENTS_ENCRYPTION_KEY || "";
const workerEnabled = process.env.DEPLOY_WORKER_ENABLED !== "false";
const workerIntervalMs = Number.parseInt(process.env.DEPLOY_WORKER_INTERVAL_MS || "2500", 10);
const workerLeaseMs = Number.parseInt(process.env.DEPLOY_WORKER_LEASE_MS || "45000", 10);
const autoProvisionPaidOrders = process.env.BILLING_AUTO_PROVISION_ON_PAYMENT !== "false";
const stripeCheckoutSuccessUrlDefault = String(process.env.STRIPE_CHECKOUT_SUCCESS_URL || "").trim();
const stripeCheckoutCancelUrlDefault = String(process.env.STRIPE_CHECKOUT_CANCEL_URL || "").trim();
const stripeTimeoutMs = Number.parseInt(process.env.STRIPE_TIMEOUT_MS || "20000", 10);
const provisionerSshPublicKeyPath = process.env.PROVISIONER_SSH_PUBLIC_KEY_PATH || "";
const provisionerSshPrivateKeyPath = process.env.PROVISIONER_SSH_PRIVATE_KEY_PATH || "";
const convexSyncEnabled = process.env.CONVEX_SYNC_ENABLED === "true";
const convexSyncTimeoutMs = Number.parseInt(process.env.CONVEX_SYNC_TIMEOUT_MS || "8000", 10);
const convexUrl = process.env.CONVEX_URL || "";
const convexDeployKey = process.env.CONVEX_DEPLOY_KEY || "";
const { plans: billingPlans, issues: billingPlanIssues } = loadBillingPlans(process.env.BILLING_PLANS_JSON);
const billingPlansById = plansMap(billingPlans);
const authState = createAuthState();
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

const billingStore = new BillingStore(billingDbPath);
const stripeBilling = new StripeBillingClient({
  secretKey: process.env.STRIPE_SECRET_KEY,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  timeoutMs: stripeTimeoutMs,
});

let secretBox: SecretBox | null = null;
const controlPlaneIssues: string[] = [];
controlPlaneIssues.push(...billingPlanIssues.map((issue) => `Billing plan config: ${issue}`));
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
    allowHeaders: ["content-type", "idempotency-key", "authorization", "stripe-signature"],
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
    billing: {
      autoProvisionPaidOrders,
      plansLoaded: billingPlans.length,
      stripe: {
        enabled: stripeBilling.enabled,
        ready: stripeBilling.ready,
        issues: stripeBilling.issues,
      },
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

const deploymentStoredInputSchema = deploymentCreateSchema.omit({ billingRef: true });

const billingCheckoutSchema = z.object({
  planId: z.string().min(1),
  deployment: deploymentStoredInputSchema,
  customerEmail: z.string().email().optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

type DeploymentCreateInput = z.infer<typeof deploymentCreateSchema>;

type NormalizedDeploymentInput = {
  name: string;
  config: DeploymentConfig;
  secrets: DeploymentSecrets;
  metadata: Record<string, unknown> | undefined;
};

function normalizeDeploymentInput(payload: DeploymentCreateInput): NormalizedDeploymentInput {
  let normalizedName: string;
  let normalizedTailscaleHostname: string | undefined;
  try {
    normalizedName = toRfc1123Label(payload.name);
    normalizedTailscaleHostname = payload.tailscaleHostname
      ? toRfc1123Label(payload.tailscaleHostname)
      : undefined;
  } catch {
    throw createHttpError(
      400,
      "Invalid name or tailscaleHostname. Use 1-63 chars: lowercase letters, digits, hyphen.",
    );
  }

  const discordGroupPolicy = payload.discordBotToken ? payload.discordGroupPolicy : "disabled";
  const discordChannelIds = Array.from(new Set((payload.discordChannelIds ?? []).map((id) => id.trim())));
  const discordGuildId = payload.discordGuildId?.trim() || undefined;

  if (payload.authChoice === "minimax-api" && !payload.minimaxApiKey) {
    throw createHttpError(400, "minimaxApiKey is required when authChoice=minimax-api");
  }
  if (payload.authChoice === "anthropic-api-key" && !payload.anthropicApiKey) {
    throw createHttpError(400, "anthropicApiKey is required when authChoice=anthropic-api-key");
  }
  if (payload.authChoice === "openai-api-key" && !payload.openaiApiKey) {
    throw createHttpError(400, "openaiApiKey is required when authChoice=openai-api-key");
  }

  if (payload.discordBotToken && discordGroupPolicy === "allowlist") {
    if (!discordGuildId) {
      throw createHttpError(400, "discordGuildId is required when discordGroupPolicy=allowlist");
    }
    if (discordChannelIds.length === 0) {
      throw createHttpError(400, "discordChannelIds is required when discordGroupPolicy=allowlist");
    }
  }

  const config: DeploymentConfig = {
    name: normalizedName,
    serverType: payload.serverType,
    image: payload.image,
    location: payload.location,
    tailscaleHostname: normalizedTailscaleHostname,
    authChoice: payload.authChoice,
    discordGroupPolicy,
    discordGuildId,
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

  return {
    name: normalizedName,
    config,
    secrets,
    metadata: payload.metadata,
  };
}

function assertDeploymentsWritable() {
  if (!secretBox) {
    throw createHttpError(503, "Control plane not configured", controlPlaneIssues);
  }
  if (!provisionerKeyReady) {
    throw createHttpError(
      503,
      "Server missing PROVISIONER_SSH_PUBLIC_KEY_PATH; cannot create deployable jobs",
      controlPlaneIssues,
    );
  }
}

function createDeploymentFromInput(
  payload: DeploymentCreateInput,
  options: {
    billingRef?: string;
    metadataOverride?: Record<string, unknown>;
    ownerUserId?: string;
  } = {},
) {
  assertDeploymentsWritable();
  const normalized = normalizeDeploymentInput(payload);
  const mergedMetadata =
    normalized.metadata || options.metadataOverride
      ? {
          ...(normalized.metadata ?? {}),
          ...(options.metadataOverride ?? {}),
        }
      : undefined;

  return deploymentsStore.createDeployment({
    id: crypto.randomUUID(),
    provider: "hetzner",
    ownerUserId: options.ownerUserId || authState.defaultUserId,
    name: normalized.name,
    config: normalized.config,
    secretsEncrypted: secretBox!.encryptObject(normalized.secrets),
    metadata: mergedMetadata,
    billingRef: options.billingRef ?? payload.billingRef,
  });
}

function isDuplicateBillingRefError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /deployments\.billing_ref|idx_deployments_billing_ref_unique/i.test(error.message);
}

async function queueDeploymentFromPaidOrder(
  orderId: string,
  trigger: "stripe_webhook" | "manual_order_provision",
) {
  const order = billingStore.getOrderInternal(orderId);
  if (!order) {
    throw createHttpError(404, "Order not found");
  }

  const existingDeployment = deploymentsStore.getPublicByBillingRef(order.id);
  if (existingDeployment) {
    const linked = billingStore.markOrderDeploymentCreated(order.id, existingDeployment.id);
    return {
      order: linked ?? billingStore.getOrder(order.id),
      deployment: existingDeployment,
      created: false,
    };
  }

  if (order.status === "pending_payment") {
    throw createHttpError(409, "Order is pending payment");
  }
  if (order.status === "expired" || order.status === "canceled") {
    throw createHttpError(409, `Order is ${order.status}`);
  }
  if (!order.paidAt) {
    throw createHttpError(409, "Order has not been paid");
  }
  if (order.status === "deployment_created") {
    throw createHttpError(409, "Order is already linked to a deployment");
  }
  if (!["paid", "failed"].includes(order.status)) {
    throw createHttpError(409, `Order cannot be provisioned from status ${order.status}`);
  }

  assertDeploymentsWritable();

  let storedInput: unknown;
  try {
    storedInput = secretBox!.decryptObject(order.deploymentInputEncrypted);
  } catch (error) {
    const failed = billingStore.markOrderFailed(
      order.id,
      `Stored deployment payload cannot be decrypted: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    throw createHttpError(500, "Stored deployment payload cannot be decrypted", {
      order: failed ?? billingStore.getOrder(order.id),
    });
  }

  const parsedStoredInput = deploymentStoredInputSchema.safeParse(storedInput);
  if (!parsedStoredInput.success) {
    const failed = billingStore.markOrderFailed(order.id, "Stored deployment payload failed validation");
    throw createHttpError(500, "Stored deployment payload failed validation", {
      validation: parsedStoredInput.error.flatten(),
      order: failed ?? billingStore.getOrder(order.id),
    });
  }

  try {
    const deployment = createDeploymentFromInput(
      {
        ...parsedStoredInput.data,
        billingRef: order.id,
      },
      {
        ownerUserId: authState.defaultUserId,
        billingRef: order.id,
        metadataOverride: {
          billingOrderId: order.id,
          billingPlanId: order.planId,
          billingProvider: order.provider,
          billingTrigger: trigger,
        },
      },
    );

    const updatedOrder = billingStore.markOrderDeploymentCreated(order.id, deployment.id);
    billingStore.appendOrderEvent(order.id, "order.provision.queued", "Deployment queued from paid order", {
      deploymentId: deployment.id,
      trigger,
    });

    return {
      order: updatedOrder ?? billingStore.getOrder(order.id),
      deployment,
      created: true,
    };
  } catch (error) {
    if (isDuplicateBillingRefError(error)) {
      const concurrentDeployment = deploymentsStore.getPublicByBillingRef(order.id);
      if (concurrentDeployment) {
        const linked = billingStore.markOrderDeploymentCreated(order.id, concurrentDeployment.id);
        return {
          order: linked ?? billingStore.getOrder(order.id),
          deployment: concurrentDeployment,
          created: false,
        };
      }
    }

    const failed = billingStore.markOrderFailed(
      order.id,
      error instanceof Error ? error.message : String(error),
    );
    if (error instanceof Error && "statusCode" in error) {
      const typed = error as HttpError;
      typed.details = {
        ...(typeof typed.details === "object" && typed.details ? (typed.details as object) : {}),
        order: failed ?? billingStore.getOrder(order.id),
      };
      throw typed;
    }
    throw createHttpError(500, "Failed to queue deployment from paid order", {
      order: failed ?? billingStore.getOrder(order.id),
    });
  }
}

async function handlePaidCheckoutSession(
  session: Stripe.Checkout.Session,
  trigger: "stripe.checkout.session.completed" | "stripe.checkout.session.async_payment_succeeded",
) {
  const orderId =
    String(session.client_reference_id || session.metadata?.order_id || "").trim() || undefined;
  const orderBySession = billingStore.getOrderByCheckoutSessionId(String(session.id || ""));
  const targetOrderId = orderId ?? orderBySession?.id;
  if (!targetOrderId) {
    return {
      ignored: true,
      reason: "order_not_found",
      checkoutSessionId: session.id,
    };
  }

  const paymentStatus = String(session.payment_status || "").trim().toLowerCase();
  const shouldWaitForAsyncSettlement =
    trigger === "stripe.checkout.session.completed" &&
    paymentStatus !== "paid" &&
    paymentStatus !== "no_payment_required";

  if (shouldWaitForAsyncSettlement) {
    billingStore.setCheckoutSession(targetOrderId, {
      checkoutSessionId: String(session.id || ""),
      checkoutUrl: session.url ?? null,
    });

    const pendingOrder = billingStore.getOrder(targetOrderId);
    if (pendingOrder?.status === "pending_payment") {
      billingStore.appendOrderEvent(
        targetOrderId,
        "order.payment.pending_async",
        "Checkout completed but payment is not yet settled; waiting for async payment success",
        {
          trigger,
          paymentStatus,
          checkoutSessionId: String(session.id || ""),
        },
      );
    }

    return {
      ignored: false,
      pendingAsyncPayment: true,
      paymentStatus,
      order: pendingOrder ?? orderBySession ?? null,
      checkoutSessionId: session.id,
    };
  }

  const paid = billingStore.markOrderPaid(targetOrderId, {
    stripeCheckoutSessionId: String(session.id || ""),
    stripePaymentIntentId: asStringId(session.payment_intent as string | { id?: string } | null | undefined),
    stripeCustomerId: asStringId(session.customer as string | { id?: string } | null | undefined),
    customerEmail: session.customer_details?.email ?? session.customer_email ?? null,
  });

  if (!paid) {
    return {
      ignored: true,
      reason: "order_not_found",
      checkoutSessionId: session.id,
    };
  }

  if (paid.status === "expired" || paid.status === "canceled") {
    return {
      ignored: true,
      reason: `order_${paid.status}`,
      order: paid,
    };
  }

  if (!autoProvisionPaidOrders) {
    billingStore.appendOrderEvent(
      paid.id,
      "order.provision.skipped",
      "Auto-provisioning disabled; waiting for manual provisioning trigger",
      { trigger },
    );
    return {
      ignored: false,
      order: paid,
      deployment: null,
      created: false,
      autoProvision: false,
    };
  }

  const queued = await queueDeploymentFromPaidOrder(paid.id, "stripe_webhook");
  return {
    ignored: false,
    order: queued.order,
    deployment: queued.deployment,
    created: queued.created,
    autoProvision: true,
  };
}

async function processStripeEvent(event: Stripe.Event) {
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    return await handlePaidCheckoutSession(
      session,
      event.type === "checkout.session.completed"
        ? "stripe.checkout.session.completed"
        : "stripe.checkout.session.async_payment_succeeded",
    );
  }

  if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    const order = billingStore.markOrderExpiredByCheckoutSession(String(session.id || ""));
    return {
      ignored: !order,
      reason: order ? null : "order_not_found",
      order,
    };
  }

  if (event.type === "checkout.session.async_payment_failed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const order = billingStore.getOrderByCheckoutSessionId(String(session.id || ""));
    if (!order) {
      return {
        ignored: true,
        reason: "order_not_found",
      };
    }
    const failed = billingStore.markOrderFailed(order.id, "Stripe async checkout payment failed");
    return {
      ignored: false,
      order: failed,
    };
  }

  return {
    ignored: true,
    reason: "event_type_not_handled",
  };
}

app.post("/v1/deployments", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => null);
  const parsed = deploymentCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(c, 400, "Invalid body", parsed.error.flatten());
  }

  try {
    const deployment = createDeploymentFromInput(parsed.data, { ownerUserId: userId });
    return c.json({
      ok: true,
      deployment,
    });
  } catch (error) {
    const typed = error as HttpError;
    return jsonError(c, Number.isFinite(typed.statusCode) ? Number(typed.statusCode) : 500, typed.message, typed.details);
  }
});

app.get("/v1/billing/plans", (c) => {
  return c.json({
    ok: true,
    plans: billingPlans,
    stripe: {
      enabled: stripeBilling.enabled,
      ready: stripeBilling.ready,
      issues: stripeBilling.issues,
    },
  });
});

app.post("/v1/billing/checkout", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = billingCheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(c, 400, "Invalid body", parsed.error.flatten());
  }

  const idempotencyKey = String(c.req.header("idempotency-key") || "").trim() || null;
  if (idempotencyKey && !/^[A-Za-z0-9._:-]{1,200}$/.test(idempotencyKey)) {
    return jsonError(c, 400, "Invalid Idempotency-Key header");
  }

  const plan = billingPlansById.get(parsed.data.planId);
  if (!plan) {
    return jsonError(c, 404, "Unknown billing plan");
  }

  if (!stripeBilling.ready) {
    return jsonError(c, 503, "Stripe billing is not ready", stripeBilling.issues);
  }

  try {
    assertDeploymentsWritable();
  } catch (error) {
    const typed = error as HttpError;
    return jsonError(
      c,
      Number.isFinite(typed.statusCode) ? Number(typed.statusCode) : 503,
      typed.message,
      typed.details,
    );
  }

  const successUrl = String(parsed.data.successUrl || stripeCheckoutSuccessUrlDefault || "").trim();
  const cancelUrl = String(parsed.data.cancelUrl || stripeCheckoutCancelUrlDefault || "").trim();
  if (!successUrl || !cancelUrl) {
    return jsonError(
      c,
      400,
      "successUrl and cancelUrl are required (either in request or STRIPE_CHECKOUT_* env vars)",
    );
  }

  let requestFingerprint = "";
  try {
    requestFingerprint = requestHash({
      planId: parsed.data.planId,
      deployment: parsed.data.deployment,
      customerEmail: parsed.data.customerEmail ?? null,
      successUrl,
      cancelUrl,
      metadata: parsed.data.metadata ?? {},
    });
  } catch {
    return jsonError(c, 400, "Unable to compute request fingerprint");
  }

  let idempotencyClaimed = false;
  if (idempotencyKey) {
    const begin = billingStore.beginCheckoutIdempotency(idempotencyKey, requestFingerprint);
    if (begin.state === "conflict") {
      return jsonError(c, 409, "Idempotency-Key already used with different payload");
    }
    if (begin.state === "completed") {
      return c.json(begin.response);
    }
    if (begin.state === "in_progress") {
      return jsonError(
        c,
        409,
        "Idempotency-Key request is already processing; retry shortly",
        { retryAfterSeconds: begin.retryAfterSeconds },
      );
    }
    idempotencyClaimed = true;
  }

  const orderId = crypto.randomUUID();
  const order = billingStore.createOrder({
    id: orderId,
    provider: "stripe",
    planId: plan.id,
    amountCents: plan.amountCents,
    currency: plan.currency,
    deploymentInputEncrypted: secretBox!.encryptObject(parsed.data.deployment),
    metadata: {
      ...(parsed.data.metadata ?? {}),
      planName: plan.name,
    },
    customerEmail: parsed.data.customerEmail,
  });

  try {
    const session = await stripeBilling.createCheckoutSession({
      orderId: order.id,
      planId: plan.id,
      customerEmail: parsed.data.customerEmail,
      idempotencyKey: idempotencyKey ? `checkout:${idempotencyKey}` : undefined,
      successUrl,
      cancelUrl,
      amountCents: plan.amountCents,
      currency: plan.currency,
      productName: plan.name,
      productDescription: plan.description,
    });

    const withCheckout = billingStore.setCheckoutSession(order.id, {
      checkoutSessionId: session.id,
      checkoutUrl: session.url ?? null,
    });

    const responsePayload = {
      ok: true,
      order: withCheckout ?? billingStore.getOrder(order.id),
      checkout: {
        sessionId: session.id,
        url: session.url ?? null,
      },
    };

    if (idempotencyKey && idempotencyClaimed) {
      billingStore.finalizeCheckoutIdempotency(idempotencyKey, requestFingerprint, responsePayload);
    }

    return c.json(responsePayload, 201);
  } catch (error) {
    if (idempotencyKey && idempotencyClaimed) {
      billingStore.clearCheckoutIdempotency(idempotencyKey, requestFingerprint);
    }

    const message = error instanceof Error ? error.message : String(error);
    const failed = billingStore.markOrderFailed(
      order.id,
      `Failed to create Stripe checkout session: ${message}`.slice(0, 1024),
    );
    return jsonError(c, 502, "Failed to create Stripe checkout session", {
      message,
      order: failed ?? billingStore.getOrder(order.id),
    });
  }
});

app.post("/v1/webhooks/stripe", async (c) => {
  if (!stripeBilling.ready) {
    return jsonError(c, 503, "Stripe billing is not ready", stripeBilling.issues);
  }

  const signature = String(c.req.header("stripe-signature") || "").trim();
  if (!signature) {
    return jsonError(c, 400, "Missing Stripe-Signature header");
  }

  const rawBody = await c.req.text();
  let event: Stripe.Event;
  try {
    event = stripeBilling.verifyWebhookEvent(rawBody, signature);
  } catch (error) {
    return jsonError(c, 400, "Invalid Stripe webhook signature", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const begin = billingStore.beginStripeWebhookEvent(event.id, event.type);
  if (!begin.shouldProcess) {
    return c.json({
      ok: true,
      deduplicated: true,
      eventId: event.id,
      eventType: event.type,
      status: begin.status,
    });
  }

  try {
    const result = await processStripeEvent(event);
    billingStore.completeStripeWebhookEvent(event.id, result.ignored ? "ignored" : "processed");
    return c.json({
      ok: true,
      eventId: event.id,
      eventType: event.type,
      ...result,
    });
  } catch (error) {
    const typed = error as HttpError;
    const message = typed.message || "Stripe webhook processing failed";
    billingStore.completeStripeWebhookEvent(event.id, "failed", message.slice(0, 1024));
    return jsonError(
      c,
      Number.isFinite(typed.statusCode) ? Number(typed.statusCode) : 500,
      "Stripe webhook processing failed",
      {
        eventId: event.id,
        eventType: event.type,
        message,
        details: typed.details,
      },
    );
  }
});

app.get("/v1/orders", (c) => {
  const limit = Number.parseInt(String(c.req.query("limit") || "50"), 10);
  const offset = Number.parseInt(String(c.req.query("offset") || "0"), 10);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 200)) : 50;
  const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;
  return c.json({
    ok: true,
    orders: billingStore.listOrders(safeLimit, safeOffset),
  });
});

app.get("/v1/orders/:id", (c) => {
  const order = billingStore.getOrder(c.req.param("id"));
  if (!order) {
    return jsonError(c, 404, "Order not found");
  }
  const limit = Number.parseInt(String(c.req.query("eventsLimit") || "200"), 10);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 500)) : 200;
  return c.json({
    ok: true,
    order,
    events: billingStore.listOrderEvents(order.id, safeLimit),
  });
});

app.post("/v1/orders/:id/provision", async (c) => {
  const orderId = c.req.param("id");
  try {
    const queued = await queueDeploymentFromPaidOrder(orderId, "manual_order_provision");
    return c.json({
      ok: true,
      order: queued.order,
      deployment: queued.deployment,
      created: queued.created,
    });
  } catch (error) {
    const typed = error as HttpError;
    return jsonError(
      c,
      Number.isFinite(typed.statusCode) ? Number(typed.statusCode) : 500,
      typed.message,
      typed.details,
    );
  }
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
  billingStore.close();
  deploymentsStore.close();
});

process.on("SIGTERM", () => {
  deploymentsWorker?.stop();
  billingStore.close();
  deploymentsStore.close();
});
