import type { DeploymentEvent, DeploymentPublic } from "./deployments-store.js";

type ConvexMutationRequest = {
  path: string;
  args: Record<string, unknown>;
  format: "json";
};

export type ConvexMirrorOptions = {
  enabled: boolean;
  url?: string;
  deployKey?: string;
  timeoutMs?: number;
};

export class ConvexMirrorClient {
  readonly enabled: boolean;
  readonly ready: boolean;
  readonly issues: string[];
  readonly #url: string;
  readonly #deployKey: string;
  readonly #timeoutMs: number;

  constructor(options: ConvexMirrorOptions) {
    this.enabled = options.enabled;
    this.#url = String(options.url || "").replace(/\/+$/, "");
    this.#deployKey = String(options.deployKey || "").trim();
    this.#timeoutMs = Math.max(1_000, Number(options.timeoutMs || 8_000));
    this.issues = [];

    if (!this.enabled) {
      this.ready = false;
      return;
    }

    if (!this.#url) {
      this.issues.push("CONVEX_URL missing");
    }
    if (!this.#deployKey) {
      this.issues.push("CONVEX_DEPLOY_KEY missing");
    }
    this.ready = this.issues.length === 0;
  }

  async #callMutation(path: string, args: Record<string, unknown>) {
    if (!this.enabled || !this.ready) return;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    timer.unref?.();

    const requestBody: ConvexMutationRequest = {
      path,
      args,
      format: "json",
    };

    try {
      const response = await fetch(`${this.#url}/api/mutation`, {
        method: "POST",
        headers: {
          authorization: `Convex ${this.#deployKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error("Convex mirror mutation failed", {
          path,
          status: response.status,
          body: body.slice(0, 300),
        });
      }
    } catch (error) {
      console.error("Convex mirror request error", {
        path,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async syncDeploymentSnapshot(deployment: DeploymentPublic) {
    await this.#callMutation("sync:upsertDeploymentSnapshot", {
      externalDeploymentId: deployment.id,
      ownerUserId: deployment.ownerUserId,
      provider: deployment.provider,
      name: deployment.name,
      status: deployment.status,
      activeTask: deployment.activeTask ?? null,
      config: deployment.config,
      metadata: deployment.metadata,
      billingRef: deployment.billingRef ?? null,
      resources: deployment.resources,
      tailnetUrl: deployment.tailnetUrl ?? null,
      cancelRequestedAt: deployment.cancelRequestedAt ?? null,
      errorMessage: deployment.errorMessage ?? null,
      createdAt: deployment.createdAt,
      updatedAt: deployment.updatedAt,
      startedAt: deployment.startedAt ?? null,
      completedAt: deployment.completedAt ?? null,
      syncedAt: new Date().toISOString(),
    });
  }

  async appendDeploymentEvent(event: DeploymentEvent) {
    await this.#callMutation("sync:appendDeploymentEvent", {
      externalDeploymentId: event.deploymentId,
      externalEventId: event.id,
      type: event.type,
      message: event.message,
      payload: event.payload,
      createdAt: event.createdAt,
      syncedAt: new Date().toISOString(),
    });
  }
}
