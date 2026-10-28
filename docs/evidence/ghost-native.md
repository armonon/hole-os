# Ghost native creation and portable source extraction

`src/ghost-native.js` exposes two bounded host helpers. It lazily loads only the existing same-origin Ghost document factory/adapter and Form parser; it never loads a renderer, resolves an embedded source pointer, fetches photographs or commits resources.

- `HoleGhostNative.newDocument({name,front,back,side?,garmentType?,signal?})` accepts explicit PNG/JPEG/WebP Blobs and returns `{blob,name,metadata}`. The retained Ghost `projectRecord` factory creates the actual native format. Default category `auto` uses the real photo-silhouette path. Original binary photographs are embedded unchanged, with no resize or destructive cleanup.
- `HoleGhostNative.extractFromForm(blob,{signal?})` parses the actual Form container and requires `extensions['hole.ghost']` schema `hole.ghost-source/1`. It returns `{blob,name,sourcePointer,metadata}` with all embedded raw source/unknown fields retained. The source pointer is provenance only: an unavailable or external pointer does not trigger a resource lookup or network access.

The host owns explicit resource selection, exact parent lineage and atomic durable commits. Creation supports front/back and optional side photos; each header and actual decoded dimension is bounded to four million pixels and 4096 pixels per edge. Native output is limited to 16 MiB and extraction input to 32 MiB. Cancellation is checked before dependency loading and around asynchronous reads/decodes; an ongoing browser decoder itself cannot be forcibly terminated, and no helper commits output.

## Checks

`node --test tests/ghost-native.test.mjs`: six cases pass for actual factory format, binary photo retention, unknown fields/pointer preservation, required input/budget rejection, cancellation, decoder failure and missing/invalid embedded source.

`node scripts/verify-ghost-native-browser.mjs`: actual browser decoder and retained native format create → durable native import/read/edit → actual Form serialization/parse → embedded source extraction → durable derived import/read. SHA-256 hashes of both original photos exactly match their native embedded bytes. All raw unknown fields survive extraction. The derived native has the selected Form version as its parent. Injected IndexedDB quota failure rolls back every output; retry commits successfully. Cancellation returns no document. No external requests occur, including for deliberately unavailable source pointers.

`node scripts/verify-ghost-browser.mjs` also qualifies the default automatic photo-silhouette path with the real retained solver: 5512 vertices, two pieces and 260 opening edges on the synthetic fixture. The result boundary now permits up to 4096 opening chains while preserving total node/byte limits, per-index validation and actual triangle-edge/same-piece checks. Unit tests reject 4097 chains. The existing jacket, GLB/Form reimport, recovery, cleanup-budget and worker security checks continue passing.

These checks establish native fidelity and real bounded engine execution, not photographic reconstruction accuracy or measured garment fit.

## Mounted shell acceptance

`node scripts/verify-ghost-authoring-shell-browser.mjs` passes against the built local shell on port 5193 with the strict worker response CSP. It exercises **New garment** → explicit front/back photo selection → native creation → **Open in Form Garment** → actual automatic photo-silhouette solve → textured GLB/Form export → **Extract garment source** → extracted native reopen. Native creation records exact selected photo version parents and hashes; extraction records the exact selected Form version parent and embedded native pointer. Unknown source/photo fields and original embedded bytes remain equivalent after the complete journey.

Missing selections and invalid encoded images create nothing. Cancellation while the actual browser decoder is held pending closes the dialog; releasing the decoder afterward creates no native output. Injected IndexedDB quota failures during both creation and extraction retain their dialogs and selections, leave asset counts unchanged, and allow retry with exactly one result. Canceling extraction before submission creates no output. The host authoring module was inspected alongside this proof; no additional scoped finding remained.
