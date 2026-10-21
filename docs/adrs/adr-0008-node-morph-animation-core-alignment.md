# ADR 0008: Node Morph Animation Core Alignment

- Status: Accepted
- Date: 2026-10-21
- Project Task: gpu-model-renderer#31; parent Feature site#1150
- Blocked consumer: gpu-model-gltf#15; related bridge Feature site#1153
- Prerequisite: released core#44 / @plasius/gpu-model-core 0.6.0

## Problem

Core0.6.0 adds authored node rest TRS, ordered per-node morph bindings and
node-weight animation channels needed by the glTF animation deliverable. The
released bridge0.3.0 pins core0.5.0. A fresh registry-installed core0.6 producer
passes its private verification check but bridge0.3.0 rejects that exact document
with unverified-document: npm correctly installed separate core instances.
This repeats the module identity constraint documented in ADR0007.

## Decision

Adopt the exact registry release core0.6.0 as the bridge's runtime dependency.
Keep its private brand/resource checks and generic preparation algorithm.
Producer and bridge must share one core version, instance and module format.
Transferred/structured-cloned objects require receiving-core resource verification.
Plain shape acceptance, forced dependency overrides and bridge-local validators
are rejected because they bypass the owning verification boundary.

Retain optional node restLocalTransform, quaternion sign, signed scales and
complete ordered morphWeights through the immutable nodes reference. Retain
node-weights channels and decoded sampler buffers. K keys with N node bindings
use K*N scalar output for step/linear, K*3*N for cubic-spline; cubic ordering is
N incoming tangents, N values, N outgoing tangents per key. Node binding order
can differ between instances of a shared mesh. Preserve signed weights/tangents
without clamp or normalization. Legacy single-shape weights channels are unchanged.
No animation evaluator, new canonical grammar, parser, texture decoder, GPU
deformation or animated bounds computation is introduced. Bounds still describe
the validated base geometry; hosts own deformed/swept bounds.

The only dependency change is runtime core0.5.0 ->0.6.0. Renderer0.2.53 remains
test-only and retains its nested core0.5.0: its public canonical mapper accepts
only Pick<Document, meshes | materials> and does not inspect the private brand.
An actual-registry NodeNext consumer compiled with core0.6.0 before adoption;
the existing atlas/acceleration integration passes after adoption. Updating the
renderer or suppressing type errors is unnecessary. Avoid unrelated churn.

## Tests and NFR implications

New step/linear/cubic fixtures failed against core0.5.0 before adoption. They
cover two mesh instances, differing binding order/defaults, signed values and
tangents, quaternion sign/signed scale, legacy translation/rig/material retention,
exact output bytes, repeat-call mutation isolation, clone/foreign-CJS rejection
and receiving-core reverification. They check remote disable/re-enable, abort
and exact decoded-byte budget boundaries. Keep all existing material/accessor/
deadline/diagnostic/skin tests, including the published runtime/renderer seam.
Require80%+ coverage with changed preparation source represented in LCOV,
strict types/lint/build, frozen install, real dependency-tree check, audit and
packed ESM/CJS/NodeNext consumers. Verify registry identity and provenance.

Security/privacy rely on core-owned validation and immutable verified payloads;
preparation has no logging, network or retries. Existing byte/deadline/abort
controls bound work. Stateless consumer-owned arrays preserve isolation; stable
error codes provide safe observability. No UI/SEO/backend change or physical GPU
rendering claim applies. Detailed NFR disposition remains in the design document.

## Release and rollback

Release a minor version through PR/exact-SHA CI, then the existing main/
production cd.yml npm-OIDC flow. Verify public registry version, tarball integrity,
provenance and installed consumers before unblocking glTF#15. Do not publish
locally or change release controls. ACA secretrefs are N/A to this package release.

Inherit gpu.model.conversion.enabled from the host's remote evaluator; the bridge
requires conversionEnabled=true and reads no local env override. No new capability
applies. Rollback disables remote adoption, aborts preparation and retains the
previous compatible producer/core/bridge plus loader set. Never pass new grammar
to old core. This prerequisite does not complete glTF#15 or parent Feature1150.
