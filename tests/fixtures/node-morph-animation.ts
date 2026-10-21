import { validDocument, sha256, IDENTITY_MATRIX } from "./model-document.js";

/** Two instances share geometry but retain distinct ordered weight bindings. */
export function nodeMorphAnimationDocument(interpolation = "linear"): Record<string, any> {
  const input = validDocument() as Record<string, any>;
  const root = input.nodes[0];
  root.restLocalTransform = { translation: [0, 0, 0], rotation: [0, 0, 0, -1], scale: [1, 1, 1] };
  root.morphWeights = [{ blendShapeId: "blend-second", weight: -0.25 }, { blendShapeId: "blend-main", weight: 1.5 }];
  input.roots.push("node-second");
  input.nodes.push({ id: "node-second", children: [], meshId: "mesh-main", skinId: "skin-main", localMatrix: IDENTITY_MATRIX,
    restLocalTransform: { translation: [0, 0, 0], rotation: [0, 1, 0, 0], scale: [-1, 1, -1] },
    morphWeights: [{ blendShapeId: "blend-main", weight: 0.5 }, { blendShapeId: "blend-second", weight: -1 }] });
  input.blendShapes[0].defaultWeight = -0.5;
  input.blendShapes.push({ ...input.blendShapes[0], id: "blend-second", defaultWeight: 1.25 });
  const outputs = interpolation === "cubic-spline"
    ? [[-2, 3, -0.25, 1.5, 4, -5, -6, 7, 0.5, -1, 8, -9], [1, -2, 0.5, -1, 3, -4, 5, -6, 1.5, -0.25, 7, -8]]
    : [[-0.25, 1.5, 0.5, -1], [0.5, -1, 1.5, -0.25]];
  const bytes = new Uint8Array(outputs.flat().length * 4);
  const view = new DataView(bytes.buffer);
  outputs.flat().forEach((value, index) => view.setFloat32(index * 4, value, true));
  input.resources.push({ id: "node-animation", kind: "buffer", mimeType: "application/octet-stream", byteLength: bytes.length,
    contentHash: sha256(bytes), payload: new Blob([bytes.buffer]) });
  const samplers = outputs.map((values, index) => {
    input.accessors.push({ id: `node-output-${index}`, resourceId: "node-animation", byteOffset: index * values.length * 4,
      count: values.length, componentType: "f32", elementType: "scalar" });
    return { id: `node-sampler-${index}`, inputAccessorId: "animation-time", outputAccessorId: `node-output-${index}`,
      inputTimesSeconds: [0, 1], outputValues: values, interpolation, sourceMetadata: {} };
  });
  input.animations.push({ id: "node-morph-clip", durationSeconds: 1, samplers,
    channels: ["node-root", "node-second"].map((targetId, index) => ({ id: `node-channel-${index}`, samplerId: `node-sampler-${index}`,
      targetType: "node-weights", targetId, sourceMetadata: {} })), sourceMetadata: {} });
  return input;
}
