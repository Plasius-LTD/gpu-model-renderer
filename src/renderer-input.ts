import {
  evaluateGpuModelDiagnostics, isGpuModelDocument,
  type GpuModelAccessor, type GpuModelDiagnosticInput, type GpuModelDiagnosticReport,
  type GpuModelDocument, type GpuModelResource, type GpuModelTexture,
} from "@plasius/gpu-model-core";

/** Fixed allocation ceiling; callers may tighten it, never raise it. */
export const GPU_MODEL_RENDERER_MAX_DECODED_BYTES = 64 * 1024 * 1024;
/** Remotely evaluated parent Feature flag. No environment override is read here. */
export const GPU_MODEL_RENDERER_FEATURE_FLAG = "gpu.model.conversion.enabled";

/** Stable, payload-free failure categories for callers and worker boundaries. */
export type GpuModelRendererErrorCode = "feature-disabled" | "unverified-document" | "invalid-options" | "budget-exceeded" | "aborted" | "diagnostics-rejected" | "resource-read-failed";
/** Bounded errors deliberately omit source paths, URIs and payload content. */
export class GpuModelRendererError extends Error {
  public constructor(public readonly code: GpuModelRendererErrorCode) {
    super(`GPU model renderer preparation failed: ${code}`);
    this.name = "GpuModelRendererError";
  }
}

/** Consumer-owned buffers; changing them never changes the canonical document. */
export type GpuModelRendererBuffer = Float32Array | Uint32Array;
/** Decode policy. Gate decisions must come from the host's remote flag evaluator. */
export interface GpuModelRendererOptions {
  readonly conversionEnabled: boolean;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly maxDecodedBytes?: number;
  readonly diagnostics?: GpuModelDiagnosticInput;
}
/** Geometry in mesh-local coordinates, directly usable by the canonical renderer adapter. */
export interface GpuModelRendererGeometry {
  readonly primitiveId: string;
  readonly positions: Float32Array;
  readonly indices?: Uint32Array;
  readonly normals?: Float32Array;
  readonly texcoords?: Float32Array;
}
/** All attributes are retained, including UV sets, colours, joints and custom semantics. */
export interface GpuModelRendererPrimitive {
  readonly meshId: string;
  readonly primitiveId: string;
  readonly topology: GpuModelDocument["meshes"][number]["primitives"][number]["topology"];
  /** Zero-based canonical material index; null denotes the renderer's default material. */
  readonly materialSlot: number | null;
  readonly attributes: Readonly<Record<string, GpuModelRendererBuffer>>;
}
/** Ordered joint palette and packed vertex influences; no animation is evaluated or baked. */
export interface GpuModelRendererSkin {
  readonly id: string;
  readonly skeletonId: string;
  readonly jointIds: readonly string[];
  readonly inverseBindMatrices: Float32Array;
  readonly weightSets: readonly {
    readonly primitiveId: string;
    readonly influencesPerVertex: number;
    readonly joints: Uint32Array;
    readonly weights: Float32Array;
  }[];
}
/** Canonical clip semantics with decoded, tightly packed sampler buffers. */
export interface GpuModelRendererAnimation {
  readonly id: string;
  readonly durationSeconds: number;
  readonly channels: GpuModelDocument["animations"][number]["channels"];
  readonly samplers: readonly {
    readonly id: string;
    readonly interpolation: GpuModelDocument["animations"][number]["samplers"][number]["interpolation"];
    readonly input: GpuModelRendererBuffer;
    readonly output: GpuModelRendererBuffer;
  }[];
}
/** Verified images remain encoded; the caller chooses its decoder/upload strategy. */
export interface GpuModelRendererTexture {
  readonly texture: GpuModelTexture;
  readonly resource: GpuModelResource;
}
/** Scene-aware preparation result. Geometry alone is not a baked world-space scene. */
export interface GpuModelRendererInput {
  readonly document: GpuModelDocument;
  readonly bounds: GpuModelDocument["bounds"];
  readonly roots: GpuModelDocument["roots"];
  readonly nodes: GpuModelDocument["nodes"];
  readonly materials: GpuModelDocument["materials"];
  readonly skeletons: GpuModelDocument["skeletons"];
  readonly joints: GpuModelDocument["joints"];
  readonly blendShapes: GpuModelDocument["blendShapes"];
  readonly analyticGeometry: GpuModelDocument["analyticGeometry"];
  readonly diagnostics: GpuModelDocument["diagnostics"];
  readonly diagnosticReport?: GpuModelDiagnosticReport;
  readonly accessors: Readonly<Record<string, GpuModelRendererBuffer>>;
  readonly geometry: readonly GpuModelRendererGeometry[];
  readonly primitives: readonly GpuModelRendererPrimitive[];
  readonly textures: readonly GpuModelRendererTexture[];
  readonly skins: readonly GpuModelRendererSkin[];
  readonly animations: readonly GpuModelRendererAnimation[];
}

const COMPONENT_BYTES = { i8: 1, u8: 1, i16: 2, u16: 2, u32: 4, f32: 4 } as const;
const COMPONENTS = { scalar: 1, vec2: 2, vec3: 3, vec4: 4, mat2: 4, mat3: 9, mat4: 16 } as const;

const readBlob = Blob.prototype.arrayBuffer;

function decode(accessor: GpuModelAccessor, view: DataView, check: () => void): GpuModelRendererBuffer {
  const size = COMPONENT_BYTES[accessor.componentType];
  const width = COMPONENTS[accessor.elementType];
  const stride = accessor.byteStride ?? size * width;
  const output = ["u8", "u16", "u32"].includes(accessor.componentType) && !accessor.normalized
    ? new Uint32Array(accessor.count * width)
    : new Float32Array(accessor.count * width);
  for (let index = 0; index < output.length; index += 1) {
    if (index % 4096 === 0) check();
    const offset = accessor.byteOffset + Math.floor(index / width) * stride + (index % width) * size;
    let value: number;
    switch (accessor.componentType) {
      case "i8": value = view.getInt8(offset); break;
      case "u8": value = view.getUint8(offset); break;
      case "i16": value = view.getInt16(offset, true); break;
      case "u16": value = view.getUint16(offset, true); break;
      case "u32": value = view.getUint32(offset, true); break;
      case "f32": value = view.getFloat32(offset, true); break;
    }
    if (accessor.normalized) {
      const divisor = { i8: 127, u8: 255, i16: 32767, u16: 65535, u32: 4294967295, f32: 1 }[accessor.componentType];
      value = Math.max(-1, value / divisor);
    }
    output[index] = value;
  }
  return output;
}

/**
 * Prepares privately verified core output without parsing source formats, fetching
 * resources or importing a renderer. Structured clones must be reverified by core.
 * Run on a host worker for large inputs. Operations are sequential, bounded and
 * have no retries. The host owns scene transforms and animation evaluation.
 */
export async function prepareGpuModelRendererInput(
  value: unknown,
  options?: GpuModelRendererOptions,
): Promise<GpuModelRendererInput> {
  if (options?.conversionEnabled !== true) throw new GpuModelRendererError("feature-disabled");
  if (!isGpuModelDocument(value)) throw new GpuModelRendererError("unverified-document");
  const document = value;
  const maxBytes = options.maxDecodedBytes ?? GPU_MODEL_RENDERER_MAX_DECODED_BYTES;
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > GPU_MODEL_RENDERER_MAX_DECODED_BYTES
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new GpuModelRendererError("invalid-options");
  }
  const diagnosticReport = options.diagnostics === undefined ? undefined : evaluateGpuModelDiagnostics(options.diagnostics);
  if (diagnosticReport?.accepted === false || document.diagnostics.some(({ severity }) => severity === "error")) {
    throw new GpuModelRendererError("diagnostics-rejected");
  }
  let allocation = 0;
  for (const accessor of document.accessors) allocation += accessor.count * COMPONENTS[accessor.elementType] * 4;
  for (const skin of document.skins) {
    allocation += skin.inverseBindMatrices.length * 16 * 4;
    for (const weights of skin.weightSets) allocation += weights.joints.length * weights.influencesPerVertex * 8;
  }
  // Include copies of encoded buffers in the peak budget; image bytes are not decoded here.
  for (const resource of document.resources) if (resource.kind === "buffer") allocation += resource.byteLength;
  if (allocation > maxBytes) throw new GpuModelRendererError("budget-exceeded");
  const deadline = performance.now() + timeoutMs;
  const check = () => {
    if (options.signal?.aborted || performance.now() >= deadline) throw new GpuModelRendererError("aborted");
  };
  check();
  const accessors: Record<string, GpuModelRendererBuffer> = Object.create(null);
  // One bounded read at a time. Abort/deadline rejects even if a host read stalls.
  const accessorsByResource = new Map<string, GpuModelAccessor[]>();
  for (const accessor of document.accessors) {
    const entries = accessorsByResource.get(accessor.resourceId) ?? [];
    entries.push(accessor);
    accessorsByResource.set(accessor.resourceId, entries);
  }
  for (const resource of document.resources) {
    const entries = accessorsByResource.get(resource.id);
    if (!entries) continue;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    try {
      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        abort = () => reject(new GpuModelRendererError("aborted"));
        options.signal?.addEventListener("abort", abort, { once: true });
        timer = setTimeout(abort, Math.max(1, deadline - performance.now()));
        readBlob.call(resource.payload).then(resolve, () => reject(new GpuModelRendererError("resource-read-failed")));
      });
      check();
      const view = new DataView(buffer);
      for (const accessor of entries) {
        check();
        accessors[accessor.id] = decode(accessor, view, check);
      }
    } finally {
      clearTimeout(timer);
      if (abort) options.signal?.removeEventListener("abort", abort);
    }
  }
  const primitives: GpuModelRendererPrimitive[] = [];
  const geometry: GpuModelRendererGeometry[] = [];
  const materialSlots = new Map(document.materials.map((material, index) => [material.id, index]));
  for (const mesh of document.meshes) for (const primitive of mesh.primitives) {
    check();
    const attributes: Record<string, GpuModelRendererBuffer> = Object.create(null);
    for (const attribute of primitive.attributes) attributes[attribute.semantic] = accessors[attribute.accessorId]!;
    primitives.push(Object.freeze({ meshId: mesh.id, primitiveId: primitive.id, topology: primitive.topology,
      materialSlot: primitive.materialId === undefined ? null : materialSlots.get(primitive.materialId)!, attributes: Object.freeze(attributes) }));
    geometry.push(Object.freeze({ primitiveId: primitive.id, positions: attributes.POSITION! as Float32Array,
      ...(primitive.indicesAccessorId === undefined ? {} : { indices: accessors[primitive.indicesAccessorId]! as Uint32Array }),
      ...(attributes.NORMAL === undefined ? {} : { normals: attributes.NORMAL as Float32Array }),
      ...(attributes.TEXCOORD_0 === undefined ? {} : { texcoords: attributes.TEXCOORD_0 as Float32Array }) }));
  }
  const pack = <T extends Float32Array | Uint32Array>(rows: readonly (readonly number[])[], output: T): T => {
    let offset = 0;
    for (const row of rows) { check(); output.set(row, offset); offset += row.length; }
    return output;
  };
  const skins = document.skins.map(skin => {
    check();
    return Object.freeze({ id: skin.id, skeletonId: skin.skeletonId, jointIds: skin.jointIds,
      inverseBindMatrices: pack(skin.inverseBindMatrices, new Float32Array(skin.inverseBindMatrices.length * 16)),
      weightSets: Object.freeze(skin.weightSets.map(weights => Object.freeze({ primitiveId: weights.primitiveId,
        influencesPerVertex: weights.influencesPerVertex, joints: pack(weights.joints, new Uint32Array(weights.joints.length * weights.influencesPerVertex)), weights: pack(weights.weights, new Float32Array(weights.weights.length * weights.influencesPerVertex)) }))) });
  });
  const animations = document.animations.map(animation => Object.freeze({ id: animation.id, durationSeconds: animation.durationSeconds,
    channels: animation.channels, samplers: Object.freeze(animation.samplers.map(sampler => Object.freeze({ id: sampler.id,
      interpolation: sampler.interpolation, input: accessors[sampler.inputAccessorId]!, output: accessors[sampler.outputAccessorId]! }))) }));
  const resources = new Map(document.resources.map(resource => [resource.id, resource]));
  check();
  return Object.freeze({ document, bounds: document.bounds, roots: document.roots, nodes: document.nodes, materials: document.materials,
    skeletons: document.skeletons, joints: document.joints, blendShapes: document.blendShapes, analyticGeometry: document.analyticGeometry,
    diagnostics: document.diagnostics, ...(diagnosticReport === undefined ? {} : { diagnosticReport }), accessors: Object.freeze(accessors),
    primitives: Object.freeze(primitives), geometry: Object.freeze(geometry), skins: Object.freeze(skins), animations: Object.freeze(animations),
    textures: Object.freeze(document.textures.map(texture => Object.freeze({ texture, resource: resources.get(texture.imageResourceId)! }))) });
}
