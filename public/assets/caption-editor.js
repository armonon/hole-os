/* Native caption edits retain raw inference and acknowledge durable drafts. */
(()=>{'use strict';
async function open(record,ctx){
 if(record.blob.size>2*1024*1024)throw new Error('Caption documents must fit within 2 MiB.');
 let baseVersionId=record.version.id,draft=(await ctx.C.list('drafts')).filter(d=>d.assetId===record.asset.id&&d.editor==='captions').sort((a,b)=>b.updatedAt-a.updatedAt)[0];
 const initial=HoleTranscriptionCues.validate(JSON.parse(draft?.text||await record.blob.text()));if(draft)baseVersionId=draft.baseVersionId;
 const d=ctx.modal('Review captions · '+record.asset.name,'Edits are kept in a local recovery draft. Save commits a new native caption version. Raw model words and source identity remain unchanged.');const root=ctx.el('div');d.append(root);const feedback=ctx.status(draft?'Recovered local caption edits.':'',false,d);let audioBlob;
 try{if(initial.source?.assetId&&initial.source?.versionId){const audio=await ctx.C.readAsset(initial.source.assetId,initial.source.versionId);if(audio.blob.type.startsWith('audio/'))audioBlob=audio.blob;}}catch{feedback.textContent='Source audio is unavailable; captions can still be reviewed.';}
 const persist=async doc=>{const value={id:draft?.id||'draft:captions:'+record.asset.id,assetId:record.asset.id,baseVersionId,editor:'captions',text:JSON.stringify(doc),...(draft?{revision:draft.revision}:{})};draft=await ctx.C.saveDraft(value);feedback.textContent='Caption recovery saved locally.';};
 const editor=HoleTranscriptionCues.mount(root,{document:initial,audioBlob,onChange:persist,onSave:async doc=>{await persist(doc);const committed=await ctx.C.commitDraft(draft.id);baseVersionId=committed.version.id;draft=null;feedback.textContent='New caption version saved; originals retained.';}});
 for(const [label,mime] of [['Download reviewed SRT','application/x-subrip'],['Download reviewed VTT','text/vtt'],['Download caption document','application/vnd.hole.captions+json']])d.append(ctx.button(label,'download',async()=>{await editor.flush();const output=HoleTranscriptionCues.outputs(editor.getDocument()).find(o=>o.blob.type===mime);ctx.download(output.blob,output.name);}));
 let closing=false;const close=async()=>{if(closing)return;closing=true;try{await editor.flush();editor.close();d.close();}catch(error){feedback.textContent=error.message+' Keep this editor open and retry recovery.';}finally{closing=false;}};
 d.addEventListener('cancel',event=>{event.preventDefault();void close();});d.append(ctx.button('Close caption review','x',close));
}
globalThis.HoleCaptionEditor=Object.freeze({open});})();
