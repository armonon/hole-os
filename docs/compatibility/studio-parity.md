# Retained studios: source contracts and parity gates

Evidence inspected on 2026-10-26. These are existing products to retain, not empty app names to replace with narrower demos. This audit did not modify or deploy any external repository. A source feature is not evidence that the deployed product, Hole bridge, or a particular device has passed the same check.

## Source inventory

| Studio | Local checkout and inspected revision | Native document / relevant hooks | Features and contracts to preserve |
| --- | --- | --- | --- |
| Luma | `tcc-operations/repos/luma-studio`, `af6f0893b6b0fe28fff2be99d7f3cb39ab6aba54` | `.luma`; `app/engine/studio.ts`: `openImage`, `importProject`, `exportImage`, `prepareProjectSave`, `completeProjectSave`; project and autosave modules | Editable raster/text/vector layers, history/recovery, brushes, native project admission, existing PSD/PSB/RAW/color/precision distinctions, PNG/JPEG/WebP exports. Keep native bytes when the user wants an editable document; a flattened PNG is not parity. |
| Glyph | `tcc-operations/repos/glyph-studio`, `e699025f624a29ed122a38b4bee6286157d91dfa` | `.glyph.json`; `src/engine/project-store.ts`, `font-export.ts`, `pages/Studio.tsx` | Glyph editing, brush/pen/curve tools, metrics/kerning, actual OTF/TTF/SVG glyph-sheet exports, autosave/recovery and explicit offline update behavior. Existing `/studio?tcc-open=<id>` is a legacy Locker path, not a Hole grant. |
| Form | `tcc-operations/repos/form-studio`, `cb4a698b2a9aa63c943495c2600e88ed993342cc` | `.form`; `app/project-format.ts` (`form-studio-project` version 2), project-save/document-session contracts | Preserve distinct scene@1, CAD@14 and fabric@1 documents, save tickets and admission safeguards. Ghost/garment consolidation must retain editable garment data and provenance; image-derived shapes do not establish calibrated fit. |
| ScenePilot | `tcc-operations/repos/scenepilot-studio-badass`, `277f1544f7ac1e6e24426571c171cc21d3ea31ea` | `.cut`; `lib/project-store.ts`, `app/project-document.ts`, `docs/engine-parity.md` | Preserve timeline/document data and referenced media, Browser Lite/native engine distinctions, and actual render/export paths. The source's ten-fixture native/Electron video comparison is historical evidence, not rerun here; its stated audio and unsupported-effect gaps remain. Animate consolidation must retain cel/onion-skin/layer/export behavior, not only transform keyframes. |
| StemDeck / Sattari Studio (browser) | `sattari-seo-20261026/source`, `ae9d4bfb82899e3b9d516a06d66b4915fc91b157` | `.sattari`; `src/pages/SattariStudioPage.jsx`, `src/utils/studioAudioEngine.js`, `src/studio/session/useStudioSession.js`, `src/utils/projectArchive.js` | Existing Perform/Arrange/Library/Mixer surfaces, deck cues/loops/pads, multitrack/automation, instruments, capture/replay, WAV export, sends/returns, cue/output-device routes, local audio library, recovery and portable sessions with embedded audio. Preserve session admission and asset relinking. A Hole launch is not a stem-engine API. |
| Sattari native suite | `tcc-operations/repos/sattari-plugins-suite`, `2cc39b7335d327017f4b7df186dc0dbe94237312` | JUCE/CMake AU/VST3/Standalone; `SattariRackProcessor.h`, `SattariInstrumentRack.h`, `SattariRackEditor.h`, rack host/product contracts | Native DSP/host behavior, presets and plugin contracts stay intact. Native pitch/separation/realtime paths do not become browser support by naming the same feature. The repository is GPLv3 and contains additional dependency terms; this prototype copies none of that engine. |

The last two are separate code paths. `sattari-plugins-suite/apps/sattari-web/assets/modular/modular.js` is a marketing tab controller, not an audio engine. The actual browser studio above is the appropriate starting point for browser session integration.

Bounded Moodboard→Luma, Ghost→Form, Animate→ScenePilot and Portfolio→Publish integrations retain their original native sources and routes. Their dedicated evidence records qualify named operations, not full retained-product parity. NOW/Circle/Sessions still require missing original source/contracts; Bounce, Locker and other destinations retain the remaining parity gates. Existing destinations remain available. The bridge inventory separately records Librarian's PDF storage and Portfolio's actual static-site ZIP export hooks. A ZIP export does not establish public publishing.

## Qualified Luma engine round trip

`scripts/qualify-luma-adapter.mjs` runs the real Luma `Studio` TypeScript engine using its test Canvas setup with native Canvas pixels, the real Hole SDK and bridge host, and HoleCore backed by IndexedDB. It uses a simulated postMessage transport; it is not a browser interaction or a deployed studio connection. The observed result is retained in `docs/evidence/luma-adapter-local.json`.

Both cases passed:

1. A 32×24 PNG enters Hole, is granted to the adapter, opens in the actual Luma engine, is cropped to 16×12 and saves through the bridge as an immutable version of the same asset. The decoded output pixel is blue (RGBA 0,0,255,255), and the original version remains readable.
2. A real `.luma` document opens through the adapter, an actual raster layer changes opacity to 0.5, native prepare/save/ACK/complete clears the matching dirty state, and a third Studio instance reopens the saved bytes with opacity 0.5 and the expected dimensions.

Rerun from Hole, with the external source dependency installed:

```sh
node --import '../tcc-operations/repos/luma-studio/node_modules/tsx/dist/loader.mjs' scripts/qualify-luma-adapter.mjs '../tcc-operations/repos/luma-studio'
```

The external checkout and its test/runtime dependencies are intentionally not required by Hole's normal test suite. This proof qualifies concrete engine hooks; it does not qualify every Luma tool, native format feature, recovery scenario or production release. Before enabling connected launch, the actual mounted Luma editor still needs SDK loading, deliberate Open/Save-to-Hole controls, Kit/state/Activity wiring, production opener/COOP verification, live browser edit/save/reload coverage and release through Luma's own guarded deployment pipeline. No source mirror should be wholesale deployed.

## Integration acceptance checklist

Each retained studio must pass these with actual native documents before its manual route is replaced:

- Open only explicitly granted resource versions; preserve linked dependencies and report missing resources.
- Keep one stable document/instance identity while moving between window, canvas and focus views; checkpoint editor state separately from file bytes.
- Preserve native editability and recovery; save after actual Core ACK only, reject stale bases, and keep dirty work after errors or ambiguous timeouts.
- Export real format bytes with MIME/dimensions/dependencies verified; save derived outputs with source-version lineage.
- Respect Kit/resource grants and revoke future access without pretending already received bytes disappeared.
- Demonstrate cancel/retry/reopen and original-file preservation, plus browser/device qualification. Compare the retained feature ledger before consolidating names or navigation.

## Sattari Rack product decision

**Recommendation: Rack becomes a mode within the existing StemDeck studio**, with presets and rendered audio available as Hole assets. Keep the current standalone/native products and the browser studio intact while that integration is qualified. A separate permanent app would split instruments, arrangement, routing and project recovery across competing identities.

`src/rack.js` is an original, bounded technical prototype to validate the browser graph and Hole asset/job contracts. It produces real sound: oscillator → low-pass filter → envelope → dry/feedback-delay mix → output compressor, with an LFO modulating cutoff. Parameters update through Web Audio scheduling. Preview requires a deliberate action; Stop releases the graph/context. OfflineAudioContext renders real 44.1 kHz stereo audio, which the WAV codec writes as PCM bytes. `rack.render` commits its output through Actions with source preset lineage, progress, cancellation and atomic job/output persistence.

The `.hole-rack.json` v1 preset is a small documented parameter object; it is neither a native Sattari plugin preset nor a `.sattari` session. Presets can be imported/exported, saved as assets, versioned and reopened. Parameter drafts are local. The UI labels this as a technical prototype. It does not implement polyphony, MIDI/MPE, arbitrary patch cables, a modulation matrix, plugin hosting, project timeline automation, hardware-device qualification or native DSP parity. The output compressor is not a promise of loudness mastering or an absolute peak ceiling.

Next integration gates: map Rack presets into the actual browser studio's instrument model; preserve portable `.sattari` asset dependencies; share transport/automation/routing without replacing its engine; verify offline/render and live parameter parity with real audio; add accessible routing controls if free patching is introduced. AU/VST hosting requires a real native host/relay and its permission/isolation design. It cannot run by downloading a native plugin into an ordinary browser.


## 26 October continuation: bounded connected surfaces

Luma now has actual opaque-iframe and built-shell browser evidence (`verify-luma-browser.mjs`, `verify-luma-shell-browser.mjs`), including original retention, recovery, durable save and minimize/reopen. The older simulated-transport evidence above remains historical, not the current ceiling.

Glyph and Form now use retained native engine bundles with source notices and adapters. Glyph edits strokes/advance and emits real TTF/OTF. Form preserves the version-2 container and untouched workspaces, edits fabric allowance and exports real PDF/DXF. Their isolated actual-browser scripts verify native recovery/save/reopen and bytes; full shell qualification is recorded separately. ScenePilot preserves full raw `.cut` JSON, including unknown authored data, and uses retained parser/title/timeline helpers. Its bounded surface supports titles and ordinary unlocked trims; explicitly selected media versions are read-only grants. Paths inside documents are never fetched. This is not the complete composition renderer.

Bounce is a browser-local queue/player with exact version references, position/loop/volume and explicit-play reopen. It does not port native C++ DSP/tag/library parity. Librarian uses retained reading helpers with actual PDF.js pages, bookmark/note/progress state and pinned-source note export; full original collection/catalog parity remains open. Original specialist routes stay available. Actual Chrome libraries evidence covers PDF raster, bookmark/note reload, export, WAV playback across navigation, playhead reload without autoplay and 320px layout.
