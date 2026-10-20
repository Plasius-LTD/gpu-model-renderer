import { describe, expect, it } from "vitest";
import { createAndVerifyGpuModelDocument, isGpuModelDocument, type GpuModelDocument } from "@plasius/gpu-model-core";
import { ModelRuntime } from "@plasius/gpu-model-runtime";
import { prepareGpuModelRendererInput } from "../src/index.js";
import { EXTENDED_SLOTS, extendedMaterialDocument } from "./fixtures/extended-material.js";
import { FixtureVerificationPort } from "./fixtures/model-document.js";

const enabled = { conversionEnabled: true };
const verify = (input = extendedMaterialDocument()) => createAndVerifyGpuModelDocument(input, new FixtureVerificationPort());

describe("released extended material contract at the bridge", () => {
  it.each(EXTENDED_SLOTS)("retains %s binding, UV transform, sampler and verified image", async (slot, usage, colorSpace) => {
    const document = await verify(extendedMaterialDocument(EXTENDED_SLOTS.filter(([name]) => name === slot)));
    const prepared = await prepareGpuModelRendererInput(document, enabled);
    const binding = prepared.materials[0]!.textures[slot];
    expect(binding).toEqual({ textureId: `texture-${slot}`, samplerId: `sampler-${slot}`, intendedUsage: usage, colorSpace, texCoordSet: 1,
      transform: { offset: [0.25, -0.5], scale: [2, 0.75], rotationRadians: Math.PI / 3 } });
    expect(prepared.materials).toBe(document.materials);
    expect(prepared.primitives[0]!.attributes.TEXCOORD_1).toBe(prepared.accessors.texcoords);
    const pair = prepared.textures.find(({ texture }) => texture.id === binding!.textureId)!;
    expect(pair.texture).toBe(document.textures.find(({ id }) => id === binding!.textureId));
    expect(pair.texture.sampler).toMatchObject({ id: binding!.samplerId, wrapS: "mirrored-repeat", wrapT: "clamp-to-edge", minFilter: "nearest", mipFilter: "nearest" });
    expect(pair.resource).toBe(document.resources[1]);
    expect(pair.resource.contentHash).toBe(pair.texture.contentHash);
    expect(pair.resource.byteLength).toBe(pair.texture.byteLength);
    expect(pair.resource.mimeType).toBe(pair.texture.mimeType);
    expect(await pair.resource.payload.arrayBuffer()).toEqual(await document.resources[1]!.payload.arrayBuffer());
    expect(Object.isFrozen(binding!.transform)).toBe(true);
  });

  it("retains all six slots and factors through published runtime orchestration", async () => {
    const input = extendedMaterialDocument();
    const runtime = new ModelRuntime();
    runtime.adapters.register({ formatId: "material-fixture", extensions: ["fixture"],
      load: async () => ({ formatId: "material-fixture", sniff: () => true,
        load: async () => ({ canonicalModel: await verify(input) }) }) });
    const loaded = await runtime.loadModel<GpuModelDocument>({ kind: "uint8-array", bytes: new Uint8Array([1]), fileNameHint: "material.fixture" }, { formatId: "material-fixture" });
    const prepared = await prepareGpuModelRendererInput(loaded.canonicalModel, enabled);
    expect(prepared.document).toBe(loaded.canonicalModel);
    expect(prepared.materials[0]!.extensions).toEqual(input.materials[0].extensions);
    expect(prepared.materials[0]!.sourceMetadata).toEqual(input.materials[0].sourceMetadata);
    expect(prepared.materials[0]!.textures).toEqual(input.materials[0].textures);
    expect(prepared.textures).toHaveLength(7);
    expect(prepared.textures.every(({ resource }) => resource === prepared.document.resources[1])).toBe(true);
    // These are preparation checks, not assertions of Wavefront or glTF support.
    expect(prepared.skins).toHaveLength(1);
    expect(prepared.animations).toHaveLength(1);
    expect(prepared.primitives[0]!.materialSlot).toBe(0);
  });

  it("rejects unbranded copies until explicitly reverified in the receiving core", async () => {
    const document = await verify();
    const clone = structuredClone(document);
    expect(isGpuModelDocument(clone)).toBe(false);
    for (const input of [extendedMaterialDocument(), clone, { ...document }]) {
      await expect(prepareGpuModelRendererInput(input, enabled)).rejects.toMatchObject({ code: "unverified-document" });
    }
    const reverified = await verify(clone);
    expect(isGpuModelDocument(reverified)).toBe(true);
    const prepared = await prepareGpuModelRendererInput(reverified, enabled);
    expect(prepared.materials[0]!.textures).toEqual(document.materials[0]!.textures);
    expect(prepared.document).toBe(reverified);
  });

  it("keeps disabled, rollback, cancellation and allocation failures closed", async () => {
    const document = await verify();
    await expect(prepareGpuModelRendererInput(document)).rejects.toMatchObject({ code: "feature-disabled" });
    await expect(prepareGpuModelRendererInput(document, { conversionEnabled: false })).rejects.toMatchObject({ code: "feature-disabled" });
    await expect(prepareGpuModelRendererInput(document, { ...enabled, signal: AbortSignal.abort() })).rejects.toMatchObject({ code: "aborted" });
    await expect(prepareGpuModelRendererInput(document, { ...enabled, maxDecodedBytes: 1 })).rejects.toMatchObject({ code: "budget-exceeded" });
    expect((await prepareGpuModelRendererInput(document, enabled)).materials).toBe(document.materials);
  });

  for (const [slot] of EXTENDED_SLOTS) {
    const cases: readonly [string, (input: Record<string, any>) => void, string][] = [
      ["missing texture", (input) => { input.materials[0].textures[slot].textureId = "missing"; }, "missing-reference"],
      ["wrong slot usage", (input) => { input.materials[0].textures[slot].intendedUsage = "normal"; }, "invalid-reference"],
      ["undeclared usage", (input) => { input.textures.find((t: any) => t.id === `texture-${slot}`).intendedUsage = ["normal"]; }, "invalid-reference"],
      ["color mismatch", (input) => { input.materials[0].textures[slot].colorSpace = "data"; }, "invalid-reference"],
      ["sampler mismatch", (input) => { input.materials[0].textures[slot].samplerId = "missing"; }, "invalid-reference"],
      ["missing UV set", (input) => { input.materials[0].textures[slot].texCoordSet = 2; }, "invalid-reference"],
      ["nonfinite transform", (input) => { input.materials[0].textures[slot].transform.rotationRadians = NaN; }, "invalid-value"],
      ["image hash mismatch", (input) => { input.textures.find((t: any) => t.id === `texture-${slot}`).contentHash = "0".repeat(64); }, "invalid-reference"],
    ];
    it.each(cases)(`rejects ${slot}: %s in the owning core`, async (_name, mutate, code) => {
      const input = extendedMaterialDocument();
      mutate(input);
      await expect(verify(input)).rejects.toMatchObject({ code });
    });
  }
});
