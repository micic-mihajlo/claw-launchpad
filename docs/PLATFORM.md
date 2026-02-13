# Platform Design Notes

## What OpenClaw Actually Wants

OpenClaw is not "just a bot"; it's a local-first gateway + CLI with a real security model.
The upstream-recommended flow is:

- `openclaw onboard` to generate config and set up auth
- `openclaw channels add` to wire channels
- `openclaw doctor` to validate

A hosting platform should not hand-roll `openclaw.json` unless strictly necessary.

## Product Modes

1. VPS Managed (resell or customer-provided cloud)
- You provision infra.
- You install OpenClaw.
- You expose it safely.
- You provide support, updates, and incident response.

2. BYO Hardware (Mac mini / mini PC)
- You ship an installer.
- You provide remote access (Tailscale) and monitoring.
- The customer pays for your labor/support, not infra.

## Required Components (to be "real")

- Control plane API
- Worker / job queue (provisioning is async)
- State store (deployments, events, logs)
- Secrets handling (encrypt at rest; avoid long-term storage where possible)
- UI onboarding

## UX Flow (what users expect)

1. Pick "Where to run": Hetzner, DigitalOcean, Existing machine
2. Pick "How to access": Tailscale Serve/Funnel or Nginx + domain
3. Pick channels: Discord / Telegram / etc
4. Only then ask for keys needed for the chosen channels/providers
5. Provision
6. Verify health + show a clear "try it" step

## Security Defaults

- Default guild/group policy should be explicit.
  - Safer default: `allowlist` and force user to select guild/channel(s)
  - Better first-run experience: `open` (but document the risk)

- Encourage `gateway.bind=loopback` and expose via Tailscale, not public IP.

## What Went Wrong In The Previous Attempt

- Cloud-init is hard to debug and easy to break.
- Writing config by hand drifts from upstream.
- systemd hardening can block OpenClaw from functioning normally.

The approach in this repo is: install OpenClaw, then run its own non-interactive onboarding, then create a minimal system-level service.
