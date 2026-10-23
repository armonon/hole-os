# Window interaction recovery — 2026-10-23

## Scope and baseline

Continue the existing Hole OS, preserving its visual design, local data model and external app handoffs. The initial remote baseline was `549f4f116393b917e1e6c1d24bb27f1eaa7c3247`; its 14 existing tests passed. The live Welcome and desktop were inspected in Chrome.

During validation, main advanced to `a2154915914bd7821bcd158eeaf2b322f554c491` with the separate Welcome/browser work. This phase is integrated on that newer commit. The original checkout and its concurrent edits were never modified by this task.

## Completed slice

- One window-module owner now handles title-bar movement at desktop and compact widths.
- Movement and resize geometry remain previews until the initiating pointer releases. Cancellation, lost capture, Escape, blur, hidden document, viewport resize and window/space transitions discard the preview.
- Foreign pointers cannot take over, commit or cancel an active window gesture.
- Cancelling a fullscreen edge gesture immediately restores the previous dock visibility, transform and opacity. Releasing an intentional gesture still commits its selected destination.
- No new dependencies, service accounts, cloud processing or storage migrations.

## Evidence

- `npm run build` and `git diff --check` pass.
- `npm test`: 69 tests pass, including 55 new tests that execute the complete production window module in a small DOM/event fixture. They cover desktop/compact geometry, interruption, pointer ownership, saved geometry restoration and edge cancellation. The same fixture against the original module fails 48 cases; these include cases reflecting its former split ownership, not 48 distinct defects.
- Independent Codex review found no blocking defects in the production changes. The reviewer also authored the lifecycle tests independently of the implementation.
- Local Chrome: single-click opening, title-bar drag, arrow-key resizing, Notes editing, content scrolling, fullscreen and bottom-handle release to the spaces manager checked. The scrolling check reached `scrollTop=659` inside the 267px Notes editor without moving the desktop.
- After integration with the newer main, reload restored Notes content and its minimized session; reopening recovered the saved geometry. Pocket layout kept the window inside its roughly 400px field and allowed title-bar movement. Right-click and Shift+F10 opened Quick Tools, and Escape returned focus to the file.
- Real setup export completed despite a timed-out browser download event. The resulting JSON is 2,161 bytes, SHA-256 `17a66d69da15460553ef76066ce4e1818c347ce5879daaa42a4283661797ff25`, format `hole-workspace`, version 1. It contains layout/preferences and excludes the validation note.

## Limits and blockers

- Browser setup import/file upload could not complete because the Chrome extension lacks local file URL access. That permission was not enabled or bypassed. The import round trip and fresh file-conversion download validation remain outstanding.
- Chrome's internal downloads page was blocked by browser URL policy; the exported artifact itself was inspected through ordinary filesystem access instead.
- Physical touch, Safari and real trackpad gesture checks remain outstanding. Automated event tests do not establish physical-device behavior. Quiet motion was toggled in Chrome; operating-system reduced-motion emulation was not performed.
- A requested 320px browser viewport override did not change the observed 1046px viewport, so this phase does not claim a fresh 320px browser check. Pocket layout was checked instead; automated geometry cases run at 400px and 1200px. The temporary override was reset.
- The Mac remained at roughly 18 GiB available. The existing local-worker disk/timeout gates, locks, budgets and independent-review rules were preserved. No local models/workers were launched and no files were deleted to reclaim space.

## Next phases

1. Finish setup import, real conversion/download and physical-device validation when the required access/devices are available; test touch hold-versus-drag and gesture reversal on hardware.
2. Audit the actual Creating Co destinations and supported formats; classify each as local utility, external workflow, partial, concept or future.
3. Add a small capability registry and a few explicit file handoffs with result import, provenance and truthful activity reporting. Audio stem separation stays external.
4. Deepen project history/recovery and portable backups before any identity, private sync or remote execution work. Browser utilities, native/portable apps, local companions and remote streaming remain separate capabilities.

This phase does not claim that external destinations are embedded apps, that every concept tile works, or that setup JSON provides synchronization.
