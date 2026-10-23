# File history and continuity — 2026-10-23

## Baseline and completed slice

Continues main `532f4e006a3db1512cbeaab0ec87c52c162862b7`. Remote main and both checkouts were inspected before work. The original checkout remains untouched; implementation and testing use the isolated checkout. No dependency, storage migration, external processing or new service was introduced.

The bounded loop is duplicate a real version → inspect its immediate source → follow Open source back to the original → navigate forward through history → rename/download the copy. It addresses demonstrated defects rather than adding another app surface.

- Duplicates now record Files as the creating utility and the actual immediate source, retaining the original root. Both metadata and content use insert-only storage, so collisions abort instead of replacing existing files.
- Old copies with inherited provenance display the live immediate parent correctly without rewriting saved records. An unrelated saved source name is not used when that parent is missing.
- Open source appears only when the immediate source remains in the library. History shows direct parents and explicitly identifies a missing original or source. Remaining versions stay usable; no recovery or backup is claimed.
- File selection and history/source navigation keep keyboard focus on the selected file. Rerendering after background changes retargets Quick Tools and dialog return focus; a removed origin falls back to New text.
- A delayed rename/removal completion can no longer close a newer dirty editor. A delayed duplicate does not steal a newer selection or dialog.

## Demonstrated issues and validation

Before the change, duplicating `workflow-source edited.txt` displayed `Text editor · From workflow-source.txt · Duplicate`, even though the copy's immediate source was the edited file. The browser also showed focus falling to the page body after file selection and duplication. An independent production-function fixture reproduced pending rename → close → open a new editor → type a draft → prior rename completes, which discarded that newer editor.

- **122 tests pass**, including 25 new regressions independently authored across file lineage, file navigation and overlay lifecycle tests. All 25 fail against the previous `532f4e0` source: 9 because the new model API does not exist, and 16 because the previous behavior fails the tested contract. These are test cases, not a claim of 25 distinct defects.
- Tests cover immediate parent/root attribution, original immutability, legacy/self-referencing records, missing source/root cases, selection and dialog return focus, delayed operations and insert collisions. Missing-source/removal cases use isolated fixtures; no user file was deleted to exercise them.
- Independent source review found no remaining blocker in this slice. Build and diff checks pass.
- Local Chrome: old-copy attribution corrected visibly; Open source followed copy → edited version → original; keyboard history selection focused the destination file. A new copy recorded its immediate source, rename preserved focus, and history displayed the rename event alongside the parent.
- Native download of `lineage-verified-copy.txt` completed. Ordinary filesystem inspection verified all 74 bytes against the expected source text, with SHA-256 `433322dc629ca6865a7c6e67fb8794df150373e19905b16f899179983d7b657f`.
- Reload preserved the copied file, history, Notes content and Pocket layout. The history dialog fit the roughly 400px Pocket field with Quiet motion enabled. This does not establish physical-device or operating-system reduced-motion behavior.
- Real cross-tab check: while one tab held an unsaved text edit, a second tab renamed its source copy to `lineage-verified-renamed.txt`. The first tab retained the exact draft and editor focus. Explicit discard then returned to the refreshed Open with button, and the preview showed the new filename and unchanged file bytes.

## Browser connection-error investigation

The earlier logger entry was `Error: Could not establish connection. Receiving end does not exist.` with the page URL and no stack. A subsequent live inspection reported the same message alongside same-timestamp `MaxListenersExceededWarning` and `ObjectMultiplex` warnings attributed to `chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/scripts/contentscript.js`. The local preview also logged warnings from that extension.

An independent scan of first-party and vendored source found neither the connection-error string nor extension messaging APIs. Hole uses a same-origin BroadcastChannel for library updates. This evidence suggests browser-extension involvement, but does **not** establish which component emitted the unstacked connection error. No application error was suppressed and no extension was altered.

Two diagnostic limits remain:

- Navigation to the no-script local 404 control at `http://127.0.0.1:5174/connection-control` was blocked by the browser with `net::ERR_BLOCKED_BY_CLIENT`; it did not load and was not retried.
- Native Google Chrome console inspection was blocked because the Mac was locked and automatic unlock could not unlock it. Native source tracing did not run; manual unlock is required to continue that path. Supported DOM browser checks remained available and were used independently.

The exact console origin remains unresolved. The product workflow findings above are independently reproduced and tested; this phase does not claim to fix an unattributed extension/browser error.

## Preserved limits and next work

The previously blocked local-file chooser was not retried and Chrome permissions were not changed. Setup import round trip, fresh image-conversion download/import and external-result import/linkage remain outstanding. Physical touch, Safari, real trackpad, a fresh true 320px viewport check and OS-level reduced-motion checks remain unverified. Text download completion is supported by actual artifacts; external app opening is not processing evidence.

External routes remain manual. Unsaved drafts are protected from stale in-page completions but do not have reload recovery. Portable setup JSON remains layout metadata, not private files, notes or account sync.

The Mac retained roughly 18 GiB free. Resource gates, locks, budgets and independent review were preserved. No gated local workers/models, cleanup, spending, credential creation or permission changes occurred. Next work should finish the blocked/device checks when access is available, then implement and verify explicit external-result linkage or draft recovery as another bounded phase.
