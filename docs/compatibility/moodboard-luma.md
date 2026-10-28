# Moodboard native source and layered Luma handoff

This additive path retains the original Moodboard route. It does not replace the full editor or claim its complete interaction parity.

## Inspected source

The owned Moodboard checkout is `tcc-operations/repos/moodboard`, commit `b2a54d1acaa902a06c2fd99a367deb7bbe5e42cf`. `src/lib/board-types.ts` defines version-1 `.moodboard` JSON with embedded images, item coordinates/sizes/z-order, notes, swatches, frames, tags, group references, camera and timestamps. `moodboard-file.ts`, `layout.ts`, `export-image.ts` and `export-zip.ts` implement its actual serializer, layout math, PNG/PDF renderer and original-image ZIP. These five exact source files, their bundled functions and notices are retained under `src/vendor/moodboard/`. The private owned source has no separate public license. Bundled JSZip uses its MIT option, with JSZip/Pako notices retained.

The actual retained Luma engine is `src/vendor/luma/engine.js`, from owned `luma-studio` commit `af6f0893b6b0fe28fff2be99d7f3cb39ab6aba54`, entry `app/engine/studio.ts`. Conversion uses its `Studio`, `addRasterLayerFromCanvas`, `addTextLayer`, `addShapeLayer`, `setLayerProp`, `exportProject` and `importProject` APIs. No native format imitation or adapter replacement is involved.

Original Moodboard autosave is origin-bound IndexedDB `moodboard/autosave/current`. This path accepts explicitly imported native files; it does not read another origin's storage or migrate it silently.

## Native editing and outputs

`moodboard-ui.js` adds an `HoleExtensions.openAsset` handler for `.moodboard` files. Opening shows the real retained canvas render and a keyboard-accessible item inspector. Users can explicitly save image/note/swatch/frame coordinates, dimensions, stacking order, applicable name/text/color. Moving a frame translates all its grouped children by the same delta. Native edits preserve unknown JSON fields, original embedded image URLs, tags, group references and camera; each save creates an immutable Core version with stale-base rejection. Historical/pinned source is read-only. Failed edits retain the unsaved input fields. Exact native export downloads the selected committed bytes.

Save board PNG/PDF/ZIP/LUMA creates a separate actual asset with `parentVersionIds:[source.version.id]`, source asset/version provenance, the retained renderer commit and (for native Luma) the engine commit. Core verifies that source parent exists. Original native data is unchanged.

PNG/PDF/ZIP use the retained Moodboard renderer/exporter. PDF is its single-page JPEG-backed export. ZIP includes original embedded image bytes and layout.json. Luma conversion runs the actual engine in an opaque sandbox with no network/storage grants, creates native raster/text/shape layers in board z-order, exports `.luma`, reimports it through the native codec, and produces a verification preview. Raster layers retain image pixels and use native scale/translation. Notes use separate editable text and background shape layers. Swatches and frame boundaries are shapes; frame labels are text. The resulting file opens through Hole's existing real Luma path.

Board camera, tags and grouping remain in the original editable board and ZIP layout; they are not mapped to Luma group/camera semantics. Text uses the native engine's sans-serif shaping; full typography/pixel equivalence is not claimed. GIF animation is not preserved as an animation in raster exports. The bounded Hole Luma surface exposes its existing controls; additional native text editing is available to the underlying engine/full studio.

## Bounds and errors

Before rendering, validation rejects remote URLs, SVG and unsupported image types. Embedded PNG/JPEG/WebP/GIF header dimensions are checked before decode: at most 8192 pixels per side, 16 megapixels per image and 32 megapixels total. A board is at most 32 MiB UTF-8 JSON and 100 items; note text is at most 10,000 characters. Geometry is finite and bounded; output is at most 4096 pixels per side and 8 megapixels. Invalid group references, repeated IDs and nested frame groups are rejected. Unsupported original source remains stored unchanged.

The engine fetch has a 15-second timeout and HTTP error check; isolated conversion has a 60-second timeout with frame/listener cleanup. Decode, render, export, storage and version conflicts report errors while retaining the native source. These are application bounds, not a hard process memory/CPU sandbox.

Full-editor creation/add/delete, drag/resize gestures, automatic grouping, grid, palette extraction, clipboard and broader source compatibility remain parity work. No external route was removed or deployed.

## Evidence

`node --test tests/moodboard.test.mjs` passes four tests: unknown source/camera retention and frame movement; URL/SVG/bounds/group validation; retained native serializer/draw order/PDF structure; and oversized image-header rejection before decode.

`scripts/verify-moodboard-browser.mjs` uses a disposable persistent Chromium profile. The source-override shell run previously passed native frame edits, profile close/reopen, exact native download, original-version preservation, all four real export assets with source parent versions, byte-identical original ZIP image, PNG sample pixels, and actual reopened Luma text/raster/shape layers with matching red/blue pixels. On 28 October 2026, the final generated-script run against http://127.0.0.1:5193 passed without source overrides in Chrome 156.0.8078.48. It additionally parsed the PDF as one 464×304 page through PDF-Lib and performed an actual native text edit→export→reimport in the retained Luma engine. No physical-device or assistive-technology result is implied.
