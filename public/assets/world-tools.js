/* Local itinerary and language practice. Network/model capabilities are explicit. */
(() => {
  'use strict';
  const fail = message => new Error(message);
  function coordinate(value, limit, label) {
    if (String(value).trim() === '') throw fail(`${label} is required.`);
    const number = Number(value);
    if (!Number.isFinite(number) || Math.abs(number) > limit) throw fail(`${label} must be between ${-limit} and ${limit}.`);
    return number;
  }
  function place(input) {
    if (!String(input.name || '').trim()) throw fail('Give this place a name.');
    const latitude = coordinate(input.latitude, 90, 'Latitude'), longitude = coordinate(input.longitude, 180, 'Longitude');
    if (input.date && (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || new Date(input.date + 'T12:00:00Z').toISOString().slice(0, 10) !== input.date)) throw fail('Choose a valid visit date.');
    if (typeof input.timeZone !== 'string' || !input.timeZone.trim()) throw fail('Choose an explicit time zone.');
    new Intl.DateTimeFormat('en', { timeZone: input.timeZone });
    return { ...input, kind: 'atlas-place', name: input.name.trim().slice(0, 160), latitude, longitude, notes: String(input.notes || '').slice(0, 10000), privacy: 'local-private' };
  }
  const mapURL = value => { const p = place(value); return `https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=15/${p.latitude}/${p.longitude}`; };
  function language(value) { const code = String(value || '').trim(); if (!code || code.length > 40) throw fail('Enter a language code such as en or es.'); return Intl.getCanonicalLocales(code)[0]; }
  function phrase(input) {
    const sourceText = String(input.sourceText || '').trim(), targetText = String(input.targetText || '').trim();
    if (!sourceText || !targetText || sourceText.length > 5000 || targetText.length > 5000) throw fail('Enter both phrases, up to 5,000 characters each.');
    const value = { ...input, kind: 'tongue-phrase', sourceText, targetText, sourceLanguage: language(input.sourceLanguage), targetLanguage: language(input.targetLanguage) };
    if (value.cue) { const start = Number(value.cue.start), end = Number(value.cue.end); if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || Math.round(end * 1000) <= Math.round(start * 1000) || end > 86400) throw fail('Subtitle times must increase by at least one millisecond between 0 and 86,400 seconds.'); value.cue = { start, end }; }
    return value;
  }
  const normalizeAnswer = text => String(text).normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  function review(card, answer, now = Date.now()) {
    const correct = normalizeAnswer(answer) === normalizeAnswer(card.targetText), previous = card.progress || { attempts: 0, correct: 0 };
    const streak = correct ? (previous.streak || 0) + 1 : 0;
    return { attempts: previous.attempts + 1, correct: previous.correct + Number(correct), streak, lastCorrect: correct, lastReviewedAt: now, nextReviewAt: now + (correct ? [1, 3, 7, 14][Math.min(streak - 1, 3)] * 86400000 : 600000) };
  }
  function subtitles(cards) {
    const values = cards.filter(card => card.cue).map(phrase).sort((a, b) => a.cue.start - b.cue.start);
    if (!values.length) throw fail('Add subtitle timing to at least one phrase.');
    const stamp = value => { const ms = Math.round(value * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return [h, m, s].map(n => String(n).padStart(2, '0')).join(':') + ',' + String(ms % 1000).padStart(3, '0'); };
    return values.map((card, index) => {
      if (index && card.cue.start < values[index - 1].cue.end) throw fail('Subtitle cues overlap. Adjust their times before exporting.');
      return `${index + 1}\n${stamp(card.cue.start)} --> ${stamp(card.cue.end)}\n${card.targetText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}\n`;
    }).join('\n');
  }
  async function translatorStatus(engine, sourceLanguage, targetLanguage) {
    if (!engine || typeof engine.availability !== 'function' || typeof engine.create !== 'function') return 'unsupported';
    const result = await engine.availability({ sourceLanguage: language(sourceLanguage), targetLanguage: language(targetLanguage) });
    return ['available', 'downloadable', 'downloading', 'unavailable'].includes(result) ? result : 'unavailable';
  }
  globalThis.HoleWorldToolsModel = Object.freeze({ place, mapURL, language, phrase, review, subtitles, translatorStatus });
  if (typeof window === 'undefined') return;
  let controller = null;
  const dispose = () => { controller?.abort(); controller = null; window.speechSynthesis?.cancel(); globalThis.HoleTonguePractice?.dispose(); };
  function link(ctx, text, href) { const anchor = ctx.el('a', 'hc-button', text); anchor.href = href; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; return anchor; }
  async function atlas(ctx) {
    ctx.title('Places and plans', 'Atlas', 'Keep a private itinerary with saved coordinates and an offline world map. External maps open only when you choose.');
    const all = (await ctx.C.list('links')).filter(item => item.kind === 'atlas-place' && (!ctx.navigation.projectId || item.projectId === ctx.navigation.projectId)).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.name.localeCompare(b.name));
    const tools = ctx.el('div', 'hc-row'); ctx.main.append(tools);
    async function edit(existing) {
      const dialog = ctx.modal(existing ? 'Edit place' : 'Save a place', 'Coordinates stay local. Opening the OpenStreetMap link sends only the chosen coordinates to that site. The coarse offline map needs no location permission. External OpenStreetMap needs connectivity.');
      const name = ctx.input('Place name', 'text', existing?.name || ''), lat = ctx.input('Latitude', 'number', existing?.latitude ?? ''), lon = ctx.input('Longitude', 'number', existing?.longitude ?? ''), date = ctx.input('Visit date', 'date', existing?.date || ''), zone = ctx.input('Time zone', 'text', existing?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone), notes = ctx.input('Notes', 'textarea', existing?.notes || '');
      lat.input.step = 'any'; lon.input.step = 'any';
      const related = ctx.el('select', 'hc-input'); related.setAttribute('aria-label', 'Linked file'); related.append(new Option('No linked file', ''));
      for (const asset of (await ctx.C.list('assets')).filter(asset => asset.state === 'active' && (!ctx.navigation.projectId || asset.projectId === ctx.navigation.projectId))) related.append(new Option(asset.name, asset.id));
      related.value = existing?.linkedAssetId || '';
      const feedback = ctx.el('p'); feedback.setAttribute('role', 'status');
      dialog.append(name.wrap, lat.wrap, lon.wrap, date.wrap, zone.wrap, notes.wrap, related, feedback, ctx.button('Save place', 'check', async () => {
        try { await ctx.put('links', place({ ...(existing || {}), id: existing?.id || `place:${crypto.randomUUID()}`, projectId: ctx.navigation.projectId || null, name: name.input.value, latitude: lat.input.value, longitude: lon.input.value, date: date.input.value, timeZone: zone.input.value.trim(), notes: notes.input.value, linkedAssetId: related.value || null })); dialog.close(); await ctx.render(); } catch (error) { feedback.textContent = error.message; }
      }), ctx.button('Cancel', 'x', () => dialog.close())); ctx.H.icons();
    }
    tools.append(ctx.button('Save a place', 'map-pin', () => edit()), ctx.button('Export private itinerary', 'download', () => ctx.download(new Blob([JSON.stringify({ schema: 'hole.atlas/1', places: all }, null, 2)], { type: 'application/json' }), 'itinerary.hole.json')));
    if (globalThis.HoleAtlasMap) {
      tools.append(ctx.button('Review shared trip export','share',()=>{
        const dialog=ctx.modal('Export a trip copy','Review the details before saving a shareable file. Nothing is published or sent. Coordinates, dates and time zones are always included.');
        const notes=ctx.el('input'),references=ctx.el('input');notes.type=references.type='checkbox';
        const notesLabel=ctx.el('label','hc-label','Include private notes'),referenceLabel=ctx.el('label','hc-label','Include source reference IDs (files are not included)');notesLabel.append(notes);referenceLabel.append(references);
        const feedback=ctx.el('p');feedback.setAttribute('role','status');dialog.append(notesLabel,referenceLabel,feedback,ctx.button('Export reviewed trip JSON','download',async()=>{try{const value=HoleAtlasMapModel.exportTrip(all,{includeNotes:notes.checked,includeReferences:references.checked});await ctx.download(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),'shared-trip.hole.json');feedback.textContent='Trip file exported. Nothing was sent.';}catch(error){feedback.textContent=error.message;}}),ctx.button('Close trip export','x',()=>dialog.close()));
      }));
      const upload=ctx.el('input');upload.type='file';upload.accept='.json,application/json';upload.hidden=true;upload.setAttribute('aria-label','Import Atlas trip JSON');tools.append(upload,ctx.button('Import a trip copy','upload',()=>upload.click()));
      upload.onchange=async()=>{const file=upload.files[0];if(!file)return;const dialog=ctx.modal('Review trip import','Imports create local places in the selected project. Source file references remain unresolved labels; no foreign file is opened. Nothing is published.');const feedback=ctx.el('p');feedback.setAttribute('role','status');dialog.append(feedback,ctx.button('Cancel trip import','x',()=>dialog.close()));
        try {if(file.size>2*1024*1024)throw fail('Trip file exceeds 2 MiB.');const value=JSON.parse(await file.text()),places=HoleAtlasMapModel.trip(value);feedback.textContent=places.length+' validated places. '+places.filter(place=>place.notes).length+' include notes. '+places.filter(place=>place.importedReferences).length+' include unresolved source references.';const commit=ctx.button('Import reviewed trip','check',async()=>{commit.disabled=true;try{const result=await HoleAtlasMapModel.importTrip(ctx.C,value,{projectId:ctx.navigation.projectId||null});dialog.close();await ctx.render();ctx.notify(result.alreadyImported?'This trip copy was already imported; no duplicates created.':result.count+' places imported locally.');}catch(error){feedback.textContent=error.message;commit.disabled=false;}});dialog.append(commit);}catch(error){feedback.textContent=error.message;}upload.value='';
      };
      await HoleAtlasMap.mount({ctx,host:ctx.main,places:all});
    }
    for (const item of all) {
      const card = ctx.section(item.name); card.append(ctx.el('p', 'hc-subtitle', `${item.date || 'Unscheduled'} · ${item.timeZone} · ${item.latitude}, ${item.longitude}`), ctx.el('p', '', item.notes), link(ctx, 'Open OpenStreetMap', mapURL(item)), ctx.button('Edit', 'pencil', () => edit(item)));
      if (item.importedReferences) card.append(ctx.el('p','hc-subtitle','Imported source references retained, not connected: '+JSON.stringify(item.importedReferences)));
      if (item.linkedAssetId) card.append(ctx.button('Open related file', 'file', () => ctx.navigate({ view: 'projects', projectId: item.projectId, assetId: item.linkedAssetId })));
      card.append(ctx.button('Add to Day', 'calendar-plus', () => {
        const dialog = ctx.modal('Schedule this visit', `Time zone: ${item.timeZone}. Day validates ambiguous or nonexistent local times.`), start = ctx.input('Start', 'datetime-local', `${item.date || new Date().toISOString().slice(0, 10)}T09:00`), end = ctx.input('End', 'datetime-local', `${item.date || new Date().toISOString().slice(0, 10)}T10:00`), feedback = ctx.el('p');
        dialog.append(start.wrap, end.wrap, feedback, ctx.button('Save event', 'check', async () => {
          try { if (!globalThis.HoleEverydayModel) throw fail('Day is not available in this build.'); const event = HoleEverydayModel.validateEvent({ id: `event:${crypto.randomUUID()}`, name: item.name, startLocal: start.input.value, endLocal: end.input.value, timeZone: item.timeZone, disambiguation: 'reject', projectId: item.projectId, notes: item.notes, placeId: item.id }); await ctx.put('events', event); dialog.close(); ctx.notify('Visit saved to Day.'); } catch (error) { feedback.textContent = error.message; }
        }), ctx.button('Cancel', 'x', () => dialog.close())); ctx.H.icons();
      }));
    }
    if (!all.length) ctx.main.append(ctx.empty('Save a place to begin your itinerary.'));
    ctx.main.append(link(ctx, 'OpenStreetMap contributors · map data and license', 'https://www.openstreetmap.org/copyright'), ctx.el('p', 'hc-subtitle', 'The bundled Natural Earth map is a coarse offline land reference. OpenStreetMap links need connectivity; they include only coordinates. Roads, routes, geocoding and Circle trip publishing are not connected.'));
  }
  async function tongue(ctx) {
    ctx.title('Language and practice', 'Tongue', 'Build a phrase collection, practice exact written answers, and hear available local voices. Translation uses a real browser engine when available.');
    if (globalThis.HoleTonguePractice) await HoleTonguePractice.mount(ctx, ctx.main);
    const compose = ctx.section('A phrase to keep'), source = ctx.input('Source language code', 'text', 'en'), target = ctx.input('Target language code', 'text', 'es'), original = ctx.input('Original phrase', 'textarea', ''), translated = ctx.input('Translation or your own target phrase', 'textarea', '');
    original.input.maxLength = 5000; translated.input.maxLength = 5000;
    const feedback = ctx.el('p', 'hc-status'); feedback.setAttribute('role', 'status');
    compose.append(source.wrap, target.wrap, original.wrap, translated.wrap, feedback);
    let checked = null, engineResult = null;
    const translate = ctx.button('Check the language pair first', 'languages', async () => {
      try {
        if (!checked || checked.sourceLanguage !== language(source.input.value) || checked.targetLanguage !== language(target.input.value)) throw fail('Check this language pair first.');
        if (!original.input.value.trim()) throw fail('Enter text to translate.');
        const pair = { ...checked }, originalText = original.input.value;
        dispose(); controller = new AbortController(); const active = controller;
        feedback.textContent = pair.state === 'available' ? 'Translating on this device…' : 'The browser is downloading the language model you requested…';
        const engine = await window.Translator.create({ sourceLanguage: pair.sourceLanguage, targetLanguage: pair.targetLanguage, signal: active.signal, monitor(monitor) { monitor.addEventListener('downloadprogress', event => { if (feedback.isConnected) feedback.textContent = `Language model download: ${Math.round(event.loaded * 100)}%`; }); } });
        try {
          const result = await engine.translate(originalText);
          if (active.signal.aborted || !feedback.isConnected) return;
          if (original.input.value !== originalText || language(source.input.value) !== pair.sourceLanguage || language(target.input.value) !== pair.targetLanguage) { feedback.textContent = 'The phrase or language changed during translation. Your current text was kept; check the pair and translate again.'; return; }
          translated.input.value = result; engineResult = { sourceText: originalText, targetText: result, sourceLanguage: pair.sourceLanguage, targetLanguage: pair.targetLanguage, engine: 'browser-translator' }; feedback.textContent = 'Browser translation complete. Review the wording before saving.';
        } finally { engine.destroy(); if (controller === active) controller = null; }
      } catch (error) { feedback.textContent = error.name === 'AbortError' ? 'Translation cancelled.' : error.message; }
    }); translate.disabled = true;
    compose.append(ctx.button('Check translation support', 'scan', async () => {
      try { const state = await translatorStatus(window.Translator, source.input.value, target.input.value); checked = { state, sourceLanguage: language(source.input.value), targetLanguage: language(target.input.value) }; translate.disabled = !['available', 'downloadable', 'downloading'].includes(state); translate.querySelector('span').textContent = state === 'available' ? 'Translate on this device' : 'Download language model and translate'; feedback.textContent = state === 'unsupported' ? 'This browser has no Translator API. You can still write phrases, practice, export subtitles and use local speech voices.' : state === 'unavailable' ? 'This language pair or device is unavailable. No translation was generated.' : state === 'available' ? 'This language pair is available on this device.' : 'A language model download is required. Start it only if you choose.'; } catch (error) { checked = null; translate.disabled = true; feedback.textContent = error.message; }
    }), translate, ctx.button('Cancel translation', 'square', dispose));
    for (const field of [source.input, target.input]) field.addEventListener('input', () => { checked = null; translate.disabled = true; engineResult = null; });
    const cueLabel = ctx.el('label', 'hc-label'), cue = ctx.el('input'); cue.type = 'checkbox'; cueLabel.append(cue, ctx.el('span', '', 'Include subtitle timing'));
    const start = ctx.input('Subtitle start (seconds)', 'number', '0'), end = ctx.input('Subtitle end (seconds)', 'number', '4'); start.input.step = end.input.step = '.001';
    compose.append(cueLabel, start.wrap, end.wrap, ctx.button('Save phrase', 'plus', async () => {
      try {
        const value = phrase({ id: `phrase:${crypto.randomUUID()}`, sourceLanguage: source.input.value, targetLanguage: target.input.value, sourceText: original.input.value, targetText: translated.input.value, projectId: ctx.navigation.projectId || null, cue: cue.checked ? { start: start.input.value, end: end.input.value } : null });
        value.provenance = engineResult && engineResult.sourceText === value.sourceText && engineResult.targetText === value.targetText && engineResult.sourceLanguage === value.sourceLanguage && engineResult.targetLanguage === value.targetLanguage ? { engine: engineResult.engine } : { engine: 'user-authored' };
        await ctx.put('memory', value); await ctx.render();
      } catch (error) { feedback.textContent = error.message; }
    }));
    const cards = (await ctx.C.list('memory')).filter(item => item.kind === 'tongue-phrase' && (!ctx.navigation.projectId || item.projectId === ctx.navigation.projectId)).sort((a, b) => (a.progress?.nextReviewAt || 0) - (b.progress?.nextReviewAt || 0));
    const exports = ctx.el('div', 'hc-row'); exports.append(ctx.button('Export phrase collection', 'download', () => ctx.download(new Blob([JSON.stringify({ schema: 'hole.tongue/1', phrases: cards }, null, 2)], { type: 'application/json' }), 'phrases.hole.json')), ctx.button('Export subtitle cues', 'captions', () => ctx.download(new Blob([subtitles(cards)], { type: 'application/x-subrip' }), 'subtitles.srt'))); ctx.main.append(exports);
    for (const card of cards) {
      const panel = ctx.section(card.sourceText), answer = ctx.input(`Your answer in ${card.targetLanguage}`, 'text', ''), response = ctx.el('p'); response.setAttribute('role', 'status');
      panel.append(ctx.el('p', 'hc-subtitle', `${card.sourceLanguage} → ${card.targetLanguage} · ${card.provenance?.engine === 'browser-translator' ? 'Browser translation' : 'Your phrase'} · ${card.progress?.correct || 0} exact answers / ${card.progress?.attempts || 0} attempts`), answer.wrap, response, ctx.button('Check written answer', 'check', async () => {
        if (!answer.input.value.trim()) { response.textContent = 'Enter your answer first.'; return; }
        try { const progress = review(card, answer.input.value); const stored = await ctx.put('memory', { ...card, progress }); Object.assign(card, stored); response.textContent = progress.lastCorrect ? 'Exact written match. Next review is scheduled from your actual result.' : `Saved answer: ${card.targetText}. This compares text; it does not grade pronunciation.`; } catch (error) { response.textContent = error.message; }
      }), ctx.button('Reveal phrase', 'eye', () => { response.textContent = card.targetText; }), ctx.button('Hear local pronunciation', 'volume-2', () => {
        const voice = window.speechSynthesis?.getVoices().find(voice => voice.localService && voice.lang.toLowerCase().split('-')[0] === card.targetLanguage.toLowerCase().split('-')[0]);
        if (!voice || !window.SpeechSynthesisUtterance) { response.textContent = 'No local voice for this language is currently available. Install a device voice or try again after voices load.'; return; }
        const speech = new SpeechSynthesisUtterance(card.targetText); speech.voice = voice; speech.lang = voice.lang; speech.onerror = () => { response.textContent = 'The local speech engine could not speak this phrase.'; }; window.speechSynthesis.cancel(); window.speechSynthesis.speak(speech); response.textContent = `Speaking with local device voice: ${voice.name}. No pronunciation score is generated.`;
      }), ctx.button('Stop speech', 'square', () => window.speechSynthesis?.cancel()));
    }
    if (!cards.length) ctx.main.append(ctx.empty('Save your first phrase to begin practice.'));
    ctx.main.append(ctx.el('p', 'hc-subtitle', 'Timed practice accepts local transcription captions or SRT with source-provided timing. Automatic conversation/pronunciation assessment is not connected. Phrase-card timing is entered by you; language models and speech voices depend on this browser and device.'), link(ctx, 'Browser translation support', 'https://developer.chrome.com/docs/ai/translator-api'));
  }
  window.HoleWorldTools = Object.freeze({ cancelLeave() { globalThis.HoleTonguePractice?.cancelLeave(); }, async beforeLeave() { await globalThis.HoleTonguePractice?.beforeLeave(); }, async render(view, ctx) { await globalThis.HoleTonguePractice?.beforeLeave(); dispose(); if (view === 'atlas') return atlas(ctx); if (view === 'tongue') return tongue(ctx); throw fail('Unknown world tool.'); }, dispose });
})();
