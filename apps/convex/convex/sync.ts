import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

const snapshotArgs = {
  externalDeploymentId: v.string(),
  provider: v.string(),
  name: v.string(),
  status: v.string(),
  activeTask: v.union(v.string(), v.null()),
  config: v.any(),
  metadata: v.any(),
  billingRef: v.union(v.string(), v.null()),
  resources: v.any(),
  tailnetUrl: v.union(v.string(), v.null()),
  cancelRequestedAt: v.union(v.string(), v.null()),
  errorMessage: v.union(v.string(), v.null()),
  createdAt: v.string(),
  updatedAt: v.string(),
  startedAt: v.union(v.string(), v.null()),
  completedAt: v.union(v.string(), v.null()),
  syncedAt: v.string(),
};

export const upsertDeploymentSnapshot = mutationGeneric({
  args: snapshotArgs,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("deploymentSnapshots")
      .withIndex("by_external_deployment_id", (q) => q.eq("externalDeploymentId", args.externalDeploymentId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return { operation: "updated", id: existing._id };
    }

    const id = await ctx.db.insert("deploymentSnapshots", args);
    return { operation: "created", id };
  },
});

export const appendDeploymentEvent = mutationGeneric({
  args: {
    externalDeploymentId: v.string(),
    externalEventId: v.number(),
    type: v.string(),
    message: v.string(),
    payload: v.any(),
    createdAt: v.string(),
    syncedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const externalEventKey = `${args.externalDeploymentId}:${args.externalEventId}`;
    const existing = await ctx.db
      .query("deploymentEvents")
      .withIndex("by_external_event_key", (q) => q.eq("externalEventKey", externalEventKey))
      .first();

    if (existing) {
      return { operation: "ignored", id: existing._id };
    }

    const id = await ctx.db.insert("deploymentEvents", {
      ...args,
      externalEventKey,
    });
    return { operation: "created", id };
  },
});

export const getDeploymentSnapshot = queryGeneric({
  args: { externalDeploymentId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("deploymentSnapshots")
      .withIndex("by_external_deployment_id", (q) => q.eq("externalDeploymentId", args.externalDeploymentId))
      .first();
  },
});

export const listDeploymentEvents = queryGeneric({
  args: {
    externalDeploymentId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 200, 500));
    const events = await ctx.db
      .query("deploymentEvents")
      .withIndex("by_external_deployment_id", (q) => q.eq("externalDeploymentId", args.externalDeploymentId))
      .order("desc")
      .take(limit);
    return events;
  },
});
