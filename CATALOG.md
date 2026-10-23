# Hole app capability audit

Reviewed 2026-10-23 against the implemented shell and modules at baseline `5e70e95`, plus the public Creating Co pages below. The registry in `src/capabilities.js` explicitly covers all 52 actual launcher entries. Tests compare its names to the shell and ecosystem source so new tiles cannot silently inherit an invented capability.

## What the categories mean

- **Local utility**: useful behavior runs in Hole in this browser, within the stated limits.
- **External app**: Hole opens a different destination in a separate tab. A public description is not evidence of embedded operation, automatic file transfer or successful processing.
- **Partial preview**: a limited sample interface exists; the expected full application does not.
- **Concept**: the tile opens an explicitly labeled concept window, without the named app's working features.
- **Future capability**: the visible system concept has no connected computer or execution service.

Counts: 3 local utilities, 16 external launchers, 2 partial previews, 28 concepts and 3 future capabilities.

## Every launcher entry

| Entry | Classification | Actual Hole scope or limitation |
| --- | --- | --- |
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
| Calendar | Concept | No calendar connection or event management. |
| Studio | Concept | No studio tools in this tile. |
| Camera | Concept | No camera capture. |
| Maps | Concept | No map or location service. |
| Mail | Concept | No connected inbox. |
| Tasks | Concept | No task manager. |
| Phone | Concept | No calling service. |
| Weather | Concept | No forecasts. |
| Recorder | Concept | No audio recording. |
| Canvas | Concept | No drawing tools; distinct from other Creating Co tools with the same name. |
| Calculator | Concept | No calculations. |
| Contacts | Concept | No address-book connection. |
| Books | Concept | No reader in this tile; distinct from Librarian. |
| Terminal | Concept | No commands or shell execution. |
| Store | Concept | No install or purchase workflow. |
| Settings | Concept | This tile is a concept; the separate Control Center does provide working preferences. |
| Compass | Concept | No device-heading input. |
| Translate | Concept | No translation service. |
| Drive | Concept | No cloud storage or synchronization. |
| Meet | Concept | No meeting or video service. |
| Code | Concept | No code editor or execution. |
| Docs | Concept | No document editor. |
| Wallet | Concept | No accounts, payments or funds. |
| Shortcuts | Concept | No automation execution. |
| Health | Concept | No health-record or device connection. |
| Play | Concept | No included playable game. |
| Home | Concept | No home-device connection. |

Implementation evidence: `src/hole-fluid-os.html` lists the base apps and defines their window bodies; `src/ecosystem.js` supplies 15 external destinations; `src/browser.js` replaces the Browser concept with an external launch surface; `src/file-platform.js` provides the working Files implementation. Control Center is implemented by `src/welcome.js`, not by the Settings tile.

## External capability evidence

These are publisher declarations and public-page observations, not a claim that this audit ran every processor or validated every codec.

| Destination | Evidence relevant to file workflows |
| --- | --- |
| [Luma](https://thecreatingco.com/products/luma/) | Declares PNG, JPEG, WebP, GIF, SVG, `.luma` and font inputs. Browser image export includes PNG/JPEG/WebP and editable `.luma` projects. RAW, printing and Photoshop interchange have edition-specific limits. Optional hosted edits can send selected image data to a service. |
| [Bounce](https://thecreatingco.com/products/bounce/) | Declares audio inputs, a browser queue, EQ and playlist listing export. Browser codecs determine playback. This does not establish processed-audio export; native tag reading and the desktop audio engine are separate. |
| [Librarian](https://thecreatingco.com/products/librarian/) | Declares PDF input and browser reading. Catalog search needs network access; AI features may send questions and shelf context to a service. No edited-PDF export is established. |
| [Glyph](https://thecreatingco.com/products/glyph-studio/) | Public font-editing alpha with `.glyph` projects and OTF/TTF exports. Kerning export is described for TTF; browser autosave is not backup. |
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

Matching MIME metadata indicates an eligible route, not certified decoding. Missing, nonfinite, fractional or negative size metadata is rejected. No catch-all image/audio route, filename-only inference, HTML editor or script execution is introduced by the registry.

External opening must not automatically upload bytes, put private content in a URL, or count as a completed processing job. A returned file should be a separate record linked to its source, with the chosen app and time recorded. A user-declared result is provenance information, not proof that a remote service actually processed it.

## Reachability and validation limits

Web extraction read the actual Locker and Converter pages. Moodboard and Portfolio returned their app titles without extractable runtime text. The web tool could not read the Luma, Bounce, Librarian, Glyph, Form, ScenePilot, StemDeck, Ghost, Animate or NOW runtime destinations; Circle timed out. Their official detail pages were readable. These are retrieval limitations, not proof the apps are offline.

No upload, account creation, external processing or cross-origin transfer was performed by this catalog audit. No automatic transfer API was established. The previously blocked Chrome local-file chooser was not retried and its permissions were not changed. Physical touch, Safari, real trackpad, setup-import round trip and fresh external-result download/import validation remain separate outstanding checks.

The bounded useful slice is Notes → a real text original in Files → local editable copy → separate saved result/history/download. It can be exercised through supported browser controls without the blocked file chooser. External launch routes are supplementary manual workflows, with their limits displayed.
