# Bounded local content search

Search retains name/place/command matching and adds an explicit Search local text operation. Current text/JSON versions are searched by default; earlier versions and recovery drafts are separate opt-ins. No search index or extra content copy is persisted or sent remotely. Binary studios, image OCR and PDF content are not indexed.

Limits:200 attempted documents,256KiB per document,8MiB total admitted content,40 matches,2–160 character query. Oversized/missing reads count against attempt budget and are reported. Cheap draft-length admission precedes UTF-8 byte counting. A new query/filter or closing the dialog aborts previous work; stale responses cannot repopulate it. Project API scope includes owned and linked materials.

Actual Chrome156.0.8078.48 shell test `scripts/verify-content-search-browser.mjs`: history opt-in finds an older immutable version and opens a pinned preview; current-text result clears prior historical selection; draft opt-in opens durable recovery; reloading leaves current head unchanged. Core tests cover current/history/draft separation, Trash exclusion, size/read limits, binary exclusion, linked-project scope and cancellation. Independent review reproduced205 oversized reads bypassing the initial attempt limit; regression now verifies exactly200 attempts and a visible limit state.

Search snippets use textContent, never imported HTML rendering. This evidence covers text/JSON and the tested recovery types; it does not claim full binary content indexing or all studio-specific drafts.
