/* Shared presentation and motion. Never stores or transforms document content. */
(() => {
  'use strict';
  const H = window.HoleOS;
  if (!H) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const ease = 'cubic-bezier(.18,.88,.22,1)';
  let departure = null;
  const moving = () => H.motion() && !reduced.matches && H.os.dataset.quiet !== 'true';
  const animate = (node, frames, duration = 340) => {
    if (!moving() || !node?.isConnected || typeof node.animate !== 'function') return null;
    return node.animate(frames, { duration, easing: ease });
  };
  function remember(node) {
    departure?.ghost?.remove(); departure = null;
    if (!moving() || !node?.isConnected || node.querySelector('iframe')) return;
    const rect = node.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ghost = node.cloneNode(true);
    const originals=[node,...node.querySelectorAll('*')],copies=[ghost,...ghost.querySelectorAll('*')];
    for(let i=0;i<originals.length;i++){const style=getComputedStyle(originals[i]);for(const key of ['font-size','line-height','padding','border-radius','background-color','color','width','height','display'])copies[i].style.setProperty(key,style.getPropertyValue(key));}
    ghost.removeAttribute('data-asset-id'); ghost.removeAttribute('data-placement-id');
    ghost.removeAttribute('id'); ghost.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    ghost.inert = true; ghost.setAttribute('aria-hidden', 'true'); ghost.classList.add('hd-departure');
    Object.assign(ghost.style, { position: 'fixed', margin: '0', left: rect.x+'px', top: rect.y+'px', width: rect.width+'px', height: rect.height+'px', zIndex: '180', pointerEvents: 'none', boxSizing: 'border-box' });
    H.os.append(ghost); const entry = { ghost, rect, time: performance.now() }; departure = entry;
    setTimeout(() => { ghost.remove(); if (departure === entry) departure = null; }, 1600);
  }
  function arrive(main) {
    // Animate small surfaces, never the main scroll/dialog host or a live editor.
    const heading = main.querySelector('.hc-title-row');
    animate(heading, [{ opacity: .3, translate: '0 10px' }, { opacity: 1, translate: '0 0' }]);
    const entry = departure; departure = null;
    if (entry) {
      const target = main.querySelector('.hc-preview,.hc-media,.hc-editor,.hc-title-row');
      const rect = target?.getBoundingClientRect();
      if (rect?.width && moving() && performance.now()-entry.time < 1400) {
        const motion = animate(entry.ghost, [{ opacity: .85, transform: 'none' }, { opacity: 0, transform: `translate(${rect.x-entry.rect.x}px,${rect.y-entry.rect.y}px) scale(${Math.min(3,rect.width/entry.rect.width)},${Math.min(3,rect.height/entry.rect.height)})` }], 420);
        if (motion) motion.finished.catch(() => {}).finally(() => entry.ghost.remove()); else entry.ghost.remove();
      } else entry.ghost.remove();
    }
  }
  function positionTools(dialog, anchor) {
    dialog.classList.add('hd-quick-tools');
    if (!anchor || innerWidth < 640) return;
    const box = dialog.getBoundingClientRect(), rect = anchor.getBoundingClientRect?.() || anchor;
    if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y)) return;
    const x = Math.max(12, Math.min(innerWidth-box.width-12, rect.x));
    const y = Math.max(12, Math.min(innerHeight-box.height-12, rect.y+(rect.height || 0)+12));
    Object.assign(dialog.style, { margin: '0', left: x+'px', top: y+'px' });
  }
  function windowEcho(host, opening=false) {
    if(!moving()||host.hidden)return;
    const r=host.getBoundingClientRect(),dock=H.dock.getBoundingClientRect();if(!r.width||!r.height)return;
    const echo=document.createElement('div');echo.className='hd-window-echo';echo.inert=true;echo.setAttribute('aria-hidden','true');
    const title=document.createElement('span');title.textContent=host.querySelector('.hc-row>strong')?.textContent||'Your workspace';echo.append(title);
    Object.assign(echo.style,{left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px'});H.os.append(echo);
    const folded=`translate(${dock.x+dock.width/2-r.x-r.width/2}px,${dock.y+dock.height/2-r.y-r.height/2}px) scale(.08)`;
    const frames=opening?[{opacity:0,transform:folded},{opacity:.45,offset:.55},{opacity:0,transform:'none'}]:[{opacity:.6,transform:'none'},{opacity:0,transform:folded}];
    const motion=animate(echo,frames,380);if(motion)motion.finished.catch(()=>{}).finally(()=>echo.remove());else echo.remove();
  }
  function editorLayout(quiet=false) {
    const motionStyle=document.createElement('style');document.head.append(motionStyle);
    const motion=value=>motionStyle.textContent=value?'*{animation:none!important;transition:none!important;scroll-behavior:auto!important}':'';motion(quiet);
    addEventListener('message',event=>{if(event.source===parent&&event.data?.kind==='hole.design.motion'&&typeof event.data.quiet==='boolean'){motion(event.data.quiet);if(['light','dark'].includes(event.data.colorScheme))document.documentElement.style.colorScheme=event.data.colorScheme;}});
    let attempts=0,pointer=false;
    document.addEventListener('pointerdown',()=>pointer=true,true);for(const type of ['pointerup','pointercancel'])document.addEventListener(type,()=>pointer=false,true);
    function mount() {
      if(!['HoleLumaMounted','HoleGlyphMounted','HoleFormMounted','HoleScenePilotMounted','HoleStemDeckMounted','HoleAnimateMounted','HoleGhostMounted'].some(key=>globalThis[key])){if(attempts++<250)setTimeout(mount,80);return;}
      if(pointer){setTimeout(mount,80);return;}
      if(document.body.dataset.holeWorkbench)return;
      const focused=document.activeElement,selection=focused?.tagName==='INPUT'||focused?.tagName==='TEXTAREA'?{start:focused.selectionStart,end:focused.selectionEnd}:null;
      const children=[...document.body.children].filter(n=>!['SCRIPT','STYLE'].includes(n.tagName));
      const header=document.createElement('header'),layout=document.createElement('main'),stage=document.createElement('section'),inspector=document.createElement('aside'),footer=document.createElement('footer');
      header.className='hd-native-header';layout.className='hd-native-layout';stage.className='hd-native-stage';inspector.className='hd-native-inspector';footer.className='hd-native-footer';
      stage.setAttribute('aria-label','Document work surface');inspector.setAttribute('aria-label','Editing tools');
      const intro=children.find(n=>n.tagName==='P'),hasCanvas=children.some(n=>n.tagName==='CANVAS');let primary=false;
      for(const n of children){
        if(n.tagName==='H2'||n===intro)header.append(n);
        else if(n.matches('button,[role=status]'))footer.append(n);
        else if(n.tagName==='CANVAS'||n.matches('audio,video,#source,#dimensions,#clock')||!hasCanvas&&!primary&&n.tagName==='FIELDSET'){stage.append(n);primary=true;}
        else inspector.append(n);
      }
      layout.append(stage,inspector);document.body.append(header,layout,footer);document.body.dataset.holeWorkbench='true';
      if(focused?.isConnected&&focused!==document.body){focused.focus({preventScroll:true});if(selection?.start!=null)focused.setSelectionRange(selection.start,selection.end);}
    }
    mount();
  }
  function editorTheme() {
    const scheme = getComputedStyle(H.root).colorScheme;
    const color = scheme === 'dark' || scheme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    return `<style>:root{color-scheme:${color};--paper:light-dark(#fffefa,#292e39);--ink:light-dark(#292c31,#f1f0ec);--soft:light-dark(#f0eee9,#343b49);--line:light-dark(#deded8,#4a5261);--muted:light-dark(#656975,#bdc3cf);--accent:light-dark(#756298,#c2b0eb)}*{box-sizing:border-box}body{font:13px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif!important;color:var(--ink)!important;background:var(--paper)!important;margin:0!important;padding:22px!important}body>h2{font-size:22px;font-weight:550;letter-spacing:-.8px;margin:0 0 8px}p{color:var(--muted);font-size:12px}button,input,select,textarea{font:inherit!important;color:var(--ink);background:var(--paper);border:1px solid var(--line)!important;border-radius:13px!important;padding:9px 12px!important;min-height:38px;max-width:100%}button{cursor:pointer;transition:background .18s,box-shadow .18s}button:hover{background:var(--soft);box-shadow:0 4px 14px #0001}button:disabled{opacity:.45;cursor:default}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid var(--accent);outline-offset:3px}fieldset{border:1px solid var(--line);border-radius:20px;padding:16px;margin:16px 0;background:var(--soft);min-width:0}legend{color:var(--muted);padding:0 8px;font-size:11px;text-transform:uppercase;letter-spacing:1px}label{gap:6px;margin:4px;max-width:100%}canvas{border-radius:18px;background:light-dark(#eeece7,#252b36)!important}input[type=checkbox]{min-height:0}input[type=number]{min-width:64px}#save{background:var(--accent);color:light-dark(white,#201b2b)}[role=status]{padding:12px 15px;border-radius:15px;background:var(--soft);border:1px solid var(--line)}@media(max-width:480px){body{padding:14px!important}fieldset{padding:12px}button,input,select{min-height:44px}label{flex-wrap:wrap}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}</style>`;
  }
  function workspaceFrame(surface, header, button, notify, getContext) {
    let floating = false, geometry = null, drag = null, full = false, stretch = null, resized = false;
    const control = button('Float workspace window', 'panels-top-left', () => set(!floating));
    header.querySelector('.hc-header-actions').prepend(control);
    const fullControl = button('Full screen workspace', 'maximize-2', () => {
      full = !full; surface.dataset.hdFullscreen = String(full);
      fullControl.setAttribute('aria-label',full?'Leave full screen workspace':'Full screen workspace');
      fullControl.title=full?'Leave full screen workspace':'Full screen workspace';
      window.HoleStudioWindow?.syncDock(true);
    });
    header.querySelector('.hc-header-actions').prepend(fullControl);
    const resizer=button('Resize workspace','move-diagonal',()=>{
      if(!getContext)return;const ctx=getContext(),d=ctx.modal('Workspace window layout','Move and resize this app surface. Your files and running work stay in place.'),r=surface.getBoundingClientRect(),fields={};
      for(const[key,label]of[['x','Left'],['y','Top'],['width','Width'],['height','Height']]){const field=ctx.input(label,'number',String(Math.round(r[key])));fields[key]=field.input;d.append(field.wrap);}
      d.append(button('Apply workspace layout','check',()=>{const value=Object.fromEntries(Object.entries(fields).map(([k,n])=>[k,Number(n.value)]));if(Object.values(value).some(n=>!Number.isFinite(n)))throw Error('Enter finite window dimensions.');geometry=fit(value);apply();d.close();}),button('Cancel','x',()=>d.close()));
    });resizer.classList.add('hd-workspace-resizer');surface.append(resizer);
    resizer.addEventListener('pointerdown',event=>{if(event.button!==0||stretch)return;const r=surface.getBoundingClientRect();resized=false;stretch={id:event.pointerId,x:event.clientX,y:event.clientY,rect:{x:r.x,y:r.y,width:r.width,height:r.height}};resizer.setPointerCapture(event.pointerId);});
    resizer.addEventListener('pointermove',event=>{if(!stretch||stretch.id!==event.pointerId)return;const dx=event.clientX-stretch.x,dy=event.clientY-stretch.y;if(Math.hypot(dx,dy)>3)resized=true;if(resized){geometry=fit({...stretch.rect,width:stretch.rect.width+dx,height:stretch.rect.height+dy});apply();}});
    function finishResize(cancel=false,event){if(!stretch||event&&event.pointerId!==stretch.id)return;const old=stretch;stretch=null;if(cancel){geometry=old.rect;apply();}if(resizer.hasPointerCapture(old.id))resizer.releasePointerCapture(old.id);}
    resizer.addEventListener('pointerup',event=>finishResize(false,event));resizer.addEventListener('pointercancel',event=>finishResize(true,event));resizer.addEventListener('lostpointercapture',event=>finishResize(true,event));
    resizer.addEventListener('click',event=>{if(resized&&event.detail!==0){event.preventDefault();event.stopImmediatePropagation();}},true);
    function fit(value) {
      const width = Math.min(innerWidth-16, Math.max(Math.min(300,innerWidth-16), value?.width || innerWidth*.84));
      const height = Math.min(innerHeight-90, Math.max(Math.min(320,innerHeight-90), value?.height || innerHeight*.78));
      return { width, height, x: Math.max(8,Math.min(value?.x ?? innerWidth*.08,innerWidth-width-8)), y: Math.max(8,Math.min(value?.y ?? 70,innerHeight-height-36)) };
    }
    function apply() { if (!floating) return; geometry = fit(geometry); Object.assign(surface.style,{left:geometry.x+'px',top:geometry.y+'px',width:geometry.width+'px',height:geometry.height+'px'}); }
    function set(value) {
      if(full){full=false;surface.dataset.hdFullscreen='false';fullControl.setAttribute('aria-label','Full screen workspace');window.HoleStudioWindow?.syncDock(true);}
      floating = value; surface.dataset.windowed = String(value);
      control.setAttribute('aria-label',value?'Expand workspace':'Float workspace window'); control.title = value?'Expand workspace':'Float workspace window';
      control.querySelector('span').textContent = value?'Expand':'Window';
      if (value) apply(); else { const r=surface.getBoundingClientRect();geometry={x:r.x,y:r.y,width:r.width,height:r.height};for(const key of ['left','top','width','height'])surface.style.removeProperty(key); }
      animate(surface.querySelector('.hc-header'),[{opacity:.5},{opacity:1}],280);
    }
    function end(event,rollback=false) { if (!drag || event && drag.id!==event.pointerId) return;const old=drag;drag=null;if(rollback||event?.type==='pointercancel'||event?.type==='lostpointercapture'){geometry={x:old.rect.x,y:old.rect.y,width:old.rect.width,height:old.rect.height};apply();}if(header.hasPointerCapture(old.id))header.releasePointerCapture(old.id);surface.classList.remove('hd-window-dragging'); }
    header.addEventListener('pointerdown',event=>{if(!floating||event.button!==0||event.target.closest('button,input,a,select'))return;const r=surface.getBoundingClientRect();drag={id:event.pointerId,x:event.clientX,y:event.clientY,rect:r};header.setPointerCapture(event.pointerId);surface.classList.add('hd-window-dragging');});
    header.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;geometry=fit({x:drag.rect.x+event.clientX-drag.x,y:drag.rect.y+event.clientY-drag.y,width:drag.rect.width,height:drag.rect.height});apply();});
    for(const name of ['pointerup','pointercancel','lostpointercapture'])header.addEventListener(name,end);
    window.addEventListener('blur',()=>{end(null,true);finishResize(true);});window.addEventListener('resize',()=>{end(null,true);finishResize(true);if(floating){const r=surface.getBoundingClientRect();geometry={x:r.x,y:r.y,width:r.width,height:r.height};apply();}});
    surface.addEventListener('keydown',event=>{if(event.altKey&&event.key==='F10'){event.preventDefault();set(!floating);notify('Workspace '+(floating?'windowed. Drag the header or resize from its corner.':'expanded.'));}});
    surface.addEventListener('keydown',event=>{if(full&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();fullControl.click();}},true);
    new MutationObserver(()=>window.HoleStudioWindow?.syncDock()).observe(surface,{attributes:true,attributeFilter:['hidden']});
  }
  // A drawer is a foreground surface even when an editor is in full screen.
  const inertWindows = new Map();
  new MutationObserver(() => {
    if(H.isDrawerOpen){for(const node of H.os.querySelectorAll('.hc-workspace,.hc-studio-host')){if(!inertWindows.has(node))inertWindows.set(node,node.inert);node.inert=true;}}
    else{for(const[node,inert]of inertWindows)if(node.isConnected)node.inert=inert;inertWindows.clear();}
    window.HoleStudioWindow?.syncDock(true);
  }).observe(H.os,{attributes:true,attributeFilter:['data-drawer-open']});
  let resizing=false;
  if(typeof ResizeObserver==='function')new ResizeObserver(()=>{if(resizing)return;resizing=true;requestAnimationFrame(()=>{resizing=false;H.resize();});}).observe(H.field);
  function syncMotion(){const quiet=!moving(),scheme=getComputedStyle(H.root).colorScheme,colorScheme=scheme==='dark'||scheme!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';if(quiet)for(const animation of H.os.getAnimations({subtree:true})){try{animation.finish();}catch{animation.cancel();}}for(const frame of H.os.querySelectorAll('.hc-studio-host iframe'))frame.contentWindow?.postMessage({kind:'hole.design.motion',quiet,colorScheme},'*');}
  reduced.addEventListener('change',syncMotion);matchMedia('(prefers-color-scheme: dark)').addEventListener('change',syncMotion);H.root.addEventListener('hole:preferences-change',syncMotion);
  const themedEditor = () => editorTheme()+`<style>body[data-hole-workbench]{display:grid;grid-template-rows:auto minmax(0,1fr) auto;height:100dvh;padding:0!important;overflow:hidden}.hd-native-header{padding:18px 24px;border-bottom:1px solid var(--line);background:var(--paper)}.hd-native-header h2{font-size:19px;letter-spacing:-.6px;margin:0 0 5px}.hd-native-header p{margin:0;font-size:11px;max-width:850px}.hd-native-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(240px,320px);min-height:0}.hd-native-stage{display:flex;flex-direction:column;align-items:center;justify-content:safe center;min-width:0;overflow:auto;padding:28px;gap:18px;background:radial-gradient(ellipse at 30% 30%,light-dark(#e9e2f34d,#45395555),transparent 70%),var(--soft)}.hd-native-stage canvas{flex-shrink:0;box-shadow:0 12px 40px #0000000b;max-width:100%}.hd-native-stage>fieldset{width:100%}.hd-native-stage>p{margin:0}.hd-native-inspector{min-width:0;overflow:auto;padding:18px;border-left:1px solid var(--line);background:var(--paper)}.hd-native-inspector>label{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:8px 0}.hd-native-inspector>fieldset{margin:14px 0;padding:14px}.hd-native-inspector p{font-size:11px}.hd-native-inspector input{max-width:100%}.hd-native-footer{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:10px 18px;background:var(--paper);border-top:1px solid var(--line)}.hd-native-footer [role=status]{margin:4px 0 0;flex-basis:100%;padding:8px 12px;font-size:11px}.hd-native-footer button{margin:0 2px;min-height:35px;padding:7px 12px!important;font-size:11px}@media(max-width:700px){body[data-hole-workbench]{display:block;height:auto;min-height:100dvh;overflow:auto}.hd-native-header{padding:16px}.hd-native-layout{display:flex;flex-direction:column}.hd-native-stage{min-height:250px;padding:18px}.hd-native-inspector{overflow:visible;border-left:0;border-top:1px solid var(--line);padding:16px}.hd-native-footer{position:sticky;bottom:0;z-index:5;padding:10px;box-shadow:0 -8px 25px #00000008}.hd-native-footer button{min-height:40px}.hd-native-header p{font-size:10px}}</style><script>(${editorLayout.toString()})(${JSON.stringify(!moving())})</script>`;
  window.HoleDesign = Object.freeze({ moving, animate, remember, arrive, positionTools, windowEcho, editorTheme: themedEditor, workspaceFrame });
})();
