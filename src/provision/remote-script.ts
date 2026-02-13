export function buildRemoteBootstrapScript(params: {
  gatewayPort: number;
  gatewayBind: "loopback" | "lan";
  gatewayToken: string;
  authChoice:
    | "skip"
    | "minimax-api"
    | "anthropic-api-key"
    | "openai-api-key"
    | "custom-api-key";
  minimaxApiKey?: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  discordBotToken?: string;
  discordGroupPolicy?: "open" | "allowlist" | "disabled";
}): string {
  // IMPORTANT: This function uses a TS template string to generate a bash script.
  // Do not emit any literal "${...}" sequences inside the script, because those
  // would be parsed by TypeScript as template interpolation.

  const onboardKeyArg =
    params.authChoice === "minimax-api"
      ? '--minimax-api-key "$MINIMAX_API_KEY"'
      : params.authChoice === "anthropic-api-key"
        ? '--anthropic-api-key "$ANTHROPIC_API_KEY"'
        : params.authChoice === "openai-api-key"
          ? '--openai-api-key "$OPENAI_API_KEY"'
          : "";

  const discordBlock = params.discordBotToken
    ? `

# Discord channel wiring
sudo -u openclaw -H env HOME=/home/openclaw DISCORD_BOT_TOKEN="$DISCORD_BOT_TOKEN" \\
  openclaw channels add --channel discord --use-env

# Make guild behavior explicit so the bot doesn't look "silent" by default.
# Safer: allowlist + configure guilds/channels. Better DX: open.
sudo -u openclaw -H env HOME=/home/openclaw \\
  openclaw config set channels.discord.groupPolicy '"$DISCORD_GROUP_POLICY"' --json
`
    : "";

  return `#!/usr/bin/env bash
set -eo pipefail

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

apt-get update
apt-get install -y ca-certificates curl gnupg nginx ufw

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

# Root-owned env file for runtime secrets (passed via systemd EnvironmentFile)
install -d -m 0755 /etc/openclaw
cat > /etc/openclaw/openclaw.env <<EOF
OPENCLAW_GATEWAY_TOKEN=$OPENCLAW_GATEWAY_TOKEN
MINIMAX_API_KEY=$MINIMAX_API_KEY
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
OPENAI_API_KEY=$OPENAI_API_KEY
DISCORD_BOT_TOKEN=$DISCORD_BOT_TOKEN
DISCORD_GROUP_POLICY=${params.discordGroupPolicy ?? "allowlist"}
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
    --auth-choice ${params.authChoice} ${onboardKeyArg}
${discordBlock}

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

# Nginx reverse proxy (HTTP only for now)
cat > /etc/nginx/sites-available/openclaw <<'NGINX'
upstream openclaw_gateway {
  server 127.0.0.1:${params.gatewayPort};
  keepalive 64;
}
server {
  listen 80 default_server;
  listen [::]:80 default_server;
  server_name _;

  client_max_body_size 50m;

  location / {
    proxy_pass http://openclaw_gateway;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    proxy_buffering off;
  }
}
NGINX

ln -sf /etc/nginx/sites-available/openclaw /etc/nginx/sites-enabled/openclaw
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
systemctl enable nginx

# Firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw --force enable

echo "bootstrap complete"
`;
}

