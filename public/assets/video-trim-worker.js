import { Input, ALL_FORMATS, BlobSource, Output, StreamTarget, WebMOutputFormat, Conversion } from './vendor/mediabunny/mediabunny.min.mjs';
const fail = (message, code = 'UNSUPPORTED_CODEC') => Object.assign(new Error(message), { code });
self.onmessage = async ({ data }) => {
  let input, verified;
  try {
    const { blob, start, end } = data;
    input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const tracks = await input.getTracks(), video = await input.getPrimaryVideoTrack();
    if (!video || tracks.filter(t => t.type === 'video').length !== 1 || tracks.filter(t => t.type === 'audio').length > 1 || tracks.some(t => !['video', 'audio'].includes(t.type))) throw fail('Choose one video track and at most one audio track.');
    const duration = await input.computeDuration(), width = await video.getCodedWidth(), height = await video.getCodedHeight();
    if (!Number.isFinite(duration) || duration > 600 || start < 0 || end > duration + .001 || end <= start || end - start > 30 || !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width > 3840 || height > 3840 || width * height > 8294400) throw fail('Source or selected range exceeds video trim limits.', 'RESOURCE_LIMIT');
    const maxBytes = 32 * 1024 * 1024, bytes = new Uint8Array(maxBytes); let size = 0;
    const target = new StreamTarget(new WritableStream({ write({ data, position }) {
      if (!Number.isSafeInteger(position) || position < 0 || position + data.length > maxBytes) throw fail('Video output exceeds 32 MiB.', 'RESOURCE_LIMIT');
      bytes.set(data, position); size = Math.max(size, position + data.length);
    } }));
    const output = new Output({ target, format: new WebMOutputFormat() });
    const conversion = await Conversion.init({ input, output, trim: { start, end }, video: { codec: 'vp8', bitrate: 2000000, forceTranscode: true }, audio: { codec: 'opus', bitrate: 128000, forceTranscode: true }, showWarnings: false });
    if (!conversion.isValid || conversion.discardedTracks.length || conversion.utilizedTracks.length !== tracks.length) throw fail('This browser cannot transcode every source track to VP8/Opus.');
    let lastProgress = 0;
    conversion.onProgress = progress => { if (progress - lastProgress >= .05) { lastProgress = progress; self.postMessage({ type: 'progress', progress }); } };
    await conversion.execute();
    const result = new Blob([bytes.subarray(0, size)], { type: 'video/webm' });
    verified = new Input({ source: new BlobSource(result), formats: ALL_FORMATS });
    const outputTracks = await verified.getTracks(), actualDuration = await verified.computeDuration();
    if (!size || outputTracks.length !== tracks.length || outputTracks.filter(t => t.type === 'video').length !== 1 || outputTracks.filter(t => t.type === 'audio').length !== tracks.filter(t => t.type === 'audio').length || !Number.isFinite(actualDuration) || Math.abs(actualDuration - (end - start)) > .25) throw fail('Encoded video failed track or duration validation.', 'OUTPUT_VALIDATION');
    self.postMessage({ type: 'done', blob: result, report: { engine: 'Mediabunny 1.51.0 / WebCodecs', sourceDuration: duration, requestedStart: start, requestedEnd: end, outputDuration: actualDuration, durationToleranceSeconds: .25, sourceTracks: tracks.length, outputTracks: outputTracks.length, width, height, encoding: 'WebM VP8/Opus transcode; not lossless or frame-exact', bytes: size } });
  } catch (error) { self.postMessage({ type: 'error', code: error.code || 'UNSUPPORTED_CODEC', message: error.message }); }
  finally { input?.dispose(); verified?.dispose(); }
};
