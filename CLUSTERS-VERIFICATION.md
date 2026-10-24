# Desktop Clusters — 24 October 2026

## Scope and implementation

Continues `d069f572d349a9193c8ce2f5f8e71cac7cad73ff`. Before changes, remote main and the isolated working checkout matched that commit. Its live index and seven runtime assets were byte-verified against the build. The original checkout remained clean at `a2154915914bd7821bcd158eeaf2b322f554c491`; no partial Cluster work existed.

A desktop item dragged into another item's central drop zone gets an explicit hover cue. After 300 ms it shows a release cue. Releasing there creates a Cluster, or adds to an existing Cluster/folder. Leaving, changing targets or cancelling resets the cue. Release checks current source, target, location and space again.

Clusters contain shortcuts to apps, existing local files and nested logical folders. Folders are browser-local shortcut containers, not disk directories. The original Notes content, IndexedDB bytes, file identities and version histories remain unchanged. Removing membership returns a shortcut to the desktop; ungrouping keeps all children in the containing group or desktop. The model rejects self/cyclic grouping, unknown references and duplicate ownership, with bounded limits of 80 groups and 500 membership links.

Single click opens a Cluster in a normal managed window with resizing, fullscreen, minimization and dock access. Breadcrumbs, rename, explicit add/move, move out and ungroup controls work with keyboard navigation. Quick Tools → Organize is the alternative to dragging. The Clusters control also places catalog app shortcuts on the desktop and retains their local/external/partial/concept/future labels. This does not embed or connect external apps.

Membership, placements, app pins and the last opened group persist in browser workspace storage. Setup JSON intentionally excludes Clusters, memberships and newly placed app pins, as well as private file data. It remains layout metadata, not a backup or sync mechanism. Storage failures retain the existing shell behavior; browser storage availability is required for persistence.

## Demonstrated reliability fixes

- Desktop movement now previews in CSS without changing persisted placement. An unrelated save during a drag therefore cannot save an uncommitted preview.
- Escape, pointer cancellation, lost capture, blur, hidden-page and stage-resize paths discard previews and grouping cues. Pinch promotion cancels the file operation.
- Removing a source file during a drag cannot recreate an orphan placement on release.
- Clusters can launch from their dock entry while the App Drawer is open, despite not being a catalog orb.
- Group controls retain keyboard focus after rerenders; focused form drafts survive same-view refreshes.
- Quick Tools organization stays with the source item's space even when the Cluster window was previously elsewhere.
- Dark and light appearance use the shell's existing color variables.

## Automated verification

`npm test`: **195 passed**, zero failed. `npm run build` and `git diff --check` passed.

New independent regression suites exercise production code:

- 19 model tests: immutable operations, malformed restore data, forward references, cycles, ownership, capacities, safe identifiers/names and original-preserving ungroup.
- 36 gesture tests: production binder and desktop adapter plus actual Cluster controller/model. Includes 299/300 ms dwell, central hit zones, reversal, release re-hit, target switching/removal/hiding, source removal, stationary touch Quick Tools followed by continued drag, pointer ownership, click suppression and cancellation routes.
- 18 integration tests: production module and actual shell restore/export/source-rectangle logic. Includes app/file restoration before membership, stale-container replacement, nested navigation, space inheritance, focus/drafts, missing local files, literal names, metadata-only export and cross-space organization.

Independent review found and confirmed fixes before publication. No remaining review findings.

## Browser verification

Chrome on the shared Mac, existing local preview data, through visible UI:

1. Placed Notes and Clock app shortcuts on the desktop.
2. Opened Quick Tools with Shift-F10; cancelled an organization action without membership changes.
3. Grouped Notes and Clock using keyboard controls; renamed the result Studio Cluster.
4. Created a nested Drafts folder. Added the existing `workflow-source.txt` shortcut.
5. Opened that grouped file in Files: original 52-byte text and Notes provenance remained visible and unchanged.
6. Reloaded: Cluster name, hidden member shortcuts, nested folder, file membership and managed window/current-group recovery remained intact.
7. Moved the file to the desktop, added it again, and ungrouped Drafts. The file remained in Studio Cluster and in Files; no file deletion occurred.
8. Verified single-click desktop opening and reopening Clusters from the dock while App Drawer was open.
9. Checked fullscreen and real content scrolling (777px client height, 976px content height, 199.5px scroll offset), keyboard window resizing, and Pocket layout at an observed 390px shell width with quiet motion enabled. Screenshots checked text contrast and wrapping.

The browser automation surface does not expose a held pointer with separate move/release controls. The complete drag dwell/cancellation route is covered by production-function tests, not claimed as a physically performed mouse/touch sequence in this phase. Physical touch, Safari, real trackpad, OS reduced-motion and true 320px viewport verification remain outstanding.

The preexisting unattributed console message, `Could not establish connection. Receiving end does not exist.`, remains visible. Earlier same-time extension logs suggested an extension source, but attribution was not proven. No suppression or permission workaround was introduced.

The blocked local-file chooser was not retried and Chrome permissions were not changed. Setup-JSON import round trip, fresh image import/conversion downloads and external result import still need their previously blocked validation. This phase makes no new browser-download-completion claim.

## Resources and remaining roadmap

Free space was about 19 GiB initially and 18 GiB at the final check. Existing local-worker/model resource gates, locks and budgets were preserved. Only bounded source edits, Node tests/build and the local preview server were used; no gated local dispatch, cleanup, spending or credentials.

Next useful phases remain physical interaction validation and a narrowly supported external result-linking workflow with explicit consent/provenance. Identity, cross-device sync, remote native apps and backups remain future work. Current catalog classifications and external manual handoff limits are unchanged.
