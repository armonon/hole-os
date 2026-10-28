/* Offline coarse land map. No location API, tiles, geocoding or remote provider. */
(function (global) {
  'use strict';
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  function project(longitude, latitude) { assert(finite(longitude,-180,180) && finite(latitude,-90,90), 'Map coordinates are outside the world bounds.'); return [(longitude+180)*2,(90-latitude)*2]; }
  function view(value = {}) {
    const zoom = finite(value.zoom,1,8) ? value.zoom : 1, width = 720/zoom, height = 360/zoom;
    const x = Math.max(width/2,Math.min(720-width/2,finite(value.x,0,720)?value.x:360)), y = Math.max(height/2,Math.min(360-height/2,finite(value.y,0,360)?value.y:180));
    return { x,y,zoom };
  }
  function paths(data) {
    assert(data?.type==='FeatureCollection' && Array.isArray(data.features) && data.features.length<=300, 'Unsupported offline map data.');
    let count=0;
    return data.features.map(feature=>{assert(feature.geometry?.type==='Polygon' && Array.isArray(feature.geometry.coordinates),'Unsupported land geometry.');return feature.geometry.coordinates.map(ring=>{assert(Array.isArray(ring)&&ring.length>=4,'Invalid land ring.');return ring.map((point,index)=>{assert(++count<=30000 && Array.isArray(point)&&point.length>=2,'Offline map geometry exceeds its limit.');const [x,y]=project(point[0],point[1]);return `${index?'L':'M'}${x.toFixed(3)},${y.toFixed(3)}`;}).join(' ')+' Z';}).join(' ');});
  }
  function trip(value) {
    assert(value && value.schema==='hole.atlas/1' && Array.isArray(value.places) && value.places.length<=200,'Choose an Atlas itinerary with at most 200 places.');
    assert(new TextEncoder().encode(JSON.stringify(value)).byteLength<=2*1024*1024,'Itinerary exceeds 2 MiB.');
    const text=(value,max,label)=>{assert(value===undefined||value===null||typeof value==='string'&&value.length<=max,`${label} is invalid or too long.`);return value||'';};
    return value.places.map(item=>{assert(item&&typeof item==='object'&&!Array.isArray(item),'Invalid itinerary place.');
      const name=text(item.name,160,'Place name'), notes=text(item.notes,10000,'Notes'), timeZone=text(item.timeZone,100,'Time zone'), date=text(item.date,10,'Visit date');
      assert(name.trim() && finite(item.latitude,-90,90) && finite(item.longitude,-180,180),'Place name or coordinates are invalid.');
      const clean=global.HoleWorldToolsModel.place({name,notes,timeZone,date,latitude:item.latitude,longitude:item.longitude});
      const reference=item.importedReferences||{sourcePlaceId:item.id,projectId:item.projectId,linkedAssetId:item.linkedAssetId};
      const importedReferences={}; for(const key of ['sourcePlaceId','projectId','linkedAssetId']) { const value=text(reference[key],160,'Reference');if(value)importedReferences[key]=value; }
      return {...clean,linkedAssetId:null,...(Object.keys(importedReferences).length?{importedReferences}:{})};
    });
  }
  function exportTrip(places,{includeNotes=false,includeReferences=false}={}) {
    const exported=places.map(p=>({name:p.name,latitude:p.latitude,longitude:p.longitude,date:p.date||'',timeZone:p.timeZone,notes:includeNotes?p.notes||'':'',...(includeReferences?{importedReferences:p.importedReferences||{sourcePlaceId:p.id,projectId:p.projectId||null,linkedAssetId:p.linkedAssetId||null}}:{})}));
    trip({schema:'hole.atlas/1',places:exported});return {schema:'hole.atlas/1',privacy:{notesIncluded:includeNotes,referencesIncluded:includeReferences},places:exported};
  }
  async function importTrip(core,value,{projectId=null}={}) {
    const places=trip(value);
    if(projectId)assert(await core.get('projects',projectId),'Choose an existing destination project.');
    const digest=await global.crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({projectId,places}))),fingerprint=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
    const id='atlas-import:'+fingerprint;let journal=await core.get('settings',id),completed=0;
    if(journal?.value?.status==='completed')return {count:journal.value.total,alreadyImported:true,fingerprint};
    journal=await core.put('settings',{id,value:{status:'importing',total:places.length,fingerprint,projectId}},journal?{expectedRevision:journal.revision}:{});
    try {
      for(let index=0;index<places.length;index++) {
        const id='place:atlas:'+fingerprint+':'+index,existing=await core.get('links',id);
        if(existing)assert(existing.importFingerprint===fingerprint,'An imported place identity conflicts with other work.');
        else await core.put('links',{...places[index],id,projectId,importFingerprint:fingerprint});
        completed++;
      }
      journal=await core.put('settings',{...journal,value:{...journal.value,status:'completed',completed}}, {expectedRevision:journal.revision});
      return {count:completed,alreadyImported:false,fingerprint};
    } catch(error) {
      try {await core.put('settings',{...journal,value:{...journal.value,status:'incomplete',completed,error:error.message}},{expectedRevision:journal.revision});} catch {}
      throw new Error(`Trip import stopped after ${completed} of ${places.length} places. Saved places remain local; retry this same file to resume without duplicates. ${error.message}`);
    }
  }
  global.HoleAtlasMapModel=Object.freeze({project,view,paths,trip,exportTrip,importTrip});
  if(typeof document==='undefined')return;
  const dataURL=new URL('./vendor/atlas/ne_110m_land.geojson',document.currentScript.src).href;let land;
  async function mount({ctx,host,places}) {
    const section=ctx.el('section','hc-note');host.append(section);section.append(ctx.el('h2','','Offline world map'));
    const note=ctx.el('p','','Coarse land outlines and your saved coordinates. No roads, routing, geocoding or live location. Arrow keys pan; +/− zoom; Home resets.');section.append(note);
    const feedback=ctx.el('p');feedback.setAttribute('role','status');section.append(feedback);
    let geometry;
    try {land ||= fetch(dataURL).then(async response=>{if(!response.ok)throw new Error('Offline map data unavailable.');const text=await response.text();assert(text.length<1024*1024,'Map data exceeds its limit.');return paths(JSON.parse(text));}).catch(error=>{land=null;throw error;});geometry=await land;} catch(error){feedback.textContent=error.message+' Saved places remain available in the list.';return;}
    const mappedPlaces=places.slice(0,200);if(places.length>200)note.textContent+=' The map shows the first 200 places; the full itinerary remains below.';
    const key='atlas-map-view:'+(ctx.navigation.projectId||'personal');let record=await ctx.C.get('settings',key),camera=view(record?.value),selected=null;
    const ns='http://www.w3.org/2000/svg', svg=document.createElementNS(ns,'svg');svg.setAttribute('aria-label','Offline Atlas map. Arrow keys pan, plus and minus zoom, Home resets.');svg.setAttribute('role','group');svg.setAttribute('tabindex','0');svg.style.cssText='display:block;width:100%;height:auto;aspect-ratio:2/1;max-height:60vh;background:#dceaf0;border:1px solid #53656b;border-radius:8px;touch-action:none';
    const group=document.createElementNS(ns,'g');svg.append(group);
    for(const d of geometry){const path=document.createElementNS(ns,'path');path.setAttribute('d',d);path.setAttribute('fill','#657f59');path.setAttribute('stroke','#344c39');path.setAttribute('stroke-width','.4');path.setAttribute('vector-effect','non-scaling-stroke');path.setAttribute('fill-rule','evenodd');group.append(path);}
    const marks=[];
    const paint=()=>{camera=view(camera);const width=720/camera.zoom,height=360/camera.zoom;svg.setAttribute('viewBox',`${camera.x-width/2} ${camera.y-height/2} ${width} ${height}`);for(const marker of marks){marker.setAttribute('r',String(4/camera.zoom));marker.setAttribute('stroke-width',String(1.5/camera.zoom));}feedback.textContent=`Zoom ${camera.zoom.toFixed(1)}×. ${selected?selected.name+': '+selected.latitude+', '+selected.longitude+'.':'Select a place using a marker or the list.'}`;};
    const focusPlace=place=>{selected=place;const [x,y]=project(place.longitude,place.latitude);camera=view({...camera,x,y,zoom:Math.max(camera.zoom,2)});paint();};
    for(const place of mappedPlaces){const [x,y]=project(place.longitude,place.latitude), marker=document.createElementNS(ns,'circle');marker.setAttribute('cx',x);marker.setAttribute('cy',y);marker.setAttribute('fill','#9b164c');marker.setAttribute('stroke','white');marker.setAttribute('role','button');marker.setAttribute('tabindex','0');marker.setAttribute('aria-label',`${place.name}: ${place.latitude}, ${place.longitude}`);const title=document.createElementNS(ns,'title');title.textContent=place.name;marker.append(title);marker.onclick=()=>focusPlace(place);marker.onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();focusPlace(place);}};marks.push(marker);svg.append(marker);}
    const move=(dx,dy)=>{camera.x+=dx*90/camera.zoom;camera.y+=dy*45/camera.zoom;paint();};
    const zoom=amount=>{camera.zoom=Math.max(1,Math.min(8,camera.zoom*amount));paint();};
    svg.onkeydown=event=>{if(event.target!==svg)return;const action={ArrowLeft:()=>move(-1,0),ArrowRight:()=>move(1,0),ArrowUp:()=>move(0,-1),ArrowDown:()=>move(0,1),'+':()=>zoom(2),'=':()=>zoom(2),'-':()=>zoom(.5),Home:()=>{camera=view();paint();}}[event.key];if(action){event.preventDefault();event.stopPropagation();action();}};
    let drag;svg.onpointerdown=event=>{if(event.target.closest('[role=button]'))return;drag={x:event.clientX,y:event.clientY,camera:{...camera}};svg.setPointerCapture(event.pointerId);};svg.onpointermove=event=>{if(!drag)return;const rect=svg.getBoundingClientRect();camera={...drag.camera,x:drag.camera.x-(event.clientX-drag.x)*720/drag.camera.zoom/rect.width,y:drag.camera.y-(event.clientY-drag.y)*360/drag.camera.zoom/rect.height};paint();};svg.onpointerup=svg.onpointercancel=()=>{drag=null;};
    section.append(svg);const controls=ctx.el('div','hc-row');section.append(controls);
    for(const [label,action] of [['Zoom map in',()=>zoom(2)],['Zoom map out',()=>zoom(.5)],['Pan map west',()=>move(-1,0)],['Pan map east',()=>move(1,0)],['Pan map north',()=>move(0,-1)],['Pan map south',()=>move(0,1)],['Reset world map',()=>{camera=view();paint();}]])controls.append(ctx.button(label,'map',action));
    controls.append(ctx.button('Save map view','bookmark',async()=>{try{record=await ctx.C.put('settings',{id:key,value:camera},record?{expectedRevision:record.revision}:{});feedback.textContent='Map view saved locally.';}catch(error){feedback.textContent=error.message;}}));
    const list=ctx.el('div','hc-row');for(const place of mappedPlaces)list.append(ctx.button('Focus '+place.name+' on map','map-pin',()=>focusPlace(place)));section.append(list);
    const attribution=ctx.el('a','','Made with Natural Earth · public domain');attribution.href='https://www.naturalearthdata.com/about/terms-of-use/';attribution.target='_blank';attribution.rel='noopener noreferrer';section.append(attribution);paint();
  }
  global.HoleAtlasMap=Object.freeze({mount});
})(globalThis);
