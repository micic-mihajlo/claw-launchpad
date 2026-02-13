#!/usr/bin/env node
import { Command } from "commander";
import { provisionHetzner } from "./provision/hetzner.js";

const program = new Command();
program.name("clawpad").description("Provision OpenClaw reliably");

program
  .command("hetzner:create")
  .description("Provision a Hetzner VPS and bootstrap OpenClaw")
  .requiredOption("--api-token <token>", "Hetzner API token")
  .requiredOption("--ssh-public-key <path>", "Path to SSH public key (.pub)")
  .requiredOption("--name <name>", "Server name")
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
  .action(async (opts) => {
    const authChoice = String(opts.authChoice);
    if (!/[a-z0-9-]+/.test(authChoice)) {
      throw new Error("Invalid --auth-choice");
    }

    const res = await provisionHetzner({
      apiToken: String(opts.apiToken),
      sshPublicKeyPath: String(opts.sshPublicKey),
      name: String(opts.name),
      serverType: String(opts.serverType),
      image: String(opts.image),
      location: String(opts.location),
      authChoice: authChoice as any,
      minimaxApiKey: opts.minimaxApiKey ? String(opts.minimaxApiKey) : undefined,
      anthropicApiKey: opts.anthropicApiKey ? String(opts.anthropicApiKey) : undefined,
      openaiApiKey: opts.openaiApiKey ? String(opts.openaiApiKey) : undefined,
      discordBotToken: opts.discordBotToken ? String(opts.discordBotToken) : undefined,
      discordGroupPolicy: opts.discordGroupPolicy ? (String(opts.discordGroupPolicy) as any) : undefined,
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
