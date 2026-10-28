/* Browser listening and reading adapters; original specialist routes remain available. */
(() => {
  const C=window.HoleCore; if(!C)return; const model=HoleLibraryModel.create(C);
  let shelf,player,playerName,playerStatus,url,currentRef,saveAt=0,loading=Promise.resolve(), mainReader=null;
  const same=(a,b)=>a?.assetId===b?.assetId&&a?.versionId===b?.versionId;
  function createPlayer(ctx) {
    if(player)return;playerContext=ctx;
    shelf=ctx.el('aside','hc-player');shelf.setAttribute('aria-label','Listening queue player');player=ctx.el('audio');player.controls=true;playerName=ctx.el('strong');playerStatus=ctx.el('p');playerStatus.setAttribute('role','status');
    shelf.append(playerName,player,ctx.button('Previous','skip-back',()=>advance(-1)),ctx.button('Next','skip-forward',()=>advance(1)),ctx.button('Pause & hide','minimize-2',async()=>{player.pause();await checkpoint();shelf.hidden=true;}),playerStatus);ctx.H.field.append(shelf);
    player.addEventListener('error',()=>{playerStatus.textContent='This browser could not decode the audio. The original is retained for export.';});
    player.addEventListener('play',()=>{document.querySelectorAll('audio,video').forEach(other=>{if(other!==player)other.pause();});});
    player.addEventListener('pause',()=>{checkpoint().catch(ctx.fail);});
    player.addEventListener('timeupdate',()=>{if(Date.now()-saveAt>5000){saveAt=Date.now();checkpoint().catch(ctx.fail);}});
    player.addEventListener('volumechange',()=>{if(currentRef)model.update({volume:player.volume}).catch(ctx.fail);});
    player.addEventListener('ended',()=>advance(1,true).catch(ctx.fail));
  }
  async function checkpoint() {if(!currentRef)return;const q=await model.queue();if(!same(q.items[q.index],currentRef))return;await model.update({position:player.currentTime||0,volume:player.volume},{expectedRef:currentRef});playerStatus.textContent='Listening position saved locally.';}
  function load(ctx,index,play=false,exactRef=null) {loading=loading.catch(()=>{}).then(async()=>{createPlayer(ctx);await checkpoint();let q=exactRef?await model.selectRef(exactRef):await model.queue();if(!exactRef&&index!==q.index)q=await model.update({index});const ref=q.items[q.index];if(!ref)throw new Error('The queue is empty.');const record=await model.resolve(ref,'audio');
      if(!same(currentRef,ref)){player.pause();currentRef=null;if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(record.blob);player.src=url;player.volume=q.volume;player.loop=q.loop;player.addEventListener('loadedmetadata',()=>{player.currentTime=Math.min(q.position,Number.isFinite(player.duration)?player.duration:q.position);},{once:true});currentRef=ref;}
      playerName.textContent=record.asset.name;shelf.hidden=false;if(play)await player.play();else playerStatus.textContent='Ready. Press play to listen.';
    });return loading;}
  let playerContext;
  async function advance(delta,automatic=false) {const q=await model.queue();const index=q.index+delta;if(index<0||index>=q.items.length){if(automatic)playerStatus.textContent='End of queue.';return;}await load(playerContext,index,automatic||!player.paused,q.items[index]);}
  async function listening(ctx) {
    ctx.title('BOUNCE · LOCAL LISTENING','Your listening room.','Queue browser-supported local audio. Native Bounce remains available separately; native library/tag features are not claimed.');
    createPlayer(ctx);const q=await model.queue();const list=ctx.section('Listening queue');
    for(let i=0;i<q.items.length;i++){const ref=q.items[i],row=ctx.el('div','hc-note hc-row');let record;try{record=await model.resolve(ref,'audio');}catch(error){row.append(ctx.el('p','',error.message));}
      if(record)row.append(ctx.el('strong','',record.asset.name),ctx.button('Listen','play',()=>load(ctx,null,true,ref)),ctx.button('Export original','download',()=>ctx.download(record.blob,record.asset.name)));
      row.append(ctx.button('Remove from queue','x',async()=>{if(same(currentRef,ref)){player.pause();await checkpoint();currentRef=null;player.removeAttribute('src');player.load();if(url)URL.revokeObjectURL(url);url=null;}await model.removeRef(ref);await ctx.render();}));list.append(row);
    }
    const loop=ctx.el('input');loop.type='checkbox';loop.checked=q.loop;loop.setAttribute('aria-label','Loop current track');loop.onchange=()=>model.update({loop:loop.checked}).then(()=>{player.loop=loop.checked;}).catch(ctx.fail);const loopLabel=ctx.el('label','','Loop current track');loopLabel.append(loop);list.append(loopLabel);
    if(q.items.length&&!currentRef)await load(ctx,q.index,false);
    const library=ctx.section('Local audio');for(const asset of (await C.list('assets')).filter(a=>a.state==='active'&&a.mime.startsWith('audio/')))library.append(ctx.button('Queue '+asset.name,'plus',async()=>{await model.enqueue({assetId:asset.id,versionId:asset.headVersionId});await ctx.render();}));
  }
  async function createReaderSession(ctx,{instanceId,ref}={}) {
    if(!ref?.assetId||!ref?.versionId)throw new Error('Open an exact saved source version in this reader.');
    const source=Object.freeze({assetId:ref.assetId,versionId:ref.versionId}),scope=instanceId===undefined?{}:{instanceId},helpers=await import('./vendor/librarian/reading.js'),record=await model.resolve(source);
    if(record.blob.size>30*1024*1024)throw new Error('The local reader supports files up to 30 MiB. Export the original to use a larger-file reader.');
    let pages,engine,total;if(record.version.mime==='application/pdf'){await helpers.validatePdf(record.blob);engine=await HolePDF.engine();total=(await engine.inspect(record.blob)).pages.length;}else if(record.version.mime.startsWith('text/')){pages=helpers.textPages(await record.blob.text());total=pages.length;}else throw new Error('Choose a PDF or text document.');
    let state={pendingNote:'',...await model.reading(source,scope)},dirty=0,ack=0,writes=Promise.resolve(),timer,disposed=false,drawId=0,rendering=Promise.resolve(),feedback;
    const root=ctx.el('section','hc-reader-session');ctx.main.append(root);const unload=event=>{if(dirty!==ack){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',unload);
    const report=message=>{if(feedback)feedback.textContent=message;};
    function flush(){clearTimeout(timer);writes=writes.catch(()=>{}).then(async()=>{while(dirty!==ack){const revision=dirty,snapshot=JSON.parse(JSON.stringify(state));await model.saveReading(source,snapshot,scope);ack=revision;}return state;});return writes;}
    function change(patch){if(disposed)throw new Error('This reader is closed.');Object.assign(state,patch);dirty++;}
    function schedule(){clearTimeout(timer);timer=setTimeout(()=>flush().then(()=>report('Reading draft saved locally.')).catch(e=>report(e.message+' Keep this reader open; your draft remains here.')),200);}
    async function performRender(){if(disposed)return;await flush();root.replaceChildren();root.append(ctx.el('h2','',record.asset.name));const controls=ctx.el('div','hc-row'),content=ctx.el('div','hc-preview');feedback=ctx.el('p');feedback.setAttribute('role','status');const page=ctx.input('Page','number',state.page);page.input.min=1;page.input.max=total;
      async function draw(){if(disposed)return;const token=++drawId,number=helpers.readingPage(state.page,total);state.page=number;page.input.value=number;const rendered=engine?(await engine.renderPage(record.blob,number,1)).canvas:ctx.el('pre','',pages[number-1]);if(disposed||token!==drawId||!content.isConnected)return;content.replaceChildren(rendered);report(`Page ${number} of ${total}.`);}
      const go=async number=>{change({page:helpers.readingPage(number,total)});try{await flush();await draw();report(`Page ${state.page} of ${total}. Reading position saved locally.`);}catch(e){report(e.message+' Keep this reader open; the requested page remains pending.');throw e;}};
      controls.append(ctx.button('Previous page','arrow-left',()=>go(state.page-1)),page.wrap,ctx.button('Go to page','arrow-right',()=>go(Number(page.input.value))),ctx.button('Next page','arrow-right',()=>go(state.page+1)),ctx.button('Bookmark page','bookmark',async()=>{change({bookmarks:[...new Set([...state.bookmarks,state.page])]});await flush();await render();}));root.append(controls,content,feedback);
      const marks=ctx.el('section');marks.append(ctx.el('h3','','Bookmarks and reading notes'));for(const number of state.bookmarks)marks.append(ctx.button('Page '+number,'bookmark',()=>go(number)),ctx.button('Remove bookmark '+number,'x',async()=>{change({bookmarks:state.bookmarks.filter(n=>n!==number)});await flush();await render();}));
      for(const note of state.notes)marks.append(ctx.el('p','',`Page ${note.page}: ${note.text}`));const note=ctx.input('Reading note','textarea',state.pendingNote);note.input.value=state.pendingNote;note.input.oninput=()=>{change({pendingNote:note.input.value});report('Saving reading draft…');schedule();};
      marks.append(note.wrap,ctx.button('Keep reading note','check',async()=>{if(!state.pendingNote.trim())throw new Error('Write a reading note first.');change({notes:[...state.notes,{page:state.page,text:state.pendingNote}],pendingNote:''});await flush();await render();}),ctx.button('Retry reading save','rotate-cw',async()=>{await flush();await render();}),ctx.button('Export reading notes','download',async()=>{await flush();ctx.download(new Blob([JSON.stringify({schema:'hole.reading/1',source,instanceId:instanceId||null,...state},null,2)],{type:'application/json'}),'reading-notes.json');}),ctx.button('Export original document','download',()=>ctx.download(record.blob,record.asset.name)));root.append(marks);if(engine)marks.append(ctx.button('Annotate PDF','pen',()=>HolePDF.edit(ctx,record)));await draw();
    }
    function render(){const next=rendering.catch(()=>{}).then(performRender);rendering=next;return next;}
    return Object.freeze({render,async serialize(){await rendering;await flush();return {schema:'hole.reader-session/1',instanceId:instanceId||null,source:{...source},page:state.page};},async dispose(){if(disposed)return;await flush();disposed=true;drawId++;clearTimeout(timer);window.removeEventListener('beforeunload',unload);root.remove();}});
  }
  async function beforeLeave(){if(mainReader){await mainReader.dispose();mainReader=null;}}
  async function reading(ctx,selected){await beforeLeave();ctx.title('LIBRARIAN · LOCAL READING','A place to read.','PDF and text files retain their identity. Each reader keeps its own exact source and local notes.');if(!selected){await window.HoleLibraryCollections?.mountList(ctx);const area=ctx.section('Your books and documents');for(const asset of (await C.list('assets')).filter(a=>a.state==='active'&&(a.mime==='application/pdf'||a.mime.startsWith('text/'))))area.append(ctx.button(asset.name,'book-open',()=>ctx.open('librarian',{assetId:asset.id,versionId:asset.headVersionId})));return;}const record=await C.readAsset(selected.assetId,selected.versionId);mainReader=await createReaderSession(ctx,{ref:{assetId:record.asset.id,versionId:record.version.id}});await mainReader.render();}
  async function createListeningSession(ctx,{instanceId}={}){let disposed=false,rendering=Promise.resolve();const changed=e=>{if(e.detail?.type==='settings'&&e.detail?.id==='listening:queue')render().catch(ctx.fail);};window.addEventListener('hole:core-change',changed);const local={...ctx,render:()=>render()};function render(){const next=rendering.catch(()=>{}).then(async()=>{if(disposed)return;ctx.main.replaceChildren();await listening(local);});rendering=next;return next;}return Object.freeze({render,async serialize(){await rendering;await checkpoint();return{schema:'hole.listening-session/1',instanceId:instanceId||null,playerOwnership:'shared-central-player'};},async dispose(){await rendering;await checkpoint();disposed=true;window.removeEventListener('hole:core-change',changed);ctx.main.replaceChildren();}});}
  window.HoleLibraries=Object.freeze({listening,reading,model,checkpoint,createReaderSession,createListeningSession,beforeLeave});
})();
