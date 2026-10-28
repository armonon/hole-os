/* Browser listening and reading adapters; original specialist routes remain available. */
(() => {
  const C=window.HoleCore; if(!C)return; const model=HoleLibraryModel.create(C);
  let shelf,player,playerName,playerStatus,url,currentRef,saveAt=0,loading=Promise.resolve(), readingEpoch=0;
  const same=(a,b)=>a?.assetId===b?.assetId&&a?.versionId===b?.versionId;
  function createPlayer(ctx) {
    if(player)return;
    shelf=ctx.el('aside','hc-player');shelf.setAttribute('aria-label','Listening queue player');player=ctx.el('audio');player.controls=true;playerName=ctx.el('strong');playerStatus=ctx.el('p');playerStatus.setAttribute('role','status');
    shelf.append(playerName,player,ctx.button('Previous','skip-back',()=>advance(-1)),ctx.button('Next','skip-forward',()=>advance(1)),ctx.button('Pause & hide','minimize-2',async()=>{player.pause();await checkpoint();shelf.hidden=true;}),playerStatus);ctx.H.field.append(shelf);
    player.addEventListener('error',()=>{playerStatus.textContent='This browser could not decode the audio. The original is retained for export.';});
    player.addEventListener('play',()=>{document.querySelectorAll('audio,video').forEach(other=>{if(other!==player)other.pause();});});
    player.addEventListener('pause',()=>{checkpoint().catch(ctx.fail);});
    player.addEventListener('timeupdate',()=>{if(Date.now()-saveAt>5000){saveAt=Date.now();checkpoint().catch(ctx.fail);}});
    player.addEventListener('volumechange',()=>{if(currentRef)model.update({volume:player.volume}).catch(ctx.fail);});
    player.addEventListener('ended',()=>advance(1,true).catch(ctx.fail));
  }
  async function checkpoint() {if(!currentRef)return;const q=await model.queue();if(!same(q.items[q.index],currentRef))return;await model.update({position:player.currentTime||0,volume:player.volume});playerStatus.textContent='Listening position saved locally.';}
  function load(ctx,index,play=false) {loading=loading.catch(()=>{}).then(async()=>{createPlayer(ctx);await checkpoint();let q=await model.queue();if(index!==q.index)q=await model.update({index});const ref=q.items[q.index];if(!ref)throw new Error('The queue is empty.');const record=await model.resolve(ref,'audio');
      if(!same(currentRef,ref)){player.pause();currentRef=null;if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(record.blob);player.src=url;player.volume=q.volume;player.loop=q.loop;player.addEventListener('loadedmetadata',()=>{player.currentTime=Math.min(q.position,Number.isFinite(player.duration)?player.duration:q.position);},{once:true});currentRef=ref;}
      playerName.textContent=record.asset.name;shelf.hidden=false;if(play)await player.play();else playerStatus.textContent='Ready. Press play to listen.';
    });return loading;}
  let context;
  async function advance(delta,automatic=false) {const q=await model.queue();const index=q.index+delta;if(index<0||index>=q.items.length){if(automatic)playerStatus.textContent='End of queue.';return;}await load(context,index,automatic||!player.paused);}
  async function listening(ctx) {
    context=ctx;ctx.title('BOUNCE · LOCAL LISTENING','Your listening room.','Queue browser-supported local audio. Native Bounce remains available separately; native library/tag features are not claimed.');
    createPlayer(ctx);const q=await model.queue();const list=ctx.section('Listening queue');
    for(let i=0;i<q.items.length;i++){const ref=q.items[i],row=ctx.el('div','hc-note hc-row');let record;try{record=await model.resolve(ref,'audio');}catch(error){row.append(ctx.el('p','',error.message));}
      if(record)row.append(ctx.el('strong','',record.asset.name),ctx.button('Listen','play',()=>load(ctx,i,true)),ctx.button('Export original','download',()=>ctx.download(record.blob,record.asset.name)));
      row.append(ctx.button('Remove from queue','x',async()=>{if(same(currentRef,ref)){player.pause();await checkpoint();currentRef=null;player.removeAttribute('src');player.load();if(url)URL.revokeObjectURL(url);url=null;}await model.remove(i);await ctx.render();}));list.append(row);
    }
    const loop=ctx.el('input');loop.type='checkbox';loop.checked=q.loop;loop.setAttribute('aria-label','Loop current track');loop.onchange=()=>model.update({loop:loop.checked}).then(()=>{player.loop=loop.checked;}).catch(ctx.fail);const loopLabel=ctx.el('label','','Loop current track');loopLabel.append(loop);list.append(loopLabel);
    if(q.items.length&&!currentRef)await load(ctx,q.index,false);
    const library=ctx.section('Local audio');for(const asset of (await C.list('assets')).filter(a=>a.state==='active'&&a.mime.startsWith('audio/')))library.append(ctx.button('Queue '+asset.name,'plus',async()=>{await model.enqueue({assetId:asset.id,versionId:asset.headVersionId});await ctx.render();}));
  }
  async function reading(ctx,selected) {
    const epoch=++readingEpoch;const helpers=await import('./vendor/librarian/reading.js');if(epoch!==readingEpoch)return;ctx.title('LIBRARIAN · LOCAL READING','A place to read.','PDF and text files retain their identity. Reading notes are separate from document contents.');
    if(!selected){const area=ctx.section('Your books and documents');for(const asset of (await C.list('assets')).filter(a=>a.state==='active'&&(a.mime==='application/pdf'||a.mime.startsWith('text/'))))area.append(ctx.button(asset.name,'book-open',()=>ctx.open('librarian',{assetId:asset.id,versionId:asset.headVersionId})));return;}
    const record=await C.readAsset(selected.assetId,selected.versionId);if(record.asset.state!=='active')throw new Error('This document is in Trash.');
    if(record.blob.size>30*1024*1024)throw new Error('The local reader supports files up to 30 MiB. Export the original to use a larger-file reader.');
    const ref={assetId:record.asset.id,versionId:record.version.id};let state=await model.reading(ref),total,pages,engine;
    if(record.version.mime==='application/pdf'){await helpers.validatePdf(record.blob);engine=await HolePDF.engine();total=(await engine.inspect(record.blob)).pages.length;}else{pages=helpers.textPages(await record.blob.text());total=pages.length;}
    if(epoch!==readingEpoch)return;const body=ctx.el('section','hc-reader'),heading=ctx.el('h2','',record.asset.name),controls=ctx.el('div','hc-row'),content=ctx.el('div','hc-preview'),feedback=ctx.el('p');feedback.setAttribute('role','status');const page=ctx.input('Page','number',state.page);page.input.min=1;page.input.max=total;
    let drawId=0;
    const draw=async()=>{const token=++drawId;state.page=helpers.readingPage(state.page,total);page.input.value=state.page;const rendered=engine?(await engine.renderPage(record.blob,state.page,1)).canvas:ctx.el('pre','',pages[state.page-1]);if(token!==drawId||epoch!==readingEpoch||!body.isConnected)return;content.replaceChildren(rendered);feedback.textContent=`Page ${state.page} of ${total}.`;};
    const go=async number=>{const requested=helpers.readingPage(number,total);state=await model.saveReading(ref,{page:requested});await draw();feedback.textContent+=' Reading position saved locally.';};
    controls.append(ctx.button('Previous page','arrow-left',()=>go(state.page-1)),page.wrap,ctx.button('Go to page','arrow-right',()=>go(Number(page.input.value))),ctx.button('Next page','arrow-right',()=>go(state.page+1)),ctx.button('Bookmark page','bookmark',async()=>{state=await model.saveReading(ref,{bookmarks:[...new Set([...state.bookmarks,state.page])]});await ctx.render();}));
    body.append(heading,controls,content,feedback);ctx.main.append(body);await draw();if(epoch!==readingEpoch||!body.isConnected)return;
    const marks=ctx.section('Bookmarks and reading notes');for(const number of state.bookmarks)marks.append(ctx.button('Page '+number,'bookmark',()=>go(number)),ctx.button('Remove bookmark '+number,'x',async()=>{state=await model.saveReading(ref,{bookmarks:state.bookmarks.filter(n=>n!==number)});await ctx.render();}));
    for(const note of state.notes)marks.append(ctx.el('p','',`Page ${note.page}: ${note.text}`));const note=ctx.input('Reading note','textarea');marks.append(note.wrap,ctx.button('Keep reading note','check',async()=>{if(!note.input.value.trim())throw new Error('Write a reading note first.');state=await model.saveReading(ref,{notes:[...state.notes,{page:state.page,text:note.input.value}]});await ctx.render();}),ctx.button('Export reading notes','download',()=>ctx.download(new Blob([JSON.stringify({schema:'hole.reading/1',source:ref,...state},null,2)],{type:'application/json'}),'reading-notes.json')),ctx.button('Export original document','download',()=>ctx.download(record.blob,record.asset.name)));
    if(engine)marks.append(ctx.button('Annotate PDF','pen',()=>HolePDF.edit(ctx,record)));
  }
  window.HoleLibraries=Object.freeze({listening,reading,model,checkpoint});
})();
