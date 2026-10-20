/** Package identity and rollout metadata for the initial repository baseline. */
export const packageName = "@plasius/gpu-model-renderer" as const;

/** @deprecated Retained for compatibility with the bootstrap package identity. */
export const packageBootstrap = Object.freeze({
  packageName,
  featureFlag: "gpu.model.conversion.enabled",
  status: "bootstrap",
} as const);

export * from "./renderer-input.js";
