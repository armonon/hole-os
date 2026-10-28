# Private curated press kits

The Publish surface now offers an explicit private press-kit workflow. The user supplies the title, short bio, credits and contact details and selects exact saved versions. Review locks a manifest before a local ZIP is created. No text is invented, and no site, message or external publication is created.

## Data and recovery contract

`src/press-kit.js` exports `HolePressKit.create({core, projectId, codecs})` and `mount(target, {core, projectId, onOpen})`. Sessions expose `set`, `flush`, `review`, `run`, `cancel`, `newRevision`, `state` and `beforeLeave`. Mount returns the session plus guarded `beforeLeave` and `dispose` hooks. The shell owns mounting and navigation.

Drafts live in version-checked Core settings scoped to the selected project or personal workspace. Failed writes retain the in-memory text and block navigation; a beforeunload guard covers undurable edits and active preparation. Flush drains edits arriving during pending writes. Disposal freezes input before draining and leaves the editor active if persistence fails.

Review persists the exact source IDs, version IDs, hashes, sizes, MIME types and archive paths with the authored document and a stable attempt/job identity. Restored attempts are checked for schema, scope, paths, bounds and agreement with the document before use. Editing a new revision explicitly retains the previous completed or cancelled job identity.

The ZIP contains `manifest.json`, `PRESS-KIT.txt` and the exact selected source bytes. Source hashes are verified. A later source rename or head advance does not change the reviewed archive. Output creation uses Core `commitJobOutputs`, with explicit parent version IDs for every selected input and private provenance. The attempt fingerprint includes destination, filename, document, source pins and timestamp. Retrying a completed attempt returns the original output, including after an ambiguous acknowledgement and later source trash. A new commit rechecks active sources; cancellation is accepted only before the atomic commit boundary.

## Bounds and limits

At most 20 distinct versions, 16 MiB per source, 64 MiB total source bytes and 65 MiB output are accepted. Archive paths are bounded and sanitized, and text fields have fixed length limits. The picker displays at most 1,000 active files and explicitly reports that limit. It does not search older unlisted files. ZIP creation uses the existing deterministic STORE ZIP codec; it does not compress or fetch content. The local archive can contain private contact information because the user explicitly supplies it; no public-hosting workflow is implied.

## Verification

`node --test tests/press-kit.test.mjs`: six passing tests cover deterministic exact-byte output, stable pins and lineage, lost acknowledgement retry, failed draft persistence, source trash, cancellation, malformed restored attempts, source bounds, duplicate selection and the delayed-write/new-edit/leave regression. The race was independently identified by the Flow reviewer and fixed by draining all edit epochs before leave resolves.

`node scripts/verify-press-kit-browser.mjs` exercises the generated shell on port 5193 with installed Chrome and real Core/IndexedDB, without script overrides. Final post-fix run passed on Chrome 156.0.8078.48. Actual Publish controls curated two exact versions; inspecting the saved ZIP confirmed original bytes, reviewed names, authored manifest text and both immutable parent IDs after a source head/name advance. Reload retry produced one output. Injected IndexedDB write failure refused navigation and prevented beforeunload until the draft became durable. An actual Core commit followed by a lost acknowledgement replayed the same output after source trash. Cancellation during ZIP preparation produced no output. Delayed real Core persistence drained a newer edit arriving during leave. At a 320×740 viewport, the kit measured 292px client width and 292px scroll width, and Tab moved from title to bio. The first run identified 40px overflow; bounded controls and selectors fixed it.

This evidence does not claim physical mobile-device, screen-reader, production hosting or cross-device tests.
