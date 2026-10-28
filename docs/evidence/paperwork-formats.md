# Paperwork format and recovery journey

Qualification date: 2026-10-28. Complements `storage-everyday.md`; does not replace the separate PDF/offline/backup evidence.

## Changes

Existing `HoleEveryday.newDocument(ctx, existing?)`, `tableEditor`, `formEditor`, and `paperwork` interfaces remain unchanged. The shared shell needs no new hook.

- Markdown now has a direct exact-source export alongside escaped standalone formatted HTML. Oversized source still remains editable/exportable and is drafted; preview reports the 500,000-character format limit and Save refuses rather than losing input through a thrown input handler.
- Imported form field IDs use own-property lookup and null-prototype answer maps. `__proto__`, `constructor`, and `toString` remain valid saved data keys. Inherited answers cannot satisfy required fields. Checkbox acceptance requires boolean `true`. Incomplete question labels or an empty draft reopen for repair while version saves retain strict validation. Field IDs and labels are bounded; unrecognized native properties are retained.
- Saving a form retains unsubmitted answers in its durable draft. Initial drafts migrate to the new asset's identity; later edits reopen under that identity. A successful response clears the submitted answer controls, including when later draft maintenance fails.
- Save operations disable editor controls and Escape until their awaits finish, preventing new edits/duplicate submissions from being cleared by an earlier save. Failed saves reenable controls and preserve the editor.
- Table recalculation updates outputs and chart in place: blurring a cell no longer destroys the next focused cell and loses its edit.
- Editors expose Retry draft save. A failed draft write blocks close until retry succeeds, or explicit discard/export is chosen. Question type/required/remove controls have question-specific accessible names.

## Reproducible checks

`node --test tests/everyday.test.mjs tests/everyday-formats.test.mjs`: 15 passed.

`HOLE_PAPERWORK_SOURCE="$PWD/src/everyday.js" node scripts/verify-paperwork-formats-browser.mjs`: passed against actual shell at port 5193 with only the owned source overridden. Fresh browser storage; real Core asset versions and IndexedDB. Output `/tmp/hole-paperwork-browser.log`.

The browser edits, saves, reloads and reopens Markdown, a formula table and a local form. It checks exact Markdown source; actual HTML strong markup with escaped scripts; calculated CSV containing 42; table original formula/input persistence; unsent form answer recovery after Save form; typed required rejection; one saved response in exported JSON and after reload; injected document/form commit refusals preserve input; injected table draft refusal blocks close, retry persists and reload recovers. It checks keyboard Tab from Question 1 to Question 1 type and no overflowing form controls at a 320px viewport. A deliberately delayed response draft write proves replacement controls remain disabled until completion. Incomplete form labels recover and can be repaired. Page errors: zero.

Final built-shell qualification: `node scripts/verify-paperwork-formats-browser.mjs` (no override) passed all assertions after coordinator rebuild. Output `/tmp/hole-paperwork-built-browser.log`: sourceOverride false, all format/recovery/refusal/delayed-save/keyboard/320px flags true, errors empty.

## Scope

Markdown supports the existing heading/emphasis/list/quote subset; exported HTML is a standalone rendered document, not an arbitrary HTML authoring engine. Tables remain bounded to 100×26 with the existing arithmetic/SUM/AVERAGE grammar; CSV exports computed values, while the saved native asset retains formulas. Forms remain local-only and do not send responses. These checks are targeted Chromium evidence, not a screen-reader or cross-browser certification. No hosting, network synchronization, or new remote dependencies were added.
