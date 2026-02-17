import Stripe from "stripe";

export type StripeBillingClientOptions = {
  secretKey?: string;
  webhookSecret?: string;
  timeoutMs?: number;
};

export type CheckoutSessionInput = {
  orderId: string;
  planId: string;
  customerEmail?: string;
  idempotencyKey?: string;
  successUrl: string;
  cancelUrl: string;
  amountCents: number;
  currency: string;
  productName: string;
  productDescription?: string;
};

export class StripeBillingClient {
  readonly enabled: boolean;
  readonly ready: boolean;
  readonly issues: string[];
  readonly #stripe: Stripe | null;
  readonly #webhookSecret: string;

  constructor(options: StripeBillingClientOptions) {
    const secretKey = String(options.secretKey || "").trim();
    this.#webhookSecret = String(options.webhookSecret || "").trim();
    this.issues = [];

    this.enabled = Boolean(secretKey);
    if (!secretKey) {
      this.issues.push("STRIPE_SECRET_KEY missing");
      this.ready = false;
      this.#stripe = null;
      return;
    }

    if (!this.#webhookSecret) {
      this.issues.push("STRIPE_WEBHOOK_SECRET missing");
    }

    this.#stripe = new Stripe(secretKey, {
      timeout: Math.max(5_000, Number(options.timeoutMs || 20_000)),
    });
    this.ready = this.issues.length === 0;
  }

  async createCheckoutSession(input: CheckoutSessionInput): Promise<Stripe.Checkout.Session> {
    if (!this.#stripe) {
      throw new Error("Stripe client is not configured");
    }

    return await this.#stripe.checkout.sessions.create(
      {
        mode: "payment",
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        client_reference_id: input.orderId,
        customer_email: input.customerEmail,
        metadata: {
          order_id: input.orderId,
          plan_id: input.planId,
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: input.currency,
              unit_amount: input.amountCents,
              product_data: {
                name: input.productName,
                description: input.productDescription,
              },
            },
          },
        ],
      },
      {
        idempotencyKey: input.idempotencyKey || `order:${input.orderId}`,
      },
    );
  }

  verifyWebhookEvent(rawBody: string, signatureHeader: string): Stripe.Event {
    if (!this.#stripe) {
      throw new Error("Stripe client is not configured");
    }
    if (!this.#webhookSecret) {
      throw new Error("Stripe webhook secret is not configured");
    }
    return this.#stripe.webhooks.constructEvent(rawBody, signatureHeader, this.#webhookSecret);
  }
}
