# claw-launchpad

A pragmatic deployment tool for provisioning **OpenClaw** on:

- VPS (first provider: Hetzner)
- BYO machines (Mac mini / mini PC) (scaffolding; see docs)

This repo is intentionally built around **OpenClaw's own CLI** (`openclaw onboard --non-interactive`) so we stay compatible with upstream config/daemon behavior.

## Why this exists (vs doing it manually)

Manual installs fail for boring reasons:

- systemd user services on headless boxes
- config drift vs upstream
- Discord guild allowlist defaults (bot appears "silent")
- DNS/SSL/port exposure decisions

Launchpad bakes a repeatable bootstrap that does:

- installs Node 22 + `openclaw@latest`
- runs non-interactive onboarding to generate config
- sets up a reliable systemd service
- enables **Tailscale Serve** (default) so the Gateway is not publicly exposed
- wires Discord and applies a **guild/channel allowlist** so it never looks “silent”

## Status

- MVP CLI: `clawpad hetzner:create` (Hetzner + Tailscale Serve + OpenClaw bootstrap)
- Early web wizard: `apps/web` + `apps/api` (Discord connector modal with token test + allowlist builder)

## Usage

```bash
npm install
npm run build

node dist/cli.js hetzner:create \
  --api-token "$HETZNER_API_TOKEN" \
  --ssh-public-key ~/.ssh/id_ed25519.pub \
  --name claw-test-1 \
  --tailscale-auth-key "$TAILSCALE_AUTH_KEY" \
  --server-type cx23 \
  --location nbg1 \
  --auth-choice minimax-api \
  --minimax-api-key "$MINIMAX_API_KEY" \
  --discord-bot-token "$DISCORD_BOT_TOKEN" \
  --discord-group-policy allowlist \
  --discord-guild-id "123456789012345678" \
  --discord-channel-ids "234567890123456789,345678901234567890"
```

It prints JSON including the gateway token.

## Dev (wizard UI)

```bash
# API (defaults to :8788)
npm run dev:api

# Web (defaults to :5173)
npm run dev:web
```

## Docs

- `docs/PLATFORM.md` (what the proper platform should look like)
- `docs/BYO.md` (bring-your-own hardware: what you sell)
