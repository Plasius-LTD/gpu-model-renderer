import { describe, it, expect } from "vitest";
import { createAndVerifyGpuModelDocument } from "@plasius/gpu-model-core";
import { prepareGpuModelRendererInput } from "../src/index.js";
import { validDocument, FixtureVerificationPort } from "./fixtures/model-document.js";

const enabled = { conversionEnabled: true };
async function model(input = validDocument()) {
  return createAndVerifyGpuModelDocument(input, new FixtureVerificationPort());
}

describe("canonical renderer preparation", () => {
  it("fails closed when rollout is disabled and rejects unverified input", async () => {
    const document = await model();
    await expect(prepareGpuModelRendererInput(document)).rejects.toMatchObject({ code: "feature-disabled" });
    await expect(prepareGpuModelRendererInput(document, { conversionEnabled: false })).rejects.toMatchObject({ code: "feature-disabled" });
    await expect(prepareGpuModelRendererInput(validDocument(), enabled)).rejects.toMatchObject({ code: "unverified-document" });
  });

  it("prepares geometry, bounds, slots and verified texture resources without losing authorship", async () => {
    const document = await model();
    const result = await prepareGpuModelRendererInput(document, enabled);
    expect(result.document).toBe(document);
    expect(result.bounds).toBe(document.bounds);
    expect(Array.from(result.geometry[0]!.positions)).toEqual([-1, 0, -1, 1, 0, -1, -1, 2, 1, 1, 2, 1]);
    expect(Array.from(result.geometry[0]!.indices!)).toEqual([0, 1, 2, 2, 1, 3]);
    expect(result.primitives[0]).toMatchObject({ meshId: "mesh-main", primitiveId: "primitive-main", materialSlot: 0, topology: "triangles" });
    expect(result.materials).toBe(document.materials);
    expect(result.textures[0]!.resource).toBe(document.resources[1]);
    expect(result.textures[0]!.texture.relativePath).toBe("textures/fixture.png");
    result.geometry[0]!.positions[0] = 99;
    const repeated = await prepareGpuModelRendererInput(document, enabled);
    expect(repeated.geometry[0]!.positions[0]).toBe(-1);
    expect(Object.isFrozen(result.geometry)).toBe(true);
  });

  it("retains scene transforms, rigs, morphs and executable animation accessor buffers", async () => {
    const document = await model();
    const result = await prepareGpuModelRendererInput(document, enabled);
    expect(result.nodes).toBe(document.nodes);
    expect(result.roots).toBe(document.roots);
    expect(result.skeletons).toBe(document.skeletons);
    expect(result.joints).toBe(document.joints);
    expect(result.blendShapes).toBe(document.blendShapes);
    expect(Array.from(result.skins[0]!.inverseBindMatrices)).toEqual(document.skins[0]!.inverseBindMatrices.flat());
    expect(Array.from(result.skins[0]!.weightSets[0]!.weights)).toEqual(document.skins[0]!.weightSets[0]!.weights.flat());
    expect(Array.from(result.skins[0]!.weightSets[0]!.joints)).toEqual(new Array(16).fill(0));
    expect(result.animations[0]!.channels).toBe(document.animations[0]!.channels);
    expect(Array.from(result.animations[0]!.samplers[0]!.input)).toEqual([0, 1]);
    expect(Array.from(result.animations[0]!.samplers[0]!.output)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(result.analyticGeometry).toBe(document.analyticGeometry);
  });

  it("enforces allocation limits and cancellation before preparing output", async () => {
    const document = await model();
    await expect(prepareGpuModelRendererInput(document, { ...enabled, maxDecodedBytes: 1 })).rejects.toMatchObject({ code: "budget-exceeded" });
    for (const maxDecodedBytes of [0, NaN, Infinity, 64 * 1024 * 1024 + 1]) {
      await expect(prepareGpuModelRendererInput(document, { ...enabled, maxDecodedBytes })).rejects.toMatchObject({ code: "invalid-options" });
    }
    await expect(prepareGpuModelRendererInput(document, { ...enabled, signal: AbortSignal.abort() })).rejects.toMatchObject({ code: "aborted" });
  });

  it("delegates strict/tolerant/forensic policy to core without accepting unsupported repairs", async () => {
    const document = await model();
    const warning = { kind: "warning" as const, code: "fixture-warning", path: "/meshes", message: "Fixture warning" };
    const strict = await prepareGpuModelRendererInput(document, { ...enabled, diagnostics: { standard: "gltf-glb", issues: [warning] } });
    expect(strict.diagnosticReport!.mode).toBe("strict");
    const violation = { kind: "violation" as const, ruleId: "bad-winding", originalValue: "clockwise", repairApplied: true,
      code: "winding-normalized", path: "/meshes", message: "Source adapter normalized winding" };
    await expect(prepareGpuModelRendererInput(document, { ...enabled, diagnostics: { standard: "gltf-glb", issues: [violation] } })).rejects.toMatchObject({ code: "diagnostics-rejected" });
    const tolerant = await prepareGpuModelRendererInput(document, { ...enabled, diagnostics: { standard: "gltf-glb", mode: "tolerant", issues: [violation] } });
    expect(tolerant.diagnosticReport!.repairs[0]!.ruleId).toBe("bad-winding");
    expect(tolerant.document).toBe(document);
    const forensic = await prepareGpuModelRendererInput(document, { ...enabled, diagnostics: { standard: "gltf-glb", mode: "forensic", issues: [], rawSource: { fixture: true } } });
    expect(forensic.diagnosticReport!.rawSource).toEqual({ fixture: true });
    for (const mode of ["strict", "tolerant", "forensic"] as const) {
      await expect(prepareGpuModelRendererInput(document, { ...enabled, diagnostics: { standard: "gltf-glb", mode, issues: [{ kind: "unsupported", code: "fixture-unsupported", path: "/animations", message: "Unsupported target" }], ...(mode === "forensic" ? { rawSource: {} } : {}) } })).rejects.toMatchObject({ code: "diagnostics-rejected" });
    }
  });
});
