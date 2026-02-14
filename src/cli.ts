#!/usr/bin/env node
import { Command } from "commander";
import { provisionHetzner } from "./provision/hetzner.js";

const program = new Command();
program.name("clawpad").description("Provision OpenClaw reliably");

const ALLOWED_AUTH_CHOICES = new Set([
  "skip",
  "minimax-api",
  "anthropic-api-key",
  "openai-api-key",
] as const);

const ALLOWED_DISCORD_GROUP_POLICIES = new Set([
  "open",
  "allowlist",
  "disabled",
] as const);

function parseCsvIds(value: unknown): string[] {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function assertDiscordId(value: string, label: string) {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(`${label} must be a numeric Discord ID`);
  }
}

function normalizeTailscaleHostname(value: string): string {
  // RFC 1123 label (lowercase only): start/end alphanumeric, interior alnum or hyphen, max 63 chars.
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(normalized)) {
    throw new Error(
      "Invalid --tailscale-hostname. Use 1-63 chars: lowercase letters, digits, hyphen; must start/end with alphanumeric.",
    );
  }
  return normalized;
}

program
  .command("hetzner:create")
  .description("Provision a Hetzner VPS and bootstrap OpenClaw")
  .requiredOption("--api-token <token>", "Hetzner API token")
  .requiredOption("--ssh-public-key <path>", "Path to SSH public key (.pub)")
  .requiredOption("--name <name>", "Server name")
  .requiredOption("--tailscale-auth-key <key>", "Tailscale auth key (ephemeral recommended)")
  .option("--tailscale-hostname <name>", "Tailscale hostname (default: server name)")
  .option("--server-type <type>", "Hetzner server type", "cx23")
  .option("--image <image>", "Hetzner image", "ubuntu-24.04")
  .option("--location <loc>", "Hetzner location", "nbg1")
  .option(
    "--auth-choice <choice>",
    "OpenClaw onboard auth choice (skip|minimax-api|anthropic-api-key|openai-api-key)",
    "skip",
  )
  .option("--minimax-api-key <key>", "MiniMax API key")
  .option("--anthropic-api-key <key>", "Anthropic API key")
  .option("--openai-api-key <key>", "OpenAI API key")
  .option("--discord-bot-token <token>", "Discord bot token")
  .option(
    "--discord-group-policy <policy>",
    "Discord group policy (open|allowlist|disabled)",
    "allowlist",
  )
  .option("--discord-guild-id <id>", "Discord guild id (required for allowlist)")
  .option(
    "--discord-channel-ids <ids>",
    "Comma-separated Discord channel IDs to allow (required for allowlist)",
  )
  .action(async (opts) => {
    const authChoice = String(opts.authChoice);
    if (!ALLOWED_AUTH_CHOICES.has(authChoice as any)) {
      throw new Error(
        `Invalid --auth-choice. Expected one of: ${Array.from(ALLOWED_AUTH_CHOICES).join(", ")}`,
      );
    }

    const tailscaleHostname = opts.tailscaleHostname
      ? normalizeTailscaleHostname(String(opts.tailscaleHostname))
      : undefined;

    const discordGroupPolicy = opts.discordGroupPolicy ? String(opts.discordGroupPolicy) : undefined;
    if (discordGroupPolicy && !ALLOWED_DISCORD_GROUP_POLICIES.has(discordGroupPolicy as any)) {
      throw new Error(
        `Invalid --discord-group-policy. Expected one of: ${Array.from(ALLOWED_DISCORD_GROUP_POLICIES).join(", ")}`,
      );
    }
    const effectiveDiscordGroupPolicy = (discordGroupPolicy ?? "allowlist") as
      | "open"
      | "allowlist"
      | "disabled";

    const discordGuildId = opts.discordGuildId ? String(opts.discordGuildId) : undefined;
    if (discordGuildId) {
      assertDiscordId(discordGuildId, "--discord-guild-id");
    }

    const discordChannelIds = parseCsvIds(opts.discordChannelIds);
    for (const id of discordChannelIds) {
      assertDiscordId(id, "--discord-channel-ids");
    }
    const uniqueDiscordChannelIds = Array.from(new Set(discordChannelIds));

    const discordBotToken = opts.discordBotToken ? String(opts.discordBotToken) : undefined;
    if (discordBotToken && effectiveDiscordGroupPolicy === "allowlist") {
      if (!discordGuildId) {
        throw new Error("--discord-guild-id is required when --discord-group-policy=allowlist");
      }
      if (uniqueDiscordChannelIds.length === 0) {
        throw new Error(
          "--discord-channel-ids is required when --discord-group-policy=allowlist",
        );
      }
    }

    const res = await provisionHetzner({
      apiToken: String(opts.apiToken),
      sshPublicKeyPath: String(opts.sshPublicKey),
      name: String(opts.name),
      tailscaleAuthKey: String(opts.tailscaleAuthKey),
      tailscaleHostname,
      serverType: String(opts.serverType),
      image: String(opts.image),
      location: String(opts.location),
      authChoice: authChoice as any,
      minimaxApiKey: opts.minimaxApiKey ? String(opts.minimaxApiKey) : undefined,
      anthropicApiKey: opts.anthropicApiKey ? String(opts.anthropicApiKey) : undefined,
      openaiApiKey: opts.openaiApiKey ? String(opts.openaiApiKey) : undefined,
      discordBotToken,
      discordGroupPolicy: effectiveDiscordGroupPolicy,
      discordGuildId,
      discordChannelIds: uniqueDiscordChannelIds.length ? uniqueDiscordChannelIds : undefined,
    });

    // Print only non-sensitive outputs.
    console.log(JSON.stringify({
      ok: true,
      provider: "hetzner",
      serverId: res.serverId,
      ip: res.ip,
      url: res.url,
      gatewayToken: res.gatewayToken,
    }, null, 2));
  });

await program.parseAsync(process.argv);
