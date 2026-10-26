# Storage, everyday tools, PDF, and offline evidence

Recorded 2026-10-26 for the local `codex/hole-os-overhaul` implementation. These results qualify the paths described below. They do not mean the entire master build program is complete, or establish cross-device sync, native application execution, production hosting, or universal browser support.

## Validation snapshot

- `npm test`: **360 passed, 0 failed, 0 skipped** at this snapshot. Other agents may add tests afterward.
- `npm run build`: passed; generated `public/index.html`, manifest, and one root service worker.
- Assigned focused tests: **48** total — Core 18, persistence adapter 4, everyday 10, real PDF engines 4, offline/update 12.
- Integration agent reports browser checks passed for creating a Day event and task, opening the local PDF engine, generating/downloading redacted PDF output, and applying a PWA Update while retaining Day data.
- PDF browser output was re-read with PDF.js: no text items, no annotations, no attachments; visual inspection retained the public text outside the selected black rectangle. This is fixture-specific evidence, not a promise that an incorrectly chosen rectangle removes information elsewhere on a page.
- The new edit lock during PWA preparation is covered by the client/worker harness; the earlier browser Update check preceded that hardening. Browser-wide network emulation/physical airplane mode were not tested. The integration agent did subsequently verify the concrete server-unavailable scenario described below.
- Clean-profile browser restore passed after the initialized-desktop collision fix: at fresh origin `http://127.0.0.1:5187`, the user-facing review checkbox enabled starter-desktop replacement and restored **24 assets / 26 versions**. Day showed the saved Nightgarden review event with its IANA zone and the Review release crops task. This complements the automated initialized-profile test using the exact shell default state and the same backup. The 320 px viewport check remained assigned to the integration agent.
- Browser offline-shell check passed with the local origin server stopped and `curl` reporting connection refused: the existing tab reloaded successfully, and a brand-new tab at `?offline-test=1&qa=cached-entry` also opened the cached shell and restored Day data while the server remained unavailable. This establishes cached entry/reload for that browser and origin; it does not establish physical airplane-mode behavior or offline availability of external providers.

## Durable local storage

`src/core.js` adds versioned storage to the existing `hole-file-library-v1` IndexedDB database at schema version 2. Existing legacy stores and IDs remain intact. New stores contain assets, immutable versions and bytes, revisioned metadata/drafts, migration journals, and restore staging. There is no production in-memory substitute for a failed database.

Writes acknowledge transaction completion. Existing metadata requires the expected revision; asset edits require the expected head version. Stale edits fail without overwriting the current version. Drafts persist independently, survive reopening, and remain recoverable after a stale save. Trash retains bytes and version history; Restore makes the asset active again. Branches receive independent asset IDs and retain provenance.

Job completion publishes output assets/versions, project memberships, compatibility records, and a successful job state in one transaction. Cancellation and transaction failure publish no partial output. An idempotency key is bound to the job and output fingerprint; a retry replays the same result and rejects changed content under the same key.

Legacy migration is additive, keeps original identifiers and raw legacy snapshots, and can recover an interrupted staging phase. The workspace persistence adapter reports saving, saved, conflict, blocked, and failed states instead of acknowledging silent failures. Legacy file conversions now use the atomic bridge. Legacy text editors keep revisioned durable drafts; file deletion routes to recoverable Trash.

### Backup and restore

The private backup includes metadata, drafts, current and historic file bytes, legacy records, and migration records. It is distinct from the old layout/setup export. The archive uses a versioned manifest with SHA-256 integrity and individual blob hashes, sizes, and MIME values. Validation checks identities, supported metadata types, asset heads, version ownership and parents, draft sources, project membership, and pinned placements before staging.

Restore stages the validated archive, then merges all supported stores in one transaction. Identical records are idempotent. Conflicting personal-work identities stop restoration; unrelated existing work is retained. Current navigation and existing Relay connection/device settings stay local; the source Relay device identity is never cloned into a fresh profile. Unapplied archive settings and both migration snapshots are retained in the restore journal.

An initialized but untouched profile already contains a desktop settings record. `validateBackup()` returns a review plan. Only when the target has no file bytes, assets, versions, jobs, personal metadata, or draft settings—and its scratchpad still exactly matches the known starter text with no custom spaces/pins/clusters—can the review offer replacement of those initial desktop settings. The user must select the review checkbox, which passes `restoreBackup(blob, { replaceBootstrapSettings: true })`. Eligibility is rechecked within the write transaction. The previous initial settings are preserved in the restore journal, and the applied workspace revision advances so the shell hydrates it. Changed notes, custom content, unknown state, or work added after review still block replacement. This is not a general overwrite option.

Tests use `fake-indexeddb` with actual Core transactions and close/reopen cycles. They cover revision conflicts, immutable history, drafts, Trash/Restore, branches, atomic output commits, cancellation, idempotency, additive legacy import, interrupted migration, full clean-database and initialized-profile restore, corrupt archives, conflicting identities, approval rechecks, independent device identity, and injected quota aborts during both output publication and staged restore. The adapter tests cover failure reporting, async hydration, and queued saves.

Limits: 150 MiB per file, 600 MiB backup envelope/expanded content, and 50,000 metadata records. Backup JSON/base64 requires memory and is not a streaming archive. Browser storage quota/eviction remains subject to the browser. Integrity checks detect corruption; this is not archive encryption or proof of a trusted sender. This is local persistence, not cloud synchronization. Complex scene/settings/carry metadata does not yet have exhaustive referential validation. A legacy file whose bytes are missing causes backup validation to fail rather than silently presenting an incomplete restore as complete.

## Day and Paperwork

Day saves events with explicit IANA zones, original wall-clock input, and UTC instants. Nonexistent daylight-saving times are rejected; repeated hours require an explicit earlier/later choice. It persists tasks and contacts and exports actual ICS events and JSON tasks/contacts. It does not send messages or synchronize external calendars/address books.

Paperwork stores actual document assets and immutable versions:

| Tool | Implemented output | Tested boundary |
| --- | --- | --- |
| Documents | Markdown source, formatted local preview, standalone HTML export | Markup escaping prevents arbitrary source HTML from executing |
| Tables | JSON table asset, arithmetic/cell references, SUM and AVERAGE, simple bar chart, calculated CSV | No `eval`; cycles, invalid references, division by zero, formula errors and CSV text injection are checked |
| Forms | Typed fields and saved response records in a JSON asset, JSON export | Required fields/types validated; only declared answers retained |
| Drafts | Revisioned settings drafts for documents/tables/forms/PDF marks | Reopen recovery and competing-tab conflicts preserve the editor value and the last accepted draft |

The everyday integration test saves events/tasks/contacts/table/document bytes, closes and reopens the database, and restores the full backup into a clean database. Calendar tests check timezone offsets, DST gaps/repeated hours, Unicode ICS line folding, and escaped line injection. There are ten everyday tests at this snapshot.

Limits: tables support up to 100 rows and 26 columns, with the implemented expression subset; this is not Excel compatibility. Forms support up to 30 fields and 1,000 responses. Documents use a limited Markdown formatter rather than DOCX import/export or a full typesetting engine. Charts are simple local bar charts. Day currently provides create/edit/complete controls but no dedicated event/contact deletion interface. There is no external calendar/contact sync or shared form response service.

## PDF qualification

The repository vendors official `pdf-lib` 1.17.1 and PDF.js 6.4.299 browser files, fonts, CMaps, WASM/ICC resources, and licenses. Engines load locally on demand. The unused QuickJS evaluator JavaScript/WASM are omitted: no scripting sandbox is shipped, neither shipped PDF module references these files, and PDF loading disables evaluation. The build mirrors the source vendor tree so removed resources cannot linger in generated output. The workbench always provides Close, reports loading/rendering/recovery failures, and can retry a rejected engine load. PDF Close and Retry await the dialog close/remove cycle before rendering or reopening, matching the shell's modal lifecycle.

- Text annotations and drawn signature strokes produce a real reopenable PDF version. The original text remains searchable in this path. A drawn signature is explicitly not a verified digital signature.
- Redaction is a separate derived export. After explicit user review, it renders every page at 144 dpi, overwrites selected pixel regions, and creates a fresh PDF from page images. It does not merely place a rectangle over the original content stream.
- The generated redacted PDF is reopened before publication. Every page must have zero text items and zero annotations, and document attachments/JavaScript actions must be absent. Original metadata and original embedded objects are not copied into the fresh document.
- The original and its history remain private local assets, including in a full private backup. Exporting a redacted copy does not erase the original library.
- Output/job publication uses the same atomic Core path as other actions.

Four tests use the actual PDF engines and `@napi-rs/canvas`, not a mocked document parser: annotation/signature output, underlying content/attachment/metadata removal, rotated-page redaction, invalid-region rejection, cancellation, and malformed input. Pixel checks confirm black redaction regions while public content remains visible. The integration agent separately confirmed the browser engine/output path. Disposable visual evidence was inspected at `/tmp/hole-pdf-qualification/annotated.png` and `/tmp/hole-pdf-qualification/redacted.png`; those temporary files are not repository assets.

Limits: 30 MiB source, 30 pages, 24 million pixels per rendered page, 16,000 px maximum edge, and 200 marks. Annotation text is 1–1,000 characters at 8–48 points in the supported Latin font. Vector annotations reject rotated pages; raster redaction handles visible page rotation. Password-protected/XFA documents are not supported. Redaction removes searchable text, forms, links, attachments, and original digital signatures and can increase output size. Users must review every intended area; readable content outside selected regions remains in the exported pixels. It is not OCR-based discovery of sensitive content, certified legal redaction, or support for every PDF feature/browser.

Official implementation references: [pdf-lib](https://pdf-lib.js.org/), [PDFPage API](https://pdf-lib.js.org/docs/api/classes/pdfpage), [PDF.js examples](https://mozilla.github.io/pdf.js/examples/), and [PDF.js API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html).

## Offline shell and update safety

The build emits a content-hashed manifest, install icons, and only `/service-worker.js`. Installation fetches required static assets into a temporary cache and verifies each length and SHA-256 hash. A version cache is marked ready only after the entire shell is present. Failed downloads/hash checks preserve the previous complete shell. Assets in an existing document remain pinned to that document's release; a missing cached asset fails explicitly rather than substituting a newer network file.

Updates do not call `skipWaiting` automatically. User Update initiates a check across all open Hole tabs. Every tab rejects open dialogs and awaits the continuity editor, extension editor, and workspace persistence flushes. The `#hole-fluid-os` root becomes inert before flushing and stays locked after acknowledgement, while the update bar remains usable. A capture guard also blocks global keyboard/input shortcuts during this pause. The previous inert state is restored after rejection/cancellation.

The worker broadcasts `HOLE_UPDATE_CANCEL` to every participating tab on refusal, acknowledgement timeout, or activation failure. A request-scoped 20-second client fallback restores editing, sends a negative acknowledgement, and suppresses late automatic reloads. Cancellation cannot be reversed by a pending flush resolving afterward. Only a still-prepared tab reloads on controller change. No update path deletes IndexedDB or private file bytes.

Twelve offline tests cover verified installation/no auto-activation, changed deployment bytes, fetch failure, safe same-version reinstall failure, per-document version pinning, missing assets, loopback opt-in, cross-tab acknowledgements, the typing lock, preserved prior inert state, rejected flushes, cancellation during flush, stale cancellation, timeout recovery, activation failure broadcasts, and deterministic builds. These are VM client/worker/cache harness tests. The separate browser test above verifies actual cached navigation when the origin server is unavailable. Neither establishes browser storage-eviction behavior or installed-app lifecycle support.

Loopback (`localhost`, `*.localhost`, 127/8, IPv6 loopback) skips service worker registration unless `?offline-test=1` is present. Previously installed Hole workers are unregistered without clearing work or forcing a reload. An already-open controlled development tab can require a manual reload after saving.

At build snapshot `f81e9461353816037944310e`, the full offline manifest contains 249 files totaling **6,848,639 bytes (about 6.53 MiB)**. Vendored engines/fonts account for 5,448,436 bytes (about 5.20 MiB). These sizes will change with source edits. Offline installation requires room for a complete staging cache and version cache, and may retain the prior release. PDF resources are included so the local engine can work without a later download. External apps, hosted providers, and network APIs remain connection-dependent and are not cached as private service responses.

## Remaining qualification

Complete the integration-agent narrow-viewport check; exercise physical network loss, browser-wide offline mode, and multi-tab update cancellation on supported browsers; test Safari/iOS installed-app storage behavior and physical touch/keyboard accessibility; and validate larger real document libraries within the stated resource limits. Clean-profile browser restore and cached entry/reload with the origin server unavailable have passed for the observed browser. Remaining master-program capabilities are tracked separately and must not be represented as complete on the basis of this evidence.
