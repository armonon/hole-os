# Browser media action scope

The registered media verbs use real browser decoders and return actual derived Blobs. No server, native command, or machine-learning model is implied by a catalog tile.

| Action | Actual implementation | Boundaries |
| --- | --- | --- |
| `audio.trim` | Decode audio, select sample frames, encode interleaved 16-bit PCM WAV | A selected range within decoded duration; originals retained |
| `audio.normalize` | Measure sample peak, apply explicit peak gain, encode PCM WAV | Peak normalization, not LUFS mastering; silent input remains silent |
| `audio.wav` | Browser audio decode and PCM WAV encode | Re-encoding, not extension renaming or lossless source extraction |
| `video.thumbnail` | Load a Blob into an HTML video decoder, seek to the requested time, render decoded frame to PNG/WebP | Seekable browser-supported video; explicit upscale consent; aspect ratio retained |
| `video.audio` | Decode a video container's audio through AudioContext and encode PCM WAV | Only containers/tracks accepted by that browser's audio decoder; silent/unsupported input fails explicitly |

Input limit is 64 MiB. Decoded audio is limited to ten minutes, eight channels and 50 million samples; WAV output is limited to 256 MiB. The browser decoder chooses the output sample rate, which is recorded in provenance. Media operations are local and may consume memory while decoding; these limits do not turn browser decoding into a streaming engine. Thumbnail loads/seeks have a 20-second timeout and abort support. Media object URLs, video sources, timers, listeners and AudioContexts are released after success, error or cancellation.

Node tests verify WAV bytes/header/interleaving; thumbnail seek coordinates, aspect ratio and URL cleanup using a media harness; cancellation while loading; and explicit codec failure with no fabricated outputs. They do not prove that a specific browser supports a particular container. On 2026-10-26 the integration agent also verified a real thumbnail and approximately two-second WAV from the synthetic fixture in the local browser. This qualifies that observed browser/fixture combination, not every browser or codec.

The generated fixture `tests/fixtures/media-check.mp4` contains a two-second H.264 320×180 test pattern and AAC 48 kHz 440 Hz tone. It is 57,772 bytes and was inspected with `ffprobe`. Thumbnail time 0.75 / width 160 should yield a 160×90 PNG. Audio extraction, where the browser supports MP4/AAC decoding, should yield approximately two seconds of mono PCM WAV. The fixture is synthetic; no personal media is included.

## Required engine gates still outstanding

- **Cutout:** requires inspection and an authorized adapter to Luma's actual segmentation engine, including its model/runtime delivery and input/output contract. There is no local segmentation model in this repository.
- **Stem separation:** requires an actual compatible separation model/engine, weights, licensing review, browser or service execution budget, progress/cancellation and output validation. Current external StemDeck launching does not establish a Hole processing API.
- **Key/BPM:** requires a validated analysis engine with real confidence/limitations and test audio; there is no implemented analysis backend in the repository.
- **Captions:** requires real speech recognition/transcription with a model or authorized service, language handling, timing and user correction. Browser availability of media playback does not provide transcription.

These four are deliberately absent from the executable action registry until their real engines and contracts are established. They remain explicit required program work/dependencies, not completed features.
