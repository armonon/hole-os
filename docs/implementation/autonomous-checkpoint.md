# Hole OS autonomous checkpoint

28 October 2026. Continue the accepted master brief on `codex/hole-os-overhaul`: preserve work, implement/test/push working increments and continue available work. Program incomplete. No recurring automation, merge or production promotion.

## Delivery

Thirteenth revision `506526e` is pushed; all 420 review files verified at https://6ae1f48498c44683a3ac6a2f--hole-os-armonon.netlify.app. Receipt `docs/evidence/review-506526e.json`; archive `/tmp/hole-release-506526e/public`.

Fourteenth revision `fd8c241` is committed and pushed. Review https://6ae1fdbf12f8ebe8698b26a1--hole-os-armonon.netlify.app has all 421 files byte-verified plus strict worker CSP; receipt `docs/evidence/review-fd8c241.json`, archive `/tmp/hole-release-fd8c241/public`. Production unchanged. Full 616 tests pass (`/tmp/hole-wave14-full-tests.log`); after the final collection lifecycle fix, 49 affected collection/Core/runtime tests pass (`/tmp/hole-wave14-final-targeted.log`). Serial build complete. Generated Luma shape/brush, ScenePilot split/source clock, Glyph close, runtime input freeze and initial-window refusal checks pass. Collection Move/Remove rerender during pending leave is fixed and independently verified; final built replay passes all 16 checks without source overrides (`/tmp/hole-wave14-collections-final-built.log`). Evidence: `library-collections.md`, `luma-shapes.md`, `scenepilot-split.md`, `runtime-close.md`.

Core edits retain the previous head plus transactionally validated additional exact parents. Missing parents roll back the batch; receipt replay remains idempotent. Initial failed window checkpoints retain visible editors and retry controls. Runtime freezes user input during close and restores it on refusal; exact prior opaque-child caret restoration is not claimed.

## Next ownership and exact steps

Root owns shared shell/Core/continuity/runtime/public and serial release. Wave14 release complete; wave15 implementation active:

- Flow: retained Form seam binding/inspection/disable/remove, native Undo/reopen, actual DXF notch output and honest PDF limitations; bounded geometry and durable raw-field/ACK recovery. Implementation active.
- Luma: retained native tone adjustment layers, merge existing tone fields, actual asymmetric pixels and unchanged raster bytes, Undo/reopen/raw recovery. Implementation active.
- Relay: native Bounce library import/browsing/exact mapping, preserving native metadata and explicit per-track queue; no shared shell edits.
- Root: reproduce and repair cross-app navigation refusal after destructive preflight. Collections have cancellation, but libraries/extensions/publish/world tools can dispose before navigation storage succeeds. Preserve drafts and lifecycle authority; test actual failed-write recovery before claiming repaired.

## Environment and genuine gates

Node22.22.2; Chrome156.0.8078.48; static server loopback5193, no watcher. Disposable profiles only. Playwright core `/Users/lillypad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs`. Agents share checkout; root alone builds/commits/deploys.

Full retained tool parity and canonical view/app matrix remain required. Original NOW/Circle/Sessions sources/contracts and authorized providers remain unavailable. Production Node hosting/TLS/operations, physical touch/audio/mic/assistive technology, Safari automation, actual formative participants and independent Vault security/key/recovery review remain external gates. Bridge lifetime 256-request/one-hour explicit renewal remains required; do not bypass caps. No spending, personal-data deletion, automatic external messages/publication, security expansion or production promotion.

## Fifteenth integration checkpoint

640 full tests pass (`/tmp/hole-wave15-full-tests.log`); generated Form seam, Luma tone, Bounce library and reader/Publish/WebLab/Tongue navigation refusal journeys pass. Independent reviews pass. The final release blocker is repaired and independently cleared: Relay reproduced a new Bounce import from a listening window opening the shared workspace after window disposal (`/tmp/bounce-window-review.mjs`). Approved bounded repair keeps catalog editing in the shared workspace and independent windows on queue/player only; 18 targeted tests and final rebuilt checks pass at `/tmp/hole-wave15-bounce-final-window-built.log` and `/tmp/hole-wave15-windows-final-built.log`. Source is frozen; commit/push/archive/review verification is next.

Next real reliability gaps: WebLab pending name loses unload protection when draft storage fails (Relay `/tmp/weblab-unload-review.mjs`); root owns next repair. Bridge current-source assessment `/tmp/bridge-lifetime-assessment.log` reproduces request257 SESSION_LIMIT, expired checkpoints and a completed commit hidden by expiry. Naive reconnect loses receipt replay and conflicts. Do not clear request receipts, bypass caps or autoextend grants. Flow has a read-only explicit expiry/acknowledged-generation design; no implementation authorized yet. Continue source-backed work after release.
