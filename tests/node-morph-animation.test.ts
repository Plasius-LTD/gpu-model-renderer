import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createAndVerifyGpuModelDocument, hashGpuModelDocumentCanonical } from "@plasius/gpu-model-core";
import { prepareGpuModelRendererInput } from "../src/index.js";
import { FixtureVerificationPort } from "./fixtures/model-document.js";
import { nodeMorphAnimationDocument } from "./fixtures/node-morph-animation.js";

const enabled = { conversionEnabled: true };
const model = (interpolation = "linear") => createAndVerifyGpuModelDocument(nodeMorphAnimationDocument(interpolation), new FixtureVerificationPort());

describe("node-scoped morph animation preparation", () => {
  it.each(["step", "linear", "cubic-spline"])("retains independent ordered bindings and exact %s sampler layout without evaluating animation", async interpolation => {
    const document = await model(interpolation);
    const before = await hashGpuModelDocumentCanonical(document);
    const prepared = await prepareGpuModelRendererInput(document, enabled);
    expect(prepared.document).toBe(document);
    expect(prepared.nodes).toBe(document.nodes);
    expect(prepared.nodes[0]!.restLocalTransform!.rotation).toEqual([0, 0, 0, -1]);
    expect(prepared.nodes[2]!.restLocalTransform!.scale).toEqual([-1, 1, -1]);
    expect(prepared.nodes[0]!.morphWeights).toEqual([{ blendShapeId: "blend-second", weight: -0.25 }, { blendShapeId: "blend-main", weight: 1.5 }]);
    expect(prepared.nodes[2]!.morphWeights).toEqual([{ blendShapeId: "blend-main", weight: 0.5 }, { blendShapeId: "blend-second", weight: -1 }]);
    expect(prepared.blendShapes.map(shape => shape.defaultWeight)).toEqual([-0.5, 1.25]);
    expect(Object.isFrozen(prepared.nodes[0]!.morphWeights)).toBe(true);
    const clip = prepared.animations[1]!;
    expect(clip.channels).toBe(document.animations[1]!.channels);
    expect(clip.channels.map(channel => [channel.targetType, channel.targetId])).toEqual([["node-weights", "node-root"], ["node-weights", "node-second"]]);
    for (const [index, sampler] of clip.samplers.entries()) {
      expect(sampler.interpolation).toBe(interpolation);
      expect(Array.from(sampler.input)).toEqual([0, 1]);
      expect(Array.from(sampler.output)).toEqual(document.animations[1]!.samplers[index]!.outputValues);
      expect(sampler.output).toBe(prepared.accessors[`node-output-${index}`]);
      expect(sampler.output).toHaveLength(interpolation === "cubic-spline" ? 12 : 4);
    }
    // Existing rig/translation and material contracts coexist with new channels.
    expect(prepared.materials).toBe(document.materials);
    expect(prepared.skins[0]!.jointIds).toBe(document.skins[0]!.jointIds);
    expect(prepared.animations[0]!.channels[0]!.targetType).toBe("node-translation");
    expect(Array.from(prepared.animations[0]!.samplers[0]!.output)).toEqual([0, 0, 0, 0, 0, 0]);
    clip.samplers[0]!.output.fill(99);
    prepared.accessors["morph-positions"]!.fill(99);
    const repeated = await prepareGpuModelRendererInput(document, enabled);
    expect(Array.from(repeated.animations[1]!.samplers[0]!.output)).toEqual(document.animations[1]!.samplers[0]!.outputValues);
    expect(repeated.animations[1]!.samplers[0]!.output).not.toBe(clip.samplers[0]!.output);
    expect(Array.from(repeated.accessors["morph-positions"]!)).toEqual(new Array(12).fill(0));
    expect(await hashGpuModelDocumentCanonical(document)).toBe(before);
  });

  it("keeps clone rejection, explicit receiving-core reverification, flag rollback, abort and byte limits", async () => {
    const document = await model("cubic-spline");
    const clone: unknown = structuredClone(document);
    await expect(prepareGpuModelRendererInput(clone, enabled)).rejects.toMatchObject({ code: "unverified-document" });
    const verified = await createAndVerifyGpuModelDocument(clone, new FixtureVerificationPort());
    expect((await prepareGpuModelRendererInput(verified, enabled)).document).toBe(verified);
    await expect(prepareGpuModelRendererInput(document, { conversionEnabled: false })).rejects.toMatchObject({ code: "feature-disabled" });
    await expect(prepareGpuModelRendererInput(document, { ...enabled, signal: AbortSignal.abort() })).rejects.toMatchObject({ code: "aborted" });
    const size = document.accessors.reduce((total, accessor) => total + accessor.count * ({ scalar: 1, vec2: 2, vec3: 3, vec4: 4, mat2: 4, mat3: 9, mat4: 16 }[accessor.elementType]) * 4, 0)
      + document.resources.filter(resource => resource.kind === "buffer").reduce((total, resource) => total + resource.byteLength, 0)
      + document.skins.reduce((total, skin) => total + skin.inverseBindMatrices.length * 64
        + skin.weightSets.reduce((sum, weights) => sum + weights.joints.length * weights.influencesPerVertex * 8, 0), 0);
    await expect(prepareGpuModelRendererInput(document, { ...enabled, maxDecodedBytes: size - 1 })).rejects.toMatchObject({ code: "budget-exceeded" });
    expect((await prepareGpuModelRendererInput(document, { ...enabled, maxDecodedBytes: size })).nodes).toBe(document.nodes);
    expect((await prepareGpuModelRendererInput(document, enabled)).animations).toHaveLength(2);
  });

  it("rejects a separately verified CJS factory instance and requires receiving-core reverification", async () => {
    const otherCore = await import(pathToFileURL(createRequire(import.meta.url).resolve("@plasius/gpu-model-core")).href);
    const foreign: unknown = await otherCore.createAndVerifyGpuModelDocument(nodeMorphAnimationDocument(), new FixtureVerificationPort());
    expect(otherCore.isGpuModelDocument(foreign)).toBe(true);
    await expect(prepareGpuModelRendererInput(foreign, enabled)).rejects.toMatchObject({ code: "unverified-document" });
    const receiving = await createAndVerifyGpuModelDocument(structuredClone(foreign), new FixtureVerificationPort());
    expect((await prepareGpuModelRendererInput(receiving, enabled)).nodes[0]!.morphWeights).toHaveLength(2);
  });
});
