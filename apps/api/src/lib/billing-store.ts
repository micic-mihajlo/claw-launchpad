import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type BillingProvider = "stripe";
export type BillingOrderStatus =
  | "pending_payment"
  | "paid"
  | "deployment_created"
  | "expired"
  | "failed"
  | "canceled";

type BillingOrderRow = {
  id: string;
  provider: BillingProvider;
  status: BillingOrderStatus;
  plan_id: string;
  amount_cents: number;
  currency: string;
  deployment_input_encrypted: string;
  metadata_json: string | null;
  stripe_checkout_session_id: string | null;
  stripe_checkout_url: string | null;
  stripe_payment_intent_id: string | null;
  stripe_customer_id: string | null;
  customer_email: string | null;
  deployment_id: string | null;
  paid_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type BillingOrderEventRow = {
  id: number;
  order_id: string;
  type: string;
  message: string;
  payload_json: string | null;
  created_at: string;
};

type StripeWebhookEventRow = {
  event_id: string;
  event_type: string;
  status: "processing" | "processed" | "ignored" | "failed";
  error_message: string | null;
  received_at: string;
  processed_at: string | null;
  updated_at: string;
};

type CheckoutIdempotencyRow = {
  idempotency_key: string;
  request_hash: string;
  response_json: string;
  created_at: string;
};

export type BillingOrderPublic = {
  id: string;
  provider: BillingProvider;
  status: BillingOrderStatus;
  planId: string;
  amountCents: number;
  currency: string;
  metadata: Record<string, unknown>;
  stripeCheckoutSessionId: string | null;
  stripeCheckoutUrl: string | null;
  stripePaymentIntentId: string | null;
  stripeCustomerId: string | null;
  customerEmail: string | null;
  deploymentId: string | null;
  paidAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BillingOrderInternal = BillingOrderPublic & {
  deploymentInputEncrypted: string;
};

export type BillingOrderEvent = {
  id: number;
  orderId: string;
  type: string;
  message: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type CheckoutIdempotentResponse = {
  idempotencyKey: string;
  requestHash: string;
  response: Record<string, unknown>;
  createdAt: string;
};

export type CheckoutIdempotencyBeginResult =
  | { state: "acquired" }
  | { state: "completed"; response: Record<string, unknown> }
  | { state: "in_progress"; retryAfterSeconds: number }
  | { state: "conflict" };

export type WebhookBeginResult =
  | { shouldProcess: true }
  | {
      shouldProcess: false;
      status: StripeWebhookEventRow["status"];
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

const IDEMPOTENCY_IN_PROGRESS_STATE = "in_progress";

type IdempotencyInProgressMarker = {
  state: typeof IDEMPOTENCY_IN_PROGRESS_STATE;
  updatedAt: string;
};

function buildInProgressMarker(now: string): IdempotencyInProgressMarker {
  return {
    state: IDEMPOTENCY_IN_PROGRESS_STATE,
    updatedAt: now,
  };
}

export class BillingStore {
  readonly #db: Database.Database;

  constructor(dbPath: string) {
    const absolutePath = path.resolve(dbPath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    this.#db = new Database(absolutePath);
    this.#db.pragma("journal_mode = WAL");
    this.#db.pragma("foreign_keys = ON");
    this.#init();
  }

  close() {
    this.#db.close();
  }

  #init() {
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS billing_orders (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL CHECK(provider IN ('stripe')),
        status TEXT NOT NULL CHECK(status IN ('pending_payment','paid','deployment_created','expired','failed','canceled')),
        plan_id TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        currency TEXT NOT NULL,
        deployment_input_encrypted TEXT NOT NULL,
        metadata_json TEXT NULL,
        stripe_checkout_session_id TEXT NULL UNIQUE,
        stripe_checkout_url TEXT NULL,
        stripe_payment_intent_id TEXT NULL,
        stripe_customer_id TEXT NULL,
        customer_email TEXT NULL,
        deployment_id TEXT NULL,
        paid_at TEXT NULL,
        completed_at TEXT NULL,
        error_message TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS billing_order_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT NOT NULL REFERENCES billing_orders(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        payload_json TEXT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS stripe_webhook_events (
        event_id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('processing','processed','ignored','failed')),
        error_message TEXT NULL,
        received_at TEXT NOT NULL,
        processed_at TEXT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS billing_checkout_idempotency (
        idempotency_key TEXT PRIMARY KEY,
        request_hash TEXT NOT NULL,
        response_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_billing_orders_status ON billing_orders(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_billing_orders_plan ON billing_orders(plan_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_billing_order_events_order ON billing_order_events(order_id, id DESC);
      CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_status ON stripe_webhook_events(status, updated_at);
    `);
  }

  #toPublic(row: BillingOrderRow): BillingOrderPublic {
    return {
      id: row.id,
      provider: row.provider,
      status: row.status,
      planId: row.plan_id,
      amountCents: row.amount_cents,
      currency: row.currency,
      metadata: parseJson<Record<string, unknown>>(row.metadata_json, {}),
      stripeCheckoutSessionId: row.stripe_checkout_session_id,
      stripeCheckoutUrl: row.stripe_checkout_url,
      stripePaymentIntentId: row.stripe_payment_intent_id,
      stripeCustomerId: row.stripe_customer_id,
      customerEmail: row.customer_email,
      deploymentId: row.deployment_id,
      paidAt: row.paid_at,
      completedAt: row.completed_at,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  #toInternal(row: BillingOrderRow): BillingOrderInternal {
    return {
      ...this.#toPublic(row),
      deploymentInputEncrypted: row.deployment_input_encrypted,
    };
  }

  #getOrderRow(id: string): BillingOrderRow | null {
    const row = this.#db
      .prepare(
        `
      SELECT * FROM billing_orders WHERE id = ?
    `,
      )
      .get(id) as BillingOrderRow | undefined;
    return row ?? null;
  }

  getOrder(id: string): BillingOrderPublic | null {
    const row = this.#getOrderRow(id);
    if (!row) return null;
    return this.#toPublic(row);
  }

  getOrderInternal(id: string): BillingOrderInternal | null {
    const row = this.#getOrderRow(id);
    if (!row) return null;
    return this.#toInternal(row);
  }

  getOrderByCheckoutSessionId(checkoutSessionId: string): BillingOrderPublic | null {
    const row = this.#db
      .prepare(
        `
      SELECT * FROM billing_orders WHERE stripe_checkout_session_id = ?
    `,
      )
      .get(checkoutSessionId) as BillingOrderRow | undefined;
    if (!row) return null;
    return this.#toPublic(row);
  }

  listOrders(limit = 50, offset = 0): BillingOrderPublic[] {
    const rows = this.#db
      .prepare(
        `
      SELECT * FROM billing_orders
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `,
      )
      .all(limit, offset) as BillingOrderRow[];
    return rows.map((row) => this.#toPublic(row));
  }

  listOrderEvents(orderId: string, limit = 200): BillingOrderEvent[] {
    const rows = this.#db
      .prepare(
        `
      SELECT id, order_id, type, message, payload_json, created_at
      FROM billing_order_events
      WHERE order_id = ?
      ORDER BY id DESC
      LIMIT ?
    `,
      )
      .all(orderId, limit) as BillingOrderEventRow[];
    return rows.map((row) => ({
      id: row.id,
      orderId: row.order_id,
      type: row.type,
      message: row.message,
      payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
      createdAt: row.created_at,
    }));
  }

  appendOrderEvent(
    orderId: string,
    type: string,
    message: string,
    payload?: Record<string, unknown>,
  ): BillingOrderEvent {
    const createdAt = nowIso();
    const result = this.#db
      .prepare(
        `
      INSERT INTO billing_order_events (
        order_id, type, message, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `,
      )
      .run(
        orderId,
        type,
        message,
        payload ? JSON.stringify(payload) : null,
        createdAt,
      );
    return {
      id: Number(result.lastInsertRowid),
      orderId,
      type,
      message,
      payload: payload ?? {},
      createdAt,
    };
  }

  createOrder(input: {
    id: string;
    provider: BillingProvider;
    planId: string;
    amountCents: number;
    currency: string;
    deploymentInputEncrypted: string;
    metadata?: Record<string, unknown>;
    customerEmail?: string;
  }): BillingOrderPublic {
    const createdAt = nowIso();
    this.#db
      .prepare(
        `
      INSERT INTO billing_orders (
        id, provider, status, plan_id, amount_cents, currency, deployment_input_encrypted, metadata_json, customer_email, created_at, updated_at
      ) VALUES (?, ?, 'pending_payment', ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        input.id,
        input.provider,
        input.planId,
        input.amountCents,
        input.currency,
        input.deploymentInputEncrypted,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.customerEmail ?? null,
        createdAt,
        createdAt,
      );
    this.appendOrderEvent(input.id, "order.created", "Order created and awaiting payment", {
      planId: input.planId,
      amountCents: input.amountCents,
      currency: input.currency,
    });
    const created = this.getOrder(input.id);
    if (!created) {
      throw new Error("Failed to read order after create");
    }
    return created;
  }

  setCheckoutSession(
    orderId: string,
    payload: {
      checkoutSessionId: string;
      checkoutUrl: string | null;
    },
  ): BillingOrderPublic | null {
    const updatedAt = nowIso();
    const row = this.#db
      .prepare(
        `
      UPDATE billing_orders
      SET
        stripe_checkout_session_id = ?,
        stripe_checkout_url = ?,
        updated_at = ?
      WHERE id = ? AND status = 'pending_payment'
      RETURNING *
    `,
      )
      .get(payload.checkoutSessionId, payload.checkoutUrl, updatedAt, orderId) as BillingOrderRow | undefined;
    if (!row) return this.getOrder(orderId);
    this.appendOrderEvent(orderId, "order.checkout_session.created", "Stripe checkout session created", {
      checkoutSessionId: payload.checkoutSessionId,
    });
    return this.#toPublic(row);
  }

  markOrderPaid(
    orderId: string,
    payload: {
      stripeCheckoutSessionId: string;
      stripePaymentIntentId?: string | null;
      stripeCustomerId?: string | null;
      customerEmail?: string | null;
    },
  ): BillingOrderPublic | null {
    const existing = this.#getOrderRow(orderId);
    if (!existing) return null;
    if (existing.status === "expired" || existing.status === "canceled") {
      return this.#toPublic(existing);
    }
    if (!["pending_payment", "paid", "failed"].includes(existing.status)) {
      return this.#toPublic(existing);
    }

    const updatedAt = nowIso();
    const paidAt = nowIso();
    const row = this.#db
      .prepare(
        `
      UPDATE billing_orders
      SET
        status = CASE
          WHEN status IN ('pending_payment','failed') THEN 'paid'
          ELSE status
        END,
        stripe_checkout_session_id = COALESCE(stripe_checkout_session_id, ?),
        stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, ?),
        stripe_customer_id = COALESCE(stripe_customer_id, ?),
        customer_email = COALESCE(customer_email, ?),
        paid_at = COALESCE(paid_at, ?),
        error_message = CASE
          WHEN status IN ('pending_payment','failed') THEN NULL
          ELSE error_message
        END,
        updated_at = ?
      WHERE id = ? AND status IN ('pending_payment','paid','failed')
      RETURNING *
    `,
      )
      .get(
        payload.stripeCheckoutSessionId,
        payload.stripePaymentIntentId ?? null,
        payload.stripeCustomerId ?? null,
        payload.customerEmail ?? null,
        paidAt,
        updatedAt,
        orderId,
      ) as BillingOrderRow | undefined;
    if (!row) return this.getOrder(orderId);
    if (row.status === "paid" && existing.status !== "paid") {
      this.appendOrderEvent(orderId, "order.paid", "Payment received", {
        checkoutSessionId: payload.stripeCheckoutSessionId,
        paymentIntentId: payload.stripePaymentIntentId ?? null,
        customerId: payload.stripeCustomerId ?? null,
      });
    }
    return this.#toPublic(row);
  }

  markOrderExpiredByCheckoutSession(checkoutSessionId: string): BillingOrderPublic | null {
    const updatedAt = nowIso();
    const row = this.#db
      .prepare(
        `
      UPDATE billing_orders
      SET
        status = 'expired',
        completed_at = ?,
        updated_at = ?
      WHERE stripe_checkout_session_id = ?
        AND status = 'pending_payment'
      RETURNING *
    `,
      )
      .get(updatedAt, updatedAt, checkoutSessionId) as BillingOrderRow | undefined;
    if (!row) {
      return this.getOrderByCheckoutSessionId(checkoutSessionId);
    }
    this.appendOrderEvent(row.id, "order.expired", "Stripe checkout session expired", {
      checkoutSessionId,
    });
    return this.#toPublic(row);
  }

  markOrderDeploymentCreated(orderId: string, deploymentId: string): BillingOrderPublic | null {
    const existing = this.#getOrderRow(orderId);
    if (!existing) return null;
    if (existing.status === "deployment_created") {
      return this.#toPublic(existing);
    }
    if (existing.status !== "paid") {
      return this.#toPublic(existing);
    }

    const updatedAt = nowIso();
    const row = this.#db
      .prepare(
        `
      UPDATE billing_orders
      SET
        status = 'deployment_created',
        deployment_id = ?,
        error_message = NULL,
        completed_at = COALESCE(completed_at, ?),
        updated_at = ?
      WHERE id = ? AND status = 'paid'
      RETURNING *
    `,
      )
      .get(deploymentId, updatedAt, updatedAt, orderId) as BillingOrderRow | undefined;
    if (!row) return this.getOrder(orderId);
    this.appendOrderEvent(orderId, "order.deployment.created", "Deployment created from paid order", {
      deploymentId,
    });
    return this.#toPublic(row);
  }

  markOrderFailed(orderId: string, message: string): BillingOrderPublic | null {
    const existing = this.#getOrderRow(orderId);
    if (!existing) return null;
    if (existing.status === "deployment_created" || existing.status === "expired" || existing.status === "canceled") {
      return this.#toPublic(existing);
    }

    const nextStatus: BillingOrderStatus =
      existing.status === "pending_payment" || existing.status === "paid"
        ? "failed"
        : existing.status;
    const updatedAt = nowIso();
    const row = this.#db
      .prepare(
        `
      UPDATE billing_orders
      SET
        status = ?,
        error_message = ?,
        updated_at = ?
      WHERE id = ?
      RETURNING *
    `,
      )
      .get(nextStatus, message, updatedAt, orderId) as BillingOrderRow | undefined;
    if (!row) return this.getOrder(orderId);
    this.appendOrderEvent(orderId, "order.failed", "Order processing failed", {
      error: message,
    });
    return this.#toPublic(row);
  }

  beginCheckoutIdempotency(
    idempotencyKey: string,
    requestHash: string,
    options: {
      staleAfterMs?: number;
    } = {},
  ): CheckoutIdempotencyBeginResult {
    const staleAfterMs = Math.max(30_000, Number(options.staleAfterMs || 2 * 60_000));
    const tx = this.#db.transaction(
      (key: string, hash: string, staleMs: number): CheckoutIdempotencyBeginResult => {
        const now = nowIso();
        const existing = this.#db
          .prepare(
            `
          SELECT * FROM billing_checkout_idempotency WHERE idempotency_key = ?
        `,
          )
          .get(key) as CheckoutIdempotencyRow | undefined;

        if (!existing) {
          this.#db
            .prepare(
              `
            INSERT INTO billing_checkout_idempotency (
              idempotency_key, request_hash, response_json, created_at
            ) VALUES (?, ?, ?, ?)
          `,
            )
            .run(key, hash, JSON.stringify(buildInProgressMarker(now)), now);
          return { state: "acquired" };
        }

        if (existing.request_hash !== hash) {
          return { state: "conflict" };
        }

        const parsed = parseJson<Record<string, unknown>>(existing.response_json, {});
        const inProgress =
          parsed.state === IDEMPOTENCY_IN_PROGRESS_STATE
            ? (parsed as Partial<IdempotencyInProgressMarker>)
            : null;

        if (!inProgress) {
          return { state: "completed", response: parsed };
        }

        const lastUpdatedRaw = typeof inProgress.updatedAt === "string" ? inProgress.updatedAt : existing.created_at;
        const lastUpdatedMs = Date.parse(lastUpdatedRaw);
        if (Number.isFinite(lastUpdatedMs) && Date.now() - lastUpdatedMs < staleMs) {
          const remainingMs = Math.max(1000, staleMs - (Date.now() - lastUpdatedMs));
          return {
            state: "in_progress",
            retryAfterSeconds: Math.ceil(remainingMs / 1000),
          };
        }

        this.#db
          .prepare(
            `
          UPDATE billing_checkout_idempotency
          SET response_json = ?, created_at = ?
          WHERE idempotency_key = ? AND request_hash = ?
        `,
          )
          .run(JSON.stringify(buildInProgressMarker(now)), now, key, hash);

        return { state: "acquired" };
      },
    );

    return tx(idempotencyKey, requestHash, staleAfterMs);
  }

  finalizeCheckoutIdempotency(
    idempotencyKey: string,
    requestHash: string,
    response: Record<string, unknown>,
  ): CheckoutIdempotentResponse {
    const updated = this.#db
      .prepare(
        `
      UPDATE billing_checkout_idempotency
      SET response_json = ?
      WHERE idempotency_key = ? AND request_hash = ?
    `,
      )
      .run(JSON.stringify(response), idempotencyKey, requestHash);
    if (updated.changes === 0) {
      throw new Error("Failed to finalize checkout idempotency response");
    }

    const row = this.#db
      .prepare(
        `
      SELECT * FROM billing_checkout_idempotency
      WHERE idempotency_key = ? AND request_hash = ?
    `,
      )
      .get(idempotencyKey, requestHash) as CheckoutIdempotencyRow | undefined;
    if (!row) {
      throw new Error("Failed to load finalized checkout idempotency response");
    }

    return {
      idempotencyKey: row.idempotency_key,
      requestHash: row.request_hash,
      response: parseJson<Record<string, unknown>>(row.response_json, {}),
      createdAt: row.created_at,
    };
  }

  clearCheckoutIdempotency(idempotencyKey: string, requestHash: string) {
    this.#db
      .prepare(
        `
      DELETE FROM billing_checkout_idempotency
      WHERE idempotency_key = ? AND request_hash = ?
    `,
      )
      .run(idempotencyKey, requestHash);
  }

  beginStripeWebhookEvent(
    eventId: string,
    eventType: string,
    options: {
      processingTimeoutMs?: number;
    } = {},
  ): WebhookBeginResult {
    const processingTimeoutMs = Math.max(15_000, Number(options.processingTimeoutMs || 5 * 60_000));

    const tx = this.#db.transaction(
      (id: string, type: string, timeoutMs: number): WebhookBeginResult => {
        const existing = this.#db
          .prepare(
            `
        SELECT * FROM stripe_webhook_events WHERE event_id = ?
      `,
          )
          .get(id) as StripeWebhookEventRow | undefined;

        if (!existing) {
          const now = nowIso();
          this.#db
            .prepare(
              `
          INSERT INTO stripe_webhook_events (
            event_id, event_type, status, error_message, received_at, processed_at, updated_at
          ) VALUES (?, ?, 'processing', NULL, ?, NULL, ?)
        `,
            )
            .run(id, type, now, now);
          return { shouldProcess: true };
        }

        if (existing.status === "processed" || existing.status === "ignored") {
          return { shouldProcess: false, status: existing.status };
        }

        if (existing.status === "processing") {
          const updatedAtMs = Date.parse(existing.updated_at || existing.received_at);
          if (Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs < timeoutMs) {
            return { shouldProcess: false, status: existing.status };
          }

          const now = nowIso();
          this.#db
            .prepare(
              `
          UPDATE stripe_webhook_events
          SET
            event_type = ?,
            status = 'processing',
            error_message = 'Recovered stale processing lease',
            updated_at = ?
          WHERE event_id = ?
        `,
            )
            .run(type, now, id);
          return { shouldProcess: true };
        }

        const now = nowIso();
        this.#db
          .prepare(
            `
        UPDATE stripe_webhook_events
        SET
          event_type = ?,
          status = 'processing',
          error_message = NULL,
          updated_at = ?
        WHERE event_id = ?
      `,
          )
          .run(type, now, id);
        return { shouldProcess: true };
      },
    );
    return tx(eventId, eventType, processingTimeoutMs);
  }

  completeStripeWebhookEvent(
    eventId: string,
    status: "processed" | "ignored" | "failed",
    errorMessage?: string,
  ) {
    const now = nowIso();
    this.#db
      .prepare(
        `
      UPDATE stripe_webhook_events
      SET
        status = ?,
        error_message = ?,
        processed_at = CASE WHEN ? IN ('processed','ignored') THEN ? ELSE processed_at END,
        updated_at = ?
      WHERE event_id = ?
    `,
      )
      .run(status, errorMessage ?? null, status, now, now, eventId);
  }
}
