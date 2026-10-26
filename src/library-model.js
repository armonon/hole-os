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
    const queue=async()=> (await core.get('settings','listening:queue'))?.value || {items:[],index:0,position:0,volume:1,loop:false};
    async function enqueue(ref) {const r=await resolve(ref,'audio');return serial(async()=>{const value=await queue();const item={assetId:r.asset.id,versionId:r.version.id};if(!value.items.some(x=>x.assetId===item.assetId&&x.versionId===item.versionId))value.items.push(item);if(value.items.length>500)throw new Error('Use at most 500 queued tracks.');await put('listening:queue',value);return value;});}
    function update(patch) {return serial(async()=>{const value=await queue();if(patch.index!==undefined){if(!Number.isInteger(patch.index)||patch.index<0||patch.index>=value.items.length)throw new Error('Select a queued track.');await resolve(value.items[patch.index],'audio');value.index=patch.index;value.position=0;}
      if(patch.position!==undefined){if(!Number.isFinite(patch.position)||patch.position<0||patch.position>86400)throw new Error('Invalid playback position.');value.position=patch.position;}
      if(patch.volume!==undefined){if(!Number.isFinite(patch.volume)||patch.volume<0||patch.volume>1)throw new Error('Invalid volume.');value.volume=patch.volume;}
      if(patch.loop!==undefined){if(typeof patch.loop!=='boolean')throw new Error('Invalid loop state.');value.loop=patch.loop;}
      await put('listening:queue',value);return value;});}
    function remove(index) {return serial(async()=>{const value=await queue();if(!Number.isInteger(index)||index<0||index>=value.items.length)throw new Error('Select a queued track.');value.items.splice(index,1);if(index===value.index)value.position=0;if(index<value.index)value.index--;value.index=Math.max(0,Math.min(value.index,value.items.length-1));await put('listening:queue',value);return value;});}
    async function reading(ref) {await resolve(ref);return (await core.get('settings',`reading:${ref.assetId}:${ref.versionId}`))?.value || {page:1,bookmarks:[],notes:[],finished:false};}
    function saveReading(ref,patch) {return serial(async()=>{await resolve(ref);const value={...await reading(ref),...patch};if(!Number.isInteger(value.page)||value.page<1||value.page>100000||!Array.isArray(value.bookmarks)||value.bookmarks.length>1000||value.bookmarks.some(n=>!Number.isInteger(n)||n<1)||!Array.isArray(value.notes)||value.notes.length>1000||value.notes.some(n=>!Number.isInteger(n.page)||n.page<1||typeof n.text!=='string'||n.text.length>10000)||typeof value.finished!=='boolean')throw new Error('Invalid reading progress or annotations.');await put(`reading:${ref.assetId}:${ref.versionId}`,value);return value;});}
    return Object.freeze({resolve,queue,enqueue,update,remove,reading,saveReading});
  }
  globalThis.HoleLibraryModel=Object.freeze({create});
})();
