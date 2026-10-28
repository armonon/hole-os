/* Durable local listening and reading state over exact resource versions. */
(() => {
  function create(core) {
    let writes=Promise.resolve();
    const serial=fn=>{const next=writes.catch(()=>{}).then(fn);writes=next;return next;};
    const put=async(id,value)=>{const old=await core.get('settings',id);return core.put('settings',{id,value},old?{expectedRevision:old.revision}:{});};
    async function resolve(ref,kind) {
      const record=await core.readAsset(ref.assetId,ref.versionId);
      if(record.asset.state!=='active')throw new Error('This item is in Trash. Restore it first.');
      if(kind==='audio'&&!record.version.mime.startsWith('audio/'))throw new Error('Choose a supported audio file.');
      return record;
    }
    const sameRef=(a,b)=>a?.assetId===b?.assetId&&a?.versionId===b?.versionId;
    const queue=async()=> (await core.get('settings','listening:queue'))?.value || {items:[],index:0,position:0,volume:1,loop:false};
    async function enqueue(ref) {const r=await resolve(ref,'audio');return serial(async()=>{const value=await queue();const item={assetId:r.asset.id,versionId:r.version.id};if(!value.items.some(x=>x.assetId===item.assetId&&x.versionId===item.versionId))value.items.push(item);if(value.items.length>500)throw new Error('Use at most 500 queued tracks.');await put('listening:queue',value);return value;});}
    function update(patch,{expectedRef}={}) {return serial(async()=>{const value=await queue();if(expectedRef&&!sameRef(value.items[value.index],expectedRef))return value;if(patch.index!==undefined){if(!Number.isInteger(patch.index)||patch.index<0||patch.index>=value.items.length)throw new Error('Select a queued track.');await resolve(value.items[patch.index],'audio');value.index=patch.index;value.position=0;}
      if(patch.position!==undefined){if(!Number.isFinite(patch.position)||patch.position<0||patch.position>86400)throw new Error('Invalid playback position.');value.position=patch.position;}
      if(patch.volume!==undefined){if(!Number.isFinite(patch.volume)||patch.volume<0||patch.volume>1)throw new Error('Invalid volume.');value.volume=patch.volume;}
      if(patch.loop!==undefined){if(typeof patch.loop!=='boolean')throw new Error('Invalid loop state.');value.loop=patch.loop;}
      await put('listening:queue',value);return value;});}
    function remove(index) {return serial(async()=>{const value=await queue();if(!Number.isInteger(index)||index<0||index>=value.items.length)throw new Error('Select a queued track.');value.items.splice(index,1);if(index===value.index)value.position=0;if(index<value.index)value.index--;value.index=Math.max(0,Math.min(value.index,value.items.length-1));await put('listening:queue',value);return value;});}
    function readingKey(ref,{instanceId}={}) {if(!ref?.assetId||!ref?.versionId)throw new Error('Reading requires an exact source version.');if(instanceId!==undefined&&(typeof instanceId!=='string'||!instanceId||instanceId.length>128))throw new Error('Invalid reader instance.');return instanceId===undefined?`reading:${ref.assetId}:${ref.versionId}`:`reading-instance:${encodeURIComponent(instanceId)}:${ref.assetId}:${ref.versionId}`;}
    async function reading(ref,scope) {const key=readingKey(ref,scope);await resolve(ref);return (await core.get('settings',key))?.value || {page:1,bookmarks:[],notes:[],pendingNote:'',finished:false};}
    function saveReading(ref,patch,scope) {return serial(async()=>{const key=readingKey(ref,scope);await resolve(ref);const value={...await reading(ref,scope),...patch};if(!Number.isInteger(value.page)||value.page<1||value.page>100000||!Array.isArray(value.bookmarks)||value.bookmarks.length>1000||value.bookmarks.some(n=>!Number.isInteger(n)||n<1)||!Array.isArray(value.notes)||value.notes.length>1000||value.notes.some(n=>!Number.isInteger(n.page)||n.page<1||typeof n.text!=='string'||n.text.length>10000)||typeof value.finished!=='boolean'||value.pendingNote!==undefined&&(typeof value.pendingNote!=='string'||value.pendingNote.length>10000))throw new Error('Invalid reading progress or annotations.');await put(key,value);return value;});}
    function selectRef(ref){return serial(async()=>{const value=await queue(),index=value.items.findIndex(x=>x.assetId===ref.assetId&&x.versionId===ref.versionId);if(index<0)throw new Error('That exact track is no longer queued.');await resolve(value.items[index],'audio');if(index!==value.index){value.index=index;value.position=0;}await put('listening:queue',value);return value;});}
    function removeRef(ref){return serial(async()=>{const value=await queue(),index=value.items.findIndex(x=>x.assetId===ref.assetId&&x.versionId===ref.versionId);if(index<0)throw new Error('That exact track is no longer queued.');value.items.splice(index,1);if(index===value.index)value.position=0;if(index<value.index)value.index--;value.index=Math.max(0,Math.min(value.index,value.items.length-1));await put('listening:queue',value);return value;});}
    return Object.freeze({resolve,queue,enqueue,update,remove,selectRef,removeRef,reading,saveReading});
  }
  globalThis.HoleLibraryModel=Object.freeze({create});
})();
