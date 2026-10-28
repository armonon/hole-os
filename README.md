# Hole OS

**Make yourself at home.** A personal browser workspace where projects, materials, tools and unfinished thoughts stay connected.

This branch implements the 26 October overhaul against the existing plain HTML/CSS/JavaScript OS. It adds a shared file and project foundation, useful local applications, spatial presentations, and a real development collaboration service. It is a review build; the complete master program still has acceptance gates. See the [program ledger](docs/implementation/backlog.md), [contracts](docs/architecture/contracts.md), and [browser qualification](docs/evidence/release-qualification.md).

To continue the remaining program, use the [autonomous completion prompt](docs/implementation/autonomous-completion.md).

## Open and develop

- [Overhaul review build](https://6adfa58acfc5e0940a9e0685--hole-os-armonon.netlify.app/)
- [Existing production app](https://hole-os-armonon.netlify.app/)
- [Private source repository](https://github.com/armonon/hole-os)
- [Overhaul branch](https://github.com/armonon/hole-os/tree/codex/hole-os-overhaul)
- [Browser source editor](https://github.dev/armonon/hole-os/tree/codex/hole-os-overhaul)

Use Node 22.13 or newer. For local development or a GitHub Codespace on this branch:

```sh
npm ci
npm run dev
```

Open the forwarded **5173** port. To verify the source and generate the static site:

```sh
npm test
npm run build
```

Netlify publishes **only `public/`**. Source modules in `src/` are copied by the build; edit source rather than generated copies. Pushes to `main` update the existing production site through its Netlify integration. Branch previews should be qualified before merging. The private source repository requires access to the owning GitHub account.

## What is working in this build

- **Shared materials:** stable Assets, immutable AssetVersions, projects, linked or pinned placements, provenance, durable drafts, revision conflicts, recoverable Trash, and atomic job outputs. Legacy files and layouts migrate additively. New output also remains available through the existing Files app.
- **One project, several views:** Desktop, a pan-and-zoom Canvas, deterministic Smart Screen arrangement proposals with explicit apply/undo, and a CSS 3D Universe with saved coordinates, Orbit/Explore and a direct List alternative. Search and breadcrumbs provide direct access. Quiet motion and compact layouts remain available.
- **Capture and continuity:** text, links and file import; recording when the browser supports it and the user grants microphone access. Recover a text draft after reload, commit a version, compare or restore history, carry materials between projects, and keep a media player open while navigating.
- **Actions and Flow:** real image crop/resize/PNG/WebP conversion; audio trim/normalize/WAV; browser-decoded video thumbnails and audio extraction; reusable Flow runs; and a Release Asset Pack with three PNG sizes and a ZIP manifest. Jobs use pinned input versions and report actual progress, failures, cancellation and retries. Browser codec and resource limits are visible.
- **Day and Paperwork:** zoned events, tasks, contacts and ICS/JSON export; formatted documents, sheets with bounded formulas and charts, local forms/responses, and PDF annotation, drawn signatures and image-only redacted copies. PDF engines are vendored for local operation. PDF limits and destructive rasterization are disclosed before export.
- **Create and WebLab:** bounded counter/checklist/timer/calculator tools with durable state, plus versioned HTML/CSS/JavaScript projects, an isolated code preview and source ZIP export. These tools do not receive ambient access to private files or accounts.
- **Lab, Crew and Momentous:** a saved pendulum experiment with CSV output; bounded local job workflows with previews and review; and validated local tool-package install, update and rollback. No AI activity, autonomous publishing, paid transaction or arbitrary-code permission is simulated.
- **Atlas, Tongue and Rack:** offline vector cartography, local itineraries and privacy-reviewed trip export/import with deliberate OpenStreetMap handoff; browser-qualified translation, available system voices, phrase practice and manually timed subtitles; and a real browser oscillator/filter/envelope/delay instrument that exports presets and stereo WAV. Translation availability depends on the browser. Rack is explicitly a technical prototype.
- **Recovery and offline delivery:** integrity-checked private backup/restore, versioned static shell caching, and user-initiated updates that flush and protect open drafts. Loopback development disables caching unless `?offline-test=1` is supplied. The full backup contains private content; portable setup JSON remains layout-only.

Bounded native consolidations now connect Moodboard boards to editable Luma layers, Ghost garments to source-preserving Form scenes, Animate cels to ScenePilot frame cuts, and Portfolio documents to private website ZIPs in Publish. Originals and native formats remain retained; these connected workflows do not replace the full original studios. Day and Paperwork also support independent runtime windows with explicit refresh and content-safe arrangement restoration.

The existing circular App Drawer, dock recents, desktop shortcuts, Clusters, resizable legacy windows and fullscreen dock gestures remain available. Single-click opens; right-click or stationary long-press opens Quick Tools. Existing studio routes and native formats stay available until their replacements pass parity. Canonical workspace applications are not yet all independently resizable runtime windows. The [catalog](CATALOG.md) distinguishes local tools, external launchers, partial previews, concepts and explicitly future capabilities.

## Local collaboration service

The static client does not make Netlify an account or file-sync backend. Start the included **development** service separately:

```sh
HOLE_DATA_DIR=/absolute/private/data/path node server/start.mjs
```

Shared spaces can connect to `http://127.0.0.1:8787` (or `http://localhost:8787`). The service implements actual accounts, expiring sessions, recovery, roles, invitations, version-scoped content grants, revocation, presence, bounded sync and curated public manifests. The UI transfers selected file versions and restores authorized copies. Complete bidirectional application-state sync and all public publishing controls remain unfinished.

Production Relay needs an approved HTTPS destination, durable storage, deployment operations and identity/email configuration. Its private data directory must stay outside the published site. See [service contracts and limits](docs/architecture/service.md) and [bridge qualification](docs/compatibility/bridges.md). NOW/Circle and other provider integrations still need their upstream contracts.

## Data and trust

Local work lives in this browser's IndexedDB and workspace storage. Export a full private backup before clearing site data or moving to another origin. The production site, a preview URL and localhost each have separate browser storage. A source-code push does not sync someone's files.

Welcome is a public start screen, not an authentication lock. Vault has a [threat model and security qualification gate](docs/architecture/vault-security-gate.md), not a disguised folder advertised as encryption. Browser downloads do not run native Windows/macOS/Linux executables or AU/VST plugins.

## Verification and remaining acceptance

The test suite exercises production code, real IndexedDB transactions, failures/conflicts, codecs, permissions, service HTTP requests, gesture cancellation, draft recovery, package validation and offline update coordination. The [release record](docs/evidence/release-qualification.md) separates actual browser output checks from source-level or simulated transport tests. It also records the desktop and 320px layout checks.

Physical touch devices, screen-reader sessions, measured large-scene performance and formative sessions with actual people remain acceptance work. Hosted-service operation and complete studio feature/device matrices require additional qualification. These are tracked requirements, not completed claims.

Historical regression evidence remains in [window recovery](VERIFICATION.md), [file workflows](FILE-WORKFLOW-VERIFICATION.md), [portable setup](PORTABLE-SETUP-VERIFICATION.md), [Clusters](CLUSTERS-VERIFICATION.md), and [file history](FILE-HISTORY-VERIFICATION.md).

## Engine and integration gates · 26 October 2026

The overhaul contains real local image/audio/video actions, an original Web Audio Rack prototype, and an engine-level Luma bridge round trip. The following work remains explicitly unfinished; a launcher, source adapter or prototype does not complete it:

- **Local media:** pinned MODNet cutout/mask, bounded WebCodecs video trim, HTDemucs four-stem separation and Whisper tiny.en speech/captions now execute with real output/source-lineage/cancellation evidence. Stems and speech require explicit verified model installation, separate from workspace backups; audio stays local. Caption edits have native versions and recovery. These bounded Chromium fixtures do not establish perceptual quality, all languages/codecs, Safari or physical-device performance.
- **Key/BPM analysis:** original experimental PCM estimators return ranked periods/keys, alternatives, ambiguity and analyzed coverage. They do not provide calibrated confidence or native/corpus accuracy. Silence/short/weak tonal evidence can be rejected.
- **Connected retained studios:** actual mounted native Luma, Glyph, Form, ScenePilot and portable StemDeck browser journeys now have save/reopen/recovery/output evidence. Their bounded connected surfaces do not replace the full original tools. Complete feature parity, consolidation and browser/device matrices remain required; retained routes stay available. See [studio parity](docs/compatibility/studio-parity.md).
- **Sattari Rack production integration:** the local prototype produces real Web Audio sound and offline WAV, with versioned `.hole-rack.json` assets. It does not yet provide StemDeck session integration, polyphony, MIDI/MPE, arbitrary patch routing, timeline automation, native plugin preset compatibility or native DSP parity. The product recommendation is a Rack mode inside StemDeck.
- **Native applications and plugins:** ordinary browser downloads do not run Windows/macOS/Linux executables or host AU/VST plugins. That requires a real, authorized native/remote host with isolation, transport, lifecycle and device qualification; none is supplied by the local Web Audio prototype.

See the [retained studio parity ledger](docs/compatibility/studio-parity.md), [bridge contracts](docs/compatibility/bridges.md), [media engine boundaries](docs/evidence/media-actions.md), and [Universe limits and verification gates](docs/evidence/universe.md). Browser codec availability, physical touch/accessibility testing and measured large-scene performance remain separate acceptance checks.
