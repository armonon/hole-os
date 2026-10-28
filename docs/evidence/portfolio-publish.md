# Local Portfolio → Publish adapter

Reused the actual owned Portfolio template engine from portfolio-studio revision `ae9a10e30204bcb9771272a48dc34a887b478693`, with unchanged renderer/types/data-URL source and a reproducible browser bundle. The source files match that commit with no local modifications. No open-source license is asserted for owned application code. Copies, hashes and provenance are in `src/vendor/portfolio/`. No original repository files or original Portfolio route changed.

## Actual operation

`HolePortfolio.mount(host,{core,projectId,inputs,onOpen})` is async and returns `{open(assetId,versionId), async dispose()}`. Root owns the Publish mount and calls/awaits dispose when leaving. The module lists local native portfolios, creates blank or selected-version documents, imports `.portfolio`, edits artist/bio/template/project text/links, adds projects and supported local media, saves immutable versions and prepares private ZIP assets. A 200 ms per-edit draft is durable independently of version saves. Reload recovers it against its original base version. Save/flush errors retain the editor and source; dispose rejects so navigation can remain blocked until the failure is resolved. The host must honor that rejection.

Native format remains Portfolio `version:1` with `artistName`, `bio`, `templateId`, `links`, `projects` and embedded media data URLs. Unknown JSON fields survive editing, drafts, commits and export. The upstream parser was not reused because it reconstructs known fields and loses extensions. Unsupported media is retained in native source and refused explicitly for preview/website export; it is never silently dropped or fetched.

Supported website media: PNG, JPEG, WebP, GIF, MP4 and WebM embedded as base64 with matching declared MIME. Native files are bounded to 32 MiB, exported media 20 MiB total, 100 projects, 100 links, 200 media; selected-source creation accepts at most 99 exact-version inputs. Those limits constrain bytes/entries, not decoded browser image/video memory. No browser decoding or transcoding is claimed; media bytes are copied exactly. Unsupported models/SVG remain editable native data but this adapter cannot export them. The existing full Portfolio route remains available.

The original Minimal Grid, Editorial Stack and Sidebar Bio renderers produce the actual website HTML. The wrapper normalizes project anchor IDs only in a temporary render copy, uses safe generated asset filenames, rejects duplicate media IDs and external/data/javascript media URLs, and accepts only deliberate HTTPS hyperlinks without credentials. Native IDs and unknown fields remain unchanged. Links use `noopener noreferrer`. Local preview is opt-in in an empty-sandbox iframe with a restrictive embedded CSP; no scripts, host access or external resources. Exports contain no injected script or external runtime for the supported subset.

## Output and lineage

Explicit Prepare saves the current edit first and exports that exact immutable native version. The ZIP contains real `index.html`, relative `assets/media-N.ext`, `portfolio.portfolio`, `manifest.json`, and a README explaining that packaging is not hosting. The manifest records native source asset/version/hash, engine revision, template and each embedded media's exact byte count/SHA-256. The new ZIP's Core parent is the exported native version. When a document is created from selected Core media, its creation-version parents are those exact selected versions and its provenance records their IDs/hashes; later native edits preserve that chain. Original selected media is never modified. Imported external native documents have no fabricated local media source references.

No network upload, hosting, sharing, account change or automatic publishing occurs. ZIP/source/manifest are ordinary private Core assets until the user deliberately exports them.

## Qualification

- `node --test tests/portfolio.test.mjs`: 6/6 pass. Retained engine/source hash pins, all three original templates, escaped text and safe anchors, exact media bytes/hash, unknown native fields, unsupported media retention/refusal, unsafe URL rejection, duplicate/cap rejection, true ZIP signature and immutable parent lineage.
- `node scripts/verify-portfolio-browser.mjs`: PASS in Chromium 156.0.8078.48 on actual localhost:5193 shell using owned module source overrides. No remote requests or page errors.
- Created from a real 3×2 PNG, edited artist/bio/project/template, waited for durable draft, reloaded/reopened, recovered edits, saved version and previewed the actual Editorial renderer. Prepared ZIP; parsed its local ZIP headers and all entries. Exact 93-byte original PNG survived; manifest source version/hash matched saved native version; selected source→native version→ZIP parents were correct. Original source hash remained unchanged. A javascript link was rejected without producing another ZIP.
- Injected Core saveDraft failure: unsaved text stayed visible; dispose rejected while editor remained attached; after restoring storage, dispose persisted the latest edit and unknown imported native fields unchanged.
- Run `HOLE_QA_SOURCE_OVERRIDE=0 node scripts/verify-portfolio-browser.mjs` after root's build to qualify the actual Publish mount. No shared build, commit or deployment was performed by this component worker.

This is a bounded local native editor and true static-site package; it does not claim the standalone Portfolio application's complete authoring/media/PDF feature set or remote publication.

## Built Publish and lifecycle qualification (2026-10-28)

`HOLE_QA_SOURCE_OVERRIDE=0 node scripts/verify-portfolio-browser.mjs` now passes against the rebuilt actual Publish integration at localhost:5193 in Chromium 156.0.8078.48. This includes the create/edit/draft/reload/template/ZIP inspection and persistence-refusal checks above, with no source overrides, no remote HTTP(S) requests and no page errors. Same-origin blob image previews are local resources, not external requests.

Explicit `open(assetId,versionId)` now opens that immutable version read-only and does not query/recover another draft. Text, template, media and save controls cannot edit it; export pins the selected version. `open(assetId)` remains editable and recovers the durable draft against its original base. Internal new/import flows use the editable form. The browser regression proves a selected saved version remains distinct from a newer draft, exporting does not change the head or draft, and reopening without a version recovers that draft.

The actual object-page Open in Publish Portfolio button was exercised with an explicit pinned version; the exact saved source appeared read-only. The object-page Recover draft control opened the editable draft. Invalid editor JSON caused root navigation to reject before removing the editor or changing its text; repairing it allowed subsequent export/navigation. The actual Open prepared portfolio ZIP button successfully navigated to the saved ZIP object.

`onOpen` is intentionally outside the editor's tracked `operation`: root navigation awaits dispose, and dispose awaits active operations. Tracking the navigation callback itself would create a circular wait. The callback has independent rejection handling instead. A browser callback regression first rejects navigation (source remains visible), then awaits dispose successfully; the actual root callback also completes without deadlock. Root must continue awaiting dispose before navigation, render replacement and close.

The built qualifier also checks a 320×800 viewport: document scroll width is exactly 320 px, every Portfolio input/select/textarea/button stays within its 292 px panel, keyboard typing persists a draft, and Tab moves from artist name to bio. No additional narrow-screen CSS was needed for these controls.
