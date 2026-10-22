import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createAndVerifyGpuModelDocument, encodeGpuModelDocumentCanonical } from "@plasius/gpu-model-core";
import { prepareGpuModelRendererInput } from "../src/index.js";
import { FixtureVerificationPort } from "./fixtures/model-document.js";
import { nodeMorphAnimationDocument } from "./fixtures/node-morph-animation.js";

const enabled = { conversionEnabled: true };
const empty = (id: string, durationSeconds: number) => ({
  id, name: `Take ${id}`, durationSeconds, samplers: [], channels: [],
  sourceMetadata: { localStartSeconds: -2, localEndSeconds: durationSeconds - 2,
    referenceStartSeconds: 3, referenceEndSeconds: durationSeconds + 3,
    framesPerSecond: 24, layers: [{ name: "Base", weight: 1 }] },
});
function fixture(duration = 2, mixed = false) {
  const input = nodeMorphAnimationDocument("cubic-spline");
  input.animations = [empty("empty", duration), ...(mixed ? input.animations : []), empty("zero", 0)];
  return input;
}
const model = (duration = 2, mixed = false) => createAndVerifyGpuModelDocument(fixture(duration, mixed), new FixtureVerificationPort());

describe("core0.7 empty-clip alignment", () => {
  it.each([0, 2, 2.5])("keeps named empty %s-second takes without new motion, accessors or resources", async duration => {
    const input = fixture(duration), document = await model(duration);
    const prepared = await prepareGpuModelRendererInput(document, enabled);
    expect(prepared.animations.map(a => [a.id, a.durationSeconds, a.channels.length, a.samplers.length])).toEqual([["empty", duration, 0, 0], ["zero", 0, 0, 0]]);
    expect(prepared.document).toBe(document);
    expect(prepared.document.animations).toEqual(input.animations);
    expect(document.resources).toHaveLength(input.resources.length);
    expect(Object.keys(prepared.accessors)).toEqual(input.accessors.map((a: {id: string}) => a.id));
    expect(prepared.nodes).toBe(document.nodes);
    expect(prepared.blendShapes).toBe(document.blendShapes);
    for (const a of prepared.animations) {
      expect(Object.isFrozen(a)).toBe(true);
      expect(Object.isFrozen(a.samplers)).toBe(true);
      expect(a.channels).toBe(document.animations.find(c => c.id === a.id)!.channels);
    }
    expect(document.animations[0]!.name).toBe("Take empty");
    expect(document.animations[0]!.sourceMetadata).toMatchObject({ localStartSeconds: -2, referenceStartSeconds: 3, framesPerSecond: 24 });
    expect(Object.isFrozen(document.animations[0]!.sourceMetadata.layers)).toBe(true);
  });
  it("preserves mixed order, populated bytes, skin/morph/materials and repeat isolation", async () => {
    const document = await model(2, true), before = encodeGpuModelDocumentCanonical(document);
    const a = await prepareGpuModelRendererInput(document, enabled);
    expect(a.animations.map(c => c.id)).toEqual(document.animations.map(c => c.id));
    for (const clip of a.animations)
      for (const sampler of clip.samplers) {
        const source = document.animations.find(c => c.id === clip.id)!.samplers.find(s => s.id === sampler.id)!;
        expect([...sampler.input]).toEqual(source.inputTimesSeconds);
        expect([...sampler.output]).toEqual(source.outputValues);
      }
    expect(a.skins[0]!.jointIds).toBe(document.skins[0]!.jointIds);
    expect(a.materials).toBe(document.materials);
    a.animations[1]!.samplers[0]!.output.fill(99);
    const b = await prepareGpuModelRendererInput(document, enabled);
    expect([...b.animations[1]!.samplers[0]!.output]).toEqual(document.animations[1]!.samplers[0]!.outputValues);
    expect(encodeGpuModelDocumentCanonical(document)).toEqual(before);
  });
  it("retains disable, rollback, abort and exact decoded budget gates", async () => {
    const document = await model();
    for (const granted of [false, true, false, true]) {
      const result = prepareGpuModelRendererInput(document, {conversionEnabled: granted});
      if(granted) expect((await result).animations).toHaveLength(2);
      else await expect(result).rejects.toMatchObject({code:"feature-disabled"});
    }
    await expect(prepareGpuModelRendererInput(document, {...enabled,signal:AbortSignal.abort()})).rejects.toMatchObject({code:"aborted"});
    const components = {scalar:1,vec2:2,vec3:3,vec4:4,mat2:4,mat3:9,mat4:16};
    const size = document.accessors.reduce((n,a)=>n+a.count*components[a.elementType]*4,0)
      +document.resources.filter(r=>r.kind==="buffer").reduce((n,r)=>n+r.byteLength,0)
      +document.skins.reduce((n,s)=>n+s.inverseBindMatrices.length*64+s.weightSets.reduce((n,w)=>n+w.joints.length*w.influencesPerVertex*8,0),0);
    await expect(prepareGpuModelRendererInput(document,{...enabled,maxDecodedBytes:size-1})).rejects.toMatchObject({code:"budget-exceeded"});
    expect((await prepareGpuModelRendererInput(document,{...enabled,maxDecodedBytes:size})).animations).toHaveLength(2);
  });
  it("rejects clones and foreign module instances, requiring receiving-core reverification", async () => {
    const document = await model(), clone = structuredClone(document);
    await expect(prepareGpuModelRendererInput(clone,enabled)).rejects.toMatchObject({code:"unverified-document"});
    const other = await import(pathToFileURL(createRequire(import.meta.url).resolve("@plasius/gpu-model-core")).href);
    const foreign = await other.createAndVerifyGpuModelDocument(fixture(),new FixtureVerificationPort());
    expect(other.isGpuModelDocument(foreign)).toBe(true);
    await expect(prepareGpuModelRendererInput(foreign,enabled)).rejects.toMatchObject({code:"unverified-document"});
    const receiving = await createAndVerifyGpuModelDocument(structuredClone(foreign),new FixtureVerificationPort());
    expect((await prepareGpuModelRendererInput(receiving,enabled)).document.animations[0]!.name).toBe("Take empty");
  });
  it.each([
    (input: Record<string, any>)=>input.animations[0].samplers.push(input.animations[1].samplers[0]),
    (input: Record<string, any>)=>input.animations[0].channels.push(input.animations[1].channels[0]),
    (input: Record<string, any>)=>input.animations[0].durationSeconds=-1,
    (input: Record<string, any>)=>input.animations[0].sourceMetadata.framesPerSecond=Infinity,
  ])("does not bypass owning-core invalid/asymmetric animation checks",async mutate=>{
    const input=fixture(2,true);mutate(input);
    await expect(createAndVerifyGpuModelDocument(input,new FixtureVerificationPort())).rejects.toBeDefined();
  });
});
