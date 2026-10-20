# Canonical renderer preparation design and NFR evidence

Work definition: gpu-model-renderer#1 under site Feature #1153; architecture:
site ADR 0094 and package ADR 0006. No new public package is created.

## Data flow

Source adapter/runtime -> privately verified core document -> bounded preparation
-> generic scene-aware consumer, or published renderer canonical geometry mapper
with externally decoded texture samples. The bridge never imports a file parser,
image decoder, network loader or renderer at runtime.

Acceptance tests were written first and failed because the API did not exist.
Unit fixtures cover typed/interleaved/normalized geometry, material slots,
verified image identity, scene transforms, rigs, weights, morph buffers,
animations, budgets, cancellation/deadlines and diagnostics modes. Integration
fixtures exercise published runtime loading, two-material texture-atlas inputs,
mesh acceleration and renderer normal fallback. A canonical fixture adapter
isolates this seam; it does not assert that a format parser passed the site
conformance matrix. The current GLB canonical importer is texture-free; full
format support remains upstream work for Story #1160.

## NFR disposition

| Area | Disposition and evidence |
| --- | --- |
| Security | Checked: only core-branded verified inputs; intrinsic immutable Blob reads; preflight peak allocation; no source SDK/network calls; malformed report rejection; unsigned index fidelity tests. |
| Privacy | Checked: no telemetry/logging, no copied URLs in errors; forensic evidence is explicit and bounded by core. Synthetic rights-clear fixtures only. |
| Accessibility | N/A: no UI, navigation, input controls or rendered content added. Host UI must still meet WCAG 2.2 AA. |
| Performance | Checked: one read at a time, typed contiguous buffers, indexed reference lookup, no retries/cache growth, 64 MiB fixed allocation ceiling. Large work belongs in host workers; no general frame-time SLO is claimed. |
| Reliability | Checked: default/tightenable 30 s deadline, abort signal checks, no partial output, immutable canonical data and repeat-call mutation isolation. |
| Scalability | Checked: stateless per-call data with bounded work; caller owns worker/concurrency limits across calls. |
| Maintainability/testability | Checked: core owns schema/diagnostics, renderer owns mapping; package tests include tests directory in TypeScript checks and all changed source files in LCOV. |
| Observability | Checked: stable bounded error codes and retained structured diagnostics; host owns correlated telemetry without raw source payloads. |
| Reproducibility/dependencies | Checked through frozen npm ci, lockfile, full test/coverage/typecheck/lint/build, public package and artifact checks, pack dry-run and npm audit before delivery. Exact versions documented below. |
| Browser/device/SEO | N/A for visual/SEO behavior. Runtime source uses standard typed arrays, Blob, performance and AbortSignal with no Node-specific imports. Node integration does not claim real-device browser rendering coverage. |
| Compatibility | Checked: additive exports; identity/bootstrap remains compatible. Generic scene output retains unsupported rendering data instead of silently dropping it. |
| Deployment safety | Approved PR/main CI and production cd.yml OIDC publication required; final run URLs and registry integrity evidence belong in the tracking issue. Azure secretref verification is N/A to an npm-only package release. |

## Dependency decision

| Package | Old -> new | Reason and compatibility |
| --- | --- | --- |
| @plasius/gpu-model-core | absent -> 0.4.6 | Runtime canonical validation/diagnostics owner; require a shared instance with source adapters. |
| @plasius/gpu-model-runtime | absent -> 0.2.4 | Test-only published load orchestration seam. |
| @plasius/gpu-renderer | absent -> 0.2.51 | Test-only current canonical geometry/material/atlas/acceleration consumer. |

No unrelated dependencies are refreshed. No local/unpublished references are
used. The lockfile records transitive resolution. Full verification commands and
exit codes, Node/npm versions, commit, timestamps and publication evidence are
recorded in the issue upon delivery.

## Extended material adoption (gpu-model-renderer#28)

[ADR 0007](../adrs/adr-0007-extended-material-core-alignment.md) adopts published
core0.5.0 in place of0.4.6 and test-only renderer0.2.53 in place of0.2.51.
The renderer update supplies released public core type alignment (fixing the
observed TS2322 integration failure) and six texture channel mappings. Frozen
resolution deduplicates to core0.5.0; other direct dependencies are unchanged.
The bridge and producer must resolve the same0.5.0 instance/module format. Clones
need explicit receiving-core reverification; retaining private verification is
a security invariant. No source validation/brand workaround is introduced.

The six additional canonical slots are retained by the existing generic bridge,
with bounded factor metadata and full UV, transform, sampler, colour-space and
verified image identity. Regression fixtures cover each slot and the combined
published runtime -> bridge result, as well as invalid reference/usage/colour/
sampler/hash/UV/transform data, clone rejection and explicit reverification,
remote disable/rollback, cancellation and allocation failure. Existing numeric,
geometry/rig/animation and published renderer controls remain required. New tests
exercise the complete runtime -> bridge -> renderer six-channel/packed-atlas
path and explicit refusal of authored unsupported UV/transform interpretations.
Actual glTF admission remains glTF#14. Renderer#252 supplies the released UV0/
identity-only contract; no physical rendering claim follows from metadata
retention or CPU atlas checks. Existing canonical alpha/unlit gaps remain #237/#238.

NFR checks for this targeted adoption use the table above: core validates new
references before preparation (security); no diagnostics contain resources or
provider data (privacy/observability); existing byte/deadline/cancellation gates
and immutable shared image identity remain tested (reliability/performance);
frozen installation, audits, source coverage, packed and registry-installed
ESM/CJS/browser probes verify reproducibility and portability. Record actual
commands, times and release results in #28. No UI, SEO, device rendering or ACA
configuration changes apply. Remote flag disable and the previous compatible
package/loader set remain the rollback route. Publish only via approved
main/production cd.yml after exact-SHA CI and verify registry/provenance.
