import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  deploymentSnapshots: defineTable({
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
  }).index("by_external_deployment_id", ["externalDeploymentId"]),

  deploymentEvents: defineTable({
    externalDeploymentId: v.string(),
    externalEventId: v.number(),
    externalEventKey: v.string(),
    type: v.string(),
    message: v.string(),
    payload: v.any(),
    createdAt: v.string(),
    syncedAt: v.string(),
  })
    .index("by_external_deployment_id", ["externalDeploymentId", "externalEventId"])
    .index("by_external_event_key", ["externalEventKey"]),
});
