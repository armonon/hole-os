# ScenePilot native split and source inspection

Owned wave 14 changes extend the retained engine rather than implementing replacement split math. The source revision and generated SHA-256 are recorded in `src/vendor/scenepilot/README.md`. No original repository mutation, application build, commit or deployment was performed by this workstream.

## Contract and controls

`HoleScenePilot.create().mount(instance, root)` retains its existing interface and explicit `editorState.mediaLinks` entries `{sourceId, assetId, versionId}`. The primary native cut receives derive permission for an explicit native copy; linked media remains read-only. `serialize()` and direct `close()` await an exact-source/nonce recovery handshake. Direct close freezes iframe input and restores it when recovery fails. Parent unload protection reflects pending raw edits, operations, failed recovery and unresolved native acknowledgements.

The UI exposes Split clip, Undo, Inspect selected clip and Export native cut copy. It uses the original parser, split function and source clock. Split updates matching raw representations together, preserves unknown native fields and external source paths, and clears only boundary fades as the retained engine specifies. Fragments must retain at least 0.04 seconds so they remain editable. Native track locks are enforced alongside clip locks. Conflicting identities, reversed/remapped/keyframed/grouped/locked/nested clips are refused. Raw incomplete title, trim, split and preview fields are recovered without coercion or silent application; switching title cannot discard unfinished title fields. A native copy first saves dirty native content, then derives from that acknowledged version. Lost acknowledgements retry the exact ticket and Blob; explicit host QUOTA rejection alone can renew a ticket.

## Verification

`node --test tests/scenepilot-adapter.test.mjs tests/scenepilot-split.test.mjs`: 11 passing tests covering retained 1×/2× source clocks, both native mirrors, boundary fades, unknown fields, Undo, unsupported/conflicting clocks, 200-clip admission, exact derived retry bytes/source links, unfinished raw fields and clean-recovery no-op saves.

`node scripts/verify-scenepilot-split-browser.mjs` runs against the actual shell at port 5193, overriding only owned ScenePilot sources by default. Source qualification passed (`/tmp/scenepilot-split-source.log`): real generated red/blue WebM; timeline 1.8 at 2× seeks original 2.1 seconds with decoded blue pixels and paused playback; split/Undo/save/native-copy bytes and canonical parent; original/unknown fields; incomplete field close/reopen; injected recovery quota refusal/retry; 320px width and keyboard labels; no source-path fetch or page errors. The same run verifies 1× source inspection and an explicitly pinned old media version after its head advances to unrelated bytes. Final generated qualification also passed: `HOLE_QA_SOURCE_OVERRIDE=0 node scripts/verify-scenepilot-split-browser.mjs`, log `/tmp/scenepilot-split-built-final.log`, `sourceOverride:false`, all proof flags true and no page errors. This verifies the local generated build, not a deployed browser session.

## Limits

Selected-source inspection is not composition playback or video rendering: effects, overlays, audio mix, transforms, reverse/remap and broader studio tools remain in the original route. Native copies preserve references, not embedded media. MIME/size/grant identity establish exact local selection; this does not establish semantic equivalence to an external original source path. Preview metadata and seek have deadlines, and accepted dimensions are bounded after decoder metadata arrives. There is no physical camera/microphone or codec-wide qualification claim.

The serial generated close regression also passed: `HOLE_QA_SOURCE_OVERRIDE=0 node scripts/verify-glyph-close-browser.mjs`, `/tmp/glyph-close-wave14-built-final.log`. Runtime input was frozen; actual keyboard/pointer attempts during final flush were blocked; failed flush retained frame and grant; retry closed successfully; no page errors. No Glyph production source change was needed.
