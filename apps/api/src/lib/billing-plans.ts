export type BillingPlan = {
  id: string;
  name: string;
  description?: string;
  amountCents: number;
  currency: string;
};

const DEFAULT_PLANS: BillingPlan[] = [
  {
    id: "hetzner-cx23-launch",
    name: "OpenClaw Launch (Hetzner cx23)",
    description: "Managed provisioning + baseline setup",
    amountCents: 4900,
    currency: "usd",
  },
];

function normalizePlan(raw: unknown): BillingPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = String(row.id || "").trim();
  const name = String(row.name || "").trim();
  const description = row.description ? String(row.description).trim() : undefined;
  const amountCents = Number(row.amountCents);
  const currency = String(row.currency || "").trim().toLowerCase();

  if (!id || !name) return null;
  if (!Number.isInteger(amountCents) || amountCents <= 0) return null;
  if (!/^[a-z]{3}$/.test(currency)) return null;

  return {
    id,
    name,
    description: description || undefined,
    amountCents,
    currency,
  };
}

export function loadBillingPlans(rawJson?: string): {
  plans: BillingPlan[];
  issues: string[];
} {
  const issues: string[] = [];
  if (!rawJson || !rawJson.trim()) {
    return { plans: DEFAULT_PLANS, issues };
  }

  try {
    const parsed = JSON.parse(rawJson) as unknown;
    if (!Array.isArray(parsed)) {
      issues.push("BILLING_PLANS_JSON must be a JSON array");
      return { plans: DEFAULT_PLANS, issues };
    }

    const normalized: BillingPlan[] = [];
    for (const entry of parsed) {
      const plan = normalizePlan(entry);
      if (!plan) {
        issues.push("Invalid billing plan entry in BILLING_PLANS_JSON");
        continue;
      }
      if (normalized.some((existing) => existing.id === plan.id)) {
        issues.push(`Duplicate billing plan id: ${plan.id}`);
        continue;
      }
      normalized.push(plan);
    }

    if (normalized.length === 0) {
      issues.push("No valid plans in BILLING_PLANS_JSON; using defaults");
      return { plans: DEFAULT_PLANS, issues };
    }

    return { plans: normalized, issues };
  } catch (error) {
    issues.push(
      `Failed to parse BILLING_PLANS_JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { plans: DEFAULT_PLANS, issues };
  }
}

export function plansMap(plans: BillingPlan[]): Map<string, BillingPlan> {
  return new Map(plans.map((plan) => [plan.id, plan]));
}
