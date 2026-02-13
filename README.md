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
- optionally wires Discord token and sets `channels.discord.groupPolicy`
- puts nginx in front (HTTP only in v0)

## Status

MVP CLI: `clawpad hetzner:create`.

## Usage

```bash
npm install
npm run build

node dist/cli.js hetzner:create \
  --api-token "$HETZNER_API_TOKEN" \
  --ssh-public-key ~/.ssh/id_ed25519.pub \
  --name claw-test-1 \
  --server-type cx23 \
  --location nbg1 \
  --auth-choice minimax-api \
  --minimax-api-key "$MINIMAX_API_KEY" \
  --discord-bot-token "$DISCORD_BOT_TOKEN" \
  --discord-group-policy open
```

It prints JSON including the gateway token.

## Docs

- `docs/PLATFORM.md` (what the proper platform should look like)
- `docs/BYO.md` (bring-your-own hardware: what you sell)

