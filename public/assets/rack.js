/* Sattari Rack qualification instrument. Original Web Audio implementation;
 * this does not copy or host the native AU/VST processing suite. */
(() => {
  'use strict';
  const MIME = 'application/vnd.hole.rack+json';
  const defaults = Object.freeze({ waveform: 'sine', frequency: 220, cutoff: 1800, resonance: .8, gain: .18, attack: .03, release: .4, lfoRate: 1.5, lfoDepth: .15, delayTime: .25, feedback: .25, delayMix: .15, duration: 3 });
  const limits = Object.freeze({ frequency: [30, 2000], cutoff: [40, 18000], resonance: [.1, 15], gain: [0, .5], attack: [.005, 2], release: [.02, 4], lfoRate: [.1, 15], lfoDepth: [0, 1], delayTime: [.01, 1], feedback: [0, .75], delayMix: [0, .8], duration: [.25, 20] });
  let playing = null, previewGeneration = 0;
  const fail = message => Object.assign(new Error(message), { code: 'INVALID_RACK_PRESET' });
  function validate(value) {
    if (!value || value.format !== 'hole-rack' || value.schemaVersion !== 1 || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 120 || !value.parameters || typeof value.parameters !== 'object' || Array.isArray(value.parameters)) throw fail('Choose a valid Hole Rack v1 preset with a name and parameter object.');
    const parameters = { ...defaults, ...value.parameters };
    for (const key of Object.keys(parameters)) if (!Object.hasOwn(defaults, key)) throw fail(`Unsupported Rack parameter: ${key}.`);
    if (!['sine', 'triangle', 'sawtooth', 'square'].includes(parameters.waveform)) throw fail('Choose a supported oscillator waveform.');
    for (const [key, [min, max]] of Object.entries(limits)) if (typeof parameters[key] !== 'number' || !Number.isFinite(parameters[key]) || parameters[key] < min || parameters[key] > max) throw fail(`${key} must be between ${min} and ${max}.`);
    return { format: 'hole-rack', schemaVersion: 1, name: value.name.trim(), parameters };
  }
  function serialize(value) { return new Blob([JSON.stringify(validate(value), null, 2)], { type: MIME }); }
  async function parse(blob) { if (!(blob instanceof Blob) || blob.size > 131072) throw fail('Rack preset files must be smaller than 128 KiB.'); let value; try { value = JSON.parse(await blob.text()); } catch { throw fail('This file is not valid preset JSON.'); } return validate(value); }
  function renderLength(parameters, sampleRate = 44100) { return Math.ceil((parameters.duration + parameters.release + Math.min(4, parameters.delayTime * 8) + .05) * sampleRate); }
  function buildGraph(context, parameters, options = {}) {
    const p = validate({ format: 'hole-rack', schemaVersion: 1, name: 'Graph', parameters }).parameters;
    const oscillator = context.createOscillator(), filter = context.createBiquadFilter(), envelope = context.createGain();
    const dry = context.createGain(), delay = context.createDelay(1), feedback = context.createGain(), wet = context.createGain(), master = context.createGain();
    const lfo = context.createOscillator(), lfoGain = context.createGain(), limiter = context.createDynamicsCompressor();
    oscillator.type = p.waveform; oscillator.frequency.value = p.frequency;
    filter.type = 'lowpass'; filter.frequency.value = p.cutoff; filter.Q.value = p.resonance;
    delay.delayTime.value = p.delayTime; feedback.gain.value = p.feedback; dry.gain.value = 1 - p.delayMix; wet.gain.value = p.delayMix;
    master.gain.value = p.gain; lfo.type = 'sine'; lfo.frequency.value = p.lfoRate; lfoGain.gain.value = p.cutoff * .7 * p.lfoDepth;
    oscillator.connect(filter); filter.connect(envelope); envelope.connect(dry); dry.connect(master);
    envelope.connect(delay); delay.connect(wet); wet.connect(master); delay.connect(feedback); feedback.connect(delay);
    limiter.threshold.value = -6; limiter.knee.value = 6; limiter.ratio.value = 12; limiter.attack.value = .003; limiter.release.value = .15;
    lfo.connect(lfoGain); lfoGain.connect(filter.frequency); master.connect(limiter); limiter.connect(options.destination || context.destination);
    const start = context.currentTime, duration = options.duration ?? p.duration, releaseEnd = start + duration + p.release;
    envelope.gain.setValueAtTime(0, start); envelope.gain.linearRampToValueAtTime(1, start + Math.min(p.attack, duration / 2));
    envelope.gain.setValueAtTime(1, start + duration); envelope.gain.linearRampToValueAtTime(0, releaseEnd);
    oscillator.start(start); oscillator.stop(releaseEnd + .01); lfo.start(start); lfo.stop(releaseEnd + 4);
    const nodes = [oscillator, filter, envelope, dry, delay, feedback, wet, master, lfo, lfoGain, limiter];
    return { oscillator, filter, envelope, master, delay, feedback, dry, wet, lfo, lfoGain,
      update(next) {
        const v = validate({ format: 'hole-rack', schemaVersion: 1, name: 'Graph', parameters: next }).parameters, at = context.currentTime;
        oscillator.type = v.waveform;
        for (const [parameter, value] of [[oscillator.frequency, v.frequency], [filter.frequency, v.cutoff], [filter.Q, v.resonance], [master.gain, v.gain], [delay.delayTime, v.delayTime], [feedback.gain, v.feedback], [dry.gain, 1 - v.delayMix], [wet.gain, v.delayMix], [lfo.frequency, v.lfoRate], [lfoGain.gain, v.cutoff * .7 * v.lfoDepth]]) parameter.setTargetAtTime(value, at, .03);
      },
      stop() { try { oscillator.stop(); } catch {} try { lfo.stop(); } catch {} nodes.forEach(node => node.disconnect()); }
    };
  }
  async function renderAudio(preset, { signal, onProgress } = {}) {
    const value = validate(preset), Offline = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
    if (!Offline) throw Object.assign(new Error('Offline audio rendering is unavailable in this browser.'), { code: 'UNSUPPORTED_CODEC' });
    if (signal?.aborted) throw Object.assign(new Error('Rack render cancelled.'), { code: 'CANCELLED' });
    const context = new Offline(2, renderLength(value.parameters), 44100), graph = buildGraph(context, value.parameters);
    try {
      await onProgress?.(.2, 'Rendering the oscillator, filter and delay graph');
      const buffer = await context.startRendering();
      if (signal?.aborted) throw Object.assign(new Error('Rack render cancelled before saving output.'), { code: 'CANCELLED' });
      await onProgress?.(.85, 'Encoding rendered stereo PCM WAV');
      return globalThis.HoleActionCodecs.wav(Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index)), buffer.sampleRate);
    } finally { graph.stop(); }
  }
  async function stop() {
    previewGeneration++;
    const current = playing; playing = null;
    if (!current) return;
    clearTimeout(current.timer); current.graph.stop(); await current.context.close().catch(() => {}); current.onEnd?.();
  }
  async function audition(preset, onEnd) {
    const generation = previewGeneration + 1; await stop();
    if (generation !== previewGeneration) return null;
    const value = validate(preset), Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) throw Object.assign(new Error('Web Audio is unavailable in this browser.'), { code: 'UNSUPPORTED_CODEC' });
    const context = new Audio();
    try { await context.resume(); } catch (cause) { await context.close().catch(() => {}); throw cause; }
    if (generation !== previewGeneration) { await context.close().catch(() => {}); return null; }
    const duration = Math.min(8, value.parameters.duration), graph = buildGraph(context, value.parameters, { duration });
    const current = { context, graph, onEnd, timer: null }; playing = current;
    current.timer = setTimeout(() => { if (playing === current) stop(); }, (duration + value.parameters.release + Math.min(4, value.parameters.delayTime * 8) + .1) * 1000);
    return current;
  }
  async function render(ctx) {
    const { C, main, el, button, input, title, notify, fail: report } = ctx;
    const projectId = ctx.navigation.projectId || null, draftId = `rack-draft:${projectId || 'inbox'}`;
    let draft = await C.get('settings', draftId), bound = null, currentJob = null, saveTimer, writing = Promise.resolve(), disposed = false;
    let preset; try { preset = draft?.value ? validate(draft.value) : validate({ format: 'hole-rack', schemaVersion: 1, name: 'A little atmosphere', parameters: defaults }); } catch { throw fail('The saved Rack draft uses an invalid or unsupported format. Its data has been retained. Export a full private backup before repairing this draft.'); }
    title('SATTARI RACK · TECHNICAL PROTOTYPE', 'A little room for sound.', 'A real browser instrument: oscillator → filter → envelope → delay → output. This prototype does not host native AU/VST plug-ins.');
    const root = el('section', 'hr-rack'), controls = el('div', 'hr-controls'), state = el('p', 'hc-status', 'Saved parameters reopen here. Audio starts only when you choose Preview.'); state.setAttribute('role', 'status');
    const name = input('Instrument name', 'text', preset.name); controls.append(name.wrap);
    const waveform = el('select', 'hc-input'); for (const value of ['sine', 'triangle', 'sawtooth', 'square']) { const option = el('option', '', value); option.value = value; waveform.append(option); } waveform.value = preset.parameters.waveform;
    const waveLabel = el('label', 'hc-label', 'Oscillator waveform'); waveLabel.append(waveform); controls.append(waveLabel);
    const diagram = el('div', 'hr-signal-path'); diagram.setAttribute('aria-label', 'Signal path: oscillator to low-pass filter, envelope, dry and feedback-delay mix, output. LFO modulates filter cutoff.');
    ['Oscillator', 'Low-pass filter', 'Envelope', 'Delay + dry', 'Output'].forEach((label, index) => { if (index) diagram.append(el('span', 'hr-signal-arrow', '→')); diagram.append(el('span', 'hr-signal-node', label)); });
    const knobs = el('div', 'hr-knobs'), fields = {};
    const labels = { frequency: 'Pitch · Hz', cutoff: 'Filter cutoff · Hz', resonance: 'Resonance · Q', gain: 'Output level', attack: 'Attack · seconds', release: 'Release · seconds', lfoRate: 'Filter motion · Hz', lfoDepth: 'Filter motion depth', delayTime: 'Delay · seconds', feedback: 'Delay feedback', delayMix: 'Delay mix', duration: 'Render note · seconds' };
    for (const [key, [min, max]] of Object.entries(limits)) {
      const group = el('label', 'hr-knob'), caption = el('span', '', labels[key]), value = el('output', '', String(preset.parameters[key]));
      const slider = el('input'); slider.type = 'range'; slider.min = min; slider.max = max; slider.step = key === 'frequency' || key === 'cutoff' ? 1 : .01; slider.value = preset.parameters[key]; slider.setAttribute('aria-label', labels[key]);
      group.append(caption, slider, value); knobs.append(group); fields[key] = { slider, value };
      slider.addEventListener('input', () => { preset.parameters[key] = Number(slider.value); value.textContent = slider.value; playing?.graph.update(preset.parameters); queueDraft(); });
    }
    const transport = el('div', 'hc-row'), previewButton = button('Preview sound', 'play', async () => { preset = read(); previewButton.disabled = true; try { const active = await audition(preset, () => { if (!disposed) { previewButton.disabled = false; state.textContent = 'Preview finished. Parameters are unchanged.'; } }); if (!active) { previewButton.disabled = false; state.textContent = 'Preview stopped before audio started.'; return; } state.textContent = 'Playing the actual Web Audio graph. Preview is limited to eight seconds plus its tail.'; } catch (cause) { previewButton.disabled = false; throw cause; } });
    const stopButton = button('Stop', 'square', stop), saveButton = button('Save preset to project', 'save', () => savePreset()), renderButton = button('Render WAV to project', 'audio-lines', async () => {
      const saved = await savePreset(); if (!globalThis.HoleActions) throw new Error('The action service is unavailable.');
      renderButton.disabled = true;
      try { const request = globalThis.HoleActions.run('rack.render', { inputs: [{ assetId: saved.asset.id, versionId: saved.version.id }], parameters: {}, projectId, onJob: job => { currentJob = job.id; } }); currentJob = request.jobId; const result = await request; state.textContent = 'Stereo WAV rendered and saved to the project.'; notify('Rack render saved locally.'); return result; }
      catch (cause) { state.textContent = cause.message; throw cause; }
      finally { currentJob = null; renderButton.disabled = false; }
    });
    const cancelButton = button('Cancel render', 'x', async () => { if (currentJob) await HoleActions.cancel(currentJob); });
    transport.append(previewButton, stopButton, saveButton, renderButton, cancelButton, button('Export preset', 'download', () => ctx.download(serialize(read()), `${safeName(preset.name)}.hole-rack.json`)));
    const picker = el('select', 'hc-input'), library = el('div', 'hr-library');
    const pickerLabel = el('label', 'hc-label', 'Saved instruments'); pickerLabel.append(picker);
    library.append(pickerLabel, button('Open saved preset', 'folder-open', async () => {
      if (!picker.value) return; const readAsset = await C.readAsset(picker.value); const parsed = await parse(readAsset.blob);
      await flushDraft(); preset = parsed; bound = { assetId: readAsset.asset.id, versionId: readAsset.version.id }; applyFields(); await flushDraft(); state.textContent = 'Preset reopened from its saved file.';
    }));
    const upload = el('input', 'hc-input'); upload.type = 'file'; upload.accept = '.json,.hole-rack.json,application/json,application/vnd.hole.rack+json'; upload.setAttribute('aria-label', 'Import a Hole Rack preset');
    upload.addEventListener('change', async () => { try { const file = upload.files?.[0]; if (!file) return; const parsed = await parse(file); await flushDraft(); preset = parsed; bound = null; applyFields(); await flushDraft(); state.textContent = 'Preset imported. Save it to add it to this project.'; } catch (cause) { report(cause); } finally { upload.value = ''; } });
    library.append(upload); root.append(controls, diagram, el('p', 'hr-modulation', 'LFO → filter cutoff · feedback is bounded to 0.75'), knobs, transport, state, library); main.append(root);
    function safeName(value) { return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'instrument'; }
    function read() { return validate({ ...preset, name: name.input.value }); }
    function applyFields() { name.input.value = preset.name; waveform.value = preset.parameters.waveform; for (const [key, field] of Object.entries(fields)) { field.slider.value = preset.parameters[key]; field.value.textContent = String(preset.parameters[key]); } playing?.graph.update(preset.parameters); }
    function queueDraft() { clearTimeout(saveTimer); state.textContent = 'Saving parameter draft…'; saveTimer = setTimeout(() => flushDraft().catch(cause => { state.textContent = `Draft save failed: ${cause.message}. Your controls are retained.`; }), 300); }
    async function flushDraft() {
      clearTimeout(saveTimer); const value = read();
      writing = writing.catch(() => {}).then(async () => { draft = await C.put('settings', { id: draftId, value }, draft ? { expectedRevision: draft.revision } : {}); if (!disposed) state.textContent = 'Parameter draft saved locally.'; });
      return writing;
    }
    async function refreshLibrary() { picker.replaceChildren(el('option', '', 'Choose an instrument')); picker.firstElementChild.value = ''; for (const asset of (await C.list('assets')).filter(asset => asset.state === 'active' && asset.mime === MIME)) { const option = el('option', '', asset.name); option.value = asset.id; picker.append(option); } if (bound) picker.value = bound.assetId; }
    async function savePreset() {
      preset = read(); await flushDraft(); const blob = serialize(preset);
      const result = bound ? await C.commitAsset({ assetId: bound.assetId, baseVersionId: bound.versionId, blob, operation: 'rack.preset-save', parameters: { format: 'hole-rack/1' } }) : await C.importAsset({ name: `${safeName(preset.name)}.hole-rack.json`, blob, kind: 'instrument', projectId, provenance: { editor: 'Hole Rack', format: 'hole-rack/1' } });
      bound = { assetId: result.asset.id, versionId: result.version.id }; await refreshLibrary(); state.textContent = 'Preset file saved locally. Its previous versions are preserved.'; return result;
    }
    waveform.addEventListener('change', () => { preset.parameters.waveform = waveform.value; playing?.graph.update(preset.parameters); queueDraft(); });
    name.input.addEventListener('input', queueDraft);
    function cleanup() { if (disposed) return; disposed = true; clearTimeout(saveTimer); observer.disconnect(); flushDraft().catch(report); }
    const observer = new MutationObserver(() => { if (!root.isConnected) cleanup(); }); observer.observe(main, { childList: true });
    await refreshLibrary(); ctx.H?.icons?.(); return cleanup;
  }
  globalThis.HoleRack = Object.freeze({ MIME, defaults, limits, validate, serialize, parse, renderLength, buildGraph, renderAudio, audition, stop, render });
})();
