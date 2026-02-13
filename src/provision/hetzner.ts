import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { HetznerClient } from "../providers/hetzner.js";
import { runOrThrow, run } from "../util/sh.js";
import { buildRemoteBootstrapScript } from "./remote-script.js";

export type HetznerProvisionParams = {
  apiToken: string;
  name: string;
  serverType: string;
  image: string;
  location: string;
  sshPublicKeyPath: string;
  minimaxApiKey?: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  authChoice: "skip" | "minimax-api" | "anthropic-api-key" | "openai-api-key";
  discordBotToken?: string;
  discordGroupPolicy?: "open" | "allowlist" | "disabled";
};

function expandHome(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

async function waitForSsh(ip: string, opts?: { timeoutMs?: number }) {
  const timeoutMs = opts?.timeoutMs ?? 180_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await run([
      "ssh",
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "ConnectTimeout=5",
      `root@${ip}`,
      "true",
    ]);
    if (res.code === 0) return;
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error(`Timeout waiting for SSH on ${ip}`);
}

export async function provisionHetzner(params: HetznerProvisionParams) {
  const client = new HetznerClient(params.apiToken);

  const pubPath = expandHome(params.sshPublicKeyPath);
  const pub = fs.readFileSync(pubPath, "utf8").trim();
  if (!pub.startsWith("ssh-")) {
    throw new Error(`Not an SSH public key: ${pubPath}`);
  }

  const sshKeyName = `clawpad-${os.hostname()}-${Date.now()}`;
  const sshKey = await client.createSshKey({ name: sshKeyName, public_key: pub });
  const sshKeyId = sshKey.ssh_key.id;

  const gatewayToken = crypto.randomBytes(32).toString("hex");

  const create = await client.createServer({
    name: params.name,
    server_type: params.serverType,
    image: params.image,
    location: params.location,
    ssh_keys: [sshKeyId],
    start_after_create: true,
    public_net: { enable_ipv4: true, enable_ipv6: true },
    labels: { "managed-by": "claw-launchpad" },
  });

  const actionId = create.action?.id;
  if (actionId) {
    await client.waitForAction(actionId, { timeoutMs: 180_000 });
  }

  const serverId = create.server.id;
  const latest = await client.getServer(serverId);
  const ip = latest.server.public_net?.ipv4?.ip;
  if (!ip) {
    throw new Error("No ipv4 assigned yet");
  }

  await waitForSsh(ip);

  const script = buildRemoteBootstrapScript({
    gatewayPort: 18789,
    gatewayBind: "loopback",
    gatewayToken,
    authChoice: params.authChoice,
    minimaxApiKey: params.minimaxApiKey,
    anthropicApiKey: params.anthropicApiKey,
    openaiApiKey: params.openaiApiKey,
    discordBotToken: params.discordBotToken,
    discordGroupPolicy: params.discordGroupPolicy,
  });

  const tmp = path.join(os.tmpdir(), `clawpad-bootstrap-${Date.now()}.sh`);
  fs.writeFileSync(tmp, script, { mode: 0o700 });

  // Copy script to server.
  await runOrThrow([
    "scp",
    "-o",
    "StrictHostKeyChecking=no",
    tmp,
    `root@${ip}:/root/clawpad-bootstrap.sh`,
  ]);

  // Execute it with secrets passed via env vars.
  const env: Record<string, string> = {
    OPENCLAW_GATEWAY_TOKEN: gatewayToken,
  };
  if (params.minimaxApiKey) env.MINIMAX_API_KEY = params.minimaxApiKey;
  if (params.anthropicApiKey) env.ANTHROPIC_API_KEY = params.anthropicApiKey;
  if (params.openaiApiKey) env.OPENAI_API_KEY = params.openaiApiKey;
  if (params.discordBotToken) env.DISCORD_BOT_TOKEN = params.discordBotToken;

  const exportPrefix = Object.entries(env)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ");

  await runOrThrow([
    "ssh",
    "-o",
    "StrictHostKeyChecking=no",
    `root@${ip}`,
    `${exportPrefix} bash /root/clawpad-bootstrap.sh`,
  ]);

  // Persist metadata locally.
  const stateDir = path.join(process.cwd(), ".clawpad");
  fs.mkdirSync(stateDir, { recursive: true });
  const record = {
    provider: "hetzner",
    serverId,
    ip,
    name: params.name,
    gatewayToken,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(stateDir, `server-${serverId}.json`), JSON.stringify(record, null, 2));

  return {
    serverId,
    ip,
    gatewayToken,
    url: `http://${ip}/`,
  };
}
