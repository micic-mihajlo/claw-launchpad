import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";

const DISCORD_BASE_URL = "https://discord.com/api/v10";

function jsonError(c: any, status: number, message: string, details?: unknown) {
  return c.json(
    {
      ok: false,
      error: message,
      ...(details !== undefined ? { details } : {}),
    },
    status,
  );
}

async function discordRequest<T>(token: string, path: string): Promise<{ ok: true; data: T } | { ok: false; status: number; data: unknown }> {
  const res = await fetch(`${DISCORD_BASE_URL}${path}`, {
    headers: {
      authorization: `Bot ${token}`,
    },
  });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    return { ok: false, status: res.status, data };
  }

  return { ok: true, data: data as T };
}

const app = new Hono();

app.use(
  "*",
  cors({
    origin: process.env.WEB_ORIGIN || "http://localhost:5173",
    allowHeaders: ["content-type"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    maxAge: 600,
  }),
);

app.get("/health", (c) => c.json({ ok: true }));

app.post("/v1/connectors/discord/test", async (c) => {
  const body = await c.req.json().catch(() => null);
  const schema = z.object({
    token: z.string().min(1),
    guildId: z.string().min(1).optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return jsonError(c, 400, "Invalid body", parsed.error.flatten());
  }

  const token = parsed.data.token.trim();
  const me = await discordRequest<{ id: string; username: string; discriminator?: string; bot?: boolean }>(
    token,
    "/users/@me",
  );
  if (!me.ok) {
    const status = me.status === 401 ? 401 : 400;
    return jsonError(c, status, "Discord token invalid", me.data);
  }

  let guild: { ok: boolean; status?: number; data?: unknown } | null = null;
  if (parsed.data.guildId) {
    const guildRes = await discordRequest<{ id: string; name: string }>(token, `/guilds/${parsed.data.guildId}`);
    guild = guildRes.ok
      ? { ok: true, data: guildRes.data }
      : { ok: false, status: guildRes.status, data: guildRes.data };
  }

  // NOTE: For bots, user id is typically the application client_id.
  const clientId = me.data.id;
  const permissions = 68608; // View Channels + Send Messages + Read Message History
  const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=${permissions}`;

  return c.json({
    ok: true,
    bot: me.data,
    inviteUrl,
    ...(guild ? { guild } : {}),
  });
});

app.post("/v1/connectors/discord/guild-channels", async (c) => {
  const body = await c.req.json().catch(() => null);
  const schema = z.object({
    token: z.string().min(1),
    guildId: z.string().min(1).regex(/^[0-9]+$/, "guildId must be a numeric Discord snowflake"),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return jsonError(c, 400, "Invalid body", parsed.error.flatten());
  }

  const token = parsed.data.token.trim();
  const channels = await discordRequest<
    Array<{ id: string; name: string; type: number; parent_id?: string | null; position?: number }>
  >(token, `/guilds/${parsed.data.guildId}/channels`);

  if (!channels.ok) {
    const status = channels.status === 401 ? 401 : 400;
    return jsonError(c, status, "Failed to list guild channels", channels.data);
  }

  const allowedTypes = new Set([0, 5, 15]);
  const normalized = channels.data
    .filter((ch) => allowedTypes.has(ch.type))
    .map((ch) => ({
      id: ch.id,
      name: ch.name,
      type: ch.type,
      parentId: ch.parent_id ?? null,
      position: typeof ch.position === "number" ? ch.position : null,
    }))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  return c.json({ ok: true, channels: normalized });
});

const port = Number.parseInt(process.env.PORT || "8788", 10);
serve({ fetch: app.fetch, port });
