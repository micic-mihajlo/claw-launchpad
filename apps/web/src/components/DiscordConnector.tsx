import { useMemo, useState } from "react";
import { buildApiHeadersFromResolver } from "../app/authToken";
import { API_BASE } from "../app/env";
import type { ApiAuthTokenResolver, ApiResponse, DiscordChannelsOk, DiscordTestOk } from "../app/types";
import { Modal } from "./Modal";

export function DiscordConnector(props: {
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
          <div className="row rowMarginTopSm">
            <a className="btn" href="https://discord.com/developers/applications" target="_blank" rel="noreferrer">
              Open Developer Portal
            </a>
          </div>

          <div className="stepTitle stepTitleGap">
            <b>2</b>
            <strong>Enable Message Content Intent</strong>
          </div>
          <div className="stepText">
            Bot → Privileged Gateway Intents → turn on <b>Message Content Intent</b> → Save.
          </div>

          <div className="stepTitle stepTitleGap">
            <b>3</b>
            <strong>Invite the bot to your server</strong>
          </div>
          <div className="stepText">
            OAuth2 → URL Generator → scopes: <b>bot</b> + <b>applications.commands</b>. Permissions: View Channels, Send
            Messages, Read Message History.
          </div>

          <div className="stepTitle stepTitleGap">
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
            <div className="row rowMarginTopSm">
              <button className="btn btnPrimary" onClick={testConnection} disabled={!token.trim() || testing}>
                {testing ? "Testing…" : "Test connection"}
              </button>
              {testErr ? <span className="hint hintError">{testErr}</span> : null}
            </div>

            {testOk?.ok ? (
              <div className="kv">
                <div>
                  Bot: <b>@{testOk.bot.username}</b> (id: {testOk.bot.id})
                </div>
                <div className="row rowMarginTopXs">
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

            <div className="row rowMarginTopSm">
              <button
                className="btn btnPrimary"
                onClick={fetchChannels}
                disabled={!testOk?.ok || !guildId.trim() || channelsLoading}
              >
                {channelsLoading ? "Fetching…" : "Fetch channels"}
              </button>
              {channelsErr ? <span className="hint hintError">{channelsErr}</span> : null}
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
                      <div className="monoBlock">#{ch.name}</div>
                      <div className="hint">id: {ch.id}</div>
                    </div>
                  </label>
                ))}
              </div>
            ) : null}

            {configSnippet ? (
              <>
                <div className="stepTitle stepTitleGap">
                  <b>B</b>
                  <strong>Resulting OpenClaw config snippet</strong>
                </div>
                <div className="code">{configSnippet}</div>
                <div className="row rowMarginTopSm">
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
              <span className="monoInline">openclaw config set channels.discord.guilds …</span>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
