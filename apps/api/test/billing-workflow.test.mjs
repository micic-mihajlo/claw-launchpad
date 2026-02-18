import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";
import { BillingStore } from "../dist/lib/billing-store.js";
import { SecretBox } from "../dist/lib/crypto.js";

const thisFilePath = fileURLToPath(import.meta.url);
const testDir = path.dirname(thisFilePath);
const apiDir = path.resolve(testDir, "..");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFreePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  if (!address || typeof address === "string") {
    throw new Error("Failed to allocate free TCP port");
  }
  return address.port;
}

function authHeaders(token, extra = {}) {
  return {
    authorization: `Bearer ${token}`,
    ...extra,
  };
}

function makeStripeWebhookPayload(type, session) {
  return JSON.stringify({
    id: `evt_${crypto.randomUUID().replaceAll("-", "")}`,
    object: "event",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: session,
    },
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: null,
      idempotency_key: null,
    },
    type,
  });
}

function signStripePayload(payload, secret) {
  return Stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
  });
}

async function postStripeWebhook(baseUrl, type, session, stripeWebhookSecret) {
  const payload = makeStripeWebhookPayload(type, session);
  const response = await fetch(`${baseUrl}/v1/webhooks/stripe`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signStripePayload(payload, stripeWebhookSecret),
    },
    body: payload,
  });
  return {
    payload,
    response,
  };
}

async function waitForServerReady(baseUrl, child, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const exited = child.exitCode !== null;
    if (exited) {
      throw new Error(`API process exited early with code ${child.exitCode}`);
    }

    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Server not ready yet.
    }
    await sleep(100);
  }
  throw new Error(`API did not become ready at ${baseUrl} within ${timeoutMs}ms`);
}

async function stopServer(child) {
  if (child.exitCode !== null) {
    return;
  }
  child.kill("SIGTERM");
  const timeout = sleep(2_000).then(() => "timeout");
  const exited = once(child, "exit").then(() => "exited");
  const result = await Promise.race([timeout, exited]);
  if (result === "timeout" && child.exitCode === null) {
    child.kill("SIGKILL");
    await once(child, "exit");
  }
}

async function createContext(
  t,
  options = {},
) {
  const tmpRoot = await mkdtemp(path.join(tmpdir(), "clawpad-api-test-"));
  const deploymentsDbPath = path.join(tmpRoot, "deployments.db");
  const billingDbPath = path.join(tmpRoot, "billing.db");
  const sshPubPath = path.join(tmpRoot, "id_ed25519.pub");
  const {
    apiToken = "test-api-token",
    env: contextEnv = {},
  } = options;
  const stripeWebhookSecret = "whsec_test_local";
  const deploymentKey = "test-deployment-encryption-key";
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  await writeFile(
    sshPubPath,
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestOnlyFakeKeyNotForUse clawpad@test\n",
    "utf8",
  );

  const child = spawn(process.execPath, ["dist/server.js"], {
    cwd: apiDir,
    env: {
      ...process.env,
      ...contextEnv,
      PORT: String(port),
      API_BEARER_TOKEN: apiToken,
      DEPLOYMENTS_DB_PATH: deploymentsDbPath,
      BILLING_DB_PATH: billingDbPath,
      DEPLOYMENTS_ENCRYPTION_KEY: deploymentKey,
      DEPLOY_WORKER_ENABLED: "false",
      PROVISIONER_SSH_PUBLIC_KEY_PATH: sshPubPath,
      STRIPE_SECRET_KEY: "sk_test_local_dummy",
      STRIPE_WEBHOOK_SECRET: stripeWebhookSecret,
      BILLING_AUTO_PROVISION_ON_PAYMENT: "true",
      STRIPE_CHECKOUT_SUCCESS_URL: "https://example.com/success",
      STRIPE_CHECKOUT_CANCEL_URL: "https://example.com/cancel",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  try {
    await waitForServerReady(baseUrl, child);
  } catch (error) {
    await stopServer(child);
    throw new Error(
      `Failed to start API server: ${error instanceof Error ? error.message : String(error)}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
    );
  }

  t.after(async () => {
    await stopServer(child);
    await rm(tmpRoot, { recursive: true, force: true });
  });

  function openBillingStore() {
    return new BillingStore(billingDbPath);
  }

  async function getDeployments() {
    const response = await fetch(`${baseUrl}/v1/deployments`, {
      headers: authHeaders(apiToken),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    return body.deployments;
  }

  async function getOrder(orderId) {
    const response = await fetch(`${baseUrl}/v1/orders/${orderId}`, {
      headers: authHeaders(apiToken),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    return body.order;
  }

  return {
    apiToken,
    baseUrl,
    billingDbPath,
    deploymentKey,
    stripeWebhookSecret,
    openBillingStore,
    getDeployments,
    getOrder,
  };
}

function createEncryptedDeploymentInput(deploymentKey, override = {}) {
  const box = new SecretBox(deploymentKey);
  return box.encryptObject({
    name: `agent-${crypto.randomUUID().slice(0, 8)}`,
    hetznerApiToken: "hetzner-token-placeholder",
    tailscaleAuthKey: "tailscale-auth-token-placeholder",
    ...override,
  });
}

test("auth protects /v1 routes while Stripe webhook stays signature-based", async (t) => {
  const ctx = await createContext(t);

  const noAuthOrders = await fetch(`${ctx.baseUrl}/v1/orders`);
  assert.equal(noAuthOrders.status, 401);
  assert.deepEqual(await noAuthOrders.json(), { ok: false, error: "Unauthorized" });

  const withAuthOrders = await fetch(`${ctx.baseUrl}/v1/orders`, {
    headers: authHeaders(ctx.apiToken),
  });
  assert.equal(withAuthOrders.status, 200);

  const webhookWithoutSignature = await fetch(`${ctx.baseUrl}/v1/webhooks/stripe`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: "{}",
  });
  assert.equal(webhookWithoutSignature.status, 400);
  assert.deepEqual(await webhookWithoutSignature.json(), {
    ok: false,
    error: "Missing Stripe-Signature header",
  });
});

test("control-plane health endpoint requires authentication", async (t) => {
  const ctx = await createContext(t);

  const noAuth = await fetch(`${ctx.baseUrl}/v1/control-plane/health`);
  assert.equal(noAuth.status, 401);
  assert.deepEqual(await noAuth.json(), { ok: false, error: "Unauthorized" });

  const withAuth = await fetch(`${ctx.baseUrl}/v1/control-plane/health`, {
    headers: authHeaders(ctx.apiToken),
  });
  assert.equal(withAuth.status, 200);
  const body = await withAuth.json();
  assert.equal(body.ok, true);
});

test("prototype token names are rejected during auth", async (t) => {
  const ctx = await createContext(t);

  for (const token of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"]) {
    const response = await fetch(`${ctx.baseUrl}/v1/orders`, {
      headers: authHeaders(token),
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, error: "Unauthorized" });
  }
});

test("checkout.session.completed with unpaid status stays pending until async success", async (t) => {
  const ctx = await createContext(t);
  const store = ctx.openBillingStore();

  const order = store.createOrder({
    id: crypto.randomUUID(),
    provider: "stripe",
    planId: "hetzner-cx23-launch",
    amountCents: 4900,
    currency: "usd",
    deploymentInputEncrypted: createEncryptedDeploymentInput(ctx.deploymentKey),
  });

  const checkoutSessionId = `cs_test_${crypto.randomUUID().replaceAll("-", "")}`;
  store.setCheckoutSession(order.id, {
    checkoutSessionId,
    checkoutUrl: null,
  });
  store.close();

  const payload = makeStripeWebhookPayload("checkout.session.completed", {
    id: checkoutSessionId,
    object: "checkout.session",
    client_reference_id: order.id,
    metadata: { order_id: order.id },
    payment_status: "unpaid",
    payment_intent: null,
    customer: null,
    customer_email: "pending@example.com",
    customer_details: { email: "pending@example.com" },
    url: `https://checkout.stripe.com/pay/${checkoutSessionId}`,
  });

  const webhookResponse = await fetch(`${ctx.baseUrl}/v1/webhooks/stripe`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signStripePayload(payload, ctx.stripeWebhookSecret),
    },
    body: payload,
  });
  assert.equal(webhookResponse.status, 200);
  const webhookBody = await webhookResponse.json();
  assert.equal(webhookBody.pendingAsyncPayment, true);
  assert.equal(webhookBody.paymentStatus, "unpaid");

  const orderAfter = await ctx.getOrder(order.id);
  assert.equal(orderAfter.status, "pending_payment");
  assert.equal(orderAfter.deploymentId, null);

  const deployments = await ctx.getDeployments();
  assert.equal(deployments.length, 0);
});

test("checkout.session.async_payment_failed can retry and still succeed later", async (t) => {
  const ctx = await createContext(t);
  const store = ctx.openBillingStore();

  const order = store.createOrder({
    id: crypto.randomUUID(),
    provider: "stripe",
    planId: "hetzner-cx23-launch",
    amountCents: 4900,
    currency: "usd",
    deploymentInputEncrypted: createEncryptedDeploymentInput(ctx.deploymentKey),
  });

  const checkoutSessionId = `cs_test_${crypto.randomUUID().replaceAll("-", "")}`;
  store.setCheckoutSession(order.id, {
    checkoutSessionId,
    checkoutUrl: null,
  });
  store.close();

  const failedPayload = {
    id: checkoutSessionId,
    object: "checkout.session",
    client_reference_id: order.id,
    metadata: { order_id: order.id },
    payment_status: "failed",
    payment_intent: `pi_${crypto.randomUUID().replaceAll("-", "")}`,
    customer: `cus_${crypto.randomUUID().replaceAll("-", "")}`,
    customer_email: "retry@example.com",
    customer_details: { email: "retry@example.com" },
    url: `https://checkout.stripe.com/pay/${checkoutSessionId}`,
  };

  const { response: failedResponse } = await postStripeWebhook(
    ctx.baseUrl,
    "checkout.session.async_payment_failed",
    failedPayload,
    ctx.stripeWebhookSecret,
  );
  assert.equal(failedResponse.status, 200);
  const failedBody = await failedResponse.json();
  assert.equal(failedBody.order.status, "failed");

  const failedOrder = await ctx.getOrder(order.id);
  assert.equal(failedOrder.status, "failed");
  const deploymentsAfterFailure = await ctx.getDeployments();
  assert.equal(deploymentsAfterFailure.length, 0);

  const succeededPayload = {
    id: checkoutSessionId,
    object: "checkout.session",
    client_reference_id: order.id,
    metadata: { order_id: order.id },
    payment_status: "paid",
    payment_intent: `pi_${crypto.randomUUID().replaceAll("-", "")}`,
    customer: `cus_${crypto.randomUUID().replaceAll("-", "")}`,
    customer_email: "retry@example.com",
    customer_details: { email: "retry@example.com" },
    url: `https://checkout.stripe.com/pay/${checkoutSessionId}`,
  };

  const { response: succeededResponse } = await postStripeWebhook(
    ctx.baseUrl,
    "checkout.session.async_payment_succeeded",
    succeededPayload,
    ctx.stripeWebhookSecret,
  );
  assert.equal(succeededResponse.status, 200);
  assert.equal((await succeededResponse.json()).order.status, "deployment_created");

  const orderAfter = await ctx.getOrder(order.id);
  assert.equal(orderAfter.status, "deployment_created");
  const deploymentsAfterSuccess = await ctx.getDeployments();
  assert.equal(deploymentsAfterSuccess.length, 1);
  assert.equal(deploymentsAfterSuccess[0].billingRef, order.id);
});

test("checkout.session.async_payment_succeeded marks paid and queues deployment", async (t) => {
  const ctx = await createContext(t);
  const store = ctx.openBillingStore();

  const order = store.createOrder({
    id: crypto.randomUUID(),
    provider: "stripe",
    planId: "hetzner-cx23-launch",
    amountCents: 4900,
    currency: "usd",
    deploymentInputEncrypted: createEncryptedDeploymentInput(ctx.deploymentKey),
  });

  const checkoutSessionId = `cs_test_${crypto.randomUUID().replaceAll("-", "")}`;
  store.setCheckoutSession(order.id, {
    checkoutSessionId,
    checkoutUrl: null,
  });
  store.close();

  const payload = makeStripeWebhookPayload("checkout.session.async_payment_succeeded", {
    id: checkoutSessionId,
    object: "checkout.session",
    client_reference_id: order.id,
    metadata: { order_id: order.id },
    payment_status: "paid",
    payment_intent: `pi_${crypto.randomUUID().replaceAll("-", "")}`,
    customer: `cus_${crypto.randomUUID().replaceAll("-", "")}`,
    customer_email: "paid@example.com",
    customer_details: { email: "paid@example.com" },
    url: `https://checkout.stripe.com/pay/${checkoutSessionId}`,
  });

  const webhookResponse = await fetch(`${ctx.baseUrl}/v1/webhooks/stripe`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signStripePayload(payload, ctx.stripeWebhookSecret),
    },
    body: payload,
  });
  assert.equal(webhookResponse.status, 200);

  const orderAfter = await ctx.getOrder(order.id);
  assert.equal(orderAfter.status, "deployment_created");
  assert.notEqual(orderAfter.deploymentId, null);
  assert.notEqual(orderAfter.paidAt, null);

  const deployments = await ctx.getDeployments();
  assert.equal(deployments.length, 1);
  assert.equal(deployments[0].billingRef, order.id);
});

test("deployment_created orders stay deployment_created even when failed is reported", async (t) => {
  const tmpRoot = await mkdtemp(path.join(tmpdir(), "clawpad-billing-store-"));
  const billingDbPath = path.join(tmpRoot, "billing.db");
  const deploymentKey = "test-deployment-encryption-key";
  const store = new BillingStore(billingDbPath);
  const box = new SecretBox(deploymentKey);

  t.after(async () => {
    store.close();
    await rm(tmpRoot, { recursive: true, force: true });
  });

  const order = store.createOrder({
    id: crypto.randomUUID(),
    provider: "stripe",
    planId: "hetzner-cx23-launch",
    amountCents: 4900,
    currency: "usd",
    deploymentInputEncrypted: box.encryptObject({
      name: "store-guard",
      hetznerApiToken: "hetzner-token-placeholder",
      tailscaleAuthKey: "tailscale-auth-key",
    }),
  });

  const checkoutSessionId = `cs_test_${crypto.randomUUID().replaceAll("-", "")}`;
  store.setCheckoutSession(order.id, {
    checkoutSessionId,
    checkoutUrl: null,
  });
  store.markOrderPaid(order.id, {
    stripeCheckoutSessionId: checkoutSessionId,
    customerEmail: "guard@example.com",
  });
  const deploymentCreated = store.markOrderDeploymentCreated(order.id, `dep-${crypto.randomUUID().slice(0, 8)}`);
  assert.equal(deploymentCreated?.status, "deployment_created");

  const beforeFailed = store.getOrder(order.id);
  assert.equal(beforeFailed?.status, "deployment_created");
  assert.equal(beforeFailed?.errorMessage, null);
  const afterFailed = store.markOrderFailed(order.id, "provider network error");

  assert.equal(afterFailed?.status, "deployment_created");
  assert.equal(afterFailed?.errorMessage, null);
  const finalOrder = store.getOrder(order.id);
  assert.equal(finalOrder?.status, "deployment_created");
  assert.equal(finalOrder?.errorMessage, null);
});

test("manual order provisioning is idempotent and never creates duplicate deployments", async (t) => {
  const ctx = await createContext(t);
  const store = ctx.openBillingStore();

  const order = store.createOrder({
    id: crypto.randomUUID(),
    provider: "stripe",
    planId: "hetzner-cx23-launch",
    amountCents: 4900,
    currency: "usd",
    deploymentInputEncrypted: createEncryptedDeploymentInput(ctx.deploymentKey),
  });

  const checkoutSessionId = `cs_paid_${crypto.randomUUID().replaceAll("-", "")}`;
  store.setCheckoutSession(order.id, {
    checkoutSessionId,
    checkoutUrl: null,
  });
  store.markOrderPaid(order.id, {
    stripeCheckoutSessionId: checkoutSessionId,
    customerEmail: "paid-now@example.com",
  });
  store.close();

  const request = () =>
    fetch(`${ctx.baseUrl}/v1/orders/${order.id}/provision`, {
      method: "POST",
      headers: authHeaders(ctx.apiToken),
    });

  const [first, second] = await Promise.all([request(), request()]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);

  const firstBody = await first.json();
  const secondBody = await second.json();
  assert.equal(firstBody.ok, true);
  assert.equal(secondBody.ok, true);
  assert.equal(Boolean(firstBody.created) || Boolean(secondBody.created), true);

  const deployments = await ctx.getDeployments();
  assert.equal(deployments.length, 1);
  assert.equal(deployments[0].billingRef, order.id);

  const orderAfter = await ctx.getOrder(order.id);
  assert.equal(orderAfter.status, "deployment_created");
  assert.equal(orderAfter.deploymentId, deployments[0].id);
});

test("manual provisioning assigns deployment to the authenticated user", async (t) => {
  const ctx = await createContext(t, {
    apiToken: "user-token-1",
    env: {
      AUTH_ENABLED: "true",
      AUTH_TOKEN_MAP: JSON.stringify({
        "user-token-1": "tenant-user-1",
      }),
      AUTH_DEFAULT_USER_ID: "system",
    },
  });
  const store = ctx.openBillingStore();

  const order = store.createOrder({
    id: crypto.randomUUID(),
    provider: "stripe",
    planId: "hetzner-cx23-launch",
    amountCents: 4900,
    currency: "usd",
    deploymentInputEncrypted: createEncryptedDeploymentInput(ctx.deploymentKey),
  });

  const checkoutSessionId = `cs_paid_${crypto.randomUUID().replaceAll("-", "")}`;
  store.setCheckoutSession(order.id, {
    checkoutSessionId,
    checkoutUrl: null,
  });
  store.markOrderPaid(order.id, {
    stripeCheckoutSessionId: checkoutSessionId,
    customerEmail: "tenant1@example.com",
  });
  store.close();

  const provisionResponse = await fetch(`${ctx.baseUrl}/v1/orders/${order.id}/provision`, {
    method: "POST",
    headers: authHeaders(ctx.apiToken),
  });
  assert.equal(provisionResponse.status, 200);
  const provisionBody = await provisionResponse.json();
  assert.equal(provisionBody.ok, true);
  assert.equal(provisionBody.deployment.ownerUserId, "tenant-user-1");

  const deployments = await ctx.getDeployments();
  assert.equal(deployments.length, 1);
  assert.equal(deployments[0].ownerUserId, "tenant-user-1");
});
