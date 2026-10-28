# Bounded retained Luma layer, text and brush tools

The mounted editor now invokes the already retained Luma Studio engine at owned source revision `af6f0893b6b0fe28fff2be99d7f3cb39ab6aba54`: `addBlankRaster`, `addTextLayer`, `updateText`, `beginStroke`, `paintTo`, `endStroke`, `cancelStroke`, and native history/recovery/save. No drawing substitute, format imitation, new engine bundle, network capability or bridge operation is introduced. The existing private-source ownership and third-party notices remain unchanged.

## Behavior

Native `.luma` files support new raster layers and editable text layers. New text uses a local generic sans-serif font, chosen size/color and baseline position; content edits preserve existing layer styles and unknown layer metadata. Text updates enter the actual engine immediately and are queued to native recovery. While recovery is pending, other controls including layer selection are disabled; the textarea remains usable. A durable busy checkpoint retains the previous recovery while the new snapshot is written, so runtime close refuses pending work. Save disables editing until the acknowledgement and checkpoint complete. A lost acknowledgement leaves the adapter's exact pending bytes/request ID intact and blocks mutations until retry.

Brush tools paint or erase on an unlocked admitted raster layer. Pointer coordinates follow the retained engine's centered fit viewport including letterboxing. The stroke is buffered and applied by the real engine on release; Escape, pointer cancellation or focus loss discards an unfinished gesture without painting. A coordinate-based brush line provides keyboard access. Undo/redo uses the engine history.

Adding editable layers is deliberately restricted to native `.luma`. PNG/JPEG/WebP brush saves export flattened pixels, with a visible explanation. A connected native Save As operation remains a parity gap; the full studio retains that workflow.

## Bounds and preservation limits

Layer/text/brush editing admits documents up to 2048 pixels per edge and four million pixels. Added layers are limited to 64 and a conservative 32 million aggregate layer pixels. Text accepts at most 2000 characters and 32 lines; new text size is 4–256 pixels. Brush size is 1–128 pixels, at most 1024 points and eight million estimated dab pixel visits. Validation occurs before engine stroke mutation.

Painting additionally requires the actual raster surface to fit the same dimension budget and have unit scale, zero rotation/shear and bounded translation. This prevents tiny imported transforms from expanding short document-space strokes into unbounded local interpolation. Transformed or larger layers remain preserved for the full studio.

Unknown **layer** metadata is retained by the actual native codec and verified after edit/recovery/save/reopen. Arbitrary unknown top-level document/manifest fields are not preserved by the retained codec's explicit document serializer; this increment does not claim blanket unknown-native fidelity. Original native versions remain readable. External fonts, full typography/shaping, advanced brushes, vector authoring, transformed painting and full precision/PSD/RAW parity remain outside this surface.

## Verification

- `node --test tests/luma-tools.test.mjs`: five cases pass for document/layer admission, text bounds, stroke work/numeric limits, viewport mapping and transformed/oversized raster rejection.
- `node scripts/verify-luma-tools-browser.mjs`: actual opaque sandbox and retained engine. Raster paint produces exact red pixels; erase reveals the original blue layer; undo restores red. Actual text creates visible glyph pixels. Pointer painting produces exact green pixels after fit-coordinate mapping. Native recovery/save/reopen retains three editable layers, text and unknown original-layer metadata. Original native version still has one untouched layer. A held text recovery blocks layer switching and runtime close; failed recovery retains the painted stroke and succeeds on explicit retry. Invalid strokes and cancelled pointer gestures do not change pixels. A simulated lost durable acknowledgement blocks edits and retries to the exact same committed version. Image layer creation is disabled and actual image brush save writes the expected flattened PNG pixels.
- `HOLE_SHELL_URL=http://127.0.0.1:5193 node scripts/verify-luma-tools-browser.mjs`: actual built shell object action → layer/text creation → brush → queued typing → layer switch → close/recover → native save → close/reopen. It checks real rendered pixels, authored text, original/unknown-layer retention and a 375-pixel layout without horizontal overflow. No source route overrides are used in this mode.

The isolated test injects failures only in its test-served SDK wrapper. Production SDK and grants are unchanged. All fixtures are local synthetic graphics; no external images, credentials or services are used.
