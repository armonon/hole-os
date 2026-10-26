/* Reusable local work surfaces. Source text is data, never instructions. */
(() => {
  'use strict';
  const capabilities = Object.freeze({ study: ['source.read', 'note.create', 'exercise.self-review'], listening: ['source.read', 'audio.playback'], travel: ['source.read', 'itinerary.read', 'note.create'] });
  const fail = message => { throw new Error(message); };
  function route(text) {
    const command = String(text || '').trim().toLowerCase().replace(/[.!?]+$/, '');
    if (/^(study|study selected|help me study(?: these (?:pages|files|materials))?)$/.test(command)) return { intent: 'study' };
    if (/^(listen|listen to selected|compare mixes|listening station)$/.test(command)) return { intent: 'listening' };
    if (/^(travel|plan (?:my |a )?trip|review itinerary|travel review)$/.test(command)) return { intent: 'travel' };
    if (/^(actions|history|capture|lab|atlas)$/.test(command)) return { view: command };
    if (command.startsWith('search ') && command.length > 7) return { search: String(text).trim().slice(7) };
    fail('Use “study selected”, “listen”, “plan my trip”, “actions”, “history”, “capture”, “lab”, “atlas”, or “search your words”.');
  }
  async function plan(core, { projectId, intent, inputs }) {
    await core.ready;if (!capabilities[intent]) fail('Choose study, listening or travel.');
    const project = await core.get('projects', projectId);if (!project) fail('Choose an existing project.');
    if (!Array.isArray(inputs) || inputs.length > 20 || (!inputs.length && intent !== 'travel')) fail('Select one to twenty source files.');
    const placements = (await core.list('placements')).filter(p => p.sceneId === projectId && p.resourceType === 'asset');
    const members = new Set([...(project.assetIds || []), ...placements.map(p => p.resourceId)]), sources = [];
    for (const ref of inputs) {
      const item = await core.readAsset(ref.assetId, ref.versionId);if (item.asset.state !== 'active' || (item.asset.projectId !== projectId && !members.has(item.asset.id))) fail('A selected source is outside this project or unavailable.');
      const source = { assetId: item.asset.id, versionId: item.version.id, name: item.asset.name, mime: item.blob.type, bytes: item.blob.size };
      if (item.blob.type.startsWith('text/') && item.blob.size <= 1048576) { source.excerpt = (await item.blob.text()).slice(0, 12000); source.coverage = item.blob.size > new Blob([source.excerpt]).size ? 'First 12,000 characters; remainder omitted' : 'Full text'; }
      else source.coverage = item.blob.type === 'application/pdf' ? 'PDF file reference only; no text extraction or generated explanation' : 'File reference; open the original for full content';
      sources.push(source);
    }
    if (intent === 'listening' && !sources.some(item => item.mime.startsWith('audio/'))) fail('Select at least one audio file for the listening station.');
    const places = intent === 'travel' ? (await core.list('links')).filter(item => item.kind === 'atlas-place' && item.projectId === projectId).sort((a,b) => String(a.date || '9999').localeCompare(String(b.date || '9999')) || a.name.localeCompare(b.name)) : [];
    return { schema: 'hole.composition/1', projectId, intent, capabilities: [...capabilities[intent]], sources, places, generatedAt: Date.now() };
  }
  async function save(core, value, previous = null) {
    const proposal = await plan(core, { projectId: value.projectId, intent: value.intent, inputs: value.sources });
    const name = String(value.name || '').trim();if (!name || name.length > 100) fail('Name this composition using up to 100 characters.');
    return core.put('instruments', { ...(previous || {}), id: previous?.id || `composition-${crypto.randomUUID()}`, schema: proposal.schema, name, projectId: proposal.projectId, intent: proposal.intent, sources: proposal.sources.map(({ assetId, versionId }) => ({ assetId, versionId })), capabilities: proposal.capabilities, navigation: { view: 'projects', projectId: proposal.projectId, presentation: 'smart', assetId: null } }, previous ? { expectedRevision: previous.revision } : {});
  }
  async function mount(container, { project, context: ctx }) {
    const C = ctx.C, root = ctx.el('section','hst-tools'), choose = ctx.el('select','hc-input'), material = ctx.el('select','hc-input'), name = ctx.input('Composition name','text','My work surface'), talk = ctx.input('Talk Bar — deterministic commands','text',''), status = ctx.el('p','hc-subtitle'), stage = ctx.el('div','hst-stage');status.setAttribute('role','status');choose.setAttribute('aria-label','Composition intent');material.setAttribute('aria-label','Selected composition sources');material.multiple=true;material.size=5;
    for (const [value,label] of [['study','Study selected sources'],['listening','Listening station'],['travel','Travel review']]) {const option=ctx.el('option','',label);option.value=value;choose.append(option);}
    const placements=(await C.list('placements')).filter(p=>p.sceneId===project.id&&p.resourceType==='asset'), members=new Set([...(project.assetIds||[]),...placements.map(p=>p.resourceId)]), refs=[];
    for(const asset of (await C.list('assets')).filter(a=>a.state==='active'&&(a.projectId===project.id||members.has(a.id)))) {const pin=placements.find(p=>p.resourceId===asset.id&&p.policy==='pinned');const ref={assetId:asset.id,versionId:pin?.versionId||asset.headVersionId};refs.push(ref);const option=ctx.el('option','',asset.name);option.value=String(refs.length-1);material.append(option);}
    let proposal=null,saved=null,urls=[],players=[],saving=Promise.resolve(),disposed=false;
    const release=()=>{for(const audio of players)audio.pause();players=[];for(const url of urls)URL.revokeObjectURL(url);urls=[];};
    const stateId=()=>saved?`composition-state:${saved.id}`:`composition-state:${project.id}:${choose.value}`;
    const persist=patch=>{const id=stateId();saving=saving.catch(()=>{}).then(async()=>{const old=await C.get('settings',id);return C.put('settings',{...(old||{}),id,value:{...(old?.value||{}),...(typeof patch==='function'?patch(old?.value||{}):patch)}},old?{expectedRevision:old.revision}:{});});return saving;};
    const selected=()=>Array.from(material.selectedOptions).map(option=>refs[Number(option.value)]);
    const draw=async()=>{
      proposal=await plan(C,{projectId:project.id,intent:choose.value,inputs:selected()});release();stage.replaceChildren();
      const state=(await C.get('settings',stateId()))?.value||{};
      stage.append(ctx.el('h3','',choose.value==='study'?'Read, recall, check':choose.value==='listening'?'Listen and compare':'Dates, places and source materials'),ctx.el('p','hc-subtitle',`Local capabilities: ${proposal.capabilities.join(', ')}. ${proposal.sources.length} exact source versions. No provider or generated factual claims.`));
      for(const source of proposal.sources){const card=ctx.el('article','hc-note');card.append(ctx.el('strong','',source.name),ctx.el('p','hx-metadata',`${source.versionId} · ${source.coverage}`),ctx.button('Open source','file',()=>ctx.open('history',{assetId:source.assetId,projectId:project.id})));if(source.excerpt)card.append(ctx.el('pre','hst-excerpt',source.excerpt));
        if(proposal.intent==='listening'&&source.mime.startsWith('audio/')){const audio=ctx.el('audio');audio.controls=true;audio.preload='metadata';audio.setAttribute('aria-label','Listen to '+source.name);const item=await C.readAsset(source.assetId,source.versionId),url=URL.createObjectURL(item.blob);urls.push(url);players.push(audio);audio.src=url;const key=source.assetId+':'+source.versionId;const previous=state.playback?.[key]||{};audio.volume=Number.isFinite(previous.volume)?Math.max(0,Math.min(1,previous.volume)):.7;audio.loop=previous.loop===true;audio.addEventListener('loadedmetadata',()=>{if(Number.isFinite(previous.position)&&Number.isFinite(audio.duration))audio.currentTime=Math.min(previous.position,audio.duration);});const loop=ctx.el('input');loop.type='checkbox';loop.checked=audio.loop;const wrap=ctx.el('label','hc-label','Loop this audio');wrap.append(loop);loop.onchange=()=>{audio.loop=loop.checked;checkpoint().catch(ctx.fail);};const checkpoint=()=>{const snapshot={position:audio.currentTime,volume:audio.volume,loop:audio.loop};return persist(current=>({playback:{...(current.playback||{}),[key]:snapshot}})).then(record=>{state.playback=record.value.playback;});};audio.addEventListener('pause',()=>checkpoint().catch(ctx.fail));audio.addEventListener('seeked',()=>checkpoint().catch(ctx.fail));audio.addEventListener('volumechange',()=>checkpoint().catch(ctx.fail));card.append(audio,wrap,ctx.button('Keep listening position','bookmark',checkpoint));}
        stage.append(card);
      }
      if(proposal.intent==='travel'){if(!proposal.places.length)stage.append(ctx.el('p','','No saved Atlas places in this project. Add places in Atlas; no itinerary is invented.'));for(const place of proposal.places)stage.append(ctx.el('p','hc-note',`${place.date||'No date'} · ${place.name} · ${place.latitude}, ${place.longitude}\n${place.notes||''}`));stage.append(ctx.button('Edit places in Atlas','map-pin',()=>ctx.open('atlas',{projectId:project.id,assetId:null})));}
      if(proposal.intent==='study'||proposal.intent==='travel'){
        const note=ctx.input(proposal.intent==='study'?'Recall exercise — write three points, then compare with the sources':'Travel review notes','textarea',state.note||'');note.input.oninput=()=>persist({note:note.input.value}).catch(ctx.fail);stage.append(note.wrap,ctx.button('Keep source-linked note','save',async()=>{const text=note.input.value.trim();if(!text)fail('Write your own notes first.');const refs=proposal.sources.map(s=>({assetId:s.assetId,versionId:s.versionId}));await C.importAsset({name:(proposal.intent==='study'?'Study recall':'Travel review')+'.md',projectId:project.id,kind:'text',blob:new Blob([text+'\n\nSources\n'+proposal.sources.map(s=>`- ${s.name}: ${s.assetId} / ${s.versionId} (${s.coverage})`).join('\n')],{type:'text/markdown'}),provenance:{operation:'composition.note',inputVersions:refs,author:'user'}});status.textContent='Your note and source references were saved.';}));
      }
      status.textContent='Temporary composition ready. Desktop positions remain unchanged.';ctx.H.icons();
    };
    const savedList=ctx.el('select','hc-input');savedList.setAttribute('aria-label','Saved compositions');const blank=ctx.el('option','','Choose a saved composition');blank.value='';savedList.append(blank);
    const refresh=async()=>{savedList.replaceChildren(blank);for(const item of (await C.list('instruments')).filter(i=>i.schema==='hole.composition/1'&&i.projectId===project.id)){const option=ctx.el('option','',item.name);option.value=item.id;savedList.append(option);}};await refresh();
    root.append(ctx.el('h2','','A reusable work surface'),talk.wrap,ctx.button('Run direct command','arrow-right',async()=>{const command=route(talk.input.value);if(command.intent){choose.value=command.intent;await draw();}else if(command.view)await ctx.open(command.view,{projectId:project.id,assetId:null});else {const found=refs.filter(ref=>{const option=Array.from(material.options).find(o=>refs[Number(o.value)]===ref);return option?.textContent.toLowerCase().includes(command.search.toLowerCase());});for(const option of material.options)option.selected=found.includes(refs[Number(option.value)]);status.textContent=`Selected ${found.length} matching project filenames. Choose a composition to review their contents.`;}}),choose,material,name.wrap,ctx.button('Preview composition','scan',draw),ctx.button('Save reusable composition','bookmark',async()=>{if(!proposal)fail('Preview a composition first.');await saving;const priorState=(await C.get('settings',stateId()))?.value||{};saved=await save(C,{...proposal,name:name.input.value},saved);await persist(priorState);await refresh();status.textContent='Composition saved with its exact source versions.';}),savedList,ctx.button('Reopen composition','folder-open',async()=>{const item=await C.get('instruments',savedList.value);if(!item)fail('Choose a saved composition.');saved=item;choose.value=item.intent;name.input.value=item.name;for(const option of material.options){const ref=refs[Number(option.value)],pin=item.sources.find(s=>s.assetId===ref.assetId);option.selected=!!pin;if(pin)refs[Number(option.value)]=pin;}await draw();}),ctx.button('Dismiss composition','x',()=>{release();stage.replaceChildren();proposal=null;status.textContent='Temporary surface dismissed.';}),status,stage);
    const invalidate=()=>{proposal=null;saved=null;release();stage.replaceChildren();};choose.onchange=material.onchange=invalidate;container.append(root);ctx.H.icons();
    return { async dispose(){if(disposed)return;disposed=true;release();await saving;}, root };
  }
  globalThis.HoleSmartTools=Object.freeze({route,plan,save,mount,capabilities});
})();
