export function buildRemoteBootstrapScript(params: {
  gatewayPort: number;
  gatewayBind: "loopback" | "lan";
  authChoice:
    | "skip"
    | "minimax-api"
    | "anthropic-api-key"
    | "openai-api-key"
    | "custom-api-key";
  discordBotToken?: string;
  discordGroupPolicy?: "open" | "allowlist" | "disabled";
  discordGuildId?: string;
  discordChannelIds?: string[];
  tailscaleMode: "off" | "serve";
}): string {
  const onboardKeyArg =
    params.authChoice === "minimax-api"
      ? '--minimax-api-key "$MINIMAX_API_KEY"'
      : params.authChoice === "anthropic-api-key"
        ? '--anthropic-api-key "$ANTHROPIC_API_KEY"'
        : params.authChoice === "openai-api-key"
          ? '--openai-api-key "$OPENAI_API_KEY"'
          : "";

  const effectiveDiscordGroupPolicy = params.discordGroupPolicy ?? "allowlist";
  const allowlistEnabled = Boolean(
    params.discordBotToken && effectiveDiscordGroupPolicy === "allowlist",
  );
  if (allowlistEnabled) {
    if (!params.discordGuildId) {
      throw new Error("discordGuildId is required when discordGroupPolicy=allowlist");
    }
    if (!Array.isArray(params.discordChannelIds) || params.discordChannelIds.length === 0) {
      throw new Error("discordChannelIds is required when discordGroupPolicy=allowlist");
    }
  }

  const discordGuildsJson = allowlistEnabled
    ? JSON.stringify(
        {
          [String(params.discordGuildId)]: {
            requireMention: true,
            channels: Object.fromEntries(
              (params.discordChannelIds ?? []).map((channelId) => [
                String(channelId),
                { allow: true, requireMention: true },
              ]),
            ),
          },
        },
        null,
        0,
      )
    : "";

  const discordGroupPolicyJson = JSON.stringify(effectiveDiscordGroupPolicy);

  const tailscaleInstallBlock =
    params.tailscaleMode === "serve"
      ? `

# Tailscale (Serve) for secure remote access without opening any ports.
curl -fsSL https://tailscale.com/install.sh | sh
systemctl enable --now tailscaled
tailscale up --authkey "$TAILSCALE_AUTH_KEY" --hostname "$TAILSCALE_HOSTNAME"

# Ensure OpenClaw can manage serve/reset without full root.
cat > /etc/sudoers.d/openclaw-tailscale <<'SUDOERS'
openclaw ALL=(root) NOPASSWD: /usr/bin/tailscale serve *, /usr/bin/tailscale serve reset
SUDOERS
chmod 440 /etc/sudoers.d/openclaw-tailscale
`
      : "";

  const tailscaleOnboardArg = params.tailscaleMode === "serve" ? "--tailscale serve" : "";

  const discordBlock = params.discordBotToken
    ? `

# Discord channel wiring
sudo -u openclaw -H env HOME=/home/openclaw DISCORD_BOT_TOKEN="$DISCORD_BOT_TOKEN" \\
  openclaw channels add --channel discord --use-env

# Group messages policy
sudo -u openclaw -H env HOME=/home/openclaw \\
  openclaw config set channels.discord.groupPolicy '${discordGroupPolicyJson}' --json
`
    : "";

  const discordAllowlistBlock = allowlistEnabled
    ? `

# Allowlist: only the configured channels are accepted
sudo -u openclaw -H env HOME=/home/openclaw \\
  openclaw config set channels.discord.guilds '${discordGuildsJson}' --json
`
    : "";

  return `#!/usr/bin/env bash
set -eo pipefail

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

apt-get update
apt-get install -y ca-certificates curl gnupg ufw
${tailscaleInstallBlock}

# Node 22
mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
apt-get update
apt-get install -y nodejs

# OpenClaw
npm install -g openclaw@latest

# Dedicated user + home
if ! id -u openclaw >/dev/null 2>&1; then
  useradd -r -m -d /home/openclaw -s /bin/bash openclaw
fi
mkdir -p /home/openclaw/.openclaw
chown -R openclaw:openclaw /home/openclaw/.openclaw
usermod -aG tailscale openclaw >/dev/null 2>&1 || true

# Root-owned env file for runtime secrets
install -d -m 0755 /etc/openclaw
cat > /etc/openclaw/openclaw.env <<EOF
OPENCLAW_GATEWAY_TOKEN=$OPENCLAW_GATEWAY_TOKEN
MINIMAX_API_KEY=$MINIMAX_API_KEY
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
OPENAI_API_KEY=$OPENAI_API_KEY
DISCORD_BOT_TOKEN=$DISCORD_BOT_TOKEN
EOF
chmod 600 /etc/openclaw/openclaw.env

# Generate config via OpenClaw itself (non-interactive)
sudo -u openclaw -H env \\
  HOME=/home/openclaw \\
  OPENCLAW_GATEWAY_TOKEN="$OPENCLAW_GATEWAY_TOKEN" \\
  MINIMAX_API_KEY="$MINIMAX_API_KEY" \\
  ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \\
  OPENAI_API_KEY="$OPENAI_API_KEY" \\
  openclaw onboard --non-interactive --accept-risk --no-install-daemon --skip-channels --skip-skills --skip-ui --skip-health \\
    --gateway-bind ${params.gatewayBind} --gateway-port ${params.gatewayPort} --gateway-auth token --gateway-token "$OPENCLAW_GATEWAY_TOKEN" \\
    ${tailscaleOnboardArg} --auth-choice ${params.authChoice} ${onboardKeyArg}
${discordBlock}
${discordAllowlistBlock}

# Systemd service (system-level: reliable on headless VPS)
cat > /etc/systemd/system/openclaw-gateway.service <<SYSTEMD
[Unit]
Description=OpenClaw Gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=openclaw
Group=openclaw
WorkingDirectory=/home/openclaw
Environment=HOME=/home/openclaw
Environment=NODE_ENV=production
EnvironmentFile=/etc/openclaw/openclaw.env
ExecStart=/usr/bin/openclaw gateway --port ${params.gatewayPort} --bind ${params.gatewayBind}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SYSTEMD

systemctl daemon-reload
systemctl enable openclaw-gateway
systemctl restart openclaw-gateway

# Firewall
ufw allow OpenSSH
ufw allow 41641/udp || true
ufw --force enable

echo "bootstrap complete"
`;
}
