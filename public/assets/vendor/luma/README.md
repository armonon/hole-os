# Retained Luma engine bundle

Source: the owned `tcc-operations/repos/luma-studio` checkout at `af6f0893b6b0fe28fff2be99d7f3cb39ab6aba54`, entry `app/engine/studio.ts`. This is the actual engine, including the actual native `.luma` codec. Refresh explicitly with `node scripts/vendor-luma.mjs /absolute/path/to/luma-studio` using its installed esbuild. Normal Hole builds copy these committed bytes and do not access the external checkout.

The bounded Hole surface exposes raster open/export, crop, layer opacity, undo/redo and native project/recovery serialization. Optional dynamic modules other than the project codec are externalized and blocked by the child CSP; this is not full Luma UI, PSD, neural cutout, external font shaping, worker or precision-feature qualification. Keep the full Luma route available. No external Luma deployment was changed.

Third-party bundled dependency licenses are retained in THIRD-PARTY-NOTICES.txt and esbuild legal comments. Dependencies included by static/native-codec imports include bidi-js, JSZip, ag-psd, pako and base64-js. Luma itself is owned private source; this bundle does not grant a separate public source license.

Run `node scripts/verify-luma-browser.mjs` for the disposable Chromium profile qualifier. PLAYWRIGHT_MODULE and CHROME_PATH can select local tooling. It serves source directly; it does not overwrite public build output. Shipping still requires the coordinator's built-shell/CSP/mobile integration checks.
