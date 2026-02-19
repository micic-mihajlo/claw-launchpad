import type { LandingAuthConfig } from "../../app/types";

export type LandingNav = {
  href: string;
  label: string;
};

export type LandingWorkflowCard = {
  number: string;
  title: string;
  detail: string;
};

export type LandingOffering = {
  title: string;
  lead: string;
  details: string[];
};

export type LandingPrice = {
  name: string;
  value: string;
  period: string;
  pitch: string;
  bullets: string[];
  action: string;
  highlighted: boolean;
};

export type LandingProof = {
  quote: string;
  source: string;
};

export type LandingFaq = {
  q: string;
  a: string;
};

export const landingNav: LandingNav[] = [
  { href: "#workflow", label: "Why it works" },
  { href: "#controls", label: "Features" },
  { href: "#proof", label: "Proof" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export const partnerSignatures = [
  "WorkOS",
  "Stripe",
  "Convex",
  "Discord",
  "Hetzner",
  "Tailscale",
  "Cloudflare",
  "Vercel",
  "Replit",
  "OpenAI",
];

export const workflowCards: LandingWorkflowCard[] = [
  {
    number: "01",
    title: "Authenticate first",
    detail:
      "Operators and automation both resolve identity first, then every write is pinned to an owner before any state changes.",
  },
  {
    number: "02",
    title: "Own by lineage",
    detail:
      "Orders, deployments, and billing are linked by owner-first IDs so actions stay reversible and auditable end-to-end.",
  },
  {
    number: "03",
    title: "Ship with telemetry",
    detail:
      "Every state transition is explicit: pending, provisioning, running, cancel, or failed. Operators can explain exactly what happened.",
  },
];

export const platformOfferings: LandingOffering[] = [
  {
    title: "Tenant Isolation by Default",
    lead: "The security model is the foundation, not a feature flag.",
    details: [
      "Authenticated owner checks across all write paths",
      "Tenant-scoped deployment + order reads",
      "No cross-tenant leakage by default",
    ],
  },
  {
    title: "Secure Connector Defaults",
    lead: "The first deployment is secure by construction.",
    details: [
      "Discord allowlist channel gating built in",
      "Mention checks enabled by default",
      "Configuration is generated, versioned, and easy to replay",
    ],
  },
  {
    title: "Operational Lineage",
    lead: "Debugging under pressure starts with clean history.",
    details: [
      "Deployment events are captured and surfaced",
      "Provisioning failures stay traceable by status",
      "Cancel/retry flows are state-aware and explicit",
    ],
  },
  {
    title: "Payment-Backed Provisioning",
    lead: "Checkout and infrastructure are now in one ownership graph.",
    details: [
      "Owner is locked on order creation",
      "Stripe and manual paths produce the same outcome",
      "Deployment references surface to operators as soon as queued",
    ],
  },
];

export const pricingCards: LandingPrice[] = [
  {
    name: "Starter",
    value: "$49",
    period: "per month",
    pitch: "For a first production surface that needs tenant-safe defaults from day one.",
    action: "Start free trial",
    highlighted: false,
    bullets: [
      "Single tenant operator workspace",
      "Discord connector defaults",
      "Manual token or WorkOS auth",
      "Deployment + billing audit feed",
    ],
  },
  {
    name: "Team",
    value: "$129",
    period: "per month",
    pitch: "For teams running multiple AI products behind one hardened control plane.",
    action: "Launch team plan",
    highlighted: true,
    bullets: [
      "Tenant fan-out and scoped endpoints",
      "Priority provisioning + retries",
      "Order ownership controls for every flow",
      "Operational observability out of the box",
    ],
  },
  {
    name: "Scale",
    value: "Custom",
    period: "enterprise",
    pitch: "For high-volume operations with strict governance, strict onboarding, and strict controls.",
    action: "Contact sales",
    highlighted: false,
    bullets: [
      "Dedicated onboarding and security review",
      "Private support with SLAs",
      "Enterprise architecture advisory",
      "SLO-oriented operational practices",
    ],
  },
];

export const proofPoints: LandingProof[] = [
  {
    quote:
      "We removed a week of auth plumbing and replaced it with one ownership model. Operators now debug incidents with confidence, not guesswork.",
    source: "CTO, B2B AI infrastructure team",
  },
  {
    quote:
      "The connector defaults and tenant boundaries are exactly what we needed. We can finally ship with predictable, explainable behavior.",
    source: "Head of Product, FinTech chatbot ops",
  },
  {
    quote:
      "Manual and webhook flows now reconcile to the same tenant scope. Consistency changed our incident posture overnight.",
    source: "Director of Platform, Developer tools startup",
  },
];

export const faqs: LandingFaq[] = [
  {
    q: "Can I start without WorkOS?",
    a: "Yes. Manual bearer auth is available and it uses the exact same tenant-scoped request model so behavior stays consistent.",
  },
  {
    q: "How do deployments stay isolated?",
    a: "By enforcing owner-scoped reads and writes at every critical path. Deployment, order, and token ownership remain linked through one identity graph.",
  },
  {
    q: "What happens after Stripe checkout?",
    a: "After checkout, the order is persisted with owner context and routed through the same pipeline as manual provisioning, preserving ownership end-to-end.",
  },
  {
    q: "Do you support other connectors besides Discord?",
    a: "Discord is production-ready today. Slack and Telegram are next, using the same allowlist-first pattern.",
  },
];

export function defaultSessionCopy(auth?: LandingAuthConfig): string {
  if (!auth?.workosEnabled) {
    return "Manual token mode is active for operator-driven sessions without WorkOS.";
  }
  if (auth.loading) {
    return "Checking your session state…";
  }
  return auth.hasSession ? `Signed in as ${auth.userLabel || "operator"}` : "Sign in to unlock workspace, deployments, and billing.";
}
