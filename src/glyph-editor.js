/* A bounded Glyph native editor; full source studio remains available. */
(async () => {
  'use strict';
  if (document.readyState !== 'complete') await new Promise(resolve=>window.addEventListener('load',resolve,{once:true}));
  const status=document.querySelector('[role=status]'), canvas=document.querySelector('canvas'), ctx=canvas.getContext('2d');
  const controls=[...document.querySelectorAll('button,input,select')], client=HoleBridgeClient.createClient({bootstrap:globalThis.HOLE_GLYPH_BOOTSTRAP,hostWindow:parent});
  const adapter=HoleGlyphAdapter.create({client}), undo=[];
  let revision, drawing=null, busy=false;
  const tell=text=>{status.textContent=text;};
  async function checkpoint(pending=false) {const result=await client.request('state.save',{state:{...adapter.serialize(),busy:pending,character:document.querySelector('#character').value},recovery:adapter.isDirty()?adapter.recovery():null,...(revision?{expectedRevision:revision}:{})});revision=result.revision;}
  function update() {
    const project=adapter.getProject(),char=document.querySelector('#character').value,draft=project.glyphs[char] || {advanceWidth:project.metrics.defaultAdvance,strokes:[]};
    document.querySelector('#family').value=project.familyName;document.querySelector('#advance').value=draft.advanceWidth;
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.save();ctx.translate(30,300);ctx.scale(.4,-.4);
    ctx.strokeStyle='#9da5b4';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(800,0);ctx.moveTo(0,project.metrics.capHeight);ctx.lineTo(800,project.metrics.capHeight);ctx.stroke();
    ctx.fillStyle='#18202d';ctx.beginPath();for(const contour of GlyphEngine.glyphContours(draft)){contour.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();}ctx.fill('evenodd');ctx.restore();
  }
  async function run(action) {if(busy)return;busy=true;controls.forEach(n=>n.disabled=true);try{await checkpoint(true);await action();await checkpoint();update();}catch(error){tell(`${error.message} Keep this window open; retry or checkpoint your recovery.`);}finally{busy=false;controls.forEach(n=>n.disabled=false);}}
  async function edit(change) {const project=adapter.getProject();const next=structuredClone(project);change(next);adapter.replaceProject(next);undo.push(project);if(undo.length>50)undo.shift();tell('Native edit retained. Save to update the Hole asset.');}
  controls.forEach(n=>n.disabled=true);
  try {
    const grant=await client.ready,resource=grant.resources[0];await adapter.openGranted(resource.assetId,resource.versionId);
    const select=document.querySelector('#character');select.replaceChildren(...GlyphEngine.GLYPH_CHARSET.map(char=>{const option=document.createElement('option');option.value=char;option.textContent=char;return option;}));
    const saved=await client.request('state.read',{});revision=saved?.revision;
    if(saved?.recovery){await adapter.restoreRecovery(saved.recovery);tell('Recovered native Glyph edits.');}else tell('Draw a glyph or edit its advance width, then save.');
    if(GlyphEngine.GLYPH_CHARSET.includes(saved?.state?.character))select.value=saved.state.character;
    if(grant.projectId){const result=await client.request('project.kit',{projectId:grant.projectId});document.querySelector('#kit').textContent=`Project Kit: ${JSON.stringify(result.kit)}`;}
    select.onchange=()=>run(async()=>{});
    document.querySelector('#family').onchange=()=>run(()=>edit(p=>{p.familyName=document.querySelector('#family').value;}));
    document.querySelector('#advance').onchange=()=>run(()=>edit(p=>{const char=select.value;p.glyphs[char] ||= {advanceWidth:p.metrics.defaultAdvance,strokes:[]};p.glyphs[char].advanceWidth=Number(document.querySelector('#advance').value);}));
    const point=event=>{const rect=canvas.getBoundingClientRect();return [Math.round(((event.clientX-rect.left)*canvas.width/rect.width-30)/.4),Math.round((300-(event.clientY-rect.top)*canvas.height/rect.height)/.4)];};
    canvas.onpointerdown=event=>{if(busy)return;event.preventDefault();drawing={id:event.pointerId,points:[point(event)],char:select.value};canvas.setPointerCapture(event.pointerId);};
    canvas.onpointermove=event=>{if(!drawing||event.pointerId!==drawing.id)return;const next=point(event);if(drawing.points.length<GlyphEngine.GLYPH_LIMITS.pointsPerStroke)drawing.points.push(next);ctx.fillStyle='#4369ce';ctx.beginPath();ctx.arc(30+next[0]*.4,300-next[1]*.4,3,0,Math.PI*2);ctx.fill();};
    canvas.onpointerup=event=>{if(!drawing||event.pointerId!==drawing.id)return;const stroke=drawing;drawing=null;void run(()=>edit(p=>{p.glyphs[stroke.char] ||= {advanceWidth:p.metrics.defaultAdvance,strokes:[]};if(stroke.points.length>1)p.glyphs[stroke.char].strokes.push({kind:'brush',width:40,points:stroke.points});}));};
    canvas.onpointercancel=()=>{drawing=null;update();};
    document.querySelector('#undo').onclick=()=>run(async()=>{if(undo.length)adapter.replaceProject(undo.pop());tell('Undo retained locally.');});
    document.querySelector('#checkpoint').onclick=()=>run(async()=>tell('Native recovery checkpoint saved.'));
    document.querySelector('#save').onclick=()=>run(async()=>{await adapter.saveBack();tell('Saved to Hole after durable acknowledgement. Original retained.');});
    for(const format of ['ttf','otf'])document.getElementById(format).onclick=()=>run(async()=>{await adapter.exportFont(format);tell(`Saved native project and exported real ${format.toUpperCase()} font to Hole.`);});
    update();controls.forEach(n=>n.disabled=false);
    globalThis.HoleGlyphMounted={adapter,client,checkpoint};
  }catch(error){tell(`Glyph could not open: ${error.message}`);client.dispose();}
})();
