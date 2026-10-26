/* Native Glyph adapter uses the retained source codec and real font compilers. */
(() => {
  'use strict';
  const fail = (code, message) => Object.assign(new Error(message), { code });
  function create({ engine = globalThis.GlyphEngine, client } = {}) {
    if (!engine || !client) throw fail('ADAPTER_UNAVAILABLE', 'The retained Glyph engine and Hole grant are required.');
    let project = null, binding = null, revision = 0, savedRevision = 0, busy = false, pending = null, pendingExport = null;
    const nativeBlob = () => { const blob = engine.serializeProject(project); if (blob.size > 8 * 1024 * 1024) throw fail('PROJECT_TOO_LARGE', 'The native Glyph project exceeds its 8 MiB reopen limit. Keep this editor open and reduce the project.'); return blob; };
    const bound = () => { if (!binding) throw fail('NOT_OPEN', 'Open a granted native Glyph project first.'); };
    async function openGranted(assetId, versionId) {
      if (binding || busy) throw fail('INSTANCE_BOUND', 'Open a separate editor for another Glyph project.');
      busy = true;
      try {
        const {asset, blob} = await client.request('resource.read', {assetId, versionId});
        if (!/\.(?:glyph(?:\.json)?|lumaglyph\.json)$/i.test(asset.name)) throw fail('UNSUPPORTED_FORMAT', 'Select a native .glyph or .glyph.json project.');
        project = await engine.parseProjectFile(blob);
        binding = {assetId, versionId, name:asset.name};
        return {...binding};
      } finally {busy = false;}
    }
    function replaceProject(value) {
      bound();
      if (busy || pending || pendingExport) throw fail('SAVE_PENDING', 'Retry the pending save or export before editing.');
      project = engine.validateEditableProject(value); revision++;
      return structuredClone(project);
    }
    async function restoreRecovery(blob) { bound(); if (busy || pending) throw fail('SAVE_PENDING','A save is pending.'); return replaceProject(await engine.parseProjectFile(blob)); }
    async function saveBack() {
      bound(); if (busy) throw fail('SAVE_PENDING', 'Wait for the current operation.'); busy = true;
      try {
        pending ||= {requestId:`glyph-save:${crypto.randomUUID()}`,revision,payload:{assetId:binding.assetId,baseVersionId:binding.versionId,blob:nativeBlob(),operation:'glyph-project-save',parameters:{editor:'Glyph'}}};
        const output = await client.request('resource.commit',pending.payload,{requestId:pending.requestId});
        binding.versionId = output.versionId; savedRevision = pending.revision; pending = null; return output;
      } finally {busy = false;}
    }
    async function exportFont(format) {
      bound(); if (!['ttf','otf'].includes(format)) throw fail('UNSUPPORTED_FORMAT','Choose TTF or OTF.');
      if (pendingExport && pendingExport.format !== format) throw fail('EXPORT_PENDING','Retry the pending font format first.');
      if (!pendingExport) {
        if (revision !== savedRevision || pending) await saveBack();
        const bytes = format === 'ttf' ? engine.buildTtf(project) : engine.buildOtf(project);
        const blob = new Blob([bytes],{type:format === 'ttf' ? 'font/ttf' : 'font/otf'});
        pendingExport = {format,requestId:`glyph-export:${crypto.randomUUID()}`,payload:{assetId:binding.assetId,versionId:binding.versionId,operation:`glyph-${format}-export`,parameters:{editor:'Glyph',kerning:format === 'ttf' ? 'legacy-kern' : 'not-exported'},outputs:[{name:`${project.familyName.replace(/\s+/g,'-')}.${format}`,kind:'font',blob}]}};
      }
      const output = await client.request('resource.derive',pendingExport.payload,{requestId:pendingExport.requestId}); pendingExport = null; return output;
    }
    return Object.freeze({openGranted,replaceProject,restoreRecovery,saveBack,exportFont,
      getProject:()=>project ? structuredClone(project) : null,
      getBinding:()=>binding ? {...binding} : null,
      isDirty:()=>revision !== savedRevision,
      recovery:()=>{bound();return nativeBlob();},
      serialize:()=>({schema:'hole.glyph-binding/1',binding:binding ? {...binding}:null,dirty:revision !== savedRevision,pendingRequestId:pending?.requestId || pendingExport?.requestId || null})
    });
  }
  globalThis.HoleGlyphAdapter = Object.freeze({create});
})();
