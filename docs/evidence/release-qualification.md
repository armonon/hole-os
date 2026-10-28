# Current continuation qualification

Latest pushed implementation: `506526e` (591 passing tests, then22 affected lifecycle tests after the final close fix). Latest byte-verified review: [420-file review](https://6ae1f48498c44683a3ac6a2f--hole-os-armonon.netlify.app), receipt `review-506526e.json`. Production remains unchanged; the master brief is not complete.

## Fourteenth increment — 28 October 2026 (integration; not yet delivered)

Combined616tests and serial build pass. Native Luma rectangles/ellipses use retained geometry/fill/stroke editing with actual pixel, sparse-field, Undo and native reopen checks. Completed brush strokes survive recovery refusal; unfinished gestures are retained on blur and explicit close refusal. Generated-browser qualification passes; full paths, masks and transformed painting remain separate. See `luma-shapes.md`.

ScenePilot uses retained clip splitting and granted exact-source clocks for paused 1×/2× inspection. Actual generated red/blue video pixels, pinned media after head advance, split/Undo, native save/copy, missing-source recovery, raw fields, storage refusal and320px controls pass. Locked tracks and fragments below the editable duration minimum are refused. This is not full composition rendering or movie export. See `scenepilot-split.md`.

The runtime freezes mounted user input through serialization, checkpoint and unmount, retaining live editors on failure. Actual text/opaque-iframe checks cover late input, restored editability and retry; exact prior opaque-child caret restoration is not claimed. Initial window checkpoint refusal retains a visible editor and retry controls, with durable recovered Glyph bytes observed. Final generated checks pass. See `runtime-close.md`.

Librarian native collections preserve ordered exact source versions and imported metadata, with immutable edits, historical readonly views, explicit foreign-source mapping and staged creation/save receipts. Core edits now retain their previous head plus validated additional exact parents; transactional missing-parent rollback and replay tests pass independently. Main generated collection journey passes; the independent Move/Remove→pending-navigation rerender regression is repaired and independently rechecked; final generated replay passes all 16 checks without source overrides. See `library-collections.md`.

## Thirteenth increment — 28 October 2026 (delivered)

Settled 591 tests and serial build pass. Exact-version previews and Quick Tools preserve selected bytes through Carry, Download and independent copies, including canonical lineage, MIME changes, readonly native previews and concurrent placement retarget refusal. Final generated-browser check passes without source overrides; see `pinned-tools.md`.

Relay explicitly reviews and retains a bounded immutable restore journal, restores remote history into one local asset and reconciles committed output before remote rereads after lost acknowledgements. Two persistent profiles verify interrupted restore/reopen, revocation and duplicate prevention. Core checks optional expectedProjectRevision inside the output transaction after hashing; concurrent destination changes leave zero outputs. Same-project batches and receipt replay remain valid. See `relay-restore.md` and shared contracts.

Luma exposes bounded retained native translate/scale/rotate/flip with real asymmetric pixel, Undo, native reopen and partial-field recovery checks. Final generated browser passes; full transformed painting remains unsupported. See `luma-transforms.md`.

Glyph adds retained pair kerning/layout preview, native Undo/reopen and real TTF kern output. OTF omission is explicit. Independent review corrected unfinished-field switching, early close admission and completed-stroke loss on failed recovery. Final generated-browser check passes without source overrides, including injected recovery refusal; independent stroke retry also passes. See `glyph-kerning.md`. Final close also freezes input and flushes again after the outer runtime checkpoint; actual delayed-write keyboard/pointer, failed-final-flush retention and retry checks pass. Full studio parity and physical-device gates remain open.

## Twelfth increment — 28 October 2026 (delivered)

Settled 572 tests and serial build pass. Publish now creates private authored press kits from explicitly reviewed exact versions, with inspected original ZIP bytes, immutable parents and duplicate-free retry after ambiguous ACK. Drafts drain edits arriving during a write; failed storage refuses navigation. Actual generated-shell320px/keyboard and cancellation/reload checks pass. See `press-kit.md`.

Tongue uses actual local transcription captions or SRT with explicit pinned audio, media-clock cue playback, durable written attempts, JSON/SRT exports and missing-audio written recovery. Malformed provenance is refused without overwriting the original record. Independent review reproduced and fixed orphan dialogs from malformed lessons and opens racing workspace Close. Final built full journey and navigation regression pass, with a separate independent recheck. See `tongue-practice.md`.

Luma exposes bounded native layer duplicate/delete/reorder/visibility/lock and Normal/Multiply/Screen controls using retained engine methods, real Undo and native persistence. Actual pixels/native reopen and failure guards pass. JPEG/WebP now route from exact selected versions into native copies; acknowledged-output/checkpoint-failure messaging avoids advice to create a duplicate export. See `luma-layers.md` and `luma-exports.md`. Full retained tool parity and physical/browser qualification remain open.

## Eleventh increment — 28 October 2026 (delivered)

Settled integration has 556 passing tests and a serial generated build. Paperwork new documents, tables and forms have independent window draft identities; legacy main-view and saved-asset keys remain compatible. Two-window recovery, failed-save Close/Escape guards and interrupted first-save migration retaining one asset pass without overrides. See `paperwork-sessions.md`.

Luma creates actual native copies from raster sources and explicit PNG/JPEG/WebP exports, with exact selected-version parents and unchanged original binding. Actual engine bytes/pixels, editable native reopen, source-save and export quota retries, ambiguous ACK duplicate prevention and pre-dispatch cancellation pass. Typing300characters uses3bridge requests; long-session256-request renewal remains open. See `luma-exports.md`.

StemDeck adds retained native track gain/pan/mute/solo and audio clip move/trim/resize/rate. Actual PCM comparisons, native Undo, source archive/hash/unknown-field retention, raw-only inspector recovery and failed-storage refusal pass. Unsupported full-mix processing remains unrendered. See `stemdeck-editing.md`.

Independent review corrected lost initial flush messages during editor initialization, stale failed typing queues, native-save cached quota failures, raw-only draft recovery omission and browser unload protection. Both studio parents authenticate pending-state notifications and wait for durable child flushes on close. Actual generated-shell normal journeys and separately labeled fault injection remain distinct. Shared derive now sets canonical parentVersionIds as well as provenance; real Core reopen regression verifies the exact selected earlier version even after the source head advances.

## Tenth increment — 28 October 2026 (delivered)

543 tests pass after the settled serial build. Luma adds actual retained-engine native raster/text layers, typed recovery and bounded paint/erase, with exact pixels, original/native reopen, failed recovery and lost-ACK retry tests. Image saves remain flattened; native layer creation is clearly limited to `.luma`. Imported transformed/oversized paint targets are refused before interpolation. See `luma-tools.md`.

Paperwork fixes lost rapid table edits, unsubmitted form-answer recovery, imported own-key fields, incomplete-draft repair and asynchronous save races. Actual built Markdown/HTML/calculated CSV/form-response exports, reload, failed storage, delayed-write controls, keyboard labels and 320px layout pass. See `paperwork-formats.md`.

StemDeck now plays actual bounded dry PCM-WAV/MIDI arrangements using retained scheduling and instruments, with loop/seek/monitor controls. Actual combined PCM exactly matches isolated-track sums. Independent review reproduced three overlapping offline allocations after repeated cancel/play; admission now retains one in-flight render until native work settles, with regression and independent one-allocation confirmation. Cancellation prevents stale playback; it cannot hard-terminate OfflineAudioContext. The final built shell journey and prior Rack/native archive regression pass. Full effects/routing/automation remain preserved but unrendered. See `stemdeck-transport.md`.

Capture retains failed recording bytes, supports retry/download and awaits storage before closing. Independent review fixed stale permission rejection stopping a newer stream and thought-save completion closing a competing recording. Six focused tests and generated-stream real MediaRecorder tests cover close/error/ACK/permission seams; no physical microphone claim. See `capture-voice.md`. Final post-review rebuilt Luma/Capture checks also pass; source is frozen for delivery.

## Ninth increment — 28 October 2026 (delivered)

Settled suite: 522 tests pass. Serial build succeeds. One stale test fixture's function-signature extraction was corrected after the arrangement API gained an explicit reader-version option; the content-preservation assertions remain unchanged.

Native Moodboards can now be created from Project or Capture, with notes, swatches, frames and embedded original images; duplicate/delete and immutable structural Undo preserve pending fields and group coordinates. Final generated structural, recovery and actual PNG/PDF/ZIP/editable-Luma export journeys pass. Imported special item IDs remain literal own keys in raw draft maps; targeted regressions cover them. Full canvas dragging/typographic parity remains open.

New garments use explicitly selected local original photos, retain exact source hashes/parents, and produce real default photo-silhouette cloth. Actual creation → GLB/Form export → embedded Ghost source extraction → reopen passes, including raw source/unknown fields, cancellation during decode, invalid input, quota failure and duplicate-free retry. The retained solver legitimately emits 260 opening pairs for the default silhouette; validation now permits up to 4096 bounded chains while keeping topology/index/byte/work bounds. See `ghost-native.md`.

Independent Librarian windows retain exact sources, separate pages and pending notes; storage rejection retains the affected window. Closed arrangement readers open current content by default. Only explicit saved-version opt-in reopens historical readonly sources and their scoped notes. Bounce windows share one paused-on-mount central player. Final rebuilt reader API/window checks pass without source overrides, including actual close rejection and both arrangement choices. An initial Chrome process-launch timeout occurred before loading the app; fresh unchanged runs passed. See `library-sessions.md`. This is not full canonical-app or device qualification.

## Eighth increment — 28 October 2026

Settled full suite: 510 tests pass; serial generated build succeeds. Imported Moodboard native editing and actual PNG/PDF/ZIP/layered Luma handoff retain original bytes and exact version lineage. Review added durable raw-field drafts, explicit recovery, failed-storage navigation refusal and in-flight operation navigation ordering. Pinned history never recovers a newer draft. See `../compatibility/moodboard-luma.md`.

Ghost uses its retained CPU cloth solver, textured renderer and native codec to derive real GLB plus Form scenes preserving embedded raw Ghost source. Actual shell recovery/save/export/Form edit/reopen passes. Independent review found and fixed excessive pre-worker photo cleanup and incomplete auxiliary geometry validation; real worst-case cleanup now refuses before decoding while preserving source. The solver is hard-terminated after 90 seconds; bounded browser decode/canvas/export phases are not a process-isolation claim. See `ghost-form.md`.

Portfolio's original templates now mount in Publish with native editing/recovery and private static-site ZIP export. Actual generated-shell checks inspect byte-identical media, source hash/parents, explicit pinned-version isolation, failed draft persistence, navigation retention, and completion without disposal deadlock. Narrow-screen keyboard checks pass; exporting never hosts or publishes the site. See `portfolio-publish.md`.

Day/Paperwork have independent windows with owned-dialog protection, geometry, minimize/resume and content-safe arrangement restore. Repeated restoration does not duplicate identities; keyboard focus returns after minimize/close. Opening runtimes refuse lifecycle operations until mounted, retaining the pending instance. See `tool-windows.md`. Full canonical app/studio parity and physical device/human/security gates remain open.

Existing Carry→Flow→pinned Publish export and 320px reduced-motion regression pass in Chrome156.0.8078.48. The 200-indexed/30-visible Universe fixture measured 78.1ms in this run; prior 33–40ms observations remain historical, not a fixed performance guarantee.

## Seventh increment

489 tests pass with the settled serial build. Retained Animate now supplies native editable cels/layers/fill/onion skins, real PNG/sprite atlas and bounded atomic frame-sequence cuts. Actual shell creation, native save/reopen, explicit PNG grants into ScenePilot and output pixels/timing pass. Full original animation tools/codecs remain available on the retained route; this is bounded consolidation, not full parity.

Studio open now persists runtime identity and offers closed native recovery explicitly. Actual older-draft/newer-head conflict testing preserves both; arrangement restoration remains content-safe. Two simultaneous Luma/Glyph dirty instances survive all four project views without changing identity or committed originals. See `studio-view-recovery.md`.

WebLab's optional QuickJS console executes in a disposable worker with no host capabilities. Actual infinite-loop deadline/cancel tests keep host heartbeats responsive; real built-app source/save/draft/navigation checks pass. Browser HTML preview now requires an explicit click, so reopening a looping authored project does not execute it automatically. The console has no DOM and is not general browser compatibility; regular preview remains cooperatively controlled. Exact runtime/license/hash and resource-limit scope are recorded in `weblab-bounded-script.md`.

Momentous object packages create native editable shape/label/color assets with optional bounded counter state, explicit project placement, provenance and immutable versions. Actual generated-shell/profile-reopen/export/update/undo/package-rollback checks pass. Placement is project material; custom 3D objects and arbitrary executable grants remain out of this bounded path.

## Sixth increment

473 tests pass after independent review. Original experimental FFT/chroma key analysis returns ranked major/minor hypotheses and relative ambiguity with explicit evidence gates; actual browser WAV decode, partial coverage, JSON lineage/reload and cancellation/timeout pass. It is not calibrated confidence or corpus-tested music accuracy.

On-demand local text search includes separate earlier-version/draft opt-ins, exact pinned history opening and current-version selection. Real browser save/reload and four model tests pass; search attempts/bytes/results are bounded and exclusions are visible. See `content-search.md` and `experimental-key.md`.

Explicit Relay material-position transfer uses private geometry-only records and deliberate local mapping. Independent review caught mutable review metadata being used for writes; apply now reconstructs original metadata from revision-checked Core records. Regression proves tampered policy/version/resource/target fields cannot rewrite local pins or redirect writes. Application journals preserve partial/uncertain writes; undo refuses newer local changes. Final integrated browser evidence is in the layout compatibility record.

## Fifth increment

Explicit model-file installation verifies pinned sizes and SHA-256 before local caching, separately from workspace backups; workers verify bytes again before inference. Optional HTDemucs and Whisper weights are not bundled or committed. Four-stem separation passed the real built install/run UI with distinct nonzero one-second stereo WAVs, retained exact originals, lineage, reload and cancellation/deadline zero-output checks. CPU fixture observation: 17.827 seconds; this is not a music-quality benchmark.

Whisper tiny.en transcribes a synthetic spoken English fixture locally. Native caption review supports corrected text/times, add/delete, version save and durable draft recovery while preserving raw inference. A real save/reopen check caught a stale-record callback; reopening now reads the current head, and pinned objects explicitly offer Edit latest captions. Imported caption source/model metadata is validated before mounting. Separate source and built-shell tests exercise actual model inference, strict worker CSP, missing-model refusal and no remote audio/model requests during inference. See transcription evidence for exact scope.

Atlas has actual offline vector cartography, saved accessible pan/zoom and privacy-reviewed trip copying. Two persistent profiles exercise exports/imports, foreign inert references and duplicate refusal; actual service-worker offline reload restores the map. Roads, geocoding and Circle publication are not implied.

## Fourth increment

Settled suite:444/444 passing; serial build excludes unfinished next-wave model provisioning.

Real Mediabunny/WebCodecs video trimming preserves selected picture/audio, validates tracks/duration and publishes no output after cancellation/deadline. Actual built Media tools UI passed. MODNet runs pinned local licensed weights in a terminable same-origin Worker; actual shell produces cutout+mask PNGs with model SHA/revision and exact source lineage. The synthetic fixture verifies inference/soft alpha/opaque RGB retention, not portrait-quality accuracy. Worker CSP permits only self scripts/connections and WebAssembly compilation; no remote model/runtime fallback. Input edge >2048 is rejected; browser image decode allocation precedes dimension admission. Model/runtime files total40,243,725bytes; offline cache must have capacity and retains the prior complete release on failed installation.

Studio geometry now has accessible keyboard controls, independent bounds/checkpoints and accurate minimized presentation. Real100/200/400% browser-zoom testing found and fixed a minimum-height overflow at320×225 CSS pixels.21 view/zoom cases pass, including focus containment/ESC return and reduced motion. Safari26.0.1 remote automation is disabled; no setting was changed and no Safari pass is claimed. Physical devices, assistive technology and human research remain gates.

The earlier release records below retain their original dates/revisions and scope; their older counts do not describe the current head.

---

# Hole OS overhaul — review build qualification

26 October 2026. Source branch: `codex/hole-os-overhaul`; verified base: `7d98b7251718b5615196bad2c793554f8573b6b1`. The final commit is the branch revision containing this record. This is a substantial review build, not completion of the full master program. The [program ledger](../implementation/backlog.md) preserves required unfinished scope.

## Delivery

- [Netlify review build](https://6adfa58acfc5e0940a9e0685--hole-os-armonon.netlify.app/)
- Deploy ID: `6adfa58acfc5e0940a9e0685`; only `public/` uploaded to the existing Hole site as a draft deployment.
- Production `main` and the production URL were not replaced.
- [Deployment byte comparison](deployment-check.json) records every published file checked against the generated local output.
- The private Node collaboration service is a separate deployment. Its local QA data and credentials are not included in Git or the static site.

## Automated verification

Final source/build verification completed with **360 tests passing**, zero failed/skipped/cancelled. `npm run build`, JavaScript syntax checking and the authored-file whitespace check passed. Vendored upstream license notices retain their original trailing whitespace and are excluded from that style check. Node minimum is 22.13 to match the PDF engine. Source and generated public modules agree. Unused QuickJS runtime assets are omitted and vendor output is synchronized on build.

Tests exercise actual Core transactions and byte storage with fake-indexeddb, concurrent revisions, drafts, quota/interruption failures, atomic jobs, real local HTTP authorization/sync, packet-boundary bridge attacks, codecs, package state, gesture cancellation and offline update coordination. The real Luma engine has a separate [local qualification](luma-adapter-local.json); that transport was simulated, not a deployed connected editor.

One overlapping manual/dev-watcher build encountered a file-copy collision during QA. Stopping the watcher and running the final build serially completed successfully. Release commands should not run concurrently against the same output directory.

## Observed browser work

All checks used Codex's in-app browser with disposable content. Local origins were `localhost:5173`, `127.0.0.1:5173` and a fresh `127.0.0.1:5187`; they do not share origin storage. Hosted startup, project creation, drawer launch, recents and responsive layout were repeated at the final review URL. This is not a Safari/physical-touch/screen-reader certification.

| Journey | Actual result |
| --- | --- |
| Return to a thought | Changed the Night garden text, saved a draft, reloaded before committing, recovered the exact text and committed an immutable version. |
| Release artwork | Approved real focal-point previews/upscaling; generated three PNGs and downloaded the ZIP. CRC and image dimensions were inspected: 3000×3000, 1080×1920 and 1200×630. |
| Media | Imported a two-second H.264/AAC fixture; generated a browser video thumbnail and exported actual mono 44.1 kHz, 16-bit WAV lasting 1.999977 seconds. Persistent-player controls survived navigation; physical audible playback continuity was not qualified. |
| Rack | Rendered the actual OfflineAudioContext graph; downloaded a 5.45-second, stereo 44.1 kHz, 16-bit WAV with nonzero samples. This qualifies output rendering, not native plugin parity or physical audio-device behavior. |
| PDF | Drew a redaction over a known fixture phrase, reviewed the rasterization warning and exported. Parsing the output found one page, zero text items/annotations and no attachments. Private original retained. |
| Create | Counter state survived reload. Actual-Core regressions separately cover rapid edits, timer close, failure and draft races. |
| WebLab | Edited, previewed, versioned and reopened JavaScript. The sandbox denied parent DOM and localStorage access. Attempted frame self-navigation to an external test URL produced the browser's blocked-content page; the harmless test source was restored afterward. |
| Momentous | Installed the built-in counter v1, updated to v2, observed Add increase by five, rolled back and reopened v1 with saved state preserved. |
| Smart Screen | Previewed a release arrangement, explicitly applied positions and undid them successfully. File content/version policies remained separate. |
| Universe | Observed actual perspective/depth projection, camera controls and direct selected-material opening. No FPS benchmark or large-scene device qualification was performed. |
| Day | Saved a zoned event and linked task; both survived reload with the expected America/Los_Angeles time. |
| Relay | Signed into the local development service with a disposable QA account; uploaded eleven file versions, restored authorized copies as a separate project and signed out. Two HTTP clients cover offline/revocation/conflict behavior; two physical devices were not tested. |
| Full private backup | Downloaded a 24-asset / 26-version archive. Initialized a fresh browser origin, reviewed the starter-desktop replacement, restored it and observed the original task, event, note content and image materials. Personal-data conflicts stay strict; the current device identity is not cloned. |
| Offline entry | Stopped the `:5187` server and confirmed connection refusal with an independent HTTP request. Reload and a brand-new browser tab both opened the cached shell and restored Day/project content. This is server-unavailable evidence, not physical airplane mode. |
| Updates | An actual Update UI action reloaded an earlier cached version while preserving Day data. Subsequent edit-lock/cancel/timeout hardening passed harness tests; the complete multi-tab lock behavior still needs browser repetition. |
| Responsive drawer/workspace | At 320×720, document and main client/scroll widths were all 320px. Icon controls retained accessible names. The hosted circular drawer contains 35 local/external launchers; launching Day opened the actual local surface and added Day to the dock. |

Browser findings fixed during integration: PDF module MIME delivery; visible modal errors; native modal closing/focus ordering; an unclickable main surface after modal + whole-container animation (animation now targets the heading); save races; project breadcrumb/Space resolution; bootstrap backup collisions; phone overflow and hidden-label accessibility. The exact package update/open/close/rollback sequence passed after the animation fix.

## Downloaded byte evidence

Files below are disposable test outputs in the local Downloads folder. Full private backups and service data are intentionally excluded from this repository.

| Output | Bytes | SHA-256 |
| --- | ---: | --- |
| Release ZIP | 3124822 | `fd5ce056af56cbfec13dd0dfaf3efedcdb37893ed103371a6f951accf1325616` |
| Extracted WAV | 176442 | `6d333064dc80e57239aaa725524be831e960d182e3e7c76c3ec5d65f2a6faec0` |
| Redacted PDF | 13814 | `6cd25968f1c735380a4a57637258e08c7aa2d9908a88afcbb98021c6b5fe601c` |
| Rack WAV | 961424 | `7c43509402702e20eef0d07c442a9339fd35e38ba58a80a81a6f8aaa5ba9df6a` |

## Visual evidence

These are screenshots of the final hosted review build, not design mockups. The project is explicitly labeled as a disposable interaction study.

![Desktop project](screenshots/desktop-project.jpg)

![Circular drawer](screenshots/circular-drawer.jpg)

![320px phone layout](screenshots/phone-project.jpg)

## Required work still open

See the full [46-row capability and acceptance ledger](../implementation/backlog.md). Major unfinished work includes platform-wide runtime/editor continuity and retained-studio feature parity; wider browser, format and model-quality qualification for the implemented media engines; full application-state Relay and missing social-provider adapters; production backend operations; remaining everyday capabilities; Vault implementation/security review; physical-device/accessibility/performance qualification and actual formative research. Later continuation evidence above records implemented flows and engines; this historical section must not be read as saying those implementations are absent. These remain required where the master brief says so. Only the brief's explicit future items, including native remote application execution, are labeled future.

## Continuation qualification — 26 October 2026

This continuation adds actual mounted Luma engine controls and native recovery, multi-step Flow/audio-inclusive release archives, Carry snippets/pinned handoff, line diffs, cross-Space project references, arrangement runtime references, lazy Universe previews, Lab instruments, optional memory, Day recovery, Browser Trails and Relay conflict/audience controls. It does **not** complete the master brief or supersede outstanding gates above.

Local evidence on macOS arm64 Apple M4, installed Chrome 155.0.8059.85:

- `scripts/verify-continuity-browser.mjs`: actual shell pinned Carry link; snippet ACK/reload; text diff; place search; cross-Space project visit; snapshot schema 2; multi-step Flow authoring; Carry → real image conversion → selected-version Publish export; 320px reduced-motion no-overflow. Zero page errors. A 200-item Universe attached at most 30 spatial holders, all 200 reachable in list mode, observed mount 33–40ms. This is a local headless sample, not a physical-device performance claim.
- `scripts/verify-luma-browser.mjs`: real engine PNG crop/save/original bytes, native `.luma` opacity edit/recovery/save/reopen, sandbox parent/localStorage/IndexedDB/top-navigation denial and revoked reads. `scripts/verify-luma-shell-browser.mjs`: actual workspace Open in Luma, crop/save, minimize/resume, close/reopen and loaded phone layout.
- `scripts/verify-lab-memory-browser.mjs`: actual signal edit/ACK/reload and WAV 48kHz/48,000 frames; invalid frequency rejection; generative PNG 640×360; pendulum saved samples; memory enable/pinned-source/save/reload/correct/JSON-export/exclude/disable/forget; disabled write refusal. Zero page errors.
- `scripts/verify-relay-browser.mjs`: two disposable persistent profiles, real offline failure, close/reopen queued conflict, deliberate resolution and other-profile pull; actual mounted guest create/review/revoke controls; anonymous pinned bytes exclude later private content and fail after revoke.
- `tests/verify-everyday-browser.mjs`: actual event create/delete/reload/restore, contact delete, exported recovery bytes, actual query URL and saved project Trail. External search response intercepted; no assertion about the provider's response.

Browser scripts use disposable localhost fixtures; no actual user data is sent or published. Set `HOLE_PLAYWRIGHT_MODULE` to an installed Playwright module for general scripts; Luma scripts document their tooling environment variables. Full Node suite count is recorded in the checkpoint. Remaining production/provider, studio-parity, physical Safari/touch/audio/assistive-technology and human-research gates remain open. The latest review deployment must be recorded separately from local verification.


## Second continuation integration — 26 October 2026

Based on pushed `a70520d`, this working increment has 418 passing tests after correcting legacy test-harness extraction for new gallery and Space-template hooks. Actual Chrome 155 shell journeys now cover Glyph/Form/ScenePilot native save/reopen and real TTF/OTF/PDF/DXF bytes; explicit ScenePilot media links, missing dependencies and preserved originals; libraries PDF pages/bookmarks/notes and audio playback/playhead recovery; semantic zoom anchors/hysteresis/input exemptions; package themes Apply/Undo, new Space-template identity/zones/provenance/reload, and explicit workflow review before outputs. Relevant scripts are `verify-studios-shell-browser`, `verify-libraries-browser`, `verify-semantic-browser`, `verify-smart-crew-browser` and `verify-package-shell-browser` under scripts/. Files and package sandbox harnesses are in tests/. All use disposable stores.

This is bounded local Chrome evidence on the existing Apple M4/macOS environment. Full studio parity, hard hostile-code CPU isolation, native audio parity, physical touch/audio/assistive technology, independent Vault review, formative participants and production backend remain open. No production promotion. The exact second increment delivery receipt follows only after its release build is verified.


## Third continuation integration

433/433 integrated tests pass. StemDeck actual shell and isolated browser demonstrate native archive save/recovery/reopen with embedded audio retained and a real non-silent PCM24 C4 audition export; not full arrangement rendering. Tempo actual shell decodes a known WAV and writes a pinned-lineage JSON estimate with alternative/ambiguity and partial coverage; cancel/budget paths publish no output. Public forms actual Chrome against local HTTP service demonstrates reviewed schema-only publication, separate guest response/receipt, failed-submit retry, owner JSON export and revoke. Static GLB actual Chrome (software WebGL flag in headless test) renders a real triangle, keyboard rotation, cleanup, original retention/reopen and 320px layout. This is not hardware-GPU performance evidence. Admission rejects URLs/textures/extensions, cycles and excessive allocations. Exact delivery follows the settled build.

Native arrangement regression (Chrome155): older snapshot/recovery never replaced a newer committed Glyph version. Restore created a fresh instance at current head; a subsequent restore preserved the live dirty instance, restored geometry/minimized state, and left historical recovery/snapshot records byte-equivalent. Two focused tests and actual browser pass.
