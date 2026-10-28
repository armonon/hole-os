# Local Whisper and editable caption qualification

Qualified on2026-10-26 in disposable Chrome profiles, against actual source transport and the built Hole shell at127.0.0.1:5193. This is a bounded English speech workflow, not broad ASR-quality certification.

## Assets and licenses

Pinned model `Xenova/whisper-tiny.en` revision `79fb389fc764e7c395bd330e9531d9d32ada7049`:

- encoder_model_quantized.onnx:10,124,913bytes; SHA256 `8cc3c6f8563d1b3fbd2c5af9f64c2bed8b020bc593c402d1ef53b9f08fbf1b90`.
- decoder_model_merged_quantized.onnx:30,727,382bytes; SHA256 `dbb2e063b7fbc41d9803b9698f93ecb035c50cbb3fb87b56cb131e4a5eb99059`.

Both were deliberately downloaded for QA outside Git into `/tmp/hole-transcription-models`, verified against pinned Hugging Face LFS metadata, then installed through the same two-file CacheAPI path exposed in the product. Model weights remain absent from the public build and workspace backups. Network provisioning remained below the authorized150MiB cap; disk preflight found24GiB available. Config/tokenizer/runtime bundle is approximately4.16MB and recorded in `src/vendor/transcription/manifest.json`.

Primary license evidence: [pinned model card](https://huggingface.co/Xenova/whisper-tiny.en/blob/79fb389fc764e7c395bd330e9531d9d32ada7049/README.md) declares Apache-2.0 for the ONNX model; [OpenAI Whisper](https://github.com/openai/whisper/blob/main/LICENSE) is MIT. Transformers.js4.3.0 Apache-2.0 and ONNX runtime MIT notices accompany the bundle. The transformer bundle is explicitly marked as rebuilt with the WASM-only backend.

## Actual inference

Offline macOS `say` Samantha generated: “Hello world. This is a local speech recognition test. The blue bird is singing in the garden.” Audio was converted to mono16kHz WAV and padded with1.5seconds of silence, total7.322seconds. No personal recording, remote speech API or uploaded audio was used. The fixture is reproducible with `scripts/create-transcription-fixture.mjs` and is not shipped as user material.

Actual Whisper output: “Hello World, this is a local speech recognition test. The Bluebird is singing in the garden.” The model returned16 usable timed words. On the unpadded fixture, the final word extended beyond the audio duration; this exposed the need to preserve raw inference, report timing warnings and omit invalid timings from subtitles rather than invent times. The editor supplies explicit Add cue/Delete cue controls for reviewed corrections.

## Checks and results

- `node --test tests/actions.test.mjs tests/transcription.test.mjs`:36 passed. Includes native caption/source/model metadata admission, original inference retention, subtitle timestamps, edit/add/delete bounds, action output lineage, and early input/budget rejection.
- `node scripts/verify-transcription-browser.mjs`:PASS actual model install/inference; recognizable speech; native model word timing; TXT/SRT/VTT/nativeJSON; durable cue edit/save/reopen; simulated recovery-write failure preserves visible work and succeeds after retry;61second audio rejected before inference; cancellation/deadline; self-origin requests only (including self Blob audio).
- `node scripts/verify-transcription-shell-browser.mjs`:PASS file→Media tools→Transcribe speech→deliberate two-model installation→actual Action four outputs→Review captions→edit/add/delete→save/reopen→unsaved draft close/reopen recovery. Raw inference and immutable input/model lineage remain intact. Cancellation after inference before commit adds no assets. Pinned old native caption version remains unchanged when opening latest captions for editing.

The shell qualifier overrides the transcription worker response header with the intended strict CSP: `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'`. No model CDN/runtime wildcard is used. Worker model reads verify cached bytes and hashes; configuration reads verify bundled hashes; remote model loading is disabled.

## Material limits

English tiny.en,20MiB audio, known duration≤60seconds, one active job, maximum180second lifetime. Worker abort/deadline terminates inference. Browser decode/resampling precedes worker inference and cannot be synchronously terminated by worker shutdown; metadata admission and post-decode duration validation are provided, not a hard browser-process memory guarantee. Model transcription and timing require review. Plain-text output retains the original full inferred transcript; reviewed subtitles/native cues reflect user corrections. Models remain in a separately removable local cache and must be reinstalled after cache removal or on another device. No deployment or full external-studio parity claim follows from this local qualification.
