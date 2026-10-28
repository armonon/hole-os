# Independent Paperwork new drafts

2026-10-28. This increment adds identity isolation; format/export checks remain in `paperwork-formats.md`.

## Scope contract

The tool-window adapter supplies `ctx.paperworkInstanceId = instance.id` for Paperwork. Existing editor functions and main Paperwork contexts remain unchanged. `HoleEverydayModel.paperworkDraftKey(kind, assetId, instanceId)` accepts document/table/form:

- Saved asset: `paper-<kind>:<assetId>`, unchanged across instances. Existing revision/ACK conflict checks remain shared.
- Main view without instance ID: `paper-<kind>:new`, unchanged. Legacy records are neither migrated nor consumed by independent windows.
- New window draft: `paper-<kind>:new:instance:<encoded-instance-id>`. Instance IDs must contain 1–200 characters. Reopening the same runtime identity and editor recovers its pending data; another identity begins independently.

First successful save continues moving future drafts to the saved asset's shared identity. Forms acknowledge the newly committed asset/base version in the old scoped draft before copying to the asset key; an interrupted copy therefore recovers the same asset and unsent answers instead of creating a duplicate. Migration compares actual session keys rather than assuming a current asset implies migration already succeeded. A window identity is not a new asset identity and does not fork existing objects.

## Checks

`node --test tests/everyday*.test.mjs`: 21 passed. `tests/everyday-sessions.test.mjs`: key compatibility/isolation for all three formats; injective encoding; identity admission; independent draft recovery; unchanged saved-asset stale revision refusal with losing editor value retained.

`scripts/verify-paperwork-sessions-browser.mjs`: real shell and two actual Paperwork windows, sequential owned dialogs, all three new draft kinds with distinct text; reopen each; injected failed settings write blocks Close/Escape and retains text; retry; save arrangement, close windows and explicitly restore same runtime identities; recover each document draft; verify legacy main keys remain byte-for-byte unchanged. An injected first form asset-key draft refusal proves same-window recovery/retry creates no duplicate asset and removes the old scoped draft only after acknowledgement. No full format matrix repeated.

Source-override real-window run passed all checks with zero page errors (`/tmp/hole-paperwork-sessions-browser.log`). Final built no-override qualification also passed all assertions after coordinator rebuild (`/tmp/hole-paperwork-sessions-built.log`): sourceOverride false, all isolation/recovery/migration/error flags true, errors empty.

During staging, `HOLE_PAPERWORK_SOURCE=/tmp/hole-wave11-paperwork/src/everyday.js` overrides the owned module and supplies the agreed scope property in the tool-window response only if the current built adapter lacks it. The final no-override invocation exercises coordinator-built assets. Failure injection wraps only the context Core settings write; storage and runtime instances are real.

Saved-asset stale ACK is covered at the draft-session boundary. One page's native modal interaction prevents simultaneous user interaction with two document dialogs; no claim of bypassing that modal policy is made.
