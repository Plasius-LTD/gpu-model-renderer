import { describe, expect, it } from "vitest";
import { createAndVerifyGpuModelDocument, type GpuModelDocument } from "@plasius/gpu-model-core";
import { ModelRuntime } from "@plasius/gpu-model-runtime";
import { createCanonicalWavefrontMeshInputs, createWavefrontGpuMaterialSource, createWavefrontMeshAcceleration, normalizeWavefrontMesh } from "@plasius/gpu-renderer";
import { prepareGpuModelRendererInput } from "../src/index.js";
import { validDocument, FixtureVerificationPort } from "./fixtures/model-document.js";

// This fixture tests runtime orchestration and the canonical bridge, not a file parser.
async function loadFixture(input: Record<string, any>) {
  const runtime = new ModelRuntime();
  runtime.adapters.register({ formatId: "canonical-fixture", extensions: ["fixture"],
    load: async () => ({ formatId: "canonical-fixture", sniff: () => true,
      load: async () => ({ canonicalModel: await createAndVerifyGpuModelDocument(input, new FixtureVerificationPort()) }) }) });
  return runtime.loadModel<GpuModelDocument>({ kind: "uint8-array", bytes: new Uint8Array([1,2,3]), fileNameHint: "mesh.fixture" }, { formatId: "canonical-fixture" });
}

describe("published runtime -> bridge -> published renderer", () => {
  it("ingests a static, two-material textured fixture into renderer atlas and BVH data", async () => {
    const input = validDocument() as Record<string, any>;
    input.nodes[0].children = [];
    delete input.nodes[0].skinId;
    input.nodes = [input.nodes[0]];
    input.skeletons = []; input.joints = []; input.skins = []; input.animations = []; input.blendShapes = [];
    const primitive = input.meshes[0].primitives[0];
    primitive.attributes = primitive.attributes.filter((a: any) => !["JOINTS_0", "WEIGHTS_0"].includes(a.semantic));
    input.materials.push({ ...input.materials[0], id: "material-second", baseColorFactor: [0.2,0.4,0.6,1], textures: {} });
    input.meshes[0].primitives.push({ ...primitive, id: "primitive-second", materialId: "material-second" });
    const loaded = await loadFixture(input);
    const prepared = await prepareGpuModelRendererInput(loaded.canonicalModel, { conversionEnabled: true });
    const meshes = createCanonicalWavefrontMeshInputs({ document: prepared.document, geometry: prepared.geometry,
      textures: new Map([["texture-main", { width: 1, height: 1, data: new Uint8Array([255,255,255,255]) }]]) });
    expect(meshes).toHaveLength(2);
    expect(meshes.map(mesh => mesh.materialRefId)).toEqual([1,2]);
    expect(prepared.primitives.map(p => p.materialSlot)).toEqual([0,1]);
    const source = createWavefrontGpuMaterialSource(meshes);
    const acceleration = createWavefrontMeshAcceleration(meshes);
    expect(acceleration.triangles).toHaveLength(4);
    expect(source.baseColorAtlas!.data.length).toBeGreaterThan(0);
    expect(prepared.bounds).toEqual({ min: [-1,0,-1], max: [1,2,1] });
    expect(prepared.textures[0]!.texture.relativePath).toBe("textures/fixture.png");
    expect(prepared.textures[0]!.resource.contentHash).toBe(prepared.textures[0]!.texture.contentHash);
    expect(meshes[1]!.baseColor).toEqual([0.2,0.4,0.6,1]);
  });

  it("leaves missing-normal fallback to the renderer and supports flag rollback", async () => {
    const input = validDocument() as Record<string, any>;
    input.meshes[0].primitives[0].attributes = input.meshes[0].primitives[0].attributes.filter((a: any) => a.semantic !== "NORMAL");
    const loaded = await loadFixture(input);
    const prepared = await prepareGpuModelRendererInput(loaded.canonicalModel, { conversionEnabled: true });
    const meshes = createCanonicalWavefrontMeshInputs({ document: prepared.document, geometry: prepared.geometry,
      textures: new Map([["texture-main", { width: 1, height: 1, data: [255,255,255,255] }]]) });
    expect(normalizeWavefrontMesh(meshes[0]!).normals).toBeNull();
    await expect(prepareGpuModelRendererInput(loaded.canonicalModel, { conversionEnabled: false })).rejects.toMatchObject({ code: "feature-disabled" });
  });
});
