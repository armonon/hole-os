# ScenePilot Animation: retained Animate native surface

Source: owned `armonon/animate`, revision `a189bc074f0c1c306d1029414d0c73d45f0a1b52`. The source package is private and has no LICENSE file. This integration asserts no open-source license. Only selected owned engine code is included; no repository metadata, React application, private credentials, or third-party codec package is deployed.

Selected native engine: `src/engine/{project,layers,timeline,stroke,tween,easing,render,fill}.ts`, `src/engine/export/spritesheet.ts`, `src/lib/fill-tool.ts`. The retained engine implements native `.animate` version 1 JSON with embedded media; previous-cel hold, pressure strokes, layer-local destination-out erasure, tweened transforms, onion skins, real flood fill, and shared canvas compositor. Small build-time lifecycle glue awaits that compositor's own image cache and bounds decoded image dimensions; it clears render caches. No fabricated frame output or alternate document schema replaces authored content.

## Mounted interface

Load `/assets/animate.js` after bridge. `HoleAnimate.create({core}).mount(instance, root)` accepts `instance.id`, `context:{assetId,versionId,projectId?}`, optional `editorState:{assetId,versionId,checkpointId}`. Returns `{frame,sessionId,revoke,serialize,close}`. `serialize()` refuses a persisted busy checkpoint. Opaque `allow-scripts` sandbox receives only exact native resource read/commit/derive grants and its own state operations. No remote fetch, external image, worker, or parent DOM authority. SDK files `bridge-client.js` and `animate-adapter.js` must be copied to root assets by host build. Existing full Animate destination remains available. `HoleAnimate.newDocument({name,width,height})` asynchronously loads the same-origin retained engine and returns `{name,blob}` for `core.importAsset`; it uses the actual native new-project factory and filename serializer.

Surface edits strokes/erasers, fills, layer name/visibility/lock/order, added layers, selected/added frames, blank/copy-held cels, onion visibility and undo. Native unknown fields, existing transform/tween data, embedded sources, and unedited cels survive save. Drawing in transformed or tweened layers is rejected explicitly; users may add an untransformed drawing layer. The original version remains unchanged.

Every mutation gets a durable recovery checkpoint; failed operations leave the busy checkpoint to prevent unsafe host close until retry/recovery. Native commits retry exact bytes/request ID after ambiguous acknowledgement. Exports first save edits, then derive from that exact native version, with exact payload/request ID retained until acknowledgement. Mid-render cancellation emits no derived outputs. A cancellation arriving after atomic commit dispatch cannot retract committed outputs.

## Actual outputs

Current PNG comes from the original compositor with onion skins excluded. Sprite sheet and JSON atlas use the original grid composer, include source start-frame index, and preserve native fps. ScenePilot transfer atomically derives 1–7 frame PNGs plus a native `.cut`: ordinary image clips on the base track each last exactly `1/fps`; native source asset/version, range and fps are preserved in `animateSource`. The user explicitly links the exported frames to ScenePilot using the existing media grants. Native editable vectors/layers remain in the original `.animate`, not baked away.

The original ScenePilot `lib/render-engine.ts` image path decodes image assets to bitmap with unbounded source duration; the original parser accepts this native cut. The browser proof parses generated cuts through the retained ScenePilot parser and checks clip timing and actual PNG pixels. It does not claim complete ScenePilot composition-render qualification or automatic relinking.

## Bounds and missing parity

Native input ≤16 MiB; ≤2048 pixels per edge; ≤32 layers and 16,777,216 total layer pixels; ≤240 frames; ≤200,000 stroke points; ≤4 onion neighbors each side. Exports ≤16,777,216 total pixels; sprite dimensions ≤16,384 per edge. Atomic ScenePilot transfer ≤7 frames because the bridge permits eight derived outputs. Fill is limited to 1,048,576 pixels because the retained flood-fill stack can consume substantial memory. Embedded images are also limited to 16,777,216 decoded pixels in total, with unused cache entries released. Browser embedded-image decoding occurs before decoded dimensions can be rejected; this is not a hard decoder allocation limit.

Only embedded PNG/JPEG/WebP reference images and fill rasters are fetched as data URLs. External/blob reference URLs are rejected. Embedded video bytes remain native data, but a visible video reference blocks this surface's rendering; use the full editor for timed video. Tween authoring, video references, frame/layer deletion, frame-rate controls, reference import UI, playback controls, GIF, Lottie, PNG ZIP and MP4/WebM export remain full-studio features. Full product parity and route consolidation are not claimed.

## Validation

- `node --test tests/animate.test.mjs`: native hold/edit/erase/recovery fidelity, original/unknown retention, durable ACK retry, invalid/remote sources and bounds.
- `node scripts/verify-animate-browser.mjs`: actual isolated opaque bridge; real pointer stroke, cel switch/blank, onion pixel differences, actual native fill, layer-local eraser revealing the underlying red layer, recovery close/reopen, save/reopen, two-frame PNG/native cut output, sprite sheet+atlas, source lineage, cancellation during real PNG encoding with no outputs, and exact export retry. Browser fixture uses synthetic colored strokes only.

`node scripts/verify-animate-shell-browser.mjs` verifies the built object action, layer/fill save and reopen, original retention, transfer into ScenePilot with explicit exact image grants, and actual image preview/timing. The same proof exercises the project New animation dialog through the actual retained factory (loaded on demand), and explicit Recover studio draft after closing unsaved work. A newer native head remains unchanged when saving recovered older-base work conflicts; that unsaved recovered work remains visible and dirty.
