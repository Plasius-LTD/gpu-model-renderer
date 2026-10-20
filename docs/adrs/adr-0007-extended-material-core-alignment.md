# ADR 0007: Extended Material Core Alignment

- Status: Accepted
- Date: 2026-10-20
- Project Task: gpu-model-renderer#28; parent Feature site#1150
- Blocked consumer: gpu-model-gltf#14; related bridge Feature site#1153
- Prerequisite: released core#41 / @plasius/gpu-model-core 0.5.0

## Problem

The bridge's exact core0.4.6 dependency rejects six texture slots required by
the glTF/renderer contract. Core0.5.0 adds those validated slots. Its privately
verified document identity is module-local, so a bridge importing core0.4.6
cannot accept the new producer's output, even when the object shape is valid.
Different copies or ESM/CJS instances of the same version also have distinct
brands. The old canonical encoder and existing geometry contract are unchanged.

## Decision

Adopt the registry release of core0.5.0 as an exact runtime dependency. Producers
and the bridge must use the same core instance and module format, or reverify
transferred/structured-cloned data in the receiving core using its trusted
verification port. Preserve preparation's private brand check and source API.
Do not introduce a copied validator or accept unbranded structural objects.

Retain all six bindings (thickness, specular, specularColor, iridescence,
iridescenceThickness, anisotropy), their sampler/UV/transform/colour-space
contracts, and verified image payloads through the existing generic bridge.
Canonical references remain in validated slots, never extension metadata.
Factors remain bounded metadata owned by format adapters. No format parser,
image decoder, renderer or network loader becomes a runtime dependency.

Runtime core0.4.6 ->0.5.0 and test-only renderer0.2.51 ->0.2.53 are the only
targeted changes. The latter consumes renderer#252's released public core type
alignment and six channel mappings. Keeping the old renderer makes typed
integration fail TS2322; suppressing that error would hide an incompatible
consumer contract. The lockfile now deduplicates the renderer and bridge to
core0.5.0. Do not force resolution overrides or claim cross-instance trust.

## Alternatives

- Accept objects by shape: rejected; bypasses private resource verification.
- Keep the old core and store new texture references in metadata: rejected;
  avoids reference/hash/sampler/usage/UV checks and prevents faithful adoption.
- Add another canonical format or bridge-local validator: rejected; core owns
  the contract and the published additive release already supplies it.
- Refresh runtime and unrelated dependencies: rejected; only the owning released
  renderer type/mapping correction is necessary to verify this seam.

## Tests, impact and release

Regression tests are derived before adoption and fail on core0.4.6. They cover
each slot and the combined runtime -> bridge result, verified resource identity,
extension factors, UV/sampler/transform preservation, clone rejection and explicit
reverification, missing references, usage/colour/sampler/hash/UV mismatches,
nonfinite transforms, remote disable/rollback, cancellation and allocation limits.
Run existing geometry/rig/animation, numeric accessor and published renderer
integration controls, plus six-channel packed-atlas and explicit unsupported
sampling tests. The bridge retains authored UVs/transforms while renderer0.2.53
refuses nonzero UVs/nonidentity transforms. Require80%+ coverage, types/lint/build/audit,
public packing and installed ESM/CJS/browser checks. No preparation source file
changes are needed; retain coverage of all existing runtime source.

This updates a pre-1.0 runtime contract dependency; release a minor version via
the approved main/production cd.yml npm OIDC workflow after exact-SHA CI.
Verify registry/provenance and a clean registry-installed same-core producer and
bridge. Never publish locally. No site/ACA deployment is part of this package.

Rollout inherits the remotely evaluated gpu.model.conversion.enabled flag.
Disable consumer adoption and keep the previous loader and compatible package
set on failure. No new capability applies to this data-only boundary.

Bridge retention is not format or renderer conformance: glTF#14 still owns KHR
and import/export semantics; gpu-renderer#252 owns the released six-channel and
explicit unsupported-sampling contract; site#1160 owns the real format ingestion matrix.
Existing canonical unlit/alpha gaps remain renderer#238/#237. Do not adopt the
replacement for unsupported consumers merely because preparation succeeds.
