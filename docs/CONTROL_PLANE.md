# Control Plane v1

This API layer is built around three rules:

1. Provisioning is asynchronous and durable.
2. Every transition is persisted and auditable.
3. Failures and cancel requests trigger infrastructure cleanup to avoid orphan spend.

Optional:
- Convex can mirror deployments/events for realtime app reads, but SQLite remains source of truth for provisioning.

## Data Model

`deployments`:
- status: `pending | provisioning | running | failed | canceled`
- active_task: `provision | destroy | null`
- provider resource pointers: `server_id`, `ssh_key_id`, IP/name
- lease fields for worker ownership/expiry
- encrypted secret payload and encrypted gateway token

`deployment_events`:
- append-only event stream used for timeline and debugging

## Worker Model

The worker polls and leases one job at a time:

1. Lease cleanup jobs first:
- running deployments with `cancel_requested_at`
- or stale destroy jobs

2. Lease provisioning jobs:
- oldest `pending` deployment

3. Lease recovery:
- stale provision leases are automatically moved to cleanup or failed, so resources are not silently abandoned

## Cleanup Guarantees

On provisioning failure or cancel:
- delete Hetzner server (if created)
- wait for delete action completion when action id is returned
- delete temporary Hetzner SSH key
- only mark `canceled` when cleanup succeeded
- otherwise mark `failed` with cleanup error context

## API Contract

- `POST /v1/deployments`
- `GET /v1/deployments`
- `GET /v1/deployments/:id`
- `POST /v1/deployments/:id/cancel`
- `POST /v1/deployments/:id/retry`
- `GET /v1/control-plane/health`

## Required Env

- `DEPLOYMENTS_DB_PATH`
- `DEPLOYMENTS_ENCRYPTION_KEY`
- `DEPLOY_WORKER_ENABLED`
- `DEPLOY_WORKER_INTERVAL_MS`
- `DEPLOY_WORKER_LEASE_MS`
- `PROVISIONER_SSH_PUBLIC_KEY_PATH`
- `PROVISIONER_SSH_PRIVATE_KEY_PATH` (optional)
