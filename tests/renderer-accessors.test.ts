import { describe, it, expect, vi } from "vitest";
import { createAndVerifyGpuModelDocument } from "@plasius/gpu-model-core";
import { prepareGpuModelRendererInput } from "../src/index.js";
import { validDocument, FixtureVerificationPort, sha256 } from "./fixtures/model-document.js";

function addResource(input: Record<string, any>, bytes: Uint8Array) {
  input.resources.push({ id: "extra-buffer", kind: "buffer", contentHash: sha256(bytes), byteLength: bytes.byteLength,
    mimeType: "application/octet-stream", payload: new Blob([bytes.buffer as ArrayBuffer]) });
}
async function prepare(input: Record<string, any>) {
  return prepareGpuModelRendererInput(await createAndVerifyGpuModelDocument(input, new FixtureVerificationPort()), { conversionEnabled: true });
}

describe("renderer accessor fidelity and boundaries", () => {
  it.each([
    ["i8", new Int8Array([-128, -1, 0, 127]), [-1, -1 / 127, 0, 1]],
    ["u8", new Uint8Array([0, 1, 128, 255]), [0, 1 / 255, 128 / 255, 1]],
    ["i16", new Int16Array([-32768, -1, 0, 32767]), [-1, -1 / 32767, 0, 1]],
    ["u16", new Uint16Array([0, 1, 32768, 65535]), [0, 1 / 65535, 32768 / 65535, 1]],
    ["u32", new Uint32Array([0, 1, 2147483648, 4294967295]), [0, 1 / 4294967295, 2147483648 / 4294967295, 1]],
  ] as const)("decodes normalized %s custom attributes without discarding semantics", async (componentType, raw, expected) => {
    const input = validDocument() as Record<string, any>;
    addResource(input, new Uint8Array(raw.buffer));
    input.accessors.push({ id: "custom-data", resourceId: "extra-buffer", byteOffset: 0, count: 4, componentType, elementType: "scalar", normalized: true });
    input.meshes[0].primitives[0].attributes.push({ semantic: "_CUSTOM", accessorId: "custom-data" });
    const result = await prepare(input);
    expected.forEach((value, i) => expect(result.primitives[0]!.attributes._CUSTOM![i]).toBeCloseTo(value, 6));
  });

  it("preserves large unsigned integers exactly", async () => {
    const input = validDocument() as Record<string, any>;
    addResource(input, new Uint8Array(new Uint32Array([0, 1, 2147483648, 4294967295]).buffer));
    input.accessors.push({ id: "custom-data", resourceId: "extra-buffer", byteOffset: 0, count: 4, componentType: "u32", elementType: "scalar" });
    const result = await prepare(input);
    expect(result.accessors["custom-data"]).toEqual(new Uint32Array([0, 1, 2147483648, 4294967295]));
  });

  it("repacks interleaved mesh-local vertices while retaining world scene transforms", async () => {
    const input = validDocument() as Record<string, any>;
    const bytes = new Uint8Array(new Float32Array([-1, 0, -1, 99, 1, 0, -1, 99, -1, 2, 1, 99, 1, 2, 1, 99]).buffer);
    addResource(input, bytes);
    Object.assign(input.accessors[0], { resourceId: "extra-buffer", byteStride: 16 });
    input.nodes[0].localMatrix = [1,0,0,0, 0,1,0,0, 0,0,1,0, 10,3,-2,1];
    input.bounds = { min: [9,3,-3], max: [11,5,-1] };
    const result = await prepare(input);
    expect(Array.from(result.geometry[0]!.positions)).toEqual([-1,0,-1, 1,0,-1, -1,2,1, 1,2,1]);
    expect(result.nodes[0]!.localMatrix[12]).toBe(10);
    expect(result.bounds).toEqual(input.bounds);
  });

  it("keeps absent optional data absent and supports generic non-triangle consumers", async () => {
    const input = validDocument() as Record<string, any>;
    const primitive = input.meshes[0].primitives[0];
    primitive.topology = "points";
    delete primitive.indicesAccessorId;
    delete primitive.materialId;
    primitive.attributes = primitive.attributes.filter((a: any) => !["NORMAL", "TEXCOORD_0"].includes(a.semantic));
    input.materials = [];
    input.textures = [];
    const result = await prepare(input);
    expect(result.geometry[0]!.indices).toBeUndefined();
    expect(result.geometry[0]!.normals).toBeUndefined();
    expect(result.geometry[0]!.texcoords).toBeUndefined();
    expect(result.primitives[0]!.materialSlot).toBeNull();
    expect(result.primitives[0]!.topology).toBe("points");
  });

  it("uses immutable Blob bytes even if an instance method is replaced after verification", async () => {
    const document = await createAndVerifyGpuModelDocument(validDocument(), new FixtureVerificationPort());
    const tamper = vi.fn().mockResolvedValue(new ArrayBuffer(0));
    document.resources[0]!.payload.arrayBuffer = tamper;
    const result = await prepareGpuModelRendererInput(document, { conversionEnabled: true });
    expect(tamper).not.toHaveBeenCalled();
    expect(result.geometry[0]!.positions[0]).toBe(-1);
  });

  it("rejects document errors in every mode and rejects invalid deadlines", async () => {
    const input = validDocument() as Record<string, any>;
    input.diagnostics = [{ severity: "error", code: "not-ready", message: "Canonical conversion incomplete" }];
    const document = await createAndVerifyGpuModelDocument(input, new FixtureVerificationPort());
    await expect(prepareGpuModelRendererInput(document, { conversionEnabled: true })).rejects.toMatchObject({ code: "diagnostics-rejected" });
    for (const timeoutMs of [0, NaN, Infinity, 30001]) {
      await expect(prepareGpuModelRendererInput(document, { conversionEnabled: true, timeoutMs })).rejects.toMatchObject({ code: "invalid-options" });
    }
  });

  it("observes caller cancellation during acquisition and does not expose partial output", async () => {
    const document = await createAndVerifyGpuModelDocument(validDocument(), new FixtureVerificationPort());
    const controller = new AbortController();
    const pending = prepareGpuModelRendererInput(document, { conversionEnabled: true, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "aborted" });
  });

  it("enforces the total deadline even during CPU work", async () => {
    const document = await createAndVerifyGpuModelDocument(validDocument(), new FixtureVerificationPort());
    let elapsed = 0;
    const now = vi.spyOn(performance, "now").mockImplementation(() => elapsed++ * 10000);
    try {
      await expect(prepareGpuModelRendererInput(document, { conversionEnabled: true })).rejects.toMatchObject({ code: "aborted" });
    } finally { now.mockRestore(); }
  });
});
