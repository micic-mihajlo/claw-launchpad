const BASE_URL = "https://api.hetzner.cloud/v1";

export type HetznerServer = {
  id: number;
  name: string;
  status: string;
  created: string;
  public_net?: {
    ipv4?: { ip?: string | null };
    ipv6?: { ip?: string | null };
  };
};

export type HetznerAction = {
  id: number;
  command: string;
  status: "running" | "success" | "error";
  started?: string;
  finished?: string | null;
  error?: { code?: string; message?: string } | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class HetznerClient {
  readonly #token: string;

  constructor(token: string) {
    if (!token) {
      throw new Error("Missing Hetzner API token");
    }
    this.#token = token;
  }

  async #request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.#token}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await res.text();
    const data = text ? (JSON.parse(text) as T & { error?: { message?: string } }) : ({} as T);

    if (!res.ok) {
      const message = (data as any)?.error?.message || `Hetzner API error (${res.status})`;
      const error = new Error(message);
      (error as any).statusCode = res.status;
      (error as any).details = data;
      throw error;
    }

    return data;
  }

  async createSshKey(params: { name: string; public_key: string }) {
    return await this.#request<{ ssh_key: { id: number; name: string } }>("POST", "/ssh_keys", params);
  }

  async deleteSshKey(id: number) {
    return await this.#request<{ action?: HetznerAction }>("DELETE", `/ssh_keys/${id}`);
  }

  async createServer(payload: unknown) {
    return await this.#request<{ server: HetznerServer; action?: HetznerAction }>("POST", "/servers", payload);
  }

  async getServer(id: number) {
    return await this.#request<{ server: HetznerServer }>("GET", `/servers/${id}`);
  }

  async deleteServer(id: number) {
    return await this.#request<{ action?: HetznerAction }>("DELETE", `/servers/${id}`);
  }

  async getAction(id: number) {
    return await this.#request<{ action: HetznerAction }>("GET", `/actions/${id}`);
  }

  async waitForAction(id: number, opts?: { timeoutMs?: number; intervalMs?: number }) {
    const timeoutMs = opts?.timeoutMs ?? 180_000;
    const intervalMs = opts?.intervalMs ?? 2_500;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const { action } = await this.getAction(id);
      if (action.status === "success") {
        return action;
      }
      if (action.status === "error") {
        throw new Error(action.error?.message || "Hetzner action failed");
      }
      await sleep(intervalMs);
    }

    throw new Error(`Timeout waiting for Hetzner action ${id}`);
  }
}
