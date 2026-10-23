# Shared file workflow — 2026-10-23

## Baseline and scope

Continues main `5e70e95acdc7bee385ac7ddf262d5311a476ff84`, including the accepted window-recovery and concurrent Welcome/browser phases. Remote main was checked again before publishing and had not advanced. Work remains isolated from the original checkout.

The completed loop is Notes → separate real text original in Files → Open with → local Text editor → separate saved version → history, activity, preview and download. Files also creates plain text and Markdown originals. No storage migration or dependency was added.

The [catalog audit](CATALOG.md) classifies all 52 launcher entries: 3 local utilities, 16 external launchers, 2 partial previews, 28 concepts and 3 future capabilities. Files exposes those descriptions; drawer tooltips and accessibility descriptions use the same registry. The registry restricts routes to declared MIME types and valid size metadata.

## What works

- Notes exports a read-only snapshot without changing the scratchpad. Local text edits preserve the original bytes and metadata, saving a new file with parent/root lineage, app/source provenance and a history event.
- Text is restricted to valid UTF-8 plain text or Markdown, at most 262,144 bytes. Markup is treated as literal text. Filenames exclude path separators and control characters.
- File metadata, bytes and completed activity are committed in one IndexedDB transaction. A rejected commit does not report a completed result. Identifier collisions cannot replace an existing record.
- Closing a dirty editor asks whether to keep editing or discard. Escape and backdrop closing use the same guard. Overlay transitions preserve the originating keyboard focus, including the Quick Tools path. Closing a loading editor prevents a delayed decode from replacing a newer dialog.
- Luma, Bounce and Librarian have explicit manual download/open instructions for conservative image, audio and PDF input sets. Opening an external link sends no file bytes, starts no processing job and claims no automatic return.

## Validation

- `npm test`: **97 passing tests**, including 7 catalog/route tests, 13 text validation/persistence tests and 8 overlay regressions added in this phase. The earlier 69 tests remain passing.
- The independent reviewer authored text and overlay tests, identified a lost-focus defect, and confirmed the corrected production code has no remaining blocking findings. All 8 new overlay regressions fail when the previous focus behavior is restored.
- `npm run build` and `git diff --check` pass. Catalog tests compare all launcher names against the actual shell/ecosystem entries.
- Local Chrome: Notes snapshot saved as `workflow-source.txt` (52 bytes), then edited through Open with to `workflow-source edited.txt` (74 bytes). The original scratchpad and file stayed unchanged. History showed both versions; Activity showed the actual saved results. Reload restored the original note, both files and their previews/provenance.
- Both native Download links completed. Ordinary filesystem reads verified the exact expected UTF-8 bytes and SHA-256 hashes: original `db419c8ddd028188e1af585e59de61dd70fb04a60ed1bf6c081c156fbe083f1e`; edited result `433322dc629ca6865a7c6e67fb8794df150373e19905b16f899179983d7b657f`. These were new validation files in the local preview, not user files.
- New text saved `workflow-markdown.md` (67 bytes), preserving a literal `<script>` example as text. The editor and 52-entry capabilities list opened correctly. Pocket layout fit the editor in its roughly 400px field; desktop Notes retained its editable text and visible save action.
- Browser keyboard checks confirmed dirty Escape → Keep editing retained text; dirty Escape → Discard returned focus to the original Open with button; unchanged Escape from the Quick Tools route returned to the originating file control.

## Remaining limits

- External results still require ordinary manual import. There is no automatic handoff, external result association, cross-origin storage sharing, external progress monitoring or certified processing. Bounce is playback; Librarian is reading; neither route promises a transformed output. Audio stem separation remains external.
- The catalog distinguishes publisher declarations from runtime observations. Only Locker and Converter exposed substantial runtime text to the audit tool; other runtime retrieval limitations are documented. No external uploads, processing, accounts or paid actions were performed.
- The previously blocked Chrome local-file chooser was not retried, and browser permissions were not changed. Setup JSON import round trip, fresh conversion-result download/import and external-result import remain unverified. Text downloads are now verified independently of that chooser.
- Physical touch, Safari, real trackpad, operating-system reduced motion and a fresh true 320px viewport check remain outstanding. Pocket layout is not proof of those device paths. Earlier gesture and reduced-motion evidence is retained in [the preceding record](VERIFICATION.md).
- Saved files survive reload; unsaved editor drafts do not have draft recovery. Portable setup JSON still contains layout metadata only, not notes, file bytes or account sync.
- Roughly 18 GiB remained available on the Mac. Existing disk/timeout gates, locks, budgets and independent review were preserved. No gated worker/model dispatch, cleanup or spending occurred.

## Next bounded work

Finish the setup/device/import validation when access is available. Then add an explicit user-declared external result import with source/app lineage, keeping original preservation and honest activity semantics. Develop recovery/exported backups before identity, private sync or native/remote execution. Browser utilities, native apps, local companions and remote streaming remain distinct capabilities.
