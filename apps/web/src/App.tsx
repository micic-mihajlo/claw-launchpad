import { AnimatePresence, motion } from "framer-motion";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@workos-inc/authkit-react";

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://localhost:8788";
const AUTH_TOKEN_STORAGE_KEY = "clawpad.apiAuthToken";
const AUTH_TOKEN_ENV = String((import.meta as any).env?.VITE_AUTH_TOKEN || "").trim();
const WORKOS_CLIENT_ID = String((import.meta as any).env?.VITE_WORKOS_CLIENT_ID || "").trim();
const WORKOS_ENABLED = Boolean(WORKOS_CLIENT_ID);

type DiscordTestOk = {
  ok: true;
  bot: { id: string; username: string; discriminator?: string; bot?: boolean };
  inviteUrl: string;
  guild?: { ok: boolean; status?: number; data?: unknown };
};

type DiscordChannelsOk = {
  ok: true;
  channels: Array<{ id: string; name: string; type: number; parentId: string | null; position: number | null }>;
};

type ApiFailure = {
  ok: false;
  error?: string;
};

type ApiEnvelope<T> = { ok: true } & T;
type ApiResponse<T> = ApiEnvelope<T> | ApiFailure;

type ApiAuthTokenResolver = () => Promise<string>;

function initialApiAuthToken(): string {
  if (typeof window === "undefined") return AUTH_TOKEN_ENV;
  try {
    return (
      window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)?.trim() ||
      window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)?.trim() ||
      AUTH_TOKEN_ENV
    );
  } catch {
    return AUTH_TOKEN_ENV;
  }
}

function persistApiAuthToken(token: string): string {
  const trimmed = token.trim();
  try {
    if (trimmed) {
      window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, trimmed);
    } else {
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
      window.sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
  } catch {
    // no-op: persistence is opportunistic in environments that don't allow storage access
  }
  return trimmed;
}

function buildApiHeaders(apiAuthToken: string, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const token = apiAuthToken.trim();
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  return headers;
}

async function buildApiHeadersFromResolver(
  getApiAuthToken: ApiAuthTokenResolver,
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  const apiAuthToken = await getApiAuthToken();
  return buildApiHeaders(apiAuthToken, extra);
}

function shortToken(token: string): string {
  const normalized = token.trim();
  if (!normalized) return "none";
  if (normalized.length <= 10) return normalized;
  return `••••${normalized.slice(-6)}`;
}

function Tile(props: {
  title: string;
  meta: string;
  desc: string;
  onClick?: () => void;
  soon?: boolean;
}) {
  return (
    <div
      className="tile"
      onClick={props.soon ? undefined : props.onClick}
      role={props.soon ? undefined : "button"}
      tabIndex={props.soon ? -1 : 0}
      aria-disabled={props.soon ? true : undefined}
      style={props.soon ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
    >
      <div className="tileTitle">
        <strong>{props.title}</strong>
        <span>{props.meta}</span>
      </div>
      <div className="tileDesc">{props.desc}</div>
    </div>
  );
}

function Modal(props: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {props.open ? (
        <motion.div
          className="modalOverlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) props.onClose();
          }}
        >
          <motion.div
            className="modal"
            initial={{ y: 16, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 8, opacity: 0, scale: 0.99 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
          >
            <div className="modalHeader">
              <h3>{props.title}</h3>
              <button className="modalClose" onClick={props.onClose} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="modalBody">{props.children}</div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function AuthModal(props: {
  open: boolean;
  token: string;
  onSave: (token: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(props.token);

  useEffect(() => {
    if (props.open) setDraft(props.token);
  }, [props.open, props.token]);

  const trimmed = draft.trim();
  const canSave = trimmed.length > 0;

  return (
    <Modal open={props.open} title="Workspace Access Token" onClose={props.onClose}>
      <div className="field">
        <label className="label">API bearer token</label>
        <input
          className="input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Paste token or leave blank to operate without auth"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <div className="hint">
          The token is sent as <span style={{ fontFamily: "var(--mono)" }}>Authorization: Bearer</span> on protected requests.
        </div>
      </div>

      <div className="field">
        <div className="row">
          <button className="btn btnPrimary" onClick={() => props.onSave(trimmed)} disabled={!canSave}>
            Save token
          </button>
          <button className="btn" onClick={props.onClear} disabled={!props.token}>
            Clear token
          </button>
        </div>
        <div className="hint" style={{ marginTop: 10 }}>
          Stored token: <span style={{ fontFamily: "var(--mono)" }}>{shortToken(props.token)}</span>
        </div>
      </div>
    </Modal>
  );
}

function DiscordConnector(props: {
  open: boolean;
  getApiAuthToken: ApiAuthTokenResolver;
  onClose: () => void;
}) {
  const [token, setToken] = useState("");
  const [testing, setTesting] = useState(false);
  const [testOk, setTestOk] = useState<DiscordTestOk | null>(null);
  const [testErr, setTestErr] = useState<string | null>(null);

  const [guildId, setGuildId] = useState("");
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channels, setChannels] = useState<DiscordChannelsOk["channels"]>([]);
  const [channelsErr, setChannelsErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const requireMention = true;

  const selectedIds = useMemo(() => Object.entries(selected).filter(([, v]) => v).map(([k]) => k), [selected]);

  const configSnippet = useMemo(() => {
    if (!testOk?.ok) return null;
    if (!guildId.trim()) return null;
    if (selectedIds.length === 0) return null;

    const guilds: Record<string, { requireMention: boolean; channels: Record<string, { allow: boolean; requireMention: boolean }> }> = {
      [guildId.trim()]: {
        requireMention,
        channels: Object.fromEntries(selectedIds.map((id) => [id, { allow: true, requireMention }])),
      },
    };

    const cfg = {
      channels: {
        discord: {
          groupPolicy: "allowlist",
          guilds,
        },
      },
    };

    return JSON.stringify(cfg, null, 2);
  }, [testOk, guildId, selectedIds]);

  async function parseResponse<T>(response: Response): Promise<ApiResponse<T>> {
    const raw = await response.text();
    if (!raw) {
      return { ok: false, error: "No response body from API" };
    }
    try {
      return JSON.parse(raw) as ApiResponse<T>;
    } catch {
      return { ok: false, error: raw };
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestOk(null);
    setTestErr(null);
    setChannels([]);
    setSelected({});

    try {
      const headers = await buildApiHeadersFromResolver(props.getApiAuthToken, { "content-type": "application/json" });
      const response = await fetch(`${API_BASE}/v1/connectors/discord/test`, {
        method: "POST",
        headers,
        body: JSON.stringify({ token }),
      });
      const payload = await parseResponse<DiscordTestOk>(response);
      if (!response.ok) {
        setTestErr((!payload.ok && payload.error) || `Request failed with HTTP ${response.status}`);
        return;
      }
      if (!payload.ok) {
        setTestErr(payload.error || "Discord token check failed");
        return;
      }
      setTestOk(payload);
    } catch (e) {
      setTestErr(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  }

  async function fetchChannels() {
    setChannelsLoading(true);
    setChannelsErr(null);
    setChannels([]);
    setSelected({});

    try {
      const headers = await buildApiHeadersFromResolver(props.getApiAuthToken, { "content-type": "application/json" });
      const response = await fetch(`${API_BASE}/v1/connectors/discord/guild-channels`, {
        method: "POST",
        headers,
        body: JSON.stringify({ token, guildId }),
      });
      const payload = await parseResponse<DiscordChannelsOk>(response);
      if (!response.ok) {
        setChannelsErr((!payload.ok && payload.error) || `Request failed with HTTP ${response.status}`);
        return;
      }
      if (!payload.ok) {
        setChannelsErr(payload.error || "Could not list guild channels");
        return;
      }
      const data = payload;
      setChannels(data.channels);

      const defaults: Record<string, boolean> = {};
      for (const ch of data.channels) {
        if (ch.name === "general") {
          defaults[ch.id] = true;
        }
      }
      setSelected(defaults);
    } catch (e) {
      setChannelsErr(e instanceof Error ? e.message : String(e));
    } finally {
      setChannelsLoading(false);
    }
  }

  return (
    <Modal open={props.open} title="Set up Discord (allowlist by default)" onClose={props.onClose}>
      <div className="steps">
        <div className="stepCard">
          <div className="stepTitle">
            <b>1</b>
            <strong>Create a bot + copy token</strong>
          </div>
          <div className="stepText">
            Open Discord Developer Portal, create an application, then go to <b>Bot</b> and click <b>Reset Token</b>.
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <a className="btn" href="https://discord.com/developers/applications" target="_blank" rel="noreferrer">
              Open Developer Portal
            </a>
          </div>

          <div className="stepTitle" style={{ marginTop: 14 }}>
            <b>2</b>
            <strong>Enable Message Content Intent</strong>
          </div>
          <div className="stepText">
            Bot → Privileged Gateway Intents → turn on <b>Message Content Intent</b> → Save.
          </div>

          <div className="stepTitle" style={{ marginTop: 14 }}>
            <b>3</b>
            <strong>Invite the bot to your server</strong>
          </div>
          <div className="stepText">
            OAuth2 → URL Generator → scopes: <b>bot</b> + <b>applications.commands</b>. Permissions: View Channels, Send
            Messages, Read Message History.
          </div>

          <div className="stepTitle" style={{ marginTop: 14 }}>
            <b>4</b>
            <strong>Paste token + test</strong>
          </div>

          <div className="field">
            <label className="label">Bot token</label>
            <input
              className="input"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your bot token"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn btnPrimary" onClick={testConnection} disabled={!token.trim() || testing}>
                {testing ? "Testing…" : "Test connection"}
              </button>
              {testErr ? <span className="hint" style={{ color: "rgba(255,120,120,.95)" }}>{testErr}</span> : null}
            </div>

            {testOk?.ok ? (
              <div className="kv">
                <div>
                  Bot: <b>@{testOk.bot.username}</b> (id: {testOk.bot.id})
                </div>
                <div style={{ marginTop: 6 }} className="row">
                  <button
                    className="btn"
                    onClick={() => {
                      void navigator.clipboard.writeText(testOk.inviteUrl);
                    }}
                  >
                    Copy invite URL
                  </button>
                  <a className="btn" href={testOk.inviteUrl} target="_blank" rel="noreferrer">
                    Open invite URL
                  </a>
                </div>
                <div className="hint">
                  Invite URL is generated from your bot id. If Discord rejects it, use OAuth2 URL Generator in the Portal.
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="stepCard">
          <div className="stepTitle">
            <b>A</b>
            <strong>Allowlist where it can talk</strong>
          </div>
          <div className="stepText">
            You chose the safest default: only the channels you allow here will trigger replies. Mention-gating is enabled by
            default.
          </div>

          <div className="field">
            <label className="label">Guild ID</label>
            <input
              className="input"
              value={guildId}
              onChange={(e) => setGuildId(e.target.value)}
              placeholder="Right click server → Copy ID"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={!testOk?.ok}
            />
            <div className="hint">
              Tip: Discord settings → Advanced → Developer Mode ON. Then right click server/channel to copy IDs.
            </div>

            <div className="row" style={{ marginTop: 10 }}>
              <button
                className="btn btnPrimary"
                onClick={fetchChannels}
                disabled={!testOk?.ok || !guildId.trim() || channelsLoading}
              >
                {channelsLoading ? "Fetching…" : "Fetch channels"}
              </button>
              {channelsErr ? <span className="hint" style={{ color: "rgba(255,120,120,.95)" }}>{channelsErr}</span> : null}
            </div>

            {channels.length > 0 ? (
              <div className="channelList">
                {channels.map((ch) => (
                  <label key={ch.id} className="channelItem">
                    <input
                      type="checkbox"
                      checked={Boolean(selected[ch.id])}
                      onChange={(e) => setSelected((prev) => ({ ...prev, [ch.id]: e.target.checked }))}
                    />
                    <div>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 12 }}>#{ch.name}</div>
                      <div className="hint">id: {ch.id}</div>
                    </div>
                  </label>
                ))}
              </div>
            ) : null}

            {configSnippet ? (
              <>
                <div className="stepTitle" style={{ marginTop: 14 }}>
                  <b>B</b>
                  <strong>Resulting OpenClaw config snippet</strong>
                </div>
                <div className="code">{configSnippet}</div>
                <div className="row" style={{ marginTop: 10 }}>
                  <button
                    className="btn"
                    onClick={() => {
                      void navigator.clipboard.writeText(configSnippet);
                    }}
                  >
                    Copy snippet
                  </button>
                </div>
              </>
            ) : null}

            <div className="footerNote">
              In the full deploy flow, we’ll apply this allowlist via:{" "}
              <span style={{ fontFamily: "var(--mono)" }}>openclaw config set channels.discord.guilds …</span>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

type AppRoute = "overview" | "deployments" | "billing";

type DeploymentRecord = {
  id: string;
  name: string;
  provider: string;
  status: string;
  tailnetUrl: string | null;
  billingRef: string | null;
  createdAt: string;
  updatedAt: string;
};

type BillingOrderRecord = {
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

type LoadState<T> = {
  status: "idle" | "loading" | "ready" | "error";
  data: T;
  error: string | null;
  loadedAt: string | null;
};

type ShellAuthConfig = {
  workosEnabled: boolean;
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

function readInitialRoute(): AppRoute {
  if (typeof window === "undefined") {
    return "overview";
  }
  const pathname = (window.location.pathname || "/").toLowerCase();
  if (pathname.startsWith("/deployments")) return "deployments";
  if (pathname.startsWith("/billing") || pathname.startsWith("/orders")) return "billing";
  return "overview";
}

function routePath(route: AppRoute): string {
  if (route === "deployments") return "/deployments";
  if (route === "billing") return "/billing";
  return "/";
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function formatAmount(amountCents: number, currency: string): string {
  const normalized = String(currency || "usd").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: normalized }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${normalized}`;
  }
}

function compactId(value: string): string {
  const normalized = value.trim();
  if (normalized.length <= 14) return normalized;
  return `${normalized.slice(0, 6)}…${normalized.slice(-6)}`;
}

async function parseApiResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const raw = await response.text();
  if (!raw) return { ok: false, error: "No response body from API" };
  try {
    return JSON.parse(raw) as ApiResponse<T>;
  } catch {
    return { ok: false, error: raw };
  }
}

function statusClass(status: string): string {
  const normalized = status
    .toLowerCase()
    .trim()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `statusPill status-${normalized}`;
}

function LaunchpadShell(props: { auth: ShellAuthConfig }) {
  const { resolveSessionToken, userLabel, workosEnabled, onSignInCta, signInCtaDisabled } = props.auth;
  const [route, setRoute] = useState<AppRoute>(readInitialRoute);
  const [discordOpen, setDiscordOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [apiAuthToken, setApiAuthToken] = useState(initialApiAuthToken);
  const [deployments, setDeployments] = useState<LoadState<DeploymentRecord[]>>({
    status: "idle",
    data: [],
    error: null,
    loadedAt: null,
  });
  const [orders, setOrders] = useState<LoadState<BillingOrderRecord[]>>({
    status: "idle",
    data: [],
    error: null,
    loadedAt: null,
  });
  const deploymentsRequestRef = useRef(0);
  const ordersRequestRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPopState = () => {
      setRoute(readInitialRoute());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const getApiAuthToken = useCallback<ApiAuthTokenResolver>(async () => {
    if (userLabel) {
      if (!resolveSessionToken) {
        throw new Error("Signed-in WorkOS session has no token resolver configured.");
      }
      const token = await resolveSessionToken();
      if (token.trim()) {
        return token.trim();
      }
      throw new Error("Signed-in WorkOS session returned an empty access token.");
    }
    return apiAuthToken.trim();
  }, [apiAuthToken, resolveSessionToken, userLabel]);

  const goToRoute = useCallback((next: AppRoute) => {
    setRoute(next);
    if (typeof window === "undefined") return;
    const targetPath = routePath(next);
    if (window.location.pathname !== targetPath) {
      window.history.pushState(null, "", targetPath);
    }
  }, []);

  const hasManualToken = Boolean(apiAuthToken.trim());
  const hasWorkosSession = Boolean(userLabel);
  const protectedAccess = !workosEnabled || hasWorkosSession || hasManualToken;
  const authScopeKey = useMemo(() => {
    const manualToken = apiAuthToken.trim();
    if (workosEnabled && hasWorkosSession) {
      return `workos:${userLabel || ""}`;
    }
    return `manual:${manualToken}`;
  }, [apiAuthToken, hasWorkosSession, userLabel, workosEnabled]);

  const saveAuthToken = useCallback((next: string) => {
    const persisted = persistApiAuthToken(next);
    setApiAuthToken(persisted || AUTH_TOKEN_ENV);
    setAuthModalOpen(false);
  }, []);

  const clearAuthToken = useCallback(() => {
    const persisted = persistApiAuthToken("");
    setApiAuthToken(persisted || AUTH_TOKEN_ENV);
  }, []);

  useEffect(() => {
    deploymentsRequestRef.current += 1;
    ordersRequestRef.current += 1;
    setDeployments({
      status: "idle",
      data: [],
      error: null,
      loadedAt: null,
    });
    setOrders({
      status: "idle",
      data: [],
      error: null,
      loadedAt: null,
    });
  }, [authScopeKey]);

  const loadDeployments = useCallback(async () => {
    const requestId = ++deploymentsRequestRef.current;
    setDeployments({
      status: "loading",
      data: [],
      error: null,
      loadedAt: null,
    });
    try {
      const headers = await buildApiHeadersFromResolver(getApiAuthToken);
      const response = await fetch(`${API_BASE}/v1/deployments`, { headers });
      const payload = await parseApiResponse<{ deployments: DeploymentRecord[] }>(response);
      if (requestId !== deploymentsRequestRef.current) {
        return;
      }
      if (!response.ok || !payload.ok) {
        setDeployments({
          status: "error",
          data: [],
          error: (!payload.ok && payload.error) || `Request failed with HTTP ${response.status}`,
          loadedAt: new Date().toISOString(),
        });
        return;
      }
      setDeployments({
        status: "ready",
        data: payload.deployments || [],
        error: null,
        loadedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (requestId !== deploymentsRequestRef.current) {
        return;
      }
      setDeployments({
        status: "error",
        data: [],
        error: error instanceof Error ? error.message : String(error),
        loadedAt: new Date().toISOString(),
      });
    }
  }, [getApiAuthToken]);

  const loadOrders = useCallback(async () => {
    const requestId = ++ordersRequestRef.current;
    setOrders({
      status: "loading",
      data: [],
      error: null,
      loadedAt: null,
    });
    try {
      const headers = await buildApiHeadersFromResolver(getApiAuthToken);
      const response = await fetch(`${API_BASE}/v1/orders`, { headers });
      const payload = await parseApiResponse<{ orders: BillingOrderRecord[] }>(response);
      if (requestId !== ordersRequestRef.current) {
        return;
      }
      if (!response.ok || !payload.ok) {
        setOrders({
          status: "error",
          data: [],
          error: (!payload.ok && payload.error) || `Request failed with HTTP ${response.status}`,
          loadedAt: new Date().toISOString(),
        });
        return;
      }
      setOrders({
        status: "ready",
        data: payload.orders || [],
        error: null,
        loadedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (requestId !== ordersRequestRef.current) {
        return;
      }
      setOrders({
        status: "error",
        data: [],
        error: error instanceof Error ? error.message : String(error),
        loadedAt: new Date().toISOString(),
      });
    }
  }, [getApiAuthToken]);

  useEffect(() => {
    if (!protectedAccess) {
      deploymentsRequestRef.current += 1;
      ordersRequestRef.current += 1;
      setDeployments({
        status: "idle",
        data: [],
        error: null,
        loadedAt: null,
      });
      setOrders({
        status: "idle",
        data: [],
        error: null,
        loadedAt: null,
      });
      return;
    }
    if (route === "deployments") {
      void loadDeployments();
      return;
    }
    if (route === "billing") {
      void loadOrders();
    }
  }, [loadDeployments, loadOrders, protectedAccess, route]);

  const pageContent = useMemo(() => {
    if (route === "overview") {
      return (
        <div className="hero">
          <div className="heroInner">
            <div>
              <h1 className="h1">Deploy OpenClaw in a way that never feels broken.</h1>
              <div className="sub">
                WorkOS-backed auth, tenant-scoped API data, and an opinionated launch flow for channel setup plus provisioning.
              </div>
              <div className="chips">
                <div className="chip">Route protection for tenant data</div>
                <div className="chip">Deployments + billing views connected to API</div>
                <div className="chip">
                  Default connector path: <span style={{ fontFamily: "var(--mono)" }}>Discord allowlist</span>
                </div>
              </div>
              <div className="row" style={{ marginTop: 18 }}>
                <button className="btn btnPrimary" onClick={() => goToRoute("deployments")}>
                  Open deployments
                </button>
                <button className="btn" onClick={() => goToRoute("billing")}>
                  Open billing
                </button>
                <button className="btn" onClick={() => setDiscordOpen(true)}>
                  Configure Discord
                </button>
              </div>
            </div>

            <div className="grid">
              <div className="panel">
                <div className="panelHeader">
                  <h2>Session</h2>
                </div>
                <div className="panelBody">
                  <div className="summaryRow">
                    <span>Identity</span>
                    <b>{userLabel || "No WorkOS session"}</b>
                  </div>
                  <div className="summaryRow">
                    <span>Manual token</span>
                    <b>{hasManualToken ? shortToken(apiAuthToken) : "not set"}</b>
                  </div>
                  <div className="summaryRow">
                    <span>Protected routes</span>
                    <b>{protectedAccess ? "available" : "sign in required"}</b>
                  </div>
                </div>
              </div>

              <div className="panel">
                <div className="panelHeader">
                  <h2>Data Sync</h2>
                </div>
                <div className="panelBody">
                  <div className="summaryRow">
                    <span>Deployments cache</span>
                    <b>{deployments.data.length}</b>
                  </div>
                  <div className="summaryRow">
                    <span>Billing cache</span>
                    <b>{orders.data.length}</b>
                  </div>
                  <div className="summaryRow">
                    <span>Last deployment refresh</span>
                    <b>{formatDateTime(deployments.loadedAt)}</b>
                  </div>
                </div>
              </div>

              <div className="panel">
                <div className="panelHeader">
                  <h2>Connectors</h2>
                </div>
                <div className="panelBody">
                  <div className="tiles">
                    <Tile title="Discord" meta="live" desc="Token test + allowlist builder" onClick={() => setDiscordOpen(true)} />
                    <Tile title="Telegram" meta="next" desc="BotFather token + allowFrom" soon />
                    <Tile title="Slack" meta="soon" desc="Bot token + app token + scopes" soon />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (!protectedAccess) {
      return (
        <div className="hero">
          <div className="panel">
            <div className="panelHeader">
              <h2>Protected View</h2>
            </div>
            <div className="panelBody">
              <div className="sub" style={{ marginTop: 0 }}>
                Sign in with WorkOS or set a manual API token to access tenant-scoped deployments and billing data.
              </div>
              <div className="row" style={{ marginTop: 14 }}>
                {onSignInCta ? (
                  <button className="btn btnPrimary" onClick={onSignInCta} disabled={signInCtaDisabled}>
                    {signInCtaDisabled ? "Checking…" : "Sign in with WorkOS"}
                  </button>
                ) : null}
                <button className="btn" onClick={() => setAuthModalOpen(true)}>
                  Set manual token
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (route === "deployments") {
      return (
        <div className="hero">
          <div className="panel dataPanel">
            <div className="panelHeader panelHeaderSplit">
              <h2>Deployments</h2>
              <div className="row">
                <span className="hintInline">Updated: {formatDateTime(deployments.loadedAt)}</span>
                <button className="btn" onClick={() => void loadDeployments()} disabled={deployments.status === "loading"}>
                  {deployments.status === "loading" ? "Refreshing…" : "Refresh"}
                </button>
              </div>
            </div>
            <div className="panelBody">
              {deployments.status === "error" ? <div className="errorBanner">{deployments.error}</div> : null}
              {deployments.status === "loading" && deployments.data.length === 0 ? <div className="sub">Loading deployments…</div> : null}
              {deployments.status !== "loading" && deployments.status !== "error" && deployments.data.length === 0 ? (
                <div className="sub">No deployments yet for this tenant.</div>
              ) : null}
              <div className="listWrap">
                {deployments.data.map((deployment) => (
                  <div key={deployment.id} className="listItem">
                    <div className="listTop">
                      <strong>{deployment.name}</strong>
                      <span className={statusClass(deployment.status)}>{deployment.status}</span>
                    </div>
                    <div className="listMeta">
                      <span>id: {compactId(deployment.id)}</span>
                      <span>provider: {deployment.provider}</span>
                      <span>billing: {deployment.billingRef ? compactId(deployment.billingRef) : "none"}</span>
                      <span>updated: {formatDateTime(deployment.updatedAt)}</span>
                    </div>
                    {deployment.tailnetUrl ? (
                      <div className="row" style={{ marginTop: 10 }}>
                        <a className="btn" href={deployment.tailnetUrl} target="_blank" rel="noreferrer">
                          Open tailnet URL
                        </a>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="hero">
        <div className="panel dataPanel">
          <div className="panelHeader panelHeaderSplit">
            <h2>Billing Orders</h2>
            <div className="row">
              <span className="hintInline">Updated: {formatDateTime(orders.loadedAt)}</span>
              <button className="btn" onClick={() => void loadOrders()} disabled={orders.status === "loading"}>
                {orders.status === "loading" ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>
          <div className="panelBody">
            {orders.status === "error" ? <div className="errorBanner">{orders.error}</div> : null}
            {orders.status === "loading" && orders.data.length === 0 ? <div className="sub">Loading orders…</div> : null}
            {orders.status !== "loading" && orders.status !== "error" && orders.data.length === 0 ? (
              <div className="sub">No billing orders for this tenant.</div>
            ) : null}
            <div className="listWrap">
              {orders.data.map((order) => (
                <div key={order.id} className="listItem">
                  <div className="listTop">
                    <strong>{order.planId}</strong>
                    <span className={statusClass(order.status)}>{order.status}</span>
                  </div>
                  <div className="listMeta">
                    <span>order: {compactId(order.id)}</span>
                    <span>amount: {formatAmount(order.amountCents, order.currency)}</span>
                    <span>customer: {order.customerEmail || "n/a"}</span>
                    <span>updated: {formatDateTime(order.updatedAt)}</span>
                  </div>
                  <div className="listMeta" style={{ marginTop: 6 }}>
                    <span>deployment: {order.deploymentId ? compactId(order.deploymentId) : "not linked"}</span>
                    <span>created: {formatDateTime(order.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }, [
    apiAuthToken,
    deployments.data,
    deployments.error,
    deployments.loadedAt,
    deployments.status,
    goToRoute,
    hasManualToken,
    loadDeployments,
    loadOrders,
    orders.data,
    orders.error,
    orders.loadedAt,
    orders.status,
    onSignInCta,
    signInCtaDisabled,
    userLabel,
    protectedAccess,
    route,
  ]);

  return (
    <div className="container">
      <div className="header">
        <div className="brand">
          <div className="logo" />
          <div className="brandText">
            <strong>Claw Launchpad</strong>
            <span>auth-aware product shell</span>
          </div>
        </div>
        <div className="row">
          <span className="tokenBadge">{props.auth.authBadge}</span>
          <span className="tokenBadge">Manual token: {hasManualToken ? shortToken(apiAuthToken) : "none"}</span>
          {props.auth.authActionLabel && props.auth.onAuthAction ? (
            <button className="btn" onClick={props.auth.onAuthAction} disabled={props.auth.authActionDisabled}>
              {props.auth.authActionLabel}
            </button>
          ) : null}
          <button className="btn" onClick={() => setAuthModalOpen(true)}>
            {hasManualToken ? "Update manual token" : "Set manual token"}
          </button>
        </div>
      </div>

      <div className="routeTabs">
        <button className={`routeTab ${route === "overview" ? "routeTabActive" : ""}`} onClick={() => goToRoute("overview")}>
          Overview
        </button>
        <button className={`routeTab ${route === "deployments" ? "routeTabActive" : ""}`} onClick={() => goToRoute("deployments")}>
          Deployments
        </button>
        <button className={`routeTab ${route === "billing" ? "routeTabActive" : ""}`} onClick={() => goToRoute("billing")}>
          Billing
        </button>
      </div>

      {pageContent}

      <AuthModal
        open={authModalOpen}
        token={apiAuthToken}
        onSave={saveAuthToken}
        onClear={() => {
          clearAuthToken();
          setAuthModalOpen(false);
        }}
        onClose={() => setAuthModalOpen(false)}
      />

      <DiscordConnector open={discordOpen} getApiAuthToken={getApiAuthToken} onClose={() => setDiscordOpen(false)} />
    </div>
  );
}

function AppManualAuth() {
  return (
    <LaunchpadShell
      auth={{
        workosEnabled: false,
        userLabel: null,
        loading: false,
        authBadge: "WorkOS: not configured",
      }}
    />
  );
}

function AppWorkosAuth() {
  const { isLoading, user, getAccessToken, signIn, signOut } = useAuth();
  const userLabel = user?.email || user?.id || null;
  const authBadge = isLoading ? "WorkOS: checking session" : userLabel ? `WorkOS: ${userLabel}` : "WorkOS: signed out";

  const authActionLabel = isLoading ? "Checking…" : userLabel ? "Sign out" : "Sign in";
  const onAuthAction = useCallback(() => {
    void (userLabel ? signOut() : signIn());
  }, [signIn, signOut, userLabel]);

  const resolveSessionToken = useCallback(async () => {
    const token = await getAccessToken();
    return token.trim();
  }, [getAccessToken]);

  return (
    <LaunchpadShell
      auth={{
        workosEnabled: true,
        userLabel,
        loading: isLoading,
        authBadge,
        authActionLabel,
        onAuthAction,
        authActionDisabled: isLoading,
        onSignInCta: userLabel ? undefined : () => void signIn(),
        signInCtaDisabled: isLoading,
        resolveSessionToken,
      }}
    />
  );
}

export function App() {
  if (WORKOS_ENABLED) {
    return <AppWorkosAuth />;
  }
  return <AppManualAuth />;
}
