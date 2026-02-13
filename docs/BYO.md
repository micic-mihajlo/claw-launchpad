# BYO Hardware (What You Can Sell)

If the customer runs OpenClaw on their own Mac mini / mini PC, you can still sell:

- setup + hardening
- remote access (Tailscale) and "support tunnel" policy
- monitoring/alerts (health checks + logs)
- upgrades (scheduled maintenance window)
- backups (workspace + config)
- channel onboarding (Discord intents, slash commands, allowlists)

A clean offering:

- One-time install fee
- Monthly support subscription (updates + monitoring + incident response)

Implementation direction:

- installer script that:
  - installs Node 22 (or validates it)
  - installs `openclaw`
  - runs `openclaw onboard` (interactive or guided web wrapper)
  - optionally installs Tailscale + exposes gateway via Serve

- a tiny "support agent" is optional; if you rely on Tailscale + SSH you can keep it simple.
