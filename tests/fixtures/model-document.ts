// Canonical fixture adapted from gpu-model-core (Apache-2.0). No user data.
import { createHash } from "node:crypto";
import {
  CANONICAL_GPU_MODEL_COORDINATE_SYSTEM,
  GPU_MODEL_DOCUMENT_SCHEMA_VERSION,
  createAndVerifyGpuModelDocument,
  verifyGpuModelResource,
  type GpuModelDocument,
  type GpuModelResourceInspection,
  type GpuModelResourceVerificationContext,
  type GpuModelResourceVerificationPort,
} from "@plasius/gpu-model-core";

export const PNG_1X1 = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
  "base64",
));

export const IDENTITY_MATRIX = Object.freeze([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function collect(chunks: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of chunks) {
    parts.push(chunk);
    size += chunk.byteLength;
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

export class FixtureVerificationPort implements GpuModelResourceVerificationPort {
  public digestCalls = 0;
  public inspectionCalls = 0;

  public async digestSha256(chunks: AsyncIterable<Uint8Array>, _context: GpuModelResourceVerificationContext): Promise<string> {
    this.digestCalls += 1;
    return sha256(await collect(chunks));
  }

  public async inspectResource(chunks: AsyncIterable<Uint8Array>, context: GpuModelResourceVerificationContext): Promise<GpuModelResourceInspection> {
    this.inspectionCalls += 1;
    const bytes = await collect(chunks);
    if (context.kind === "buffer") return { valid: true, detectedMimeType: context.declaredMimeType };
    const png = bytes.byteLength >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return png
      ? { valid: true, detectedMimeType: "image/png", width: view.getUint32(16), height: view.getUint32(20) }
      : { valid: false, detectedMimeType: "application/octet-stream" };
  }
}

export function fixtureBuffer(): Uint8Array {
  const bytes = new Uint8Array(320);
  const view = new DataView(bytes.buffer);
  const writeF32 = (offset: number, values: readonly number[]) => values.forEach((value, index) => view.setFloat32(offset + index * 4, value, true));
  writeF32(0, [-1, 0, -1, 1, 0, -1, -1, 2, 1, 1, 2, 1]);
  [0, 1, 2, 2, 1, 3].forEach((value, index) => view.setUint16(48 + index * 2, value, true));
  for (let vertex = 0; vertex < 4; vertex += 1) bytes.set([0, 0, 0, 0], 64 + vertex * 4);
  for (let vertex = 0; vertex < 4; vertex += 1) writeF32(80 + vertex * 16, [1, 0, 0, 0]);
  writeF32(144, new Array<number>(12).fill(0));
  writeF32(192, [0, 1]);
  writeF32(200, [0, 0, 0, 0, 0, 0]);
  writeF32(224, [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
  writeF32(272, [0, 0, 1, 0, 0, 1, 1, 1]);
  return bytes;
}

export function validDocument(): Record<string, unknown> {
  const buffer = fixtureBuffer();
  const bufferHash = sha256(buffer);
  const imageHash = sha256(PNG_1X1);
  return {
    schemaVersion: GPU_MODEL_DOCUMENT_SCHEMA_VERSION,
    coordinateSystem: CANONICAL_GPU_MODEL_COORDINATE_SYSTEM,
    roots: ["node-root"],
    nodes: [
      { id: "node-root", name: "Root", children: ["node-joint"], meshId: "mesh-main", skinId: "skin-main", localMatrix: IDENTITY_MATRIX, metadata: { semantic: "prop" } },
      { id: "node-joint", children: [], localMatrix: IDENTITY_MATRIX },
    ],
    resources: [
      { id: "buffer-main", kind: "buffer", contentHash: bufferHash, byteLength: buffer.byteLength, mimeType: "application/octet-stream", payload: new Blob([buffer.buffer as ArrayBuffer], { type: "application/octet-stream" }) },
      { id: "image-main", kind: "image", contentHash: imageHash, byteLength: PNG_1X1.byteLength, mimeType: "image/png", payload: new Blob([PNG_1X1], { type: "image/png" }) },
    ],
    accessors: [
      { id: "positions", resourceId: "buffer-main", byteOffset: 0, byteStride: 12, count: 4, componentType: "f32", elementType: "vec3", min: [-1, 0, -1], max: [1, 2, 1] },
      { id: "indices", resourceId: "buffer-main", byteOffset: 48, count: 6, componentType: "u16", elementType: "scalar" },
      { id: "joints", resourceId: "buffer-main", byteOffset: 64, count: 4, componentType: "u8", elementType: "vec4" },
      { id: "weights", resourceId: "buffer-main", byteOffset: 80, count: 4, componentType: "f32", elementType: "vec4" },
      { id: "morph-positions", resourceId: "buffer-main", byteOffset: 144, count: 4, componentType: "f32", elementType: "vec3" },
      { id: "animation-time", resourceId: "buffer-main", byteOffset: 192, count: 2, componentType: "f32", elementType: "scalar", min: [0], max: [1] },
      { id: "animation-output", resourceId: "buffer-main", byteOffset: 200, count: 2, componentType: "f32", elementType: "vec3" },
      { id: "normals", resourceId: "buffer-main", byteOffset: 224, count: 4, componentType: "f32", elementType: "vec3" },
      { id: "texcoords", resourceId: "buffer-main", byteOffset: 272, count: 4, componentType: "f32", elementType: "vec2" },
    ],
    meshes: [{ id: "mesh-main", name: "Fixture mesh", primitives: [{
      id: "primitive-main",
      topology: "triangles",
      attributes: [
        { semantic: "POSITION", accessorId: "positions" },
        { semantic: "NORMAL", accessorId: "normals" },
        { semantic: "TEXCOORD_0", accessorId: "texcoords" },
        { semantic: "JOINTS_0", accessorId: "joints" },
        { semantic: "WEIGHTS_0", accessorId: "weights" },
      ],
      indicesAccessorId: "indices",
      materialId: "material-main",
    }] }],
    materials: [{
      id: "material-main",
      name: "Neutral",
      workflow: "metallic-roughness",
      alphaMode: "opaque",
      doubleSided: false,
      baseColorFactor: [1, 1, 1, 1],
      metallicFactor: 0,
      roughnessFactor: 1,
      emissiveFactor: [0, 0, 0],
      textures: { baseColor: { textureId: "texture-main", samplerId: "sampler-main", texCoordSet: 0, colorSpace: "srgb", intendedUsage: "base-color" } },
      extensions: { KHR_materials_variants: { authored: true } },
      sourceMetadata: { authoredWorkflow: "metallic-roughness" },
    }],
    textures: [{
      id: "texture-main",
      fileName: "fixture.png",
      relativePath: "textures/fixture.png",
      mimeType: "image/png",
      contentHash: imageHash,
      imageResourceId: "image-main",
      byteLength: PNG_1X1.byteLength,
      intendedUsage: ["base-color"],
      colorSpace: "srgb",
      sampler: { id: "sampler-main", wrapS: "repeat", wrapT: "repeat", minFilter: "linear", magFilter: "linear", mipFilter: "linear" },
      exportEmbeddingPolicy: "prefer-embedded",
      sourceMetadata: { sourcePath: "textures/fixture.png" },
    }],
    skeletons: [{ id: "skeleton-main", name: "Fixture rig", jointIds: ["joint-root"], rootJointIds: ["joint-root"], sourceMetadata: { sourceArmature: "FixtureRig" } }],
    joints: [{
      id: "joint-root",
      name: "Root joint",
      nodeId: "node-joint",
      restLocalTransform: { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      inverseBindMatrix: IDENTITY_MATRIX,
      sourceMetadata: { sourceJoint: "Root" },
    }],
    skins: [{
      id: "skin-main",
      skeletonId: "skeleton-main",
      jointIds: ["joint-root"],
      inverseBindMatrices: [IDENTITY_MATRIX],
      weightSets: [{
        primitiveId: "primitive-main",
        influencesPerVertex: 4,
        joints: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
        weights: [[1, 0, 0, 0], [1, 0, 0, 0], [1, 0, 0, 0], [1, 0, 0, 0]],
      }],
      sourceMetadata: { sourceSkin: "FixtureSkin" },
    }],
    blendShapes: [{ id: "blend-main", meshId: "mesh-main", name: "Neutral delta", defaultWeight: 0, deltas: [{ primitiveId: "primitive-main", positionAccessorId: "morph-positions" }], sourceMetadata: { sourceShape: "Neutral" } }],
    animations: [{
      id: "animation-main",
      name: "Idle",
      durationSeconds: 1,
      samplers: [{ id: "animation-sampler", inputAccessorId: "animation-time", outputAccessorId: "animation-output", inputTimesSeconds: [0, 1], outputValues: [0, 0, 0, 0, 0, 0], interpolation: "linear", sourceMetadata: { sourceSampler: "Translation" } }],
      channels: [{ id: "animation-channel", samplerId: "animation-sampler", targetType: "node-translation", targetId: "node-joint", sourceMetadata: { sourceChannel: "RootTranslation" } }],
      sourceMetadata: { sourceTake: "Idle" },
    }],
    analyticGeometry: [{ id: "cad-main", kind: "brep-placeholder", sourceResourceId: "buffer-main", sourceUnit: "millimetre", tessellatedMeshId: "mesh-main" }],
    bounds: { min: [-1, 0, -1], max: [1, 2, 1] },
    provenance: { sourceFormat: "glb", sourceContentHash: bufferHash, converterId: "gltf-glb-adapter", converterVersion: "2026-08-20.v1", provider: "plasius", sourceIdentifier: "fixture:minimal" },
    diagnostics: [{ severity: "info", code: "canonical", message: "Canonical fixture." }],
    metadata: { category: "prop", tags: ["fixture"] },
  };
}

/** Minimal rigid geometry document for aggregate-work regression fixtures. */
export function rigidDocument(): Record<string, unknown> {
  const input = validDocument();
  input.roots = ["node-root"];
  input.nodes = [{ id: "node-root", children: [], meshId: "mesh-main", localMatrix: IDENTITY_MATRIX }];
  input.resources = [(input.resources as unknown[])[0]!];
  input.accessors = [(input.accessors as Array<Record<string, unknown>>).find(({ id }) => id === "positions")!];
  input.meshes = [{
    id: "mesh-main",
    primitives: [{ id: "primitive-main", topology: "points", attributes: [{ semantic: "POSITION", accessorId: "positions" }] }],
  }];
  input.materials = [];
  input.textures = [];
  input.skeletons = [];
  input.joints = [];
  input.skins = [];
  input.blendShapes = [];
  input.animations = [];
  input.analyticGeometry = [];
  input.diagnostics = [];
  input.metadata = {};
  return input;
}

export async function createValidGpuModelDocument(): Promise<GpuModelDocument> {
  return createAndVerifyGpuModelDocument(validDocument(), new FixtureVerificationPort());
}

export async function withVerifiedResources(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const port = new FixtureVerificationPort();
  const resources = await Promise.all((input.resources as unknown[]).map((resource) => verifyGpuModelResource(resource, port)));
  return { ...input, resources };
}
