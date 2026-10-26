# Hole app capability audit

Updated 2026-10-26 against the local overhaul source and `src/capabilities.js`. The registry covers **68 entries**; tests compare its names to the shell and ecosystem source. This audit describes the pending local implementation, not a declaration that it has already been published to the live Netlify site. The external public-page observations below are retained from the 2026-10-23 audit at baseline `5e70e95`; they were not rechecked as live product behavior in this update.

## What the categories mean

- **Local utility**: useful behavior runs in Hole in this browser, within the stated limits. Relay is a local client surface whose account/transfer operations require the separately running backend; Tongue translation additionally requires a compatible browser engine.
- **External app**: Hole opens a different destination in a separate tab. A public description is not evidence of embedded operation, automatic file transfer or successful processing.
- **Partial preview**: a limited sample interface exists; the expected full application does not.
- **Concept**: the tile opens an explicitly labeled concept window, without the named app's working features.
- **Future capability**: the visible system concept has no connected computer or execution service.

Counts: **19 local utilities/client surfaces, 16 external launchers, 2 partial previews, 28 concepts and 3 future capabilities**. The installed App Drawer and shell search expose local/external entries. Partial previews, concepts and future entries remain explicitly classified in the catalog; they do not become working apps because another Hole surface implements a related feature. Existing placements or pinned shortcuts may still reach legacy previews.

## Every launcher entry

| Entry | Classification | Actual Hole scope or limitation |
| --- | --- | --- |
| Projects | Local utility | Spaces/projects, shared asset membership, linked or pinned placements, object previews, durable text drafts, search and return paths. Flat, Canvas, Smart Screen and Universe are views of the same material. |
| Day | Local utility | Local zoned events, tasks and contacts; actual ICS/JSON exports. Explicit daylight-saving handling; no external calendar or address-book synchronization. |
| Capture | Local utility | Text, links, files, pasted images and supported, user-initiated microphone recordings into a project or Inbox. Browser permissions and codecs apply. |
| Paperwork | Local utility | Markdown documents/HTML export; bounded tables/formulas/bar charts/CSV; local forms/responses; actual PDF annotations, drawn signatures and image-only redacted exports. See engine limits below. |
| Actions | Local utility | Typed image crop/resize/conversion; browser-decoded audio trim/peak normalization/WAV; video thumbnails and supported-container audio extraction; reusable Flow recipes and Release Asset Pack ZIP. No Cutout, stems, key/BPM or transcription engine. |
| History | Local utility | Immutable content versions, restore as a new version, branch, and placement arrangement checkpoints. Restoring an arrangement does not roll back file bytes or reopen every app. |
| Create | Local utility | Forge creates real bounded counters, checklists, timers and calculators; saved instruments retain project/navigation references. No general AI-generated app engine or arbitrary resource grants. |
| Publish | Local utility | Prepare/download real release files and ZIP packages. The work surface does not deploy websites or expose private projects publicly. |
| WebLab | Local utility | Saved HTML/CSS/JavaScript projects, durable drafts, isolated previews and source ZIP export. Existing website checkup opens the separate WebLab service. No automatic hosting. |
| Lab | Local utility | A nonlinear pendulum experiment with visible assumptions, saved state/sample data and CSV export. No general science engine or engineering certification. |
| Atlas | Local utility | Saved places, coordinates, itinerary dates/zones, related material, Day event creation and JSON export; deliberate OpenStreetMap handoff. No embedded map, geocoding, offline map tiles or computed routes. |
| Tongue | Local utility | Saved authored/actually translated phrases, written-answer practice, available local speech voices, manual subtitle timing and valid SRT export. Translation is feature-detected and requires a compatible on-device browser model; no fabricated fallback or automatic transcription. |
| Crew | Local utility | Inspect and execute a saved local Actions flow with a pinned input, size/step budget and cancellation. No language-model provider, autonomous network actions or publishing grants. |
| Momentous | Local utility | Review/install compatible bounded tool manifests; updates retain a rollback version. No arbitrary executable installation, purchase/payment service or native app runtime. |
| Relay | Local utility / service client | Connect deliberately to the separate local account service; real accounts, project upload/authorized-version restore, durable queues, invitations, revocation and expiring presence. No production endpoint is configured; this is not continuous account-wide synchronization. |
| Rack | Local utility / technical prototype | Original Web Audio oscillator/filter/envelope/LFO/delay instrument, versioned `.hole-rack.json` presets and actual offline stereo WAV render. No AU/VST hosting, native Sattari preset parity or completed StemDeck integration. |
| Notes | Local utility | Browser-saved scratchpad with separate text snapshots saved to Files. |
| Files | Local utility | IndexedDB files, text creation/editing as separate versions, supported previews, history and real raster conversion. |
| Clock | Local utility | Local time captured when opened; not a continuously updating clock. |
| Music | Partial preview | Soundless playback interface; user audio can be played through Files. |
| Photos | Partial preview | Sample color gallery; user images can be previewed through Files. |
| Browser | External app | Opens the existing [Hole workspace](https://thecreatingco.com/community/hole); no embedded browser or query handoff. |
| Luma | External app | Separate image editor; see evidence below. |
| Glyph | External app | Separate font editor, distinct from the experiment inside Luma. |
| Form | External app | Separate browser 3D/CAD studio. |
| ScenePilot | External app | Separate Browser Lite video editor. |
| StemDeck | External app | Separate stem-remix studio; no Hole stem separation. |
| Bounce | External app | Separate browser audio player. |
| Librarian | External app | Separate PDF reader and book discovery. |
| Locker | External app | Separate browser-local library, with a different storage origin. |
| NOW | External app | Separate messaging service. |
| Circle | External app | Separate community service. |
| Ghost | External app | Separate garment-visualization app. |
| Moodboard | External app | Separate reference canvas. |
| Animate | External app | Separate animation alpha. |
| Portfolio | External app | Separate portfolio builder. |
| Converter | External app | Separate conversion app; Hole's built-in raster conversion remains a different utility. |
| Windows | Future capability | No connected Windows computer, native runtime or remote stream. |
| Linux | Future capability | No connected Linux computer, native runtime or remote stream. |
| Mac | Future capability | No connected Mac computer, native runtime or remote stream. |
| Messages | Concept | No messaging in this tile; distinct from NOW and Circle. |
| Calendar | Concept | This legacy tile has no calendar connection or event management. Day provides local events. |
| Studio | Concept | No studio tools in this tile. |
| Camera | Concept | No camera capture. |
| Maps | Concept | No map or location service in this tile. Atlas provides local place records and explicit map handoff. |
| Mail | Concept | No connected inbox. |
| Tasks | Concept | This legacy tile has no task manager. Day provides local tasks. |
| Phone | Concept | No calling service. |
| Weather | Concept | No forecasts. |
| Recorder | Concept | No recording in this tile. Capture provides supported user-initiated voice recording. |
| Canvas | Concept | No drawing tools in this legacy tile; distinct from project Canvas placement/navigation and external Creating Co tools. |
| Calculator | Concept | No calculations in this tile. Create can build a bounded four-operation calculator. |
| Contacts | Concept | No address-book connection in this tile. Day provides local contact records. |
| Books | Concept | No reader in this tile; distinct from Librarian. |
| Terminal | Concept | No commands or shell execution. |
| Store | Concept | No install or purchase workflow in this tile. Momentous installs its bounded tool format; it does not provide commerce. |
| Settings | Concept | This tile is a concept; the separate Control Center does provide working preferences. |
| Compass | Concept | No device-heading input. |
| Translate | Concept | No translation service in this tile. Tongue offers an explicitly conditional browser translation path. |
| Drive | Concept | No cloud storage or synchronization. |
| Meet | Concept | No meeting or video service. |
| Code | Concept | No editor in this legacy tile. WebLab provides isolated web source projects. |
| Docs | Concept | No editor in this legacy tile. Paperwork provides the implemented document tools. |
| Wallet | Concept | No accounts, payments or funds. |
| Shortcuts | Concept | No automation in this legacy tile. Actions/Flow provides the bounded local recipe engine. |
| Health | Concept | No health-record or device connection. |
| Play | Concept | No included playable game. |
| Home | Concept | No home-device connection. |

Implementation evidence: `src/hole-fluid-os.html` lists base apps, installed filtering and legacy bodies; `src/ecosystem.js` supplies 15 external destinations; `src/browser.js` provides Browser's external launch surface. `src/continuity.js` routes the 16 new local entries; `core.js`, `actions.js`, `everyday.js`, `pdf-tools.js`, `extensions.js`, `world-tools.js`, `rack.js` and `relay.js` provide their actual behaviors. Control Center is implemented by `src/welcome.js`, not the Settings tile.

## Capabilities shared throughout the OS

| Capability | Implemented contract | Exact boundary |
| --- | --- | --- |
| Assets and storage | Stable asset IDs, immutable version bytes, source lineage, revision conflicts, durable drafts, recoverable Trash and additive legacy import | Browser-local IndexedDB is not encrypted storage or account sync. Storage failure stays visible; originals are retained. |
| Full backup | Integrity-checked manifest/bytes, validation, staged atomic restore, idempotent identical records and rejection of conflicting identities | A private JSON/base64 backup contains actual content. Setup/layout export remains separate and does not back up files. Backup is not encryption or a streaming archive. |
| Actions / Flow | Pinned inputs; typed verbs; real progress/cancel/retry; idempotency; atomic output/job commit; per-step durable runs | Browser decoders determine supported media. Native decode calls may finish before cancellation can discard their output. No unregistered processor is implied. |
| Release Asset Pack | Explicit focal point/crop and upscale consent; real 3000×3000, 1080×1920 and 1200×630 outputs plus ZIP/manifest | Aspect ratio is cropped rather than stretched. Originals/history remain; export does not publish. |
| Carry and links | Shared asset references, project placement links and pinned approved versions | Moving or arranging a link does not move/delete original file bytes. Carry is local. |
| History / Time | Content inspection, new-version restore, branching and saved position checkpoints | Content and layout are independent. Checkpoints are not full running-computer snapshots. |
| Canvas / Smart Screen | Place shared cards with pan/zoom and explicit Arrange; preview an intent, Apply and Undo positions | Smart Screen uses local arrangement rules, not an AI layout engine. File content is unaffected. |
| Universe | Actual x/y/depth CSS 3D projection; Orbit/explicit Explore; themes, lighting cues, view presets, direct material opener and accessible List/Flat | Maximum 30 spatial cards; same assets/DOM. Reduced motion forces a stable list. No furniture/physics engine; upstream large-library performance and device measurements remain gates. |
| Runtime and studio bridge | Stable app instances, scoped origin/source/nonce/resource/operation grants, revocation, write ACK after Core commit and retry idempotency | Installable SDK and local engine qualification do not connect deployed studios automatically. See retained studio ledger. |
| PDF tools | Real vector text/ink annotations; derived image-only PDF redaction; actual bytes reopened for structural validation before output commit | 30 MiB/30 pages, 24 MP per page, 200 marks. Redaction removes searchability/forms/links/original signatures; users must choose/review regions. Drawn ink is not a verified digital signature. Password/XFA and general PDF parity are unsupported. |
| Offline shell | Versioned complete static cache, integrity verification, per-document release pinning and explicit update with editing/flush checks across tabs | External apps/services still need a connection. Browser network-offline cold start, mobile installation/storage behavior and device matrix remain separately qualified. |
| Shared service / Relay | Real local HTTP accounts/sessions/recovery, scoped version access, queues, conflicts, roles, invitations, revocation and presence; API also implements pinned guest/public World manifests | Separate loopback backend, not part of Netlify static deployment. UI is explicit upload/restore, not continuous bidirectional merge. Guest/World API coverage is not a shipped public publishing UI or production hosting. |

Document/table limits and PDF evidence are in [storage and everyday qualification](docs/evidence/storage-everyday.md). Media action limits are in [media evidence](docs/evidence/media-actions.md); spatial limits are in [Universe evidence](docs/evidence/universe.md); account/service gates are in [service architecture](docs/architecture/service.md).

## Retained studios and native execution

The existing external launch routes remain. Source inspection identifies `.luma`, `.glyph.json`, `.form`, `.cut` and portable `.sattari` contracts. Luma's actual production editing engine passed PNG open/crop/save and native `.luma` edit/save/reopen through Hole's SDK/Core using simulated transport. That is concrete engine evidence, not an enabled production browser connection. Mounted studio controls, real origin/opener policies, broader feature parity and each studio's authorized release remain gates. Other retained studio adapters have not passed an equivalent Hole browser round trip. See the [source/parity ledger](docs/compatibility/studio-parity.md) and [bridge contract](docs/compatibility/bridges.md).

Rack is recommended as a mode inside the existing StemDeck studio after integration qualifies. Its current browser prototype is separate from the GPLv3 native Sattari JUCE/AU/VST engine; that native code was not copied into Hole. Downloading a Windows/macOS/Linux executable or an AU/VST plugin does not make it run in the browser. Native application/plugin hosting remains future work requiring a real native or remote execution service, permissions and isolation.

No credential Vault is enabled. Accounts, a start screen, a hidden folder and ordinary browser storage do not establish a password manager, encryption or E2EE. The [Vault qualification gate](docs/architecture/vault-security-gate.md) remains unmet.

## External capability evidence

These are historical publisher declarations and public-page observations from 2026-10-23, not a claim that this update ran every external processor, revalidated live services or checked every codec. The local source ledger above records newer format evidence where available.

| Destination | Evidence relevant to file workflows |
| --- | --- |
| [Luma](https://thecreatingco.com/products/luma/) | Declares PNG, JPEG, WebP, GIF, SVG, `.luma` and font inputs. Browser image export includes PNG/JPEG/WebP and editable `.luma` projects. RAW, printing and Photoshop interchange have edition-specific limits. Optional hosted edits can send selected image data to a service. |
| [Bounce](https://thecreatingco.com/products/bounce/) | Declares audio inputs, a browser queue, EQ and playlist listing export. Browser codecs determine playback. This does not establish processed-audio export; native tag reading and the desktop audio engine are separate. |
| [Librarian](https://thecreatingco.com/products/librarian/) | Declares PDF input and browser reading. Catalog search needs network access; AI features may send questions and shelf context to a service. No edited-PDF export is established. |
| [Glyph](https://thecreatingco.com/products/glyph-studio/) | Public font-editing alpha with native projects and OTF/TTF exports. The current inspected source uses `.glyph.json`; earlier public copy called the format `.glyph`. Kerning export is described for TTF; browser autosave is not backup. |
| [Form](https://thecreatingco.com/products/form/) | Browser 3D/CAD alpha with declared `.glb`, `.stl`, `.obj`, `.ply`, `.usd` and `.usda` inputs. Manufacturing and measured-fit claims require independent checks. |
| [ScenePilot](https://thecreatingco.com/products/scenepilot/) | Browser Lite declares media, image, LUT and subtitle inputs. Editable cuts need source media/relinking. A documented MP4 example does not qualify every codec/export path. |
| [StemDeck](https://thecreatingco.com/products/stemdeck/) | Stem mixing and arrangements, with `.sattari` project download described. Prepared stems do not establish live source separation; capture capabilities vary by edition. |
| [Locker](https://thecreatingco.com/locker/) | Actual page exposes add/drop, preview/details, rename, download and manifest export for browser-local files. It explicitly does not provide cloud/account sync. Connection-window wording does not establish a tested Hole transfer protocol. |
| [NOW](https://thecreatingco.com/products/now/) | External messaging public alpha with sign-in/account limits. Guest state can be lost with browser data; media upload requires sign-in; messages are not end-to-end encrypted. |
| [Circle](https://thecreatingco.com/products/circle/) | External profiles, projects and discussions. Contribution features may require sign-in. No file-import format is declared, and this is not original-file backup. |
| [Ghost](https://thecreatingco.com/products/ghost/) | PNG/JPEG/WebP references and `.ghost`/`.ghostbatch` projects; GLB and editable-project export described. Visual models are not measured fit or sewing patterns; Mac early access is a separate edition. |
| [Moodboard](https://thecreatingco.com/products/moodboard/) | Browser reference canvas alpha. No qualified input/export format list was established; verify persistence in the workspace. |
| [Animate](https://thecreatingco.com/products/animate/) | Frame/tween animation alpha. Save/export behavior and input coverage require checking in the actual workspace. |
| [Portfolio](https://thecreatingco.com/products/portfolio/) | Browser portfolio builder/export alpha. No qualified input list was established. Export alone does not publish a site. |
| [Converter](https://thecreatingco.com/forma/) | Actual page describes on-device conversion and individual/ZIP downloads. Raster outputs include PNG/JPG/WebP/PDF; animation becomes a still frame and JPEG loses transparency. Codec and size limits vary by path; native projects may provide guidance only. |

The public [Creating Co catalog](https://thecreatingco.com/) corroborates the destinations and distinguishes browser tools from native editions.

## Conservative Open with routes

| Route | Input allowed by this Hole registry | Meaning |
| --- | --- | --- |
| Text editor | `text/plain`, `text/markdown`; at most 262,144 bytes | Local text-version editing, preserving the source. |
| Luma | `image/png`, `image/jpeg`, `image/webp` | Manual separate-app image workflow. Other declared Luma formats are not enabled by this phase. |
| Bounce | `audio/mpeg`, `audio/wav`, `audio/x-wav` | Manual playback handoff, not audio processing. |
| Librarian | `application/pdf` | Manual reading handoff, not edited-PDF generation. |

These are the conservative legacy Files → Open with routes, not a complete list of the new in-Hole tool surfaces. Matching MIME metadata indicates an eligible route, not certified decoding. Missing, nonfinite, fractional or negative size metadata is rejected. This routing registry does not infer a format from a filename or grant arbitrary execution. WebLab's separate, explicit source editor/isolated preview is described above.

External opening must not automatically upload bytes, put private content in a URL, or count as a completed processing job. A returned file should be a separate record linked to its source, with the chosen app and time recorded. A user-declared result is provenance information, not proof that a remote service actually processed it.

## Historical reachability and current validation limits

During the 2026-10-23 audit, web extraction read the actual Locker and Converter pages. Moodboard and Portfolio returned their app titles without extractable runtime text. The web tool could not read the Luma, Bounce, Librarian, Glyph, Form, ScenePilot, StemDeck, Ghost, Animate or NOW runtime destinations; Circle timed out. Their official detail pages were readable. These are historical retrieval limitations, not proof the apps are offline today.

This catalog update performed source/evidence review only and did not send messages, publish private material or modify external apps. The broader local implementation has automated real HTTP account/transfer and SDK/Core tests, and integration-agent browser checks of local actions, PDF output and Relay upload/restore. Those results do not establish a deployed studio bridge, upstream NOW/Circle integration, production account hosting or native execution. Physical touch, Safari, real trackpad and browser/device-specific checks remain separate acceptance work.

Outstanding executable engines are image Cutout, stem separation, validated key/BPM analysis and automatic transcription/captions. Tongue's manual subtitle export is not transcription. Maps/geocoding/routing, paid providers, public hosting, continuous collaborative sync and retained studio consolidation likewise require their stated integrations. The catalog must continue distinguishing implemented paths from these gates as work progresses.
