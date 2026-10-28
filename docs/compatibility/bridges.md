# Runtime and studio bridge v1

Evidence date: 2026-10-26. This is source evidence and automated protocol coverage, not proof that a deployed external studio is connected. No other repository was edited or deployed.

## Host integration

Load `core.js`, `runtime.js`, and `bridge.js` as classic scripts before consumers. Factories are exported through `HoleRuntimeModel.createRuntime` and `HoleBridgeModel.createBridge` for tests; browsers receive `HoleRuntime` and `HoleBridge` automatically. Core is resolved lazily. The module build copies both files into `public/assets`.

Register each real editor once:

```js
HoleRuntime.register('paper', {
  mount(instance, root) {
    // Mount once. instance.context and instance.editorState contain restored data.
    return {
      serialize() { return readEditorState(); },
      present(mode) { updatePresentationWithoutRemounting(mode); },
      close() { removeEditor(); }
    };
  }
});
const instance = await HoleRuntime.open('paper', {
  projectId, assetId, versionId, root: editorHost, reuse: 'same-resource'
});
await HoleRuntime.present(instance.id, 'canvas');
await HoleRuntime.checkpoint(instance.id);
```

Default reuse is never. Explicit `same-resource` reuse compares app, project, asset, version, and space. Modes are window/canvas/focus/minimized. `present` does not call mount. `serialize` returns `hole.instance/1`; `checkpoint` saves that snapshot as a revision-checked Core settings record. `restore(snapshot,{root})` preserves instance identity and refuses to replace a running instance. `close` checkpoints before unmounting; a save failure leaves the editor mounted. Roots and DOM handles are never serialized. `hole:runtime-change` reports actual lifecycle changes.

For an owned external studio, open a dedicated connected window and keep its WindowProxy. Approve its exact origin, then call `connectExternal({origin,source,instanceId,projectId,resources,operations,ttlMs})`. Every resource specifies `{assetId,versionId,operations}`. Source and origin must both match. Handshake is host hello → studio ready → scoped grant. Call `retryHandshake(sessionId)` after the studio has loaded if the initial hello arrived too early. A regular `noopener` catalog launch has no bridge; do not label it connected. Production opener/COOP policy and popup behavior must be verified per studio before enabling this route.

Operations: `resource.read`, `resource.commit`, `resource.derive`, `project.kit`, `state.read`, `state.save`, `activity.report`, `request.cancel`. Every request carries protocol version, session ID, random nonce, grant ID, request ID, operation, and validated payload. A grant lasts 1 second–1 hour (default 15 minutes), names resources/versions and operations, and is explicitly revocable. No account tokens or unrestricted workspace records are sent. A project Kit exposes only colors/fonts and an explicitly resource-granted logo ID.

Binary transfer accepts structured-cloned Blob or ArrayBuffer, at most 32 MiB total per request; metadata is limited to 64 KiB/depth 16. No URL-based arbitrary fetch or executable values are accepted. Writes acknowledge only Core completion. Commit requires the granted base version; conflict is an error, never an overwrite. Successful versions extend this connection's existing resource scope. Derived files use atomic `commitJobOutputs`, fixed project/input provenance, and actual Activity status. Activity reporting alone cannot claim completion. The transport's fractional progress is converted to Core's 0–100 progress.

Each session caches at most 256 request results, including errors. Reusing a request ID with changed content is rejected; simultaneous identical requests execute once. Reconnect at the limit. Session credentials are intentionally not persisted. Following a host reload, compare durable versions/jobs and establish a fresh grant; do not replay an old session blindly. A storage commit already started cannot be cancelled or retroactively revoked; no further private response is delivered to a revoked connection. Revocation cannot remove bytes already received.

## SDK and generated tools

`sdk/bridge-client.js` provides `HoleBridgeClient.createClient({hostOrigin,hostWindow})`, `ready`, `request`, `getGrant`, and `dispose`. The expected host origin is configured by the owned integration, never trusted merely because a random message supplied it. Timeouts are ambiguous: retain the same request ID and exact bytes for retries. The SDK does not mark a timeout as a failed save.

Generated tools must use a host-created `srcdoc` frame with exactly `sandbox="allow-scripts"`; `allow-same-origin`, forms, popups, downloads, top navigation and added sandbox exemptions are refused by `prepareSandbox`. The host obtains `{bootstrap}` from `prepareSandbox` and includes it in the controlled sandbox bootstrap. The SDK uses `createClient({bootstrap,hostWindow:parent})`. The **child** transfers a MessagePort to the exact configured parent origin. The host verifies source WindowProxy, opaque `null` origin, nonce and session before accepting one port. Private grants and payloads travel only over that bound port. The host never uses wildcard targetOrigin.

The runner still needs an explicit restrictive CSP (`default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'`) and safe bootstrap insertion. External scripts/network are disabled unless a separately reviewed capability explicitly permits them. Do not concatenate user HTML before the CSP/bootstrap, remove isolation to make a tool work, or execute generated code in the OS document. The current build rejects literal frame markup; the runner UI is **not enabled by these modules**. Actual browser tests must demonstrate that sandbox JS cannot read Hole's IndexedDB/localStorage, access parent DOM, navigate the top window, or continue broker reads after revocation before the runner is shipped. Unit tests validate the transport boundary but do not substitute for those browser tests.

## Smallest Luma round trip

Read-only inspection: `tcc-operations/AGENTS.md`, `repos/luma-studio/AGENTS.md`, `app/engine/studio.ts`, `app/engine/project.ts`, `app/engine/autosave.ts`, `app/engine/neural.ts`, `app/studio/studio-client.tsx`, and `netlify.toml`. Luma's deployment has a live-static overlay/promotion guard; do not wholesale-deploy the mirror or change its build as part of Hole integration.

Verified source primitives:

- `Studio.openImage(name, image)` installs a distinct document and a real raster layer.
- `Studio.importProject(blob,{restoreHistory:true})` validates and decodes native `.luma` content with existing project admission/memory safeguards.
- `Studio.exportImage(mime,quality)` snapshots the actual document and guards against mid-export context changes.
- `prepareProjectSave(name)` creates a blob plus a document/history/revision ticket. `completeProjectSave(ticket)` marks the matching document saved only if that ticket still matches. Host ACK must occur before this method.
- Recovery serialization and the native project format remain owned by Luma. Hole stores those bytes without flattening the native document.
- `cutoutSubject` calls on-device matting and can return `used:'neural'|'luma'`. The model path uses Hugging Face/ONNX machinery and may require downloads. Do not advertise uniform AI Cutout quality or add it as a host verb until model/runtime/cancellation behavior is qualified; expose actual fallback mode.

`sdk/luma-adapter.js` is an installable source adapter against these inspected methods. It refuses an occupied/dirty binding, reads only a granted PNG/JPEG/WebP or `.luma` asset, binds to the resulting document ID, and writes back a version. Native saves use the prepare/complete ticket; raster exports do not falsely mark a layered project saved. It retains request IDs and bytes across an ambiguous timeout and rejects a save after switching documents. Its serialized binding is metadata, not a substitute for Luma recovery bytes or complete editor UI state.

Remaining before enabling a connected Luma launch: load both SDK scripts in Luma's mounted editor, connect explicit Open/Save-to-Hole controls, grant deliberate access, wire Kit/editor-state/Activity UI, qualify a registered verb, test production opener policy, perform actual browser editing and save-back, and deploy through Luma's own verified release process. The adapter tests use the production SDK/host/Core contracts plus an injected studio method fixture; they do not claim a live Luma connection.

An additional local qualifier, `scripts/qualify-luma-adapter.mjs`, uses the actual Studio TypeScript engine at revision `af6f0893b6b0fe28fff2be99d7f3cb39ab6aba54`, native Canvas, real Hole Core with IndexedDB emulation, and this SDK with simulated message transport. Its recorded evidence in `docs/evidence/luma-adapter-local.json` verifies PNG import → actual crop → immutable save (16×12 pixels, expected blue pixel, original retained), and native `.luma` edit → save ACK → reopen with editable layer opacity 0.5. The native document becomes clean only after the committed save acknowledgement. This qualifies the local engine/adapter path; browser UI, cross-origin policy and deployed integration remain the gates above.

## Other ecosystem adapters

| Product | Source evidence inspected | Smallest adapter and actual blocker |
| --- | --- | --- |
| Glyph | `src/engine/project-store.ts`, `font-export.ts`, `pages/Studio.tsx` | `parseProjectFile`/`serializeProject` preserve editable `.glyph`; `buildOtf`/`buildTtf` return genuine font bytes. Needs bridge binding, save ACK integration, scoped Kit/fonts and browser round trip. |
| Form | `app/project-format.ts`, `project-save-session.ts`, `document-session.ts`, `luma-text-bridge.ts` | Versioned native project and document/session guards exist. Luma text/spatial interchange is a format contract, not a Hole authorization bridge. Needs native asset decode/encode adapter, scene-specific editor state and resource admission checks. |
| ScenePilot | `lib/project-store.ts`, `app/project-document.ts` | `parseCutFile`, `saveProject`, `loadProject` exist with media links and a separate desktop bridge. Preserve referenced media and distinguish Browser Lite from native media execution; Hole transport and asset dependency grants are unimplemented. |
| Librarian | `src/pdf-storage.js` | `pdfSave`, `pdfGet`, `pdfLibrary` retain real PDF bytes. Start as a declared reader: scoped PDF open plus position/annotation checkpoint. Exact reader-state hooks and live source parity still need inspection. |
| Portfolio | `src/lib/export-zip.ts` | `buildStaticSite`/`exportStaticSiteZip` produce real ZIP/site bytes. Bind approved project assets and export derived packages; static packaging does not establish public hosting. |
| StemDeck | P6 owner located browser source at `sattari-seo-20261026/source/src/pages/SattariStudioPage.jsx`, `src/utils/studioAudioEngine.js`, and `studio/session/useStudioSession.js`; native source is `tcc-operations/repos/sattari-plugins-suite` | P6 is inspecting real portable-session, save/reload and WAV paths. This bridge package has not validated that adapter or deployment. No connection or stem-processing claim follows merely from locating source. |
| Bounce, NOW, Circle, Ghost, Moodboard, Animate, Locker, Converter | Catalog destinations; no protocol proof in this package | Remain external/manual destinations. Audit their owned source and supported APIs independently. Do not infer a bridge from a destination URL or a different product's format. |

Evidence categories: local source inspected as listed; remote source not inspected in this package; deployed bytes not matched; live studio bridge runtime not observed; external policy and service contracts unresolved where noted.

## Verification

`node --test tests/runtime-bridge.test.mjs`: 12 tests cover exact origin/source/nonce, denied resource/project/version access, strict schemas, duplicate requests/content changes, save-after-commit, stale base conflicts, expiry/revocation, bounded payloads, original project/input binding, sandbox port admission, lifecycle stability, save-failure retention, SDK retry semantics, and real Core output recovery after reopening.

Host wiring, actual studio interaction, physical device gestures, and sandbox browser access-denial tests remain separate integration gates.
