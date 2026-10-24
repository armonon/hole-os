# Portable Cluster setup — 24 October 2026

This bounded follow-up starts at `0082300722c82f058bd477d4ccf54db7568caec3`. That commit was independently reviewed and its 19 live runtime files were byte-verified. Remote main matched it before this phase. Free space remained about 18 GiB; existing local-worker/model gates were preserved.

## Portable metadata

Setup export uses `hole-workspace` version 2. It carries layout/views/project spaces plus Cluster/folder names, stable group identities, app shortcuts and membership IDs. Geometry is limited to built-in shortcuts, apps and containers. The serializer excludes local-file geometry, filenames, file contents, Notes, history, jobs, sessions and arbitrary extra fields. Welcome adds only its existing allowlisted appearance preferences.

File identifiers are references, not portable files. A local-file membership can reconnect only when the matching desktop shortcut and actual file-library identity both exist in this browser. Missing references are skipped and counted. No file, pin, placeholder or uploaded result is manufactured.

If a skipped file becomes available later, add its shortcut to the Cluster explicitly. Reimporting preserves the existing group instead of silently repopulating it.

## Compatibility and merge rules

Version 1 setup files remain accepted. Version 2 files require the new runtime; older runtimes reject their version instead of interpreting them incorrectly.

Validation and the complete merge plan run before gesture cancellation or any workspace mutation. Unsupported versions and malformed/cyclic/duplicate group structures are rejected. Existing groups retain their names, records, geometry and ownership when identities collide. Imported groups cannot adopt an existing root group. Existing app pins and private data remain intact. Nonconflicting new groups use their original stable IDs, making repeat imports idempotent. Valid missing references and capacity conflicts are skipped and reported.

Import remains an explicit layout action: supported layout/view data can change, and previously ungrouped shortcuts can join a new imported group. Existing custom project names win ID collisions. Group/project/membership limits remain bounded; unavailable destinations fall back safely to My desk.

The import UI reports what was added, kept or skipped and states that file contents and Notes were not imported. Its asynchronous reader accepts only the latest selection, and waits for the existing file library to finish loading before resolving IDs. Invalid or superseded reads do not apply preferences.

## Verification boundaries

All 240 production-code tests pass, including 45 setup model/integration cases. `npm run build` and `git diff --check` pass. Independent review found no unresolved blocker. Baseline replay confirmed two repaired defects: malformed legacy input could mutate the workspace, and a delayed older file read could overwrite the latest selection. Current tests verify rejection before mutation and cancellation of stale reads.

Verification uses synthetic fixtures against production parser/serializer/merge, shell functions and the actual asynchronous Welcome handler. This is not a browser file-chooser round trip, a confirmed setup download, a physical device test or a file backup test.

The previously denied local-file chooser was not retried. Chrome permissions were not changed. Native input remained blocked after the fresh Mac inspection reported a locked screen. Existing Safari, physical touch/trackpad and true 320px validation gaps remain open. No local model/worker dispatch, cleanup, spending or credentials were used.
