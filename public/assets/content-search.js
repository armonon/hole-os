/* On-demand bounded local text search; never persists a secondary copy of content. */
(()=>{'use strict';
const limits=Object.freeze({maxDocuments:200,maxBytes:8*1024*1024,maxDocumentBytes:256*1024,maxResults:40});
const aborted=signal=>{if(signal?.aborted)throw Object.assign(new Error('Search cancelled.'),{name:'AbortError'});};
const searchable=mime=>/^text\//.test(mime||'')||['application/json','application/vnd.hole.captions+json'].includes(mime);
async function search(core,query,{history=false,drafts=false,projectId,signal}={}){
 const q=String(query||'').trim().toLocaleLowerCase();if(q.length<2||q.length>160)throw Error('Use 2–160 characters for content search.');aborted(signal);
 let linked=new Set();if(projectId){const project=await core.get('projects',projectId);linked=new Set(project?.assetIds||[]);for(const p of await core.list('placements'))if(p.sceneId===projectId&&p.resourceType==='asset')linked.add(p.resourceId);}
 const assets=(await core.list('assets')).filter(a=>a.state==='active'&&(!projectId||a.projectId===projectId||linked.has(a.id))),byId=new Map(assets.map(a=>[a.id,a]));
 const versions=(await core.list('versions')).filter(v=>byId.has(v.assetId)&&searchable(v.mime)&&(history||byId.get(v.assetId).headVersionId===v.id)).sort((a,b)=>b.createdAt-a.createdAt);
 const candidates=versions.map(v=>({asset:byId.get(v.assetId),version:v,kind:byId.get(v.assetId).headVersionId===v.id?'Current text':'Historical text'}));
 if(drafts)for(const draft of await core.list('drafts'))if(byId.has(draft.assetId)&&typeof draft.text==='string')candidates.unshift({asset:byId.get(draft.assetId),draft,kind:'Recovery draft'});
 const result={matches:[],scanned:0,attempted:0,bytes:0,skipped:0,limited:false,candidates:candidates.length,limits};
 for(const candidate of candidates){aborted(signal);if(result.attempted>=limits.maxDocuments||result.matches.length>=limits.maxResults){result.limited=true;break;}
  result.attempted++;let text;try{if(candidate.draft){text=candidate.draft.text;if(text.length>limits.maxDocumentBytes){result.skipped++;continue;}const bytes=new TextEncoder().encode(text).length;if(bytes>limits.maxDocumentBytes){result.skipped++;continue;}if(result.bytes+bytes>limits.maxBytes){result.limited=true;break;}result.bytes+=bytes;}else{const record=await core.readAsset(candidate.asset.id,candidate.version.id);aborted(signal);if(record.blob.size>limits.maxDocumentBytes){result.skipped++;continue;}if(result.bytes+record.blob.size>limits.maxBytes){result.limited=true;break;}result.bytes+=record.blob.size;text=await record.blob.text();}}catch(error){aborted(signal);result.skipped++;continue;}
  aborted(signal);result.scanned++;const offset=text.toLocaleLowerCase().indexOf(q);if(offset<0)continue;
  result.matches.push({assetId:candidate.asset.id,name:candidate.asset.name,projectId:candidate.asset.projectId||null,versionId:candidate.version?.id||candidate.draft.baseVersionId,draftId:candidate.draft?.id||null,kind:candidate.kind,snippet:text.slice(Math.max(0,offset-70),offset+q.length+100)});
 }
 return result;
}
globalThis.HoleContentSearch=Object.freeze({search,limits});})();
