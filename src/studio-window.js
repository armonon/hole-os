/* Shared native/tool window presentation. Geometry never changes document bytes. */
(() => {
  'use strict';
  let layer = 160;
  function fit(value, width, height) {
    const n = (v, fallback) => Number.isFinite(v) ? v : fallback;
    const w = Math.max(Math.min(260,width),Math.min(n(value?.width,width*.9),width));
    const h = Math.max(Math.min(300,height),Math.min(n(value?.height,height*.8),height));
    return {x:Math.max(0,Math.min(n(value?.x,width*.05),width-w)),y:Math.max(0,Math.min(n(value?.y,height*.08),height-h)),width:w,height:h};
  }
  function apply(host, value) {
    const g = fit(value,innerWidth,innerHeight);
    Object.assign(host.style,{inset:'auto',left:g.x+'px',top:g.y+'px',width:g.width+'px',height:g.height+'px',boxSizing:'border-box'});return g;
  }
  function read(host) {
    if(host.hidden)return fit({x:parseFloat(host.style.left),y:parseFloat(host.style.top),width:parseFloat(host.style.width),height:parseFloat(host.style.height)},innerWidth,innerHeight);
    const r=host.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};
  }
  function syncDock(reset=false) {
    const H=window.HoleOS;if(!H)return;
    const active=!!H.os.querySelector('.hc-studio-host[data-hd-fullscreen=true]:not([hidden]),.hc-workspace[data-hd-fullscreen=true]:not([hidden])');
    const changed=H.os.dataset.hdFullscreen!==String(active);H.os.dataset.hdFullscreen=String(active);
    if(changed||reset){H.os.dataset.dockRevealed=String(!active||H.isDrawerOpen);H.dock.inert=active&&!H.isDrawerOpen;}
  }
  function wrap(adapter) {
    return {...adapter,async mount(instance,root) {
      const host=root.closest('.hc-studio-host');apply(host,instance.editorState?.hostGeometry);
      const handle=await adapter.mount(instance,root);let normal=read(host),full=false,drag=null;
      function raise(){if(layer>=195){document.querySelectorAll('.hc-studio-host').forEach((n,i)=>n.style.zIndex=String(160+i));layer=175;}host.style.zIndex=String(++layer);}
      function fullscreen(value) {
        if(value&&!full)normal=read(host);full=value;host.dataset.hdFullscreen=String(value);
        if(value)Object.assign(host.style,{inset:'0',left:'0',top:'0',width:innerWidth+'px',height:innerHeight+'px'});else apply(host,normal);
        syncDock();
      }
      const resize=()=>{end();if(full)fullscreen(true);else normal=apply(host,read(host));};
      function end(event){if(!drag||event&&drag.id!==event.pointerId)return;const id=drag.id;drag=null;if(host.hasPointerCapture?.(id))host.releasePointerCapture(id);host.classList.remove('hd-window-dragging');}
      function down(event){raise();if(full||event.button!==0||!event.target.closest('.hc-studio-host>.hc-row')||event.target.closest('button,input,select,a'))return;drag={id:event.pointerId,x:event.clientX,y:event.clientY,rect:read(host)};host.setPointerCapture(event.pointerId);host.classList.add('hd-window-dragging');}
      function move(event){if(!drag||drag.id!==event.pointerId)return;normal=apply(host,{...drag.rect,x:drag.rect.x+event.clientX-drag.x,y:drag.rect.y+event.clientY-drag.y});}
      const blur=()=>end();
      host.addEventListener('pointerdown',down);host.addEventListener('pointermove',move);
      for(const name of ['pointerup','pointercancel','lostpointercapture'])host.addEventListener(name,end);
      window.addEventListener('resize',resize);window.addEventListener('blur',blur);raise();
      if(instance.presentation==='focus')fullscreen(true);
      window.HoleDesign?.animate(host.querySelector('.hc-studio-content'),[{opacity:.3},{opacity:1}],280);
      return {...handle,
        present:async presentation=>{await handle.present?.(presentation);const wasHidden=host.hidden;if(presentation==='minimized')window.HoleDesign?.windowEcho(host);host.hidden=presentation==='minimized';if(presentation!=='minimized')fullscreen(presentation==='focus');syncDock();if(!host.hidden){raise();if(wasHidden)window.HoleDesign?.windowEcho(host,true);}},
        serialize:async()=>({...await handle.serialize(),hostGeometry:full?normal:read(host)}),
        close:async()=>{await handle.close();end();window.removeEventListener('resize',resize);window.removeEventListener('blur',blur);host.removeEventListener('pointerdown',down);host.removeEventListener('pointermove',move);for(const name of ['pointerup','pointercancel','lostpointercapture'])host.removeEventListener(name,end);host.dataset.hdFullscreen='false';syncDock();}
      };
    }};
  }
  function layout(host,instanceId,ctx) {
    const d=ctx.modal('Studio window layout','Move or resize this view without changing your document. Saved arrangements retain these bounds.');const g=read(host),fields={};
    for(const[key,label]of[['x','Left'],['y','Top'],['width','Width'],['height','Height']]){const f=ctx.input(label,'number',String(Math.round(g[key])));fields[key]=f.input;d.append(f.wrap);}
    d.append(ctx.button('Apply window layout','check',async()=>{const value=Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,Number(v.value)]));if(Object.values(value).some(v=>!Number.isFinite(v)))throw new Error('Enter finite window dimensions.');if(HoleRuntime.get(instanceId)?.presentation==='focus')await HoleRuntime.present(instanceId,'window');apply(host,value);await HoleRuntime.checkpoint(instanceId);d.close();}),ctx.button('Cancel','x',()=>d.close()));
  }
  globalThis.HoleStudioWindow=Object.freeze({fit,apply,wrap,layout,syncDock});
})();
