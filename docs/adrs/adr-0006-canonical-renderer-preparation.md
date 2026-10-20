# ADR 0006: Canonical Renderer Preparation

- Status: Accepted
- Date: 2026-10-20
- Task: Plasius-LTD/gpu-model-renderer#1
- Parent Feature: Plasius-LTD/plasius-ltd-site#1153

## Problem

ADR 0094 reserves this package for the canonical-to-renderer seam. Bootstrap
metadata cannot supply decoded buffers or prove runtime renderer ingestion.
Core already owns validation and bounded diagnostics. The renderer already
owns material mapping, atlases and acceleration structures.

## Decision

Add `prepareGpuModelRendererInput` using published core contracts and privately
verified factory output. Decode canonical accessors into tightly packed typed
buffers and retain every attribute semantic. Provide local geometry, canonical
world bounds, explicit scene nodes, material slots, texture resource pairs,
packed skin influences/joint palettes and decoded animation sampler tracks.
Preserve the full canonical document for authored metadata and analytic data.

Do not parse formats, decode images, apply transforms, bake animation or copy
the renderer's existing canonical material mapper. A host-specific renderer
must consume scene/animation information explicitly. The existing Wavefront
adapter accepts the geometry subset and rejects unsupported representations.

Preflight peak buffer allocations with a non-raiseable 64 MiB ceiling. Use
sequential intrinsic Blob reads, a bounded deadline and caller cancellation.
No retry, shared cache, network I/O, or image decoder is introduced. Run large
preparation work in a host worker. Return mutable owned upload buffers inside
frozen containers; never mutate canonical data.

Require the host's remote `gpu.model.conversion.enabled` evaluation on every
call. Omission/false fails closed. No capability applies at this package-only
boundary. Disable the flag, abort in-flight work and keep the old loader/version
pin for rollback. Environment overrides are not evaluated here.

Core diagnostics evaluation owns strict/tolerant/forensic policy. The bridge
neither requests nor invents repairs. Unsupported or error-bearing canonical
input is rejected; explicitly supplied forensic ledgers remain bounded and
retained without logging.

## Alternatives

- Reimplement canonical schema/diagnostic validation: rejected; core owns it.
- Import gpu-renderer at runtime and duplicate its mapping: rejected; keep
  renderer independence and reuse its published mapper in consumer tests.
- Bake static vertices and discard rigs/animation: rejected; silent fidelity
  loss and wrong instancing would violate ADR 0094.
- Parse GLB in this package: rejected; source adapters own that boundary.

## Consequences, tests and release

The API is additive; bootstrap identity exports remain compatible. Core becomes
a runtime dependency; published runtime/renderer are test dependencies only.
Keep the core module instance shared with producers, reverifying clones across
worker/module boundaries. Test accessor numeric fidelity, scene/skin/animation
retention, remote gate states, bounded failures and published consumer ingestion.
Require coverage/changed-source LCOV, typecheck, lint, build, pack and audit.
Release a minor version through the existing production cd.yml OIDC workflow;
never publish locally. Consumer site conformance remains separately tracked.
