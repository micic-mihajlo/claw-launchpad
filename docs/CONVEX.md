# Convex Integration

Convex is used as an optional **realtime read-model** layer.

## Ownership Split

SQLite + API worker remain the source of truth for:
- provisioning state machine and leases
- Hetzner/Tailscale/OpenClaw side effects
- cleanup guarantees on failure/cancel

Convex owns:
- deployment snapshot mirror
- deployment event stream mirror
- realtime app-facing reads/subscriptions

## Why This Split

Provisioning workflows include long-running infrastructure steps (cloud actions, SSH bootstrap).
Those flows stay in the dedicated worker for strict operational control.

Convex then gives:
- fast app queries
- reactive UI updates
- product-layer structure for billing/account experiences

## Convex Workspace

Path: `apps/convex`

Tables:
- `deploymentSnapshots`
- `deploymentEvents`

Sync mutations:
- `sync:upsertDeploymentSnapshot`
- `sync:appendDeploymentEvent`

## API -> Convex Sync

When `CONVEX_SYNC_ENABLED=true`, API store hooks asynchronously forward:
- every deployment snapshot change
- every appended deployment event

Failures in Convex sync are logged but do not fail provisioning state transitions.

## Env

In `apps/api`:
- `CONVEX_SYNC_ENABLED=true`
- `CONVEX_URL=<your convex deployment url>`
- `CONVEX_DEPLOY_KEY=<server deploy key>`
- `CONVEX_SYNC_TIMEOUT_MS=8000`
