/* Typed, browser-local actions. Every input is pinned to an immutable version;
 * only HoleCore acknowledges durable outputs. This module never publishes. */
(() => {
  'use strict';
  const codecs = globalThis.HoleActionCodecs;
  if (!codecs) throw new Error('Load actions-codecs.js before actions.js.');
  const sessions = new Map(), flows = new Map(), lockQueues = new Map();
  const imageTypes = ['image/png', 'image/jpeg', 'image/webp'];
  const audioTypes = ['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/flac', 'audio/webm'];
  const videoTypes = ['video/mp4', 'video/webm', 'video/ogg'];
  const isAudioAction = id => id.startsWith('audio.') || id === 'video.audio' || id === 'rack.render';
  const releaseSizes = Object.freeze([{ role: 'cover', width: 3000, height: 3000 }, { role: 'story', width: 1080, height: 1920 }, { role: 'social', width: 1200, height: 630 }]);
  const terminal = status => ['succeeded', 'completed', 'failed', 'cancelled', 'interrupted'].includes(status);
  const uid = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  const error = (message, code = 'INVALID_PARAMETERS') => Object.assign(new Error(message), { code });
  const copy = value => JSON.parse(JSON.stringify(value));
  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
  }
  function emit(type, detail) {
    if (globalThis.dispatchEvent && globalThis.CustomEvent) globalThis.dispatchEvent(new CustomEvent(type, { detail }));
  }
  async function core() {
    if (!globalThis.HoleCore) throw error('Workspace storage is not available.', 'STORAGE_UNAVAILABLE');
    await globalThis.HoleCore.ready;
    return globalThis.HoleCore;
  }
  async function update(type, id, patch) {
    const store = await core();
    for (let attempt = 0; attempt < 4; attempt++) {
      const current = await store.get(type, id);
      if (!current) throw error(`The ${type} record is missing.`, 'NOT_FOUND');
      const change = typeof patch === 'function' ? patch(current) : patch;
      if (!change) return current;
      try { return await store.put(type, { ...current, ...change }, { expectedRevision: current.revision }); }
      catch (cause) { if (attempt === 3 || !/CONFLICT|REVISION/.test(cause.code || '')) throw cause; }
    }
  }
  function abortCheck(signal) { if (signal?.aborted) throw error('Action cancelled. No new outputs were committed.', 'CANCELLED'); }
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  function format(parameters = {}) {
    const value = parameters.format || 'png';
    if (!['png', 'webp'].includes(value)) throw error('Choose PNG or WebP.');
    const quality = parameters.quality ?? .92;
    if (typeof quality !== 'number' || !Number.isFinite(quality) || quality < 0 || quality > 1) throw error('WebP quality must be between 0 and 1.');
    return { extension: value, mime: `image/${value}`, quality };
  }
  async function decodeImage(blob, signal) {
    abortCheck(signal);
    if (blob.size > 67108864) throw error('Choose an image smaller than 64 MiB.', 'RESOURCE_LIMIT');
    let image;
    try {
      if (typeof createImageBitmap === 'function') image = await createImageBitmap(blob);
      else if (typeof Image === 'function') {
        const url = URL.createObjectURL(blob);
        try { image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = url; }); }
        finally { URL.revokeObjectURL(url); }
      } else throw error('Image decoding is unavailable in this browser.', 'UNSUPPORTED_CODEC');
      codecs.dimensions(image.width || image.naturalWidth, image.height || image.naturalHeight);
      abortCheck(signal);
      return image;
    } catch (cause) { image?.close?.(); if (cause.code) throw cause; throw error('This image could not be decoded. Try a valid PNG, JPEG or WebP.', 'DECODE_FAILED'); }
  }
  async function renderImage(image, geometry, output, signal) {
    abortCheck(signal);
    const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(geometry.outputWidth, geometry.outputHeight) : globalThis.document?.createElement('canvas');
    if (!canvas) throw error('Canvas image processing is unavailable.', 'UNSUPPORTED_CODEC');
    canvas.width = geometry.outputWidth; canvas.height = geometry.outputHeight;
    const context = canvas.getContext('2d');
    if (!context) throw error('The browser could not allocate an image canvas.', 'RESOURCE_LIMIT');
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
    context.drawImage(image, geometry.x, geometry.y, geometry.width, geometry.height, 0, 0, geometry.outputWidth, geometry.outputHeight);
    const blob = canvas.convertToBlob ? await canvas.convertToBlob({ type: output.mime, quality: output.quality }) : await new Promise(resolve => canvas.toBlob(resolve, output.mime, output.quality));
    canvas.width = canvas.height = 1;
    abortCheck(signal);
    if (!blob || !blob.size || blob.type !== output.mime) throw error(`${output.extension.toUpperCase()} encoding is unavailable in this browser. Choose PNG instead.`, 'UNSUPPORTED_CODEC');
    return blob;
  }
  async function decodeAudio(blob, signal) {
    if (blob.size > 67108864) throw error('Audio processing is limited to 64 MiB inputs.', 'RESOURCE_LIMIT');
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) throw error('Audio decoding is unavailable in this browser.', 'UNSUPPORTED_CODEC');
    const context = new Audio();
    try {
      abortCheck(signal);
      const buffer = await context.decodeAudioData(await blob.arrayBuffer());
      abortCheck(signal);
      if (buffer.duration > 600 || buffer.numberOfChannels > 8 || buffer.length * buffer.numberOfChannels > 50000000) throw error('Use audio of up to ten minutes, eight channels, and 50 million decoded samples.', 'RESOURCE_LIMIT');
      return buffer;
    } catch (cause) { if (cause.code) throw cause; throw error('This browser could not decode that audio. Try WAV or another supported source.', 'UNSUPPORTED_CODEC'); }
    finally { await context.close().catch(() => {}); }
  }
  async function videoFrame(blob, at = 0, signal) {
    if (!globalThis.document?.createElement) throw error('Video frame decoding is unavailable.', 'UNSUPPORTED_CODEC');
    if (blob.size > 67108864) throw error('Video actions support files up to 64 MiB.', 'RESOURCE_LIMIT');
    const video = document.createElement('video'), url = URL.createObjectURL(blob);
    video.preload = 'auto'; video.muted = true; video.playsInline = true;
    const cleanup = () => { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); };
    const wait = (event, start) => new Promise((resolve, reject) => {
      let timer;
      const finish = cause => { clearTimeout(timer); video.removeEventListener(event, done); video.removeEventListener('error', failed); signal?.removeEventListener('abort', aborted); cause ? reject(cause) : resolve(); };
      const done = () => finish(), failed = () => finish(error('The browser could not decode this video. Try a supported MP4 or WebM.', 'UNSUPPORTED_CODEC')), aborted = () => finish(error('Video decoding cancelled.', 'CANCELLED'));
      video.addEventListener(event, done, { once: true }); video.addEventListener('error', failed, { once: true }); signal?.addEventListener('abort', aborted, { once: true });
      timer = setTimeout(() => finish(error('Video decoding timed out. Try a smaller supported video.', 'DECODE_TIMEOUT')), 20000);
      try { abortCheck(signal); start?.(); } catch (cause) { finish(cause); }
    });
    try {
      await wait('loadeddata', () => { video.src = url; video.load(); });
      abortCheck(signal);
      const width = video.videoWidth, height = video.videoHeight, duration = video.duration;
      codecs.dimensions(width, height);
      if (!Number.isFinite(duration) || duration <= 0) throw error('This video has no seekable duration.', 'UNSUPPORTED_CODEC');
      if (typeof at !== 'number' || !Number.isFinite(at) || at < 0 || at > duration) throw error(`Choose a frame between 0 and ${duration.toFixed(3)} seconds.`);
      const time = Math.min(at, Math.max(0, duration - .001));
      if (Math.abs(video.currentTime - time) > .0001) await wait('seeked', () => { video.currentTime = time; });
      abortCheck(signal);
      return { image: video, width, height, duration, time, close: cleanup };
    } catch (cause) { cleanup(); throw cause; }
  }
  function geometryFor(id, width, height, parameters) {
    if (id === 'image.resize') return codecs.resizeGeometry(width, height, parameters.width, parameters.height);
    if (id === 'image.crop') {
      if (parameters.crop) return codecs.explicitCrop(width, height, parameters.crop, parameters.width, parameters.height);
      return codecs.focalCrop(width, height, parameters.width, parameters.height, parameters.focalPoint);
    }
    return { x: 0, y: 0, width, height, outputWidth: width, outputHeight: height, scale: 1, needsUpscale: false };
  }
  function requireUpscaleConsent(geometries, parameters) {
    if (geometries.some(value => value.needsUpscale) && parameters.allowUpscale !== true) throw error('One or more outputs require upscaling. Review the preview and explicitly allow upscaling, or choose a larger source.', 'UPSCALE_REQUIRES_CONSENT');
  }
  function provenance(input, actionId, parameters) {
    return { sourceAssetId: input.asset.id, sourceVersionId: input.version.id, inputVersions: [{ assetId: input.asset.id, versionId: input.version.id }], actionId, actionVersion: 1, parameters: copy(parameters) };
  }
  function outputName(input, role, extension, project) {
    return `${codecs.safeName(project?.name || input.asset.name)}-${codecs.safeName(role)}-${codecs.safeName(input.version.id).slice(-16)}.${extension}`;
  }
  const imageHandler = async context => {
    const { id, inputs: [input], parameters, signal, progress, project } = context;
    const output = format(parameters), image = await decodeImage(input.blob, signal);
    try {
      const geometry = geometryFor(id, image.width, image.height, parameters);
      requireUpscaleConsent([geometry], parameters); await progress(.25, 'Rendering image');
      const blob = await renderImage(image, geometry, output, signal); await progress(.85, 'Saving image version');
      return [{ assetId: input.asset.id, baseVersionId: input.version.id, name: `${input.asset.name.replace(/\.[a-z0-9]{1,8}$/i, '')}.${output.extension}`, blob, kind: 'image', operation: id, parameters: { ...parameters, geometry, encoding: output.mime }, provenance: provenance(input, id, parameters) }];
    } finally { image.close?.(); }
  };
  const releaseHandler = async context => {
    const { inputs: [input, audio], parameters, signal, progress, project, job } = context;
    const output = format(parameters), image = await decodeImage(input.blob, signal);
    try {
      const crops = releaseSizes.map(size => ({ ...size, geometry: codecs.focalCrop(image.width, image.height, size.width, size.height, parameters.focalPoint) }));
      requireUpscaleConsent(crops.map(item => item.geometry), parameters);
      const outputs = [], entries = [], files = [];
      for (let index = 0; index < crops.length; index++) {
        const item = crops[index]; await progress(.1 + index * .2, `Creating ${item.role} ${item.width} × ${item.height}`);
        const blob = await renderImage(image, item.geometry, output, signal);
        const name = outputName(input, item.role, output.extension, project);
        outputs.push({ name, blob, kind: 'image', operation: context.id, parentVersionIds: [input.version.id], projectId: context.projectId, provenance: { ...provenance(input, context.id, parameters), role: item.role, width: item.width, height: item.height, crop: item.geometry } });
        entries.push({ name, blob }); files.push({ name, role: item.role, width: item.width, height: item.height, mime: blob.type, bytes: blob.size, crop: item.geometry });
      }
      if (audio) {
        const name = `audio/${codecs.safeName(audio.asset.name)}.${({ 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/flac': 'flac', 'audio/webm': 'webm' })[audio.blob.type]}`;
        entries.push({ name, blob: audio.blob });
        files.push({ name, role: 'original-audio', mime: audio.blob.type, bytes: audio.blob.size, assetId: audio.asset.id, versionId: audio.version.id, preservedOriginal: true });
      }
      const inputVersions = context.inputs.map(item => ({ assetId: item.asset.id, versionId: item.version.id }));
      const manifest = { inputs: inputVersions, audio: audio ? { assetId: audio.asset.id, versionId: audio.version.id, name: audio.asset.name, mime: audio.blob.type, bytes: audio.blob.size, preservedOriginal: true } : null, format: 'hole-release-pack', schemaVersion: 1, actionVersion: 1, createdAt: job.createdAt, projectId: context.projectId || null, projectName: project?.name || null, input: { assetId: input.asset.id, versionId: input.version.id, name: input.asset.name, mime: input.blob.type }, settings: { focalPoint: parameters.focalPoint, allowUpscale: parameters.allowUpscale === true, format: output.extension, quality: output.quality }, compression: 'ZIP STORE (packaging, no recompression)', files };
      const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
      entries.push({ name: 'manifest.json', blob: manifestBlob });
      await progress(.75, audio ? 'Packaging artwork, original audio and manifest' : 'Packaging images and manifest');
      const archive = await codecs.zip(entries, { signal, timestamp: job.createdAt, onProgress: () => {} });
      outputs.push({ name: outputName(input, 'release-pack', 'zip', project), blob: archive, kind: 'archive', operation: context.id, parentVersionIds: inputVersions.map(item => item.versionId), projectId: context.projectId, provenance: { ...provenance(input, context.id, parameters), inputVersions, manifest } });
      await progress(.95, 'Saving release collection');
      return outputs;
    } finally { image.close?.(); }
  };
  const cutoutHandler = async context => {
    if (!globalThis.HoleCutout?.run) throw error('Local cutout engine is unavailable.', 'ENGINE_UNAVAILABLE');
    const { inputs: [input], parameters, signal } = context;
    let queue = Promise.resolve(), progressError;
    const result = await HoleCutout.run(input.blob, { signal, timeoutMs: parameters.timeoutMs, onProgress: stage => { queue = queue.then(() => context.progress(.5, String(stage))).catch(cause => { progressError = cause; }); } });
    await queue; if (progressError) throw progressError; abortCheck(signal);
    if (![result.cutout, result.alpha].every(blob => blob instanceof Blob && blob.type === 'image/png' && blob.size > 0)) throw error('Cutout engine did not return two valid PNG outputs.', 'OUTPUT_VALIDATION');
    return [['cutout', result.cutout], ['alpha-mask', result.alpha]].map(([role, blob]) => ({ name: outputName(input, role, 'png', context.project), blob, kind: 'image', operation: context.id, parentVersionIds: [input.version.id], projectId: context.projectId, provenance: { ...provenance(input, context.id, parameters), role, model: result.model, modelRevision: result.revision, modelSHA256: result.sha256, width: result.width, height: result.height } }));
  };
  const videoTrimHandler = async context => {
    if (!globalThis.HoleVideoTrim) throw error('Local video trim engine is unavailable.', 'ENGINE_UNAVAILABLE');
    const { inputs: [input], parameters, signal } = context;
    const result = await HoleVideoTrim.trim(input.blob, { ...parameters, signal, onProgress: value => context.progress(value * .9, 'Transcoding selected video range') });
    abortCheck(signal);
    return [{ name: outputName(input, 'trim', 'webm', context.project), blob: result.blob, kind: 'video', operation: context.id, parentVersionIds: [input.version.id], projectId: context.projectId, provenance: { ...provenance(input, context.id, parameters), ...result.report } }];
  };
  const tempoHandler = async context => {
    if (!globalThis.HoleTempo) throw error('Local tempo analysis module is unavailable.', 'ENGINE_UNAVAILABLE');
    const { inputs: [input], parameters, signal } = context;
    await context.progress(.1, 'Decoding audio for experimental tempo estimate');
    const buffer = await decodeAudio(input.blob, signal);
    const report = await HoleTempo.analyze(Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i)), buffer.sampleRate, { ...parameters, signal });
    report.source = { assetId: input.asset.id, versionId: input.version.id, name: input.asset.name };
    abortCheck(signal);
    return [{ name: outputName(input, 'tempo-estimate', 'json', context.project), blob: new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }), kind: 'document', operation: context.id, parentVersionIds: [input.version.id], projectId: context.projectId, provenance: { ...provenance(input, context.id, parameters), engine: report.engine, experimental: true, coverage: report.coverage } }];
  };
  const audioHandler = async context => {
    const { inputs: [input], parameters, signal, progress, id } = context;
    await progress(.1, 'Decoding audio (browser codec support applies)');
    const buffer = await decodeAudio(input.blob, signal);
    const start = id === 'audio.trim' ? parameters.start : 0, end = id === 'audio.trim' ? parameters.end : buffer.duration;
    if (typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > buffer.duration + .00001 || end <= start) throw error(`Choose a trim range between 0 and ${buffer.duration.toFixed(3)} seconds.`);
    const first = Math.floor(start * buffer.sampleRate), last = Math.min(buffer.length, Math.ceil(end * buffer.sampleRate));
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index).slice(first, last));
    let gain = 1, peak = 0;
    if (id === 'audio.normalize') {
      const peakDb = parameters.peakDb ?? -1;
      if (typeof peakDb !== 'number' || !Number.isFinite(peakDb) || peakDb > 0 || peakDb < -24) throw error('Peak target must be between -24 and 0 dBFS.');
      for (const channel of channels) {
        for (let index = 0; index < channel.length; index++) {
          peak = Math.max(peak, Math.abs(channel[index]));
          if (index % 262144 === 0) { abortCheck(signal); await tick(); }
        }
      }
      gain = peak > 0 ? Math.pow(10, peakDb / 20) / peak : 1;
      for (const channel of channels) for (let index = 0; index < channel.length; index++) {
        channel[index] *= gain;
        if (index % 262144 === 0) { abortCheck(signal); await tick(); }
      }
    }
    await progress(.75, 'Encoding 16-bit PCM WAV'); abortCheck(signal);
    const blob = codecs.wav(channels, buffer.sampleRate);
    return [{ name: outputName(input, id.split('.')[1], 'wav', context.project), blob, kind: 'audio', operation: id, parentVersionIds: [input.version.id], projectId: context.projectId, provenance: { ...provenance(input, id, parameters), start, end, gain, sourcePeak: peak, sampleRate: buffer.sampleRate, channels: channels.length, encoding: 'PCM signed 16-bit little-endian WAV' } }];
  };
  const textHandler = async context => {
    const { id, inputs: [input], parameters, progress } = context;
    if (id === 'text.branch') {
      await progress(.8, 'Saving a separate text branch');
      return [{ name: parameters.name || `${input.asset.name.replace(/\.[^.]+$/, '')}-branch.${input.blob.type === 'text/markdown' ? 'md' : 'txt'}`, blob: input.blob, kind: 'text', operation: id, parentVersionIds: [input.version.id], projectId: context.projectId, provenance: provenance(input, id, {}) }];
    }
    if (typeof parameters.text !== 'string') throw error('Text save requires the edited text.');
    const blob = new Blob([parameters.text], { type: input.blob.type });
    if (blob.size > 1048576) throw error('Text actions support documents up to 1 MiB.', 'RESOURCE_LIMIT');
    await progress(.8, 'Saving text version');
    // Do not duplicate the complete document into version provenance.
    return [{ assetId: input.asset.id, baseVersionId: input.version.id, blob, operation: id, parameters: { encoding: 'UTF-8' }, provenance: provenance(input, id, {}) }];
  };
  const videoHandler = async context => {
    const { inputs: [source], parameters, signal, progress } = context;
    await progress(.12, 'Decoding selected video frame');
    const frame = await videoFrame(source.blob, parameters.time ?? 0, signal);
    try {
      const output = format(parameters), geometry = codecs.resizeGeometry(frame.width, frame.height, parameters.width ?? Math.min(1280, frame.width), parameters.height);
      requireUpscaleConsent([geometry], parameters);
      await progress(.65, 'Rendering still image');
      const blob = await renderImage(frame.image, geometry, output, signal);
      return [{ name: outputName(source, `frame-${frame.time.toFixed(3).replace('.', '-')}`, output.extension, context.project), blob, kind: 'image', projectId: context.projectId, parentVersionIds: [source.version.id], operation: context.id, provenance: { ...provenance(source, context.id, parameters), time: frame.time, duration: frame.duration, width: geometry.outputWidth, height: geometry.outputHeight, encoding: output.mime } }];
    } finally { frame.close(); }
  };
  const rackHandler = async context => {
    if (!globalThis.HoleRack?.renderAudio) throw error('The Rack renderer is unavailable.', 'UNSUPPORTED_CODEC');
    const input = context.inputs[0], preset = await HoleRack.parse(input.blob);
    const blob = await HoleRack.renderAudio(preset, { signal: context.signal, onProgress: context.progress });
    return [{ name: outputName(input, 'render', 'wav', context.project), blob, kind: 'audio', projectId: context.projectId, operation: context.id, parentVersionIds: [input.version.id], provenance: { ...provenance(input, context.id, {}), engine: 'Web Audio OfflineAudioContext', presetFormat: 'hole-rack/1', sampleRate: 44100, channels: 2, encoding: '16-bit PCM WAV' } }];
  };
  const defs = [
    { id: 'text.save', label: 'Save text version', acceptedTypes: ['text/plain', 'text/markdown'], outputPolicy: 'version', parameterSchema: { text: 'string, up to 1 MiB UTF-8' }, handler: textHandler },
    { id: 'text.branch', label: 'Branch text', acceptedTypes: ['text/plain', 'text/markdown'], outputPolicy: 'derived-assets', parameterSchema: { name: 'string?' }, handler: textHandler },
    { id: 'image.cutout', label: 'Create cutout and alpha mask', acceptedTypes: imageTypes, outputPolicy: 'derived-assets', parameterSchema: { timeoutMs: '1..90000 ms (default 90000)' }, handler: cutoutHandler, note: 'Local MODNet portrait segmentation. Saves transparent PNG plus alpha mask; inspect edges before reuse. Up to30 MiB,2048 input edge,4:1 aspect ratio; output preserves input dimensions. Model bias and non-portrait limitations apply.' },
    { id: 'image.crop', label: 'Crop image', acceptedTypes: imageTypes, outputPolicy: 'version', parameterSchema: { width: 'integer?', height: 'integer?', crop: '{x,y,width,height}?', focalPoint: '{x:0..1,y:0..1}?', format: 'png|webp', allowUpscale: 'boolean' }, handler: imageHandler },
    { id: 'image.resize', label: 'Resize image', acceptedTypes: imageTypes, outputPolicy: 'version', parameterSchema: { width: 'integer?', height: 'integer?', format: 'png|webp', allowUpscale: 'boolean' }, handler: imageHandler },
    { id: 'image.convert', label: 'Convert to PNG / WebP', acceptedTypes: imageTypes, outputPolicy: 'version', parameterSchema: { format: 'png|webp', quality: '0..1 (WebP)' }, handler: imageHandler },
    { id: 'release.asset-pack', label: 'Release Asset Pack', acceptedTypes: imageTypes, outputPolicy: 'derived-assets', parameterSchema: { focalPoint: '{x:0..1,y:0..1} required', allowUpscale: 'boolean', format: 'png|webp', quality: '0..1 (WebP)' }, handler: releaseHandler },
    { id: 'audio.tempo', label: 'Estimate tempo (experimental)', acceptedTypes: audioTypes, outputPolicy: 'derived-assets', parameterSchema: { maxSeconds: '8..120 seconds from start (default 60)', budgetMs: '1..30000 ms analysis budget (default 10000)' }, handler: tempoHandler, note: 'Local energy/onset estimate, 50–200 BPM. Saves JSON with source coverage and competing periods; no key estimate or calibrated confidence.' },
    { id: 'audio.trim', label: 'Trim to WAV', acceptedTypes: audioTypes, outputPolicy: 'derived-assets', parameterSchema: { start: 'seconds >=0', end: 'seconds >start' }, handler: audioHandler, note: 'Browser-decodable audio, up to ten minutes. Output is 16-bit PCM WAV at the decoder sample rate.' },
    { id: 'audio.normalize', label: 'Peak normalize to WAV', acceptedTypes: audioTypes, outputPolicy: 'derived-assets', parameterSchema: { peakDb: '-24..0 dBFS (default -1)' }, handler: audioHandler, note: 'Peak normalization, not loudness mastering. Browser-decodable audio, up to ten minutes; 16-bit PCM WAV output.' },
    { id: 'audio.wav', label: 'Convert to WAV', acceptedTypes: audioTypes, outputPolicy: 'derived-assets', parameterSchema: {}, handler: audioHandler, note: 'Browser-decodable audio only; up to ten minutes. Produces 16-bit PCM WAV at the decoder sample rate.' },
    { id: 'video.trim', label: 'Trim video to WebM', acceptedTypes: videoTypes, outputPolicy: 'derived-assets', parameterSchema: { start: 'seconds >=0', end: 'seconds >start, range <=30', budgetMs: '1..120000 ms (default 60000)' }, handler: videoTrimHandler, note: 'Local WebCodecs VP8/Opus transcode, up to 30 seconds from 64 MiB/10 minute source. Preserves one video and optional audio track; validates duration within 0.25s. Not lossless or frame-exact.' },
    { id: 'video.thumbnail', label: 'Extract video frame', acceptedTypes: videoTypes, outputPolicy: 'derived-assets', parameterSchema: { time: 'seconds (default 0)', width: 'integer?', height: 'integer?', format: 'png|webp', quality: '0..1 (WebP)', allowUpscale: 'boolean' }, handler: videoHandler, note: 'Seekable video decoded by this browser, up to 64 MiB. Produces a real still image without modifying the video.' },
    { id: 'video.audio', label: 'Extract video audio to WAV', acceptedTypes: videoTypes, outputPolicy: 'derived-assets', parameterSchema: {}, handler: audioHandler, note: 'Requires a video container/audio track that this browser’s audio decoder can read. Up to 64 MiB and ten minutes. Produces 16-bit PCM WAV; unsupported or silent videos fail explicitly.' },
    { id: 'rack.render', label: 'Render Rack instrument to WAV', acceptedTypes: ['application/vnd.hole.rack+json'], outputPolicy: 'derived-assets', parameterSchema: {}, handler: rackHandler, note: 'Renders the saved Hole Rack oscillator/filter/delay instrument through OfflineAudioContext. Stereo 44.1 kHz 16-bit PCM WAV; no native plug-in hosting.' }
  ];
  const number = (minimum, maximum) => ({ type: 'number', minimum, maximum });
  const imageParameters = { format: { type: 'string', enum: ['png', 'webp'], default: 'png' }, quality: { ...number(0, 1), default: .92 } };
  const pixel = { type: 'integer', minimum: 1, maximum: 16384 };
  const focal = { type: 'object', required: ['x', 'y'], additionalProperties: false, properties: { x: number(0, 1), y: number(0, 1) } };
  const crop = { type: 'object', required: ['x', 'y', 'width', 'height'], additionalProperties: false, properties: { x: number(0, 16384), y: number(0, 16384), width: number(1, 16384), height: number(1, 16384) } };
  const schemas = {
    'text.save': { required: ['text'], properties: { text: { type: 'string', maxLength: 1048576 } } },
    'text.branch': { properties: { name: { type: 'string', minLength: 1, maxLength: 180 } } },
    'image.crop': { properties: { ...imageParameters, width: pixel, height: pixel, crop, focalPoint: focal, allowUpscale: { type: 'boolean', default: false } } },
    'image.resize': { properties: { ...imageParameters, width: pixel, height: pixel, allowUpscale: { type: 'boolean', default: false } } },
    'image.convert': { properties: imageParameters },
    'image.cutout': { properties: { timeoutMs: { ...number(1, 90000), default: 90000 } } },
    'release.asset-pack': { required: ['focalPoint'], properties: { ...imageParameters, focalPoint: focal, allowUpscale: { type: 'boolean', default: false } } },
    'audio.trim': { required: ['start', 'end'], properties: { start: number(0, 600), end: number(0, 600) } },
    'audio.normalize': { properties: { peakDb: { ...number(-24, 0), default: -1 } } },
    'audio.wav': { properties: {} },
    'audio.tempo': { properties: { maxSeconds: { ...number(8, 120), default: 60 }, budgetMs: { ...number(1, 30000), default: 10000 } } },
    'video.thumbnail': { properties: { ...imageParameters, time: { ...number(0, 86400), default: 0 }, width: pixel, height: pixel, allowUpscale: { type: 'boolean', default: false } } },
    'video.audio': { properties: {} },
    'video.trim': { required: ['start', 'end'], properties: { start: number(0, 600), end: number(0, 600), budgetMs: { ...number(1, 120000), default: 60000 } } },
    'rack.render': { properties: {} }
  };
  for (const definition of defs) {
    definition.parameterHelp = definition.parameterSchema;
    definition.parameterSchema = { type: 'object', additionalProperties: false, ...schemas[definition.id] };
  }
  function validateParameters(schema, value, path = 'Parameters') {
    if (schema.type === 'object') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw error(`${path} must be an object.`);
      for (const required of schema.required || []) if (!Object.hasOwn(value, required)) throw error(`${path}.${required} is required.`);
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(schema.properties, key)) throw error(`${path}.${key} is not a supported option.`);
        validateParameters(schema.properties[key], value[key], `${path}.${key}`);
      }
    } else if (schema.type === 'number' || schema.type === 'integer') {
      if (typeof value !== 'number' || !Number.isFinite(value) || (schema.type === 'integer' && !Number.isInteger(value)) || value < schema.minimum || value > schema.maximum) throw error(`${path} must be ${schema.type === 'integer' ? 'a whole number' : 'a number'} between ${schema.minimum} and ${schema.maximum}.`);
    } else if (typeof value !== schema.type) throw error(`${path} must be ${schema.type}.`);
    if (schema.enum && !schema.enum.includes(value)) throw error(`${path} must be one of: ${schema.enum.join(', ')}.`);
    if (typeof value === 'string' && (value.length < (schema.minLength || 0) || value.length > (schema.maxLength || Infinity))) throw error(`${path} has an invalid length.`);
  }
  const registry = new Map(defs.map(definition => [definition.id, definition]));
  function available(definition) {
    if (definition.id.startsWith('text.')) return true;
    if (definition.id === 'rack.render') return !!(globalThis.HoleRack && (globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext));
    if (definition.id === 'image.cutout') return !!(globalThis.HoleCutout?.run && globalThis.Worker);
    if (definition.id === 'video.trim') return !!(globalThis.HoleVideoTrim && globalThis.Worker && globalThis.VideoEncoder && globalThis.VideoDecoder);
    if (definition.id === 'audio.tempo' && !globalThis.HoleTempo) return false;
    return isAudioAction(definition.id) ? !!(globalThis.AudioContext || globalThis.webkitAudioContext) : definition.id === 'video.thumbnail' ? !!globalThis.document?.createElement : !!(globalThis.OffscreenCanvas || globalThis.document?.createElement);
  }
  function describe(definition) {
    if (!definition) return null;
    const { handler, ...publicDefinition } = definition;
    return copy({ ...publicDefinition, version: 1, kind: 'transform', cardinality: { min: 1, max: definition.id === 'release.asset-pack' ? 2 : 1 }, capabilityRequirements: [definition.id === 'image.cutout' ? 'local.modnet-worker' : definition.id === 'video.trim' ? 'browser.webcodecs-worker' : definition.id.startsWith('text.') ? 'workspace.text' : isAudioAction(definition.id) ? 'browser.audio-decode' : definition.id === 'video.thumbnail' ? 'browser.video-decode' : 'browser.canvas'], permissionScope: 'selected-immutable-inputs-and-output-project', outputSchema: { policy: definition.outputPolicy, contents: definition.id === 'image.cutout' ? ['image', 'image'] : definition.id === 'release.asset-pack' ? ['image', 'image', 'image', 'archive'] : [definition.id === 'video.trim' ? 'video' : definition.id.startsWith('text.') ? 'text' : definition.id === 'audio.tempo' ? 'document' : isAudioAction(definition.id) ? 'audio' : 'image'] }, progress: true, cancellation: 'before-durable-commit', retry: 'explicit-idempotent', available: available(definition) });
  }
  async function resolveRequest(id, request) {
    const definition = registry.get(id);
    if (!definition) throw error('This action is not registered.', 'UNKNOWN_ACTION');
    if (!Array.isArray(request.inputs) || request.inputs.length < 1 || request.inputs.length > (id === 'release.asset-pack' ? 2 : 1)) throw error(id === 'release.asset-pack' ? 'Choose artwork and optionally one original audio file.' : 'Choose exactly one input file.');
    const store = await core(), inputs = [];
    for (const reference of request.inputs) {
      if (!reference || typeof reference.assetId !== 'string') throw error('Choose a saved input file.');
      const input = await store.readAsset(reference.assetId, reference.versionId);
      if (!input || input.asset.state === 'trashed') throw error('The selected file is unavailable or in Trash.', 'NOT_FOUND');
      if (!(id === 'release.asset-pack' && inputs.length === 1 ? audioTypes : definition.acceptedTypes).includes(input.blob.type || input.version.mime)) throw error('This action does not support the selected file type.', 'UNSUPPORTED_INPUT');
      if (id === 'release.asset-pack' && inputs.length === 1 && input.blob.size > 134217728) throw error('Release audio is limited to 128 MiB.', 'RESOURCE_LIMIT');
      inputs.push(input);
    }
    let project = null;
    if (request.projectId) { project = await store.get('projects', request.projectId); if (!project) throw error('The chosen destination project no longer exists.', 'NOT_FOUND'); }
    const parameters = copy(request.parameters || {});
    if (!parameters || Array.isArray(parameters) || typeof parameters !== 'object') throw error('Parameters must be an object.');
    validateParameters(definition.parameterSchema, parameters);
    const bound = { inputs: inputs.map(input => ({ assetId: input.asset.id, versionId: input.version.id })), parameters, projectId: request.projectId || null };
    return { definition, inputs, project, parameters, bound };
  }
  async function preview(id, request = {}) {
    const resolved = await resolveRequest(id, request), input = resolved.inputs[0], parameters = resolved.parameters;
    const result = { action: describe(resolved.definition), ...resolved.bound, input: { name: input.asset.name, mime: input.blob.type, bytes: input.blob.size }, outputs: [], warnings: [] };
    if (id === 'image.cutout') {
      if (input.blob.size > 30 * 1024 * 1024) throw error('Cutout inputs must fit within 30 MiB.', 'RESOURCE_LIMIT');
      const image = await decodeImage(input.blob);
      try {
        const width = image.width, height = image.height;
        if (Math.max(width, height) > 2048) throw error('Cutout inputs must have edges no larger than 2048 pixels.', 'RESOURCE_LIMIT');
        if (Math.max(width / height, height / width) > 4) throw error('Cutout supports image aspect ratios up to 4:1.');
        Object.assign(result.input, { width, height });
        result.outputs = ['cutout', 'alpha-mask'].map(role => ({ role, name: outputName(input, role, 'png', resolved.project), mime: 'image/png', width, height }));
        result.warnings.push(resolved.definition.note);
      } finally { image.close?.(); }
    } else if (id.startsWith('image.') || id === 'release.asset-pack') {
      const image = await decodeImage(input.blob);
      try {
        const output = format(parameters);
        result.input.width = image.width; result.input.height = image.height;
        const items = id === 'release.asset-pack' ? releaseSizes.map(size => ({ role: size.role, geometry: codecs.focalCrop(image.width, image.height, size.width, size.height, parameters.focalPoint) })) : [{ role: id.split('.')[1], geometry: geometryFor(id, image.width, image.height, parameters) }];
        result.outputs = items.map(item => ({ role: item.role, name: outputName(input, item.role, output.extension, resolved.project), width: item.geometry.outputWidth, height: item.geometry.outputHeight, mime: output.mime, geometry: item.geometry }));
        if (items.some(item => item.geometry.needsUpscale)) result.warnings.push('Some outputs need upscaling, which cannot add original detail. Explicit consent is required.');
        result.requiresUpscaleConsent = items.some(item => item.geometry.needsUpscale) && parameters.allowUpscale !== true;
        if (id === 'release.asset-pack') result.outputs.push({ role: 'archive', name: outputName(input, 'release-pack', 'zip', resolved.project), mime: 'application/zip', contains: resolved.inputs.length === 2 ? 'Three images, the unchanged original audio and manifest.json' : 'Three images and manifest.json' });
      } finally { image.close?.(); }
    } else if (id === 'video.thumbnail') {
      const frame = await videoFrame(input.blob, parameters.time ?? 0);
      try {
        const output = format(parameters), geometry = codecs.resizeGeometry(frame.width, frame.height, parameters.width ?? Math.min(1280, frame.width), parameters.height);
        Object.assign(result.input, { width: frame.width, height: frame.height, duration: frame.duration, time: frame.time });
        result.outputs = [{ name: outputName(input, `frame-${frame.time.toFixed(3).replace('.', '-')}`, output.extension, resolved.project), mime: output.mime, width: geometry.outputWidth, height: geometry.outputHeight, geometry }];
        result.requiresUpscaleConsent = geometry.needsUpscale && parameters.allowUpscale !== true;
        result.warnings.push(resolved.definition.note); if (geometry.needsUpscale) result.warnings.push('This size requires explicit upscaling consent.');
      } finally { frame.close(); }
    } else if (id === 'video.trim') {
      if (parameters.end <= parameters.start || parameters.end - parameters.start > 30) throw error('Choose a positive range up to 30 seconds.');
      result.outputs = [{ name: outputName(input, 'trim', 'webm', resolved.project), mime: 'video/webm', encoding: 'VP8/Opus transcode' }];
      result.warnings.push(resolved.definition.note);
    } else if (id === 'audio.tempo') {
      result.outputs = [{ name: outputName(input, 'tempo-estimate', 'json', resolved.project), mime: 'application/json', encoding: 'UTF-8 JSON' }];
      result.warnings.push(resolved.definition.note);
    } else if (isAudioAction(id)) {
      result.outputs = [{ name: outputName(input, id.split('.')[1], 'wav', resolved.project), mime: 'audio/wav', encoding: '16-bit PCM WAV' }];
      result.warnings.push(resolved.definition.note);
    } else {
      result.outputs = [{ name: id === 'text.branch' ? parameters.name || `${input.asset.name.replace(/\.[^.]+$/, '')}-branch.${input.blob.type === 'text/markdown' ? 'md' : 'txt'}` : input.asset.name, mime: input.blob.type, encoding: 'UTF-8' }];
    }
    return result;
  }
  async function lock(key, callback, ifAvailable = false) {
    if (ifAvailable && lockQueues.has(key)) return null;
    const previous = lockQueues.get(key) || Promise.resolve();
    let release;
    const queue = new Promise(resolve => { release = resolve; }); lockQueues.set(key, queue);
    await previous;
    try {
      if (globalThis.navigator?.locks?.request) return await navigator.locks.request(`hole-action:${key}`, { mode: 'exclusive', ...(ifAvailable ? { ifAvailable: true } : {}) }, handle => !handle && ifAvailable ? null : callback());
      return await callback();
    } finally { release(); if (lockQueues.get(key) === queue) lockQueues.delete(key); }
  }
  async function resultFromJob(job) {
    const store = await core();
    const outputs = await Promise.all((job.outputs || []).map(async value => ({ asset: await store.get('assets', value.assetId), version: await store.get('versions', value.versionId) })));
    return { jobId: job.id, job, outputs, assets: outputs.map(value => value.asset), versions: outputs.map(value => value.version), replayed: true };
  }
  function run(id, request = {}) {
    const jobId = uid('job'), controller = new AbortController();
    sessions.set(jobId, controller);
    const promise = execute(id, request, jobId, controller).finally(() => sessions.delete(jobId));
    Object.defineProperty(promise, 'jobId', { value: jobId });
    return promise;
  }
  async function execute(id, request, proposedId, controller) {
    const idempotencyKey = request.idempotencyKey || proposedId;
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length > 240 || !idempotencyKey || /[\u0000-\u001f\u007f]/.test(idempotencyKey)) throw error('Invalid action idempotency key.');
    return lock(idempotencyKey, async () => {
      const store = await core();
      let job = (await store.list('jobs')).find(item => item.idempotencyKey === idempotencyKey);
      // A replay uses the first invocation's immutable versions, even if heads changed.
      if (job && (!Array.isArray(request.inputs) || request.inputs.length !== job.inputs.length || request.inputs.some((input, index) => input.assetId !== job.inputs[index].assetId || (input.versionId && input.versionId !== job.inputs[index].versionId)))) throw error('That idempotency key belongs to different input versions.', 'IDEMPOTENCY_CONFLICT');
      const effective = job ? { ...request, inputs: job.inputs } : request;
      const resolved = await resolveRequest(id, effective);
      const fingerprint = canonical({ actionId: id, ...resolved.bound });
      if (job && job.requestFingerprint !== fingerprint) throw error('That idempotency key belongs to a different request.', 'IDEMPOTENCY_CONFLICT');
      if (job && ['succeeded', 'completed'].includes(job.status)) return resultFromJob(job);
      if (job && !request.retry) throw error('This action already has a job. Use Retry to resume a failed or interrupted job.', 'JOB_EXISTS');
      if (job && job.status === 'running' && sessions.has(job.id)) throw error('This action is still running.', 'JOB_RUNNING');
      abortCheck(controller.signal);
      if (!job) job = await store.put('jobs', { id: proposedId, actionId: id, actionVersion: 1, idempotencyKey, requestFingerprint: fingerprint, ...resolved.bound, status: 'queued', progress: 0, attempt: 1, outputs: [] });
      else job = await update('jobs', job.id, { status: 'queued', progress: 0, error: null, attempt: (job.attempt || 1) + 1, finishedAt: null });
      sessions.set(job.id, controller);
      emit('hole:action-progress', { jobId: job.id, status: 'queued', progress: 0, message: 'Queued' });
      const progress = async (value, message) => {
        abortCheck(controller.signal);
        job = await update('jobs', job.id, current => {
          if (current.status === 'cancelled') throw error('Action cancelled.', 'CANCELLED');
          return { status: 'running', progress: Math.round(100 * Math.min(.99, Math.max(0, value))), message, step: message };
        });
        emit('hole:action-progress', { jobId: job.id, status: 'running', progress: job.progress, message });
        await tick(); abortCheck(controller.signal);
      };
      try {
        request.onJob?.(job);
        await progress(.02, 'Reading pinned input');
        const outputs = await resolved.definition.handler({ id, inputs: resolved.inputs, parameters: resolved.parameters, projectId: resolved.bound.projectId, project: resolved.project, signal: controller.signal, progress, job });
        abortCheck(controller.signal);
        const fresh = await store.get('jobs', job.id);
        if (fresh.status === 'cancelled') throw error('Action cancelled.', 'CANCELLED');
        if (request.beforeCommit) await request.beforeCommit({ jobId: job.id, outputs: outputs.map(output => ({ name: output.name, mime: output.blob.type, bytes: output.blob.size })) });
        abortCheck(controller.signal);
        const result = await store.commitJobOutputs({ jobId: job.id, idempotencyKey, outputs });
        emit('hole:action-progress', { jobId: job.id, status: 'completed', progress: 100, message: 'Saved', outputs: result.outputs });
        return { ...result, jobId: job.id };
      } catch (cause) {
        const cancelled = cause.code === 'CANCELLED' || controller.signal.aborted;
        try {
          job = await update('jobs', job.id, current => ['succeeded', 'completed'].includes(current.status) ? null : { status: cancelled ? 'cancelled' : 'failed', finishedAt: new Date().toISOString(), error: { code: cause.code || 'ACTION_FAILED', message: cause.message || 'The action failed.' } });
          emit('hole:action-progress', { jobId: job.id, status: job.status, progress: job.progress, message: job.error?.message });
        } catch (saveError) { cause.persistenceError = saveError.message; }
        cause.jobId = job.id; throw cause;
      } finally { sessions.delete(job.id); }
    });
  }
  async function cancel(jobId) {
    const controller = sessions.get(jobId); controller?.abort();
    const exists = await (await core()).get('jobs', jobId);
    if (!exists && controller) return { id: jobId, status: 'cancelled', progress: 0 };
    const job = await update('jobs', jobId, current => terminal(current.status) ? null : { status: 'cancelled', finishedAt: new Date().toISOString(), message: 'Cancelled before output commit' });
    emit('hole:action-progress', { jobId, status: job.status, progress: job.progress, message: job.message });
    return job;
  }
  async function retry(jobId) {
    const store = await core(), job = await store.get('jobs', jobId);
    if (!job) throw error('Job not found.', 'NOT_FOUND');
    return run(job.actionId, { inputs: job.inputs, parameters: job.parameters, projectId: job.projectId, idempotencyKey: job.idempotencyKey, retry: true });
  }
  async function recover() {
    const store = await core(), jobs = await store.list('jobs');
    for (const job of jobs.filter(item => ['running', 'queued'].includes(item.status) && item.actionId && !sessions.has(item.id))) {
      // Without cross-tab locks, report rather than infer that another tab died.
      if (globalThis.navigator?.locks?.request) await lock(job.idempotencyKey, () => update('jobs', job.id, current => ['running', 'queued'].includes(current.status) ? { status: 'interrupted', error: { code: 'INTERRUPTED', message: 'Execution stopped before outputs were committed. Retry is available.' } } : null), true);
    }
    if (globalThis.navigator?.locks?.request) for (const run of (await store.list('runs')).filter(item => ['running', 'queued'].includes(item.status) && !flows.has(item.id))) {
      await lock(`flow:${run.id}`, () => update('runs', run.id, current => ['running', 'queued'].includes(current.status) ? { status: 'interrupted', error: { code: 'INTERRUPTED', message: 'Flow stopped before all steps completed. Retry continues from saved results.' }, stepStates: current.stepStates.map(step => step.status === 'running' ? { ...step, status: 'interrupted' } : step) } : null), true);
    }
    return store.list('jobs');
  }
  function validateRecipe(recipe) {
    if (!recipe || typeof recipe.name !== 'string' || !recipe.name.trim() || recipe.name.length > 120) throw error('Give the recipe a name, up to 120 characters.');
    if (!Array.isArray(recipe.steps) || !recipe.steps.length || recipe.steps.length > 20) throw error('Recipes support one to twenty steps.');
    const known = new Set();
    for (const step of recipe.steps) {
      if (!step || typeof step.id !== 'string' || !step.id || step.id.length > 80 || known.has(step.id) || !registry.has(step.actionId)) throw error('Every step needs a unique ID and a supported action.');
      if (step.from && step.from !== 'inputs' && !known.has(step.from)) throw error('A step can use the original input or an earlier step.');
      if (step.outputIndex != null && (!Number.isInteger(step.outputIndex) || step.outputIndex < 0 || step.outputIndex > 3)) throw error('Choose a valid previous output index.');
      if (step.inputIndex != null && (!Number.isInteger(step.inputIndex) || step.inputIndex < 0 || step.inputIndex > 1)) throw error('Choose original input 0 or 1.');
      validateParameters(registry.get(step.actionId).parameterSchema, step.parameters || {});
      known.add(step.id);
    }
    return recipe;
  }
  async function saveRecipe(recipe, options = {}) {
    validateRecipe(recipe); const store = await core(), previous = recipe.id ? await store.get('recipes', recipe.id) : null;
    return store.put('recipes', { ...copy(recipe), id: recipe.id || uid('recipe'), schemaVersion: 1, recipeVersion: previous ? (previous.recipeVersion || 1) + 1 : 1 }, previous ? { expectedRevision: options.expectedRevision ?? recipe.revision } : {});
  }
  async function recipeFor(value) {
    const recipe = typeof value === 'string' ? await (await core()).get('recipes', value) : value;
    return copy(validateRecipe(recipe));
  }
  async function previewFlow(recipeOrId, request = {}) {
    const recipe = await recipeFor(recipeOrId), store = await core();
    if (!Array.isArray(request.inputs) || request.inputs.length < 1 || request.inputs.length > 2) throw error('Select one or two original inputs for this Flow.');
    const originals = await Promise.all(request.inputs.map(ref => store.readAsset(ref.assetId, ref.versionId)));
    const boundInputs = originals.map(item => ({ assetId: item.asset.id, versionId: item.version.id }));
    const steps = [];
    for (const step of recipe.steps) {
      const action = describe(registry.get(step.actionId));
      if ((!step.from || step.from === 'inputs') && !boundInputs[step.inputIndex || 0]) throw error(`Step ${step.id} needs an original input that was not selected.`, 'MISSING_INPUT');
      if (step.actionId === 'release.asset-pack' && step.inputIndex === 1) throw error('Release Packs use artwork first and optional original audio second.');
      if (step.from && step.from !== 'inputs') {
        const earlier = steps.find(item => item.id === step.from), slot = step.outputIndex || 0;
        const kind = earlier.action.outputSchema.contents[slot];
        if (!kind) throw error(`Step ${step.id} selects an output that ${step.from} does not produce.`, 'MISSING_STEP_OUTPUT');
        const expected = action.acceptedTypes;
        const compatible = kind === 'image' ? expected.some(type => type.startsWith('image/')) : kind === 'audio' ? expected.some(type => type.startsWith('audio/')) : kind === 'text' ? expected.some(type => type.startsWith('text/')) : kind === 'video' ? expected.some(type => type.startsWith('video/')) : false;
        if (!compatible) throw error(`Step ${step.id} cannot use the ${kind} output from ${step.from}.`, 'UNSUPPORTED_INPUT');
      }
      steps.push({ ...copy(step), action, preview: !step.from || step.from === 'inputs' ? await preview(step.actionId, { inputs: step.actionId === 'release.asset-pack' ? boundInputs : [boundInputs[step.inputIndex || 0]], parameters: step.parameters || {}, projectId: request.projectId }) : null, inputDescription: step.from && step.from !== 'inputs' ? `Output ${step.outputIndex ?? 0} from ${step.from}; concrete dimensions will be checked before this step.` : originals[step.inputIndex || 0].asset.name });
    }
    return { recipe, inputs: boundInputs, projectId: request.projectId || null, steps };
  }
  function runFlow(recipeOrId, request = {}) {
    const runId = request.runId || uid('flow'), controller = new AbortController();
    const result = executeFlow(recipeOrId, request, runId, controller);
    Object.defineProperty(result, 'runId', { value: runId }); return result;
  }
  async function executeFlow(recipeOrId, request, runId, controller) {
    const store = await core();
    return lock(`flow:${runId}`, async () => {
      let record = await store.get('runs', runId);
      if (record && ['succeeded', 'completed'].includes(record.status)) return record;
      if (record && !request.retry) throw error('This Flow already exists. Use Retry.', 'RUN_EXISTS');
      if (!record) {
        const plan = await previewFlow(recipeOrId, request);
        record = await store.put('runs', { id: runId, recipeId: plan.recipe.id || null, recipeVersion: plan.recipe.recipeVersion || 1, recipeSnapshot: plan.recipe, inputs: plan.inputs, projectId: plan.projectId, status: 'queued', stepStates: plan.steps.map(step => ({ id: step.id, status: 'queued', jobId: null, outputs: [] })), outputs: [] });
      }
      flows.set(runId, controller);
      record = await update('runs', runId, { status: 'running', error: null });
      try {
        for (let index = 0; index < record.recipeSnapshot.steps.length; index++) {
          abortCheck(controller.signal);
          const latest = await store.get('runs', runId);
          if (latest.status === 'cancelled') throw error('Flow cancelled.', 'CANCELLED');
          record = latest;
          const step = record.recipeSnapshot.steps[index], state = record.stepStates[index];
          if (['succeeded', 'completed'].includes(state.status)) continue;
          let inputs = step.actionId === 'release.asset-pack' ? record.inputs : [record.inputs[step.inputIndex || 0]];
          if (step.from && step.from !== 'inputs') {
            const prior = record.stepStates.find(item => item.id === step.from), output = prior?.outputs?.[step.outputIndex ?? 0];
            if (!output?.assetId || !output?.versionId) throw error(`Step ${step.id} has no saved input from ${step.from}.`, 'MISSING_STEP_OUTPUT');
            inputs = [{ assetId: output.assetId, versionId: output.versionId }];
            if (step.actionId === 'release.asset-pack' && record.inputs[1]) inputs.push(record.inputs[1]);
          }
          const stepStates = copy(record.stepStates); stepStates[index] = { ...state, status: 'running', error: null };
          record = await update('runs', runId, { stepStates });
          const jobPromise = run(step.actionId, { inputs, parameters: step.parameters || {}, projectId: record.projectId, idempotencyKey: `${runId}:${step.id}`, retry: request.retry === true, onJob: job => { controller.currentJobId = job.id; } });
          controller.currentJobId = jobPromise.jobId;
          let result;
          try { result = await jobPromise; }
          catch (cause) {
            const failedStates = copy(record.stepStates); failedStates[index] = { ...failedStates[index], status: cause.code === 'CANCELLED' ? 'cancelled' : 'failed', jobId: cause.jobId || controller.currentJobId, error: { code: cause.code || 'ACTION_FAILED', message: cause.message } };
            record = await update('runs', runId, { stepStates: failedStates }); throw cause;
          }
          const outputs = (result.outputs || []).map(value => ({ assetId: value.asset?.id || value.assetId, versionId: value.version?.id || value.versionId }));
          const finishedStates = copy(record.stepStates); finishedStates[index] = { ...finishedStates[index], status: 'completed', jobId: result.jobId, outputs };
          record = await update('runs', runId, { stepStates: finishedStates, outputs: [...record.outputs, ...outputs] });
          emit('hole:flow-progress', { runId, stepId: step.id, index, count: record.stepStates.length, status: 'running' });
        }
        abortCheck(controller.signal);
        record = await update('runs', runId, current => {
          if (current.status === 'cancelled') throw error('Flow cancelled.', 'CANCELLED');
          return { status: 'completed', finishedAt: new Date().toISOString() };
        });
        emit('hole:flow-progress', { runId, status: 'completed' }); return record;
      } catch (cause) {
        record = await update('runs', runId, { status: cause.code === 'CANCELLED' || controller.signal.aborted ? 'cancelled' : 'failed', error: { code: cause.code || 'FLOW_FAILED', message: cause.message } });
        emit('hole:flow-progress', { runId, status: record.status });
        cause.runId = runId; throw cause;
      } finally { flows.delete(runId); }
    });
  }
  async function cancelFlow(runId) {
    const controller = flows.get(runId); controller?.abort();
    if (controller?.currentJobId) await cancel(controller.currentJobId);
    return update('runs', runId, current => terminal(current.status) ? null : { status: 'cancelled', finishedAt: new Date().toISOString() });
  }
  async function retryFlow(runId) {
    const record = await (await core()).get('runs', runId);
    if (!record) throw error('Flow not found.', 'NOT_FOUND');
    return runFlow(record.recipeSnapshot, { runId, retry: true });
  }
  globalThis.HoleActions = Object.freeze({ list: () => defs.map(describe), get: id => describe(registry.get(id)), preview, run, cancel, retry, recover,
    releasePack: ({ assetId, versionId, audioAssetId, audioVersionId, projectId, focalPoint, allowUpscale = false, format: encoding = 'png', quality, idempotencyKey }) => run('release.asset-pack', { inputs: [{ assetId, versionId }, ...(audioAssetId ? [{ assetId: audioAssetId, versionId: audioVersionId }] : [])], projectId, parameters: { focalPoint, allowUpscale, format: encoding, ...(quality == null ? {} : { quality }) }, idempotencyKey }),
    saveRecipe, listRecipes: async () => (await core()).list('recipes'), previewFlow, runFlow, cancelFlow, retryFlow,
    releaseSizes: copy(releaseSizes) });
})();
