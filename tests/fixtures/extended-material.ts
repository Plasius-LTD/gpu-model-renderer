import { validDocument } from "./model-document.js";

/** The six owning-core slots needed by the glTF material preservation task. */
export const EXTENDED_SLOTS = [
  ["thickness", "thickness", "linear"],
  ["specular", "specular", "linear"],
  ["specularColor", "specular-color", "srgb"],
  ["iridescence", "iridescence", "linear"],
  ["iridescenceThickness", "iridescence-thickness", "linear"],
  ["anisotropy", "anisotropy", "linear"],
] as const;

/** Authored factors remain bounded metadata; texture references use core slots. */
export function extendedMaterialDocument(selected = EXTENDED_SLOTS.slice()): Record<string, any> {
  const input = validDocument() as Record<string, any>;
  input.meshes[0].primitives[0].attributes.push({ semantic: "TEXCOORD_1", accessorId: "texcoords" });
  const material = input.materials[0];
  material.extensions = {
    KHR_materials_volume: { thicknessFactor: 0.35, attenuationColor: [0.7, 0.8, 0.9], attenuationDistance: 2 },
    KHR_materials_specular: { specularFactor: 0.6, specularColorFactor: [0.9, 0.7, 0.5] },
    KHR_materials_iridescence: { iridescenceFactor: 0.4, iridescenceIor: 1.3, iridescenceThicknessMinimum: 100, iridescenceThicknessMaximum: 400 },
    KHR_materials_anisotropy: { anisotropyStrength: 0.8, anisotropyRotation: 0.2 },
  };
  for (const [slot, usage, colorSpace] of selected) {
    const textureId = `texture-${slot}`;
    const samplerId = `sampler-${slot}`;
    input.textures.push({
      ...input.textures[0], id: textureId, colorSpace, intendedUsage: [usage],
      sampler: { id: samplerId, wrapS: "mirrored-repeat", wrapT: "clamp-to-edge", minFilter: "nearest", magFilter: "linear", mipFilter: "nearest" },
    });
    material.textures[slot] = { textureId, samplerId, intendedUsage: usage, colorSpace, texCoordSet: 1,
      transform: { offset: [0.25, -0.5], scale: [2, 0.75], rotationRadians: Math.PI / 3 } };
  }
  return input;
}
