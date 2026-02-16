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
- Control-plane v1: SQLite-backed deployments + worker queue + automatic cleanup on failed/canceled provisioning
- Optional Convex mirror: deployment snapshots/events streamed for realtime app UX

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

# Convex (optional realtime mirror/read-model)
npm --workspace @clawpad/convex run dev
```

## Deployments API (control plane)

States:
- `pending`
- `provisioning`
- `running`
- `failed`
- `canceled`

Core endpoints:
- `POST /v1/deployments` create a deployment request (queued in `pending`)
- `GET /v1/deployments` list deployments
- `GET /v1/deployments/:id` get deployment + event history
- `POST /v1/deployments/:id/cancel` request cancel (worker performs cleanup)
- `POST /v1/deployments/:id/retry` retry failed/canceled deployments (only when no resources remain attached)
- `GET /v1/control-plane/health` config + worker readiness

Required API env for worker mode:
- `DEPLOYMENTS_ENCRYPTION_KEY` (encrypt secrets at rest)
- `PROVISIONER_SSH_PUBLIC_KEY_PATH`
- optionally `PROVISIONER_SSH_PRIVATE_KEY_PATH`

See `apps/api/.env.example` for full list.

Optional Convex mirror env:
- `CONVEX_SYNC_ENABLED=true`
- `CONVEX_URL`
- `CONVEX_DEPLOY_KEY`
- `CONVEX_SYNC_TIMEOUT_MS`

## Docs

- `docs/PLATFORM.md` (what the proper platform should look like)
- `docs/BYO.md` (bring-your-own hardware: what you sell)
- `docs/CONTROL_PLANE.md` (deployment state machine + worker + cleanup behavior)
- `docs/CONVEX.md` (what Convex owns vs what worker still owns)
