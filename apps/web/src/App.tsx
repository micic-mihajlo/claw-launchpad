import { AnimatePresence, motion } from "framer-motion";
import React, { useMemo, useState } from "react";

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://localhost:8788";

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

function DiscordConnector(props: { open: boolean; onClose: () => void }) {
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

    const guilds: any = {
      [guildId.trim()]: {
        requireMention,
        channels: Object.fromEntries(selectedIds.map((id) => [id, { allow: true, requireMention }]))
      }
    };

    const cfg = {
      channels: {
        discord: {
          groupPolicy: "allowlist",
          guilds
        }
      }
    };

    return JSON.stringify(cfg, null, 2);
  }, [testOk, guildId, selectedIds]);

  async function testConnection() {
    setTesting(true);
    setTestOk(null);
    setTestErr(null);
    setChannels([]);
    setSelected({});

    try {
      const res = await fetch(`${API_BASE}/v1/connectors/discord/test`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json()) as any;
      if (!res.ok || !data?.ok) {
        setTestErr(data?.error || "Discord token check failed");
        return;
      }
      setTestOk(data as DiscordTestOk);
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
      const res = await fetch(`${API_BASE}/v1/connectors/discord/guild-channels`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, guildId }),
      });
      const data = (await res.json()) as any;
      if (!res.ok || !data?.ok) {
        setChannelsErr(data?.error || "Could not list guild channels");
        return;
      }

      const payload = data as DiscordChannelsOk;
      setChannels(payload.channels);

      const defaults: Record<string, boolean> = {};
      for (const ch of payload.channels) {
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
            OAuth2 → URL Generator → scopes: <b>bot</b> + <b>applications.commands</b>. Permissions: View Channels, Send Messages, Read Message History.
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
                <div>Bot: <b>@{testOk.bot.username}</b> (id: {testOk.bot.id})</div>
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
                <div className="hint">Invite URL is generated from your bot id. If Discord rejects it, use OAuth2 URL Generator in the Portal.</div>
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
            You chose the safest default: only the channels you allow here will trigger replies.
            Mention-gating is enabled by default.
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
              In the full deploy flow, we’ll apply this allowlist via: <span style={{ fontFamily: "var(--mono)" }}>openclaw config set channels.discord.guilds …</span>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function App() {
  const [discordOpen, setDiscordOpen] = useState(false);

  return (
    <div className="container">
      <div className="header">
        <div className="brand">
          <div className="logo" />
          <div className="brandText">
            <strong>Claw Launchpad</strong>
            <span>allowlist + tailscale serve by default</span>
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => alert("Auth + billing are next.")}>Sign in</button>
        </div>
      </div>

      <div className="hero">
        <div className="heroInner">
          <div>
            <h1 className="h1">Deploy OpenClaw in a way that never feels broken.</h1>
            <div className="sub">
              Safe defaults, real-time checks, and upstream-compatible provisioning. No guessing why your bot isn’t responding.
            </div>
            <div className="chips">
              <div className="chip">Discord: allowlist + mention gating</div>
              <div className="chip">Access: Tailscale Serve (no public ports)</div>
              <div className="chip">Config: driven by <span style={{ fontFamily: "var(--mono)" }}>openclaw onboard</span></div>
            </div>
          </div>

          <div className="grid">
            <div className="panel">
              <div className="panelHeader">
                <h2>Pick a model</h2>
              </div>
              <div className="panelBody">
                <div className="tiles">
                  <Tile title="Claude" meta="Anthropic" desc="Opus 4.6 (recommended)" onClick={() => alert("Model selection UI next.")} />
                  <Tile title="ChatGPT" meta="OpenAI" desc="GPT-5.2" onClick={() => alert("Model selection UI next.")} />
                  <Tile title="Gemini" meta="Google" desc="Gemini 3 Flash" onClick={() => alert("Model selection UI next.")} />
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panelHeader">
                <h2>Connect a channel</h2>
              </div>
              <div className="panelBody">
                <div className="tiles">
                  <Tile title="Discord" meta="live" desc="Token test + allowlist builder" onClick={() => setDiscordOpen(true)} />
                  <Tile title="Telegram" meta="next" desc="BotFather token + allowFrom" soon />
                  <Tile title="Slack" meta="soon" desc="Bot token + app token + scopes" soon />
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panelHeader">
                <h2>Deploy</h2>
              </div>
              <div className="panelBody">
                <div className="sub" style={{ marginTop: 0 }}>
                  Next: pick infra (Hetzner), paste a Tailscale auth key, then we provision via OpenClaw’s non-interactive onboarding.
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn btnPrimary" onClick={() => alert("Provisioning UI + worker next.")}>Start deploy</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DiscordConnector open={discordOpen} onClose={() => setDiscordOpen(false)} />
    </div>
  );
}
