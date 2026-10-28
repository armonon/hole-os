# Tongue local timed practice

2026-10-28. This adds the previously missing path from actual local transcription captions/SRT to saved listening and written practice. Existing manual phrase cards and browser translation remain available.

## Interfaces and storage

Load `tongue-practice.js` before `world-tools.js`, after the existing transcription caption validator. `HoleTonguePractice.mount(ctx,host)` adds selectors/import/lesson controls; `beforeLeave()` flushes and closes an active practice modal, rejecting on pending write failure; `dispose()` stops playback. `HoleWorldTools.beforeLeave()` delegates this guard; its render awaits the guard. The coordinator must await this before its existing synchronous WorldTools disposal on navigation/close/render replacement.

`HoleTonguePracticeModel` provides `parseSRT`, `srt`, `cues`, `lesson`, `createLesson`, `check`, exact-ref `resolve`, native/SRT `source`, and revisioned `session`. A stable `tongue-practice:<UUID>` settings record belongs to one explicit project (or personal/null), with exact caption asset/version and optional explicitly chosen audio asset/version in both its value and `inputs`. Cue copies, provenance, answer drafts, selected cue, and inspectable attempts/matches are stored together. Aggregate record limit is 128 KiB; value admission reserves 4 KiB for record metadata and writes verify the full record. Raw caption JSON/SRT remains in its immutable asset version.

Local source selectors capture versions at rendering. Native `hole.captions/1` uses the existing validator and retains declared model/revision/file hashes and source reference as attribution. Selecting native captions checks availability of their declared exact audio locally and offers a distinctly labelled pinned-version option, including when the audio head has advanced. It never selects or plays that option automatically: pairing requires the user to choose it. SRT has no implicit file references. Import validates SRT before saving its original bytes. Missing/trashed/mismatched caption sources reject on reopen; changed heads are not substituted. If only paired audio is missing or trashed, an explicit “Open written practice without audio” choice recovers cues/answers/progress and JSON/SRT export. It does not rewrite or replace the saved audio reference.

## Bounds and behavior

At most 200 nonempty ordered, nonoverlapping cues, each 4,000 characters, within one hour; source at most 2 MiB; explicitly paired audio at most 50 MiB. Native caption validator retains its existing 60-second/model metadata constraints. Plain transcripts lacking timing are refused rather than given invented timings. SRT parser accepts numbered standard `HH:MM:SS,mmm` timing lines and preserves Unicode/multiline text. Export uses actual source cue times/text. Native cue text containing blank paragraphs/carriage returns is refused for SRT export rather than silently rewritten.

Listening seeks actual local audio to the chosen cue and pauses on cue completion, Stop, cue switch, close, or disposal. No autoplay on open. Opening requests and close requests are serialized so double clicks or navigation during resolution cannot orphan a practice modal. Metadata waiting is bounded to five seconds; late playback is invalidated by close/stop. Cue completion is polled against the actual media clock (rather than an early wall-clock cutoff), with a cue-duration-plus-five-second stalled-playback deadline. Browser scheduling limits clip-stop precision; this is listening practice, not frame/sample-exact media trimming.

Written matching uses NFC, case folding and collapsed whitespace, retaining accents. Counts/answers are inspectable and reflect user submissions; there is no pronunciation, fluency or translation quality score. No model/provider/network is invoked by this practice module. This does not add a conversational teaching engine or physical microphone qualification.

## Evidence

`tests/tongue-practice.test.mjs`: six focused checks pass for timestamp/Unicode roundtrip, malformed/overlapping/oversized sources and aggregate limits, exact text attempts, exact-ref/trashed/foreign/audio size rejection, project isolation and failed/stale revision recovery, and malformed restored provenance refusal without rewriting the record.

Staged actual-shell command:

`HOLE_TONGUE_STAGE=/tmp/hole-wave12-tongue node scripts/verify-tongue-practice-browser.mjs`

The browser imports a real locally generated WAV and native caption fixture, creates a lesson via actual Tongue controls, listens to a cue and observes seek/stop, saves a written attempt, inspects exact refs/model attribution, injects a refused settings write and verifies Close/beforeLeave refusal, retries and reloads the answer/selected cue, imports a real SRT file and checks identical exported text, offers the declared old audio version after its head advances without autopairing, recovers/export answers through explicit written-only mode after audio is trashed while retaining its exact reference, and denies a trashed caption source. The missing-audio recovery option and written practice controls fit a 320px viewport; keyboard Enter opens recovery, Tab moves from cue selection to the labelled answer, and Enter closes the modal. No external requests or page errors. The fixture is deliberately author-generated, not presented as model accuracy evidence or physical speech qualification. Logs: `/tmp/hole-tongue-practice-staged.log`.

After coordinator build, run `node scripts/verify-tongue-practice-browser.mjs` without the stage variable for built qualification.

Final built journey passed without source overrides in `/tmp/hole-tongue-practice-built.log`, including actual media-clock cue stopping and 320px keyboard recovery. Independent review then found two recovery/lifecycle defects, now fixed: missing/malformed provenance is rejected before opening a modal (original record retained), and navigation closes admission until a new mount, with per-mount generation checks rejecting old controls. Initialization failures clean up partial dialogs, audio URLs, timers and unload listeners. Failed saves restore admission for retry.

The expanded source journey passed `/tmp/hole-tongue-practice-source-final.log` with `malformedProvenanceRetainedWithoutModal:true`. `scripts/verify-tongue-navigation-browser.mjs` passed `/tmp/hole-tongue-navigation-source.log`: pending A → workspace Close → B cannot queue a late dialog; a fresh mount opens normally. Coordinator rebuild and final no-override reruns cover these last independent-review fixes.

Final coordinator build qualification passed both scripts without source overrides after both independent-review fixes. `/tmp/hole-tongue-practice-built-final.log`: all journey flags true, including malformed provenance retained without a modal, no external requests, zero page errors. `/tmp/hole-tongue-navigation-built-final.log`: queued open denied during close, no orphan dialog, subsequent fresh mount reopens, `sourceOverride:false`. Ten focused Tongue/world-tools unit tests also pass (`/tmp/hole-tongue-tests-final.log`).
