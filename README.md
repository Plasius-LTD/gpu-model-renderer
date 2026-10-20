# @plasius/gpu-model-renderer

Prepare verified canonical GPU models as renderer-ready geometry, material slots,
texture resources, joint palettes, skin influences, animation tracks and bounds.
The package follows site ADR 0094. It does not parse file formats, fetch URLs,
decode images, evaluate animation, or upload GPU resources.

## Usage

```ts
import { prepareGpuModelRendererInput } from "@plasius/gpu-model-renderer";

// document is factory output from the same @plasius/gpu-model-core instance.
// The source adapter/runtime owns loading, hashing and resource verification.
const prepared = await prepareGpuModelRendererInput(document, {
  conversionEnabled: remotelyEvaluatedConversionFlag,
  signal: abortController.signal,
  timeoutMs: 30_000,
  maxDecodedBytes: 64 * 1024 * 1024,
});

// Load the renderer only when needed. Image decoding is owned by the host.
const { createCanonicalWavefrontMeshInputs } = await import("@plasius/gpu-renderer");
const meshes = createCanonicalWavefrontMeshInputs({
  document: prepared.document,
  geometry: prepared.geometry,
  textures: decodedTextureSamplesByCanonicalTextureId,
});
```

The renderer is a consumer dependency, not a runtime dependency of this bridge.
The example maps **mesh-local geometry**. Before rendering a scene, the host must
apply `nodes`/`roots` transforms and instancing, and handle skins, morph targets
and animation. `bounds` retains the validated **world-space** canonical bounds.
The current Wavefront canonical adapter supports triangle primitives and a
subset of canonical materials. It rejects unsupported topology/workflows;
callers must preserve that failure or select another renderer. Passing geometry
alone does not bake a scene or implement animation.

`primitives` retains every attribute semantic and a zero-based `materialSlot`
(`null` for the default material). `accessors` contains tightly packed,
little-endian-decoded buffers, including animation and morph accessors.
Non-normalized unsigned integers use `Uint32Array`; other components use
`Float32Array`, including normalized integer attributes. Indices never pass
through floating-point conversion. Missing normals remain absent so the
renderer owns its existing normal fallback.

`skins` contains ordered joint IDs, packed inverse bind matrices, joint indices
and weights. `animations` contains channels, interpolation and decoded sampler
inputs/outputs. The full immutable `document` retains clip names, source
metadata, material extensions, texture binding transforms, colour spaces,
samplers, analytic source references, and diagnostics. Texture entries pair
canonical metadata with verified encoded image resources. Image decoders must
apply their own output limits; the bridge makes no image/network requests.

## Validation and failure handling

Only privately verified `GpuModelDocument` factory output is accepted. Plain
objects and structured clones fail closed; verify clones through
`createAndVerifyGpuModelDocument` in the receiving core instance. Keep core
versions/module instances consistent across adapters and bridge consumers.
The deprecated `packageBootstrap` identity export remains compatible.

Optional `diagnostics` uses the core `GpuModelDiagnosticInput` contract. Core
owns strict/tolerant/forensic evaluation and bounded repair/loss/evidence
ledgers. Strict is the default. Tolerant reports describe repairs already
performed by a source adapter; the bridge performs no repairs. Rejected reports
or canonical error diagnostics prevent preparation in every mode. Forensic raw
evidence is returned only in its explicit report and is never logged here.

`GpuModelRendererError.code` distinguishes `feature-disabled`,
`unverified-document`, `invalid-options`, `budget-exceeded`, `aborted`,
`diagnostics-rejected`, and `resource-read-failed`. Core may also throw its
bounded diagnostics error for malformed reports. Errors contain no payloads,
source URLs or identifiers. No partial output is returned.

The default/fixed ceiling is 64 MiB for encoded buffer copies plus decoded
accessors and skin buffers, preflighted before allocation. The timeout defaults
to 30 seconds and can only be tightened. Resource acquisition is sequential,
with no retries or shared mutable cache. Cancellation/deadline failures discard
partial output. CPU loops check the deadline; run large models in a host worker
so cancellation and main-thread responsiveness remain under host control.
Output containers are frozen; typed arrays are intentionally consumer-owned
and mutable for GPU upload. Accessor views within one result may share a buffer.
Mutations never affect the canonical document or a subsequent preparation.

## Rollout and rollback

- Parent Feature: [site #1153](https://github.com/Plasius-LTD/plasius-ltd-site/issues/1153).
- Feature flag: `gpu.model.conversion.enabled`.
- Source-of-truth evaluator: the host's remote feature-flag service; pass its
  decision as `conversionEnabled` on every preparation. Omission/false rejects.
- Capability: none for this data-only package layer.
- Rollback: disable the remote flag, cancel outstanding preparation via its
  signal, and retain the previous consumer loader and validated package pin.
  No local environment value is used as the normal control plane.

## Development and release

Requires the Node.js 24 version pinned in `.nvmrc` and npm.

```bash
npm ci
npm run typecheck
npm test
npm run test:coverage
npm run lint
npm run build
npm run pack:check
npm pack --dry-run
```

Tests cover canonical geometry/accessor fidelity, scene/rig/animation retention,
rollout and error paths, and the published runtime -> bridge -> published
renderer material-atlas/mesh-acceleration boundary. The runtime test adapter is
a deterministic canonical fixture, **not** a glTF parser. These tests do not
prove the full format conformance matrix in site Story #1160: the current
published GLB canonical importer supports a narrower texture-free static
profile. Actual format-adapter support must be verified separately.

Dependencies added for this API: runtime core `0.4.6` (canonical validation and
diagnostics); test-only runtime `0.2.4` and renderer `0.2.51` (published consumer
contract checks). No local package references or format SDKs are introduced.
See [ADR 0006](docs/adrs/adr-0006-canonical-renderer-preparation.md) and the
[design and NFR evidence](docs/design/canonical-renderer-preparation.md).

Apache-2.0. See LICENSE, SECURITY.md, and legal/.

<!-- BEGIN PLASIUS RELEASE INTEGRITY -->
## Release integrity

CI keeps the administrative contributor registry outside Git and npm package
artifacts using exact, case-normalised path checks. CI runs on explicit
GitHub-hosted runners. Publication uses the GitHub-hosted `production` job with
Node 24 and a pinned npm 11.6.2 client. It is token-free and proceeds only while
the prepared SHA is the exact `main` head after successful push-triggered CI.
The completed `0.1.0` bootstrap path has been removed; subsequent releases must
use npm trusted publishing.
<!-- END PLASIUS RELEASE INTEGRITY -->
