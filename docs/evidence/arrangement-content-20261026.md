# Arrangement restore preserves current native content

Qualified against the integrated local static preview on 26 October 2026 using Chrome 155.0.8059.85. `scripts/verify-arrangement-content-browser.mjs` runs real Glyph editing, Core persistence, runtime mounting and History restore buttons in a disposable browser context.

The regression creates a Glyph original with advance 600, keeps unsaved advance 650 in a recovery checkpoint, saves a minimized arrangement with geometry `[30,40,500,400]`, closes the editor and commits a later native version with advance 900. Restoring the arrangement opens 900 under a fresh runtime identity. The original bridge checkpoint and snapshot remain byte-equivalent as serialized JSON. The saved older recovery is not implicitly applied.

The test then edits the live editor to unsaved advance 950, changes its window geometry and restores the same arrangement again. Its runtime identity and unsaved 950 remain intact, while saved geometry and minimized presentation are restored. Core's committed head remains the version containing 900. No JavaScript page errors were observed. Two extracted-function tests additionally cover current-head selection and preservation of existing live instances.

The scoped implementation in `restoreArrangement` restores only native view state and ScenePilot's explicit media links. It opens current content with a fresh identity when no matching editor is live, avoiding accidental access to `bridge-state:<oldInstanceId>`. Existing live editors are preserved. The completion notice explicitly says saved recovery was not applied and original checkpoints remain retained. This change does not add a full recovery-management interface or automatically merge historical native drafts.

Commands: `node --test tests/arrangement-content.test.mjs` and `node scripts/verify-arrangement-content-browser.mjs`. Both passed. No build, deployment, physical-device or screen-reader qualification is implied by this browser regression.
