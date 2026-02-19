export type DiscordTestOk = {
  ok: true;
  bot: { id: string; username: string; discriminator?: string; bot?: boolean };
  inviteUrl: string;
  guild?: { ok: boolean; status?: number; data?: unknown };
};

export type DiscordChannelsOk = {
  ok: true;
  channels: Array<{ id: string; name: string; type: number; parentId: string | null; position: number | null }>;
};

export type ApiFailure = {
  ok: false;
  error?: string;
};

export type ApiEnvelope<T> = { ok: true } & T;
export type ApiResponse<T> = ApiEnvelope<T> | ApiFailure;

export type ApiAuthTokenResolver = () => Promise<string>;

export type AppRoute = "overview" | "deployments" | "billing";

export type DeploymentRecord = {
  id: string;
  name: string;
  provider: string;
  status: string;
  tailnetUrl: string | null;
  billingRef: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BillingOrderRecord = {
  id: string;
  status: string;
  planId: string;
  amountCents: number;
  currency: string;
  customerEmail: string | null;
  deploymentId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LoadState<T> = {
  status: "idle" | "loading" | "ready" | "error";
  data: T;
  error: string | null;
  loadedAt: string | null;
};

export type ShellAuthConfig = {
  workosEnabled: boolean;
  hasSession: boolean;
  userLabel: string | null;
  loading: boolean;
  authBadge: string;
  authActionLabel?: string;
  onAuthAction?: () => void;
  authActionDisabled?: boolean;
  onSignInCta?: () => void;
  signInCtaDisabled?: boolean;
  resolveSessionToken?: () => Promise<string>;
};

export type LandingAuthConfig = {
  workosEnabled: boolean;
  hasSession: boolean;
  loading: boolean;
  userLabel: string | null;
  onSignIn: () => void;
  onSignOut: () => void;
};
