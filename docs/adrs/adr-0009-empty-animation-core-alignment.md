# ADR0009: Align empty animation takes with canonical core

Date: 2026-10-22. Status: Accepted for renderer task34 / Feature site1151.
Blocked consumer: FBX27. Prerequisite: released core47/core0.7.0.
Inherited remote flag: `gpu.model.conversion.enabled`; package-only, no capability.

## Problem and decision

Core0.7.0 admits canonical empty takes needed by FBX27. Renderer0.4.0 pins
core0.6.0, so npm correctly installs separate private verification instances.
The actual FBX consumer's existing morph/skin projections reject the producer's
verified documents with `unverified-document`. Old core also rejects required
empty clips. This is the identity constraint documented in ADR0007/0008.

Adopt exact public core0.7.0 as the runtime dependency. Keep the generic
projection and its unconditional private brand/resource checks. An empty clip
has id/duration and empty sampler/channel arrays; names and original
span/rate/layer metadata remain on the same immutable document. No dummy
channel, buffer, deformation, bounds update or evaluation is invented. Mixed and
populated lists retain order and decoded values. No public prepared-object shape
or canonical schema identifier changes. The source edit documents these semantics.

Structural acceptance, local validators and forced overrides weaken the owning
verification boundary. Filtering empty takes erases authored identity. Producers
and bridge must share exact core version, instance and ESM/CJS format; transferred
objects need receiving-core verification. Matched older consumers remain available
for rollback but reject empty clips. No unrelated dependencies are updated.

## Qualification and NFRs

Requirements-derived tests fail against core0.6.0 before adoption. They cover
empty zero/nonzero-duration clips, negative original spans/rate/layer evidence,
mixed populated clips, exact bytes, legacy skin/morph/material/accessor data,
repeat mutation isolation, clone/foreign-instance rejection, reverification,
remote disable/re-enable, abort, exact decoded-byte bounds and invalid asymmetric
clips. Require full tests, >=80% LCOV including changed source, lint/types/build,
frozen install, artifact/package checks, full audit/signatures and packed/actual
registry ESM+CJS/strict declarations/browser consumers.

Security/privacy: core owns validation and immutable resource bytes; no new
logging, parsing, network authority, retries or data collection. Reliability and
performance retain byte/deadline/cancellation limits, sequential reads and
isolated caller arrays. Empty clips add only bounded clip rows. Maintainability
and testability use one owning contract and synthetic Apache-2.0 fixtures, with
no new runtime algorithm. Finite error codes remain safe observability.
UI/accessibility/SEO/server/ACA and physical GPU rendering are N/A to this data
bridge change; browser import/decoding is qualified without claiming GPU poses.

## Release and rollback

Minor release through signed-off PR, exact-head/main CI, then existing
main/cd.yml production npm OIDC flow. Pipeline owns version/changelog promotion.
Verify registry bytes/integrity/provenance, exact workflow/environment and clean
consumers before unblocking FBX27. No publication/token/runner/environment policy
changes. Rollback disables the inherited remote flag and pins a matched
producer/core/bridge set. This task does not implement FBX27, coordinator1 or
Feature1151.
