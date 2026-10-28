# Hole OS feature audit — 28 October 2026

**Result: the complete master program is not implemented or qualified yet.** Substantial working features exist; a passing suite does not close the remaining requirements. This audit reviewed all **38 implementation rows and eight acceptance/delivery rows** in the [ledger](../implementation/backlog.md), against the [master brief](../implementation/master-build-brief.txt), current source and recorded evidence.

Starting revision: `8361b32` on `codex/hole-os-overhaul`, clean and aligned with the fetched remote. Changes from this audit repair text recovery, refresh capability descriptions/classifications, and correct two stale browser selectors. They do not add the missing studio, social, sync or Vault implementations.

## Fresh verification

- `npm test`: **659 passed, zero failures/skips**, before and after the fixes.
- `npm run build`: passed; generated assets retained. No dev watcher wrote concurrently.
- **25 distinct browser scripts** ultimately passed across the initial audit and targeted final replays, using Chrome `156.0.8078.48` with disposable storage. Ten scripts were replayed after the fixes with source overrides explicitly disabled; the new text regression also uses generated assets. The initial suite's only failure was a stale Librarian selector, repaired and replayed successfully. Exact script results and artifact hashes are in [the audit receipt](feature-audit-20261028.json).
- Fresh workflows include Carry → Flow → pinned Publish export; two dirty native studios across Desktop/Canvas/Smart/Universe; semantic return anchors; Smart compositions/Crew budgets; Paperwork formats and independent windows; Luma selection/native exports; Glyph kerning; Form seams/DXF; ScenePilot split/source clocks; StemDeck PCM transport; PDF reading/notes/audio continuity; collections; two-profile Relay conflicts/sharing; Lab/memory; packages; isolated script deadlines; Tongue lessons; press-kit bytes; initial-window/unload protection; and keyboard/reflow at 100%, 200% and 400% browser zoom.
- These checks qualify their named paths. They do not test every original studio tool, all media/model quality, a physical phone, real microphone/audio output, a screen reader, Safari, or real participants. Existing model inference/backup/offline proofs remain revision-scoped historical evidence; they were not all rerun here.

## Repairs made during this audit

1. **Text before durable storage:** immediate/failed draft writes previously allowed unload without warning. Pending or failed text now protects unload; an acknowledged durable draft releases the warning.
2. **Text commit followed by failed close:** the editor previously retained its old base and consumed draft after a successful commit. It now retains the acknowledged version as its next edit base, resets the draft identity and can save subsequent edits without conflict. Concurrent Done requests share one finish operation, preventing competing commits. The generated-browser regression checks actual IndexedDB versions, parents, retained text, reload and injected failure paths: [test](../../scripts/verify-text-recovery-browser.mjs).
3. **Stale reader checks:** the Libraries and accessibility scripts referenced `.hc-reader`; the actual session uses `.hc-reader-session`. Corrected selectors still require a rendered PDF canvas, real reading state and working keyboard/reflow paths. The app was rendering; the previous test failure did not establish a PDF regression.
4. **Capability descriptions:** Browser, Bounce and Librarian now classify as local working surfaces. Registry totals are **22 local, 13 external, two partial previews, 28 concepts and three future entries**. Updated descriptions expose the implemented Atlas map, Lab instruments, compositions, packages and local media paths without claiming full parity. Legacy external studio routes stay retained. A tile or catalog entry remains separate from feature completion.

## Implementation coverage and unfinished scope

“Bounded” below means a real supported path exists, with tests/evidence. “Partial” means required implementation remains. “Gated” names an actual external or security dependency. None of these rows certifies the complete product by itself.

| Ledger row | What exists | Required work still open |
| --- | --- | --- |
| P0 — shared shell/contracts | Shared identity/contracts, coherent shell and classified launchers; build/tests pass. | Whole-program integration and verified production release. |
| P1a — assets/migration | Stable IDs, immutable hashed versions, optimistic revisions, additive journaled migration. | Historical-profile, old-tab and rollback matrix preserving later acknowledged work. |
| P1b — drafts/jobs/trash | Durable drafts, atomic job outputs, recoverable Trash; text recovery repaired here. | Every editor's crash/conflict/missing-source and late-render failure journey. |
| P1c — backup | Integrity checking, staging/atomic restore and prior fresh-origin byte/relationship proof. | Broader historical profiles and physical-device interrupted restore. |
| P2a — registry/jobs | Typed inputs, pinned versions, progress/cancel/retry and atomic outputs. | Complete routing/error/grant matrix across all consumers/codecs. |
| P2b — starter media | Actual raster conversion/crop/resize and WAV trim/normalization. | Supported-format/browser quality/cancellation matrix; peak normalization is not LUFS mastering. |
| P2c — Flow/release pack | Multi-step UI, retry/reuse, audio/artwork ZIP with retained original bytes and lineage; creative path replay passed. | Interrupted cross-app recovery and physical touch/Safari coverage. |
| P2d — deeper media | Real bounded cutout, video trim, optional verified local stems/transcription; experimental key/tempo. | Model/language/perceptual quality, codec/device budgets and calibrated analysis qualification. |
| P3a — app instances | Stable lifecycle; native studios and Day/Paperwork/readers/player have window adapters. Two simultaneous studio/view checks pass. | All canonical apps independently resizable and the complete editor/playback/permission matrix. |
| P3b — bridge/SDK | Scoped authenticated grants, durable receipts, revocation and explicit expiry renewal. | **256-request exhaustion remains:** request 257 is refused. Safe rollover must preserve receipt/ambiguous-write continuity; external-window opener/COOP lifecycle also needs qualification. Do not just clear maps or raise the cap. |
| P3c — isolation | Opaque WebLab preview; terminating zero-host-capability QuickJS worker. | General DOM-compatible hard isolation, process memory enforcement and brokered executable grants/revocation. |
| P4 — navigation/search | Direct paths, content/history opt-ins, project links across Spaces, zoom hysteresis/return anchors. | Complete Back/Forward/revoked-resource paths and broader indexing/input qualification. |
| P5a — Time/snapshots | Bounded text diff, latest/pinned identity, content-safe layout/window restoration. | All retained apps/resources supported in snapshots; complete failed-restore matrix. |
| P5b — inline/specialist editors | Media loop/level, video trim/captions and bounded static GLB preview. | Broader specialist editing/routing and full playback/view/autoplay matrix. |
| Capture | Text/link/file/paste and actual MediaRecorder path with retained failed-save bytes. | Physical microphone denial/device loss, actual device replay and Safari. |
| Carry | Pinned references, snippets/previews, explicit links/destinations and Flow handoff. | Physical touch and all remote grant/revocation paths. |
| Publish | Exact-version release/press kits, native Portfolio/private ZIP; local guest/public controls. | Hosted operation, broader end-to-end recovery/audience qualification and production configuration. |
| P6a — Luma | Real mounted engine, editable native layers/shapes/tone/selections/transforms, painting and exports. | Full retained-tool parity, including transformed painting and wider mask/path/tool behavior. |
| P6b — retained studios | Real native Glyph/Form/ScenePilot/StemDeck adapters; local Bounce/Librarian. Named browser checks pass. | Form's complete scene/CAD/character/rig/animation workflows; ScenePilot composition/effects/caption/media export parity; StemDeck full effects/routing/automation/production rendering; Glyph remaining tools/exports; complete reader/library parity. Native data retention alone does not expose these tools. |
| P6c — consolidations | Bounded Moodboard→Luma, Ghost→Form, Animate→ScenePilot and Portfolio→Publish. | Full retained editing/export/creation parity; Pocket versus Pocket Studio preservation and actual Sessions integration. |
| P7a — Smart/instruments | Real study/listening/travel compositions with pinned sources and reversible layouts. | Broader reusable adaptive composition and interrupted/conflicting Apply/Undo. |
| P7b — Crew | Deterministic commands, inspectable grants, budgets/checkpoints/revoke/cancel and real outputs. | Wider action/runtime matrix and genuinely configured optional AI/source explanation providers. |
| P7c — memory | Default-off scoped consent, source versions, retention and inspect/correct/exclude/export/forget. | Remote restore/provider lifecycle qualification; no implicit behavioral collection. |
| P8 — Universe | Real 3D presentation, bounded 30 mounted objects, 200-item accessible list and direct navigation. | Named physical-device frame/input/memory measurements, Safari/focus/playback/touch/assistive testing. |
| P9a — accounts | Real local Node authentication/session/recovery and server authorization. | Production HTTPS/storage/origins/identity recovery, operations, abuse/security review and account/data lifecycle. |
| P9b — sharing/Worlds | Local guest review/download/revoke, role/ownership/leave, publication/discovery and public forms. | Broader revoked/offline cache coverage and hosted operations. Downloads cannot be recalled. |
| P9c — Relay | Selected content/preferences/layout/memory transfers, resumable restore, explicit conflicts; two real profiles. | Continuous full application-state adapters, second physical device/Safari and production qualification. |
| P9d — offline | Versioned complete-cache/update/edit-lock implementation and prior cold-reopen proof. | Physical airplane mode, incompatible/interrupted updates and device-storage behavior. |
| P9e — NOW/Circle/providers | Original external routes and inspected gateway boundary retained. | **Gated:** missing original upstream sources/contracts/deployment mapping, authorized test accounts and provider OAuth/APIs. No connected native messaging/following/live sessions or mail/calendar sync is claimed. |
| P10a — everyday/browser/files | Day local records/recoverable deletion, Notes/Files, Photos/Locker views and actual Browser Trails/query handoff. | Full error/format/accessibility matrix and authorized provider sync; Locker origins still require explicit migration. |
| P10b — Paperwork | Documents/tables/formulas/charts/forms and real PDF annotation/signature/redaction; format/recovery browser checks pass. | Broader PDF/browser/accessibility matrix and hosted forms operations. No DOCX/Excel or digital-signature parity. |
| P10c — Atlas | Offline vector map, places/itineraries, linked events/material and privacy-reviewed trip copy/import. | Real street/geocoding/routing providers and Circle publishing. |
| P10d — Tongue | Conditional translation/voices, written progress and genuine caption/audio timed lessons. | Supported-language/voice/device qualification, richer lessons/conversations and pronunciation practice. |
| P10e — WebLab/Create | Durable source projects/export/diagnostics, isolated preview, bounded script worker and component composition. | Deeper developer tooling and qualified executable resource grants; cooperative HTML preview is not hard process isolation. |
| P10f — Lab | Saved/reopened pendulum, signal WAV and generative-visual PNG instruments with recovery. | Broader extension/format matrix and physical audio qualification. |
| P10g — Momentous | Zero-grant declarative tools/apps/instruments/themes/objects/workflows/Spaces with provenance/update/rollback. | Discovery and permission compatibility beyond these bounded packages. Commerce is not enabled. |
| P10h — Vault | Threat model/key/recovery/review design document. | **No vault runtime.** Separately reviewed isolation/crypto/key lifecycle, recovery drills and independent review are required before real secrets. |
| P10i — Rack | Actual Web Audio prototype, versioned presets and non-silent rendered WAV. | StemDeck transport/assets/automation integration, physical audio/preset qualification; no native plugin or DSP parity. |

The eight cross-cutting gates remain open: waves 1–2 need the complete input/browser recovery matrix; wave 3 needs universal app continuity; wave 4 needs specialist parity; wave 5 needs full sync/providers/hosted service; wave 6 needs remaining app/install/Vault gates; P11 needs complete physical/browser/accessibility/security qualification; Research needs actual participants; Delivery needs verified releases of the accepted scope. Passing one bounded path does not close these gates.

## Visual completeness — follow-up inspection

Inspected nine actual screens from the current overhaul build at 1440×1000 and 390×844: Welcome, circular space manager, desktop, drawer, Control Center, project Desktop, Universe, phone Welcome and phone drawer. No horizontal document overflow was observed at those captured sizes. Static screenshots do not qualify animation feel, touch hardware or all screens.

**The visual overhaul is partial.** The original shell carries the circular/spatial direction; newer functional applications do not consistently carry it through. Functional test results above must not be read as visual completion.

| Requested visual/interaction upgrade | Current state | Remaining visual acceptance |
| --- | --- | --- |
| WatchOS/Agar-style circular App Drawer | Present: colored circular icons, collision/spring behavior, hover magnification, inertia, pan/pinch and circular reveal. | Measure and review real touch/trackpad feel, loading and interrupted transitions; maintain readable labels and discoverable offscreen apps. |
| Circular workspace manager | Present in the shell: circular previews, titles and nearby activation, zoom thresholds and saved spaces. | Unify the shell manager and canonical project/Space navigation rather than maintaining two differently presented hierarchies. |
| Mac-like personal desktop | Present: dock, smaller upright icons, free placement and saved layout. | Bring real canonical project materials and all running app windows into the same desktop presentation. |
| Tap to focus; hold to approach; zoom out to overview | Implemented in shell gesture code; canonical Canvas also has semantic zoom/anchors. | Consistent handoff and thresholds across drawer, shell, Canvas and every app; actual hardware/animation qualification. |
| A genuinely spatial computer | Universe has actual CSS 3D projection and controls. | It currently appears as a panel inside a conventional sidebar/card page. A coherent immersive presentation, object-to-preview-to-editor transitions and shared depth/layer hierarchy remain incomplete. Rich furniture/physics remains explicitly later scope. |
| Beautiful transitions throughout | Shell drawer reveal, window morphs, camera easing and welcome/control overlays exist. | New workspace views often replace main content with a heading fade. Shared transition choreography, interruption behavior and consistent motion across apps are not complete. |
| Resizable apps and fullscreen dock gestures | Legacy windows and several canonical app/studio windows support sizing; shell includes minimal dock/hover and 10/30/50 gesture levels. | All apps need equivalent window/fullscreen behavior, one dock integration and consistent minimize/restore/focus transitions. |
| Welcome/lock-style widgets and Control Center | Clock, circular space previews, idea/app entry, Circle/NOW card, Browser entry, About and preference overlay are present. | The combined, useful widget/notification surface is still limited; Welcome is a splash/start surface, with account/privacy boundaries tracked separately. |
| Contextual quick tools | Right-click/long-press tools exist; actual processors are available through supported paths. | A consistent contextual tool strip, selection treatment, positioning and animation across desktop, materials and all apps. |
| One phone/desktop design language | Responsive layouts, shared palette/icons, reduced motion and narrow-screen paths exist. | Many new apps remain dense forms/cards. Review typography, spacing, toolbars, empty/loading/error states and direct manipulation throughout the complete app set. |

The next visual milestone must carry the shell's design into real working projects and apps, keeping durable identity, draft recovery and accessibility intact. A visual sign-off needs explicit screen/interaction acceptance alongside functional checks; neither circle icons nor a 3D panel alone closes it. These observations document gaps; this follow-up did not redesign the UI.

## Delivery distinction and next work

The previously recorded review is [6f516a4](https://6ae21d2def8445bb7cca9ee8--hole-os-armonon.netlify.app/), with a committed 422-file receipt. A fresh HTTP/hash sample compared production and that review against the current local build: production's HTML, bridge, continuity and capability assets differed; the review matched unchanged HTML/bridge but predates this audit's continuity/capability fixes. This is a four-file sample, not a new whole-deployment certification. Exact responses/hashes are recorded in the audit receipt.

Prioritize safe bridge rollover and remaining editor/navigation recovery, then universal runtime/snapshots and full retained studio tools. Continue available local work while obtaining upstream social/provider contracts and service deployment configuration. Human/device/security qualification needs its actual participants, hardware and independent reviewer. Keep these dependencies explicit instead of treating them as implemented.

Care, remote native Windows/macOS/Linux execution and the brief's later rich Universe furniture/physics remain explicitly future. Other required items above remain unfinished requirements. This audit does not merge the PR or promote production.
