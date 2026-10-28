# Independent local reader sessions and shared listening ownership

Each reader now owns its render token, exact immutable asset/version, page, bookmarks, kept notes and pending note text. `HoleLibraries.createReaderSession(ctx,{instanceId,ref})` returns async `render`, `serialize` and `dispose`. An exact ref is required. The model's optional `{instanceId}` scope uses a separate settings key, leaving legacy main-reader keys unchanged. Reader source bytes are never modified. Serialization records the exact source; disposal waits for durable pending edits and rejects on persistence failure before removing the reader.

Pending notes autosave after 200 ms. A failed save leaves the text and session alive, with an explicit retry control. Reopening the same instance/source restores the pending note and page. Opening another source version or another instance cannot consume the prior session's notes. Rendering a second PDF reader no longer invalidates the first reader's draw token. Main-screen reading uses its own session; root navigation must await `HoleLibraries.beforeLeave()`.

`createListeningSession(ctx,{instanceId})` owns a queue view, not another audio engine. All listening views deliberately control one central player and durable queue. Mount/restore loads paused; only explicit Listen starts playback. Closing a queue window leaves the shared player alive. Queue windows refresh on queue changes. Selecting/removing a displayed item resolves its exact asset/version against the latest queue rather than replaying a stale index. Late playback checkpoints carry an expected current ref, preventing an old track's position from being written to a newly selected track.

PDF annotation remains the existing, separately labeled shared PDF workbench, including its existing asset-level annotation recovery. This change isolates reading positions and reading-note drafts, not the separate PDF-editing format.

## Verification

- `node --test tests/library-model.test.mjs tests/library-sessions.test.mjs`: 8/8 pass. Includes legacy state compatibility, two independent reader scopes, version separation, storage failure, stale queue identities and stale playback checkpoint protection.
- `node scripts/verify-library-sessions-browser.mjs`: passes with owned source overrides in Chromium 156.0.8078.48 on the real local shell. A real two-page PDF renders concurrently in two readers: page 2 is blue while page 1 remains red. Pending notes differ and recover after disposal/reopen. Injected persistence failure blocks closing the affected session and retains its pending text while the other reader remains intact. Retrying storage saves and reopens the text. A kept note in one reader does not clear the other's pending draft. No page errors.
- Root owns window routing, arrangement restoration and its explicit saved-version restoration choice. Actual built window and arrangement journeys are qualified separately after integration; API tests do not establish that UI qualification.

## Built windows and arrangement journeys

`node scripts/verify-library-windows-browser.mjs` passes against the integrated shell on port 5193 (Chromium 156.0.8078.48). It opens two actual Librarian windows through the header controls, places them side by side using Window layout, retains different PDF pages and pending notes, and saves an arrangement. After closing both and creating a new source version:

- Default restore opens current content with new instance IDs and separate empty note scopes.
- Repeating that default restore reuses the live reopened instances.
- Explicitly checking “Reopen reader windows at saved versions” restores the saved IDs, exact older source versions, pages and pending notes.

A real Close Librarian window click was tested with injected Core failure for reader-state writes. Runtime serialization rejected; the window stayed running with its unsaved text, and the other reader stayed unchanged. Restoring persistence and using Retry reading save completed the pending write. The qualifier uses built module bytes, with only Core write failure injected for this rejection case.

The built Bounce window test verifies one central audio element, no automatic playback on mount, and that closing the queue window leaves the central player present and paused. No page errors occurred.

Each reader now also registers a beforeunload handler while its local edit revision differs from its acknowledged revision. It is removed on successful disposal. The API browser qualifier confirms a failed save cancels a synthetic beforeunload event, and the event proceeds after durable acknowledgment. Serialization awaits both render setup and pending writes; disposed sessions reject late mutations and invalidate pending draws.

Final serial-build qualification passed with `HOLE_QA_SOURCE_OVERRIDE=0` and the built window script, including the beforeunload and close-failure guards above. One initial Chrome launch timed out before page creation; its log is preserved in `/tmp/hole-wave9-readers.log`. Unchanged fresh runs passed with no page errors.
