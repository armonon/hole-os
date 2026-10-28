# Ghost → Form native garment surface

Implemented against owned Ghost Studio revision `5a6356b92626c29a3122b7c81db52d85f8522283`, with exact selected source hashes and ownership/dependency notices under `src/vendor/ghost`. The adapter uses the actual retained document validator, photo pipeline, CPU cloth solver, textured renderer, GLB writer and GLB loader. Form creation/parsing uses the already retained Form engine. No synthetic mesh substitute or calibrated-fit claim is made.

## Mount and persistence contract

Load `assets/ghost.js`; register `HoleGhost.create({core})` as `hole.ghost`. `mount(instance,root)` requires an explicitly granted `context.assetId` and `context.versionId`; optional `projectId` and restored `editorState` follow the existing runtime contract. The returned handle supplies `frame`, `sessionId`, `serialize()`, `revoke()` and `close()`. Dependencies are loaded only from same-origin assets, including the SDK and selected retained engine. Shell integration labels the surface **Form Garment** and the object action **Open in Form Garment**.

Native `.ghost` JSON, original embedded front/back/side photo references, nondestructive cleanup, construction and unknown authored fields remain in the editable document. Settings/name edits and bounded undo operate on retained native data. Save retries preserve the exact request ID and blob after ambiguous durable ACK failure. Checkpoints preserve unsaved authoring; reopening the shell offers explicit recovery.

Export saves the source first, then atomically derives a real textured GLB and a native `.form` scene with exact saved-source parents. The scene contains the actual GLB as its imported asset; `extensions['hole.ghost']` preserves the raw source document, exact native version pointer, engine metadata and explicit inferred/noncalibrated status. Form scene movement/save/reopen retains both the original source and embedded GLB bytes. Fabric manufacturing pattern data is not invented.

## Bounds and security

Native input is limited to 16 MiB. Embedded PNG/JPEG/WebP headers are checked before decoding (4 million pixels, 4096-pixel edge); decoded dimensions are checked again. Remote references are rejected; unbundled original sample paths remain preservable but cannot generate without their photos. Export GLB is bounded to 16 MiB and combined derived output to 32 MiB.

The parent accepts computation only from the mounted frame with its exact nonce. It validates all settings, construction and silhouette arrays before creating one globally admitted worker. The standalone worker has a 90-second absolute deadline and is terminated on cancellation, close, revoke, result or error. Returned buffers, finite coordinates, complete piece/index partitions, triangle bounds, seam indices, opening edges, optional hood grid/attachments and support profile are validated before rendering. Motion capture is disabled.

Retained photo cleanup runs before the solver on the editor thread. A conservative 12-million-work budget now rejects excessive cleanup before allocating an image, using the retained edited-photo path's 1024-edge replay bound. Existing heavy cleanup remains editable and saveable; generation reports its limit. Browser image decoding, bounded canvas preparation and GLB writing cannot be forcibly interrupted mid-synchronous operation; cancellation checks prevent subsequent output commits. The 90-second hard termination guarantee applies to the CPU solver, not browser decoder/export internals.

Worker response CSP: `default-src 'none'; script-src 'self'; connect-src 'none'; worker-src 'none'; base-uri 'none'`. The opaque editor receives no worker/network capabilities and no additional Core authority.

## Acceptance

- `node --test tests/ghost.test.mjs`: 7 passing cases covering native fidelity, recovery/undo, exact ACK retry, image/input limits, adversarial returned geometry, excessive cleanup retention and small cleanup admission.
- `node scripts/verify-ghost-browser.mjs`: real opaque editor with synthetic garment photographs, actual CPU solve/WebGL pixels/textured GLB, independent original GLB-loader reimport and matching bounds; derived Form native edit/save/reopen; source bytes and provenance preserved. Wrong-frame/wrong-nonce requests ignored; two mounted frames cannot run concurrent workers; cancel/revoke/close/deadline terminate workers without new outputs. Worst-case valid 1600² photo cleanup (15 strokes × 160 alternating points, radius .25) rejects before any Image, renderer or worker allocation while heartbeat continues and raw native recovery remains exact.
- `node scripts/verify-ghost-shell-browser.mjs`: built local shell on port 5193, object action → settings edit → close → explicit recovery → native save → actual solve/export → native reopen; derived Form object action → scene position edit → save/reopen with source extension and GLB unchanged. The browser qualifier applies the strict worker CSP response header to match deployment rather than relying on the development server's missing headers.

Fixtures are generated locally and contain no personal photographs; no external uploads or services are used. This proves the bounded native/engine/transport path, not universal photographic reconstruction quality. Full Ghost object/artwork/model/collection tools, new-photo creation UI, detailed photo-edit authoring, portable source-extraction UI, calibrated fit and manufacturing pattern recovery are not included in this increment. Original Ghost and Form routes remain available.
