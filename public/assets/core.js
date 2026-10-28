/* Durable local resource service. Every acknowledgement follows an IDB commit.
 * The legacy stores remain intact; no in-memory success fallback is provided. */
(() => {
  'use strict';
  const DB_NAME = 'hole-file-library-v1', DB_VERSION = 2, SCHEMA = 1;
  const TYPES = new Set('spaces projects placements scenes drafts snapshots jobs recipes runs carry events tasks contacts links instruments packages memory settings'.split(' '));
  const STORES = ['files', 'contents', 'jobs', 'assets', 'versions', 'versionContents', 'records', 'journal', 'backupStage'];
  const MAX_BLOB = 150 * 1024 * 1024, MAX_BACKUP = 600 * 1024 * 1024, MAX_RECORDS = 50000;
  const error = (code, message) => Object.assign(new Error(message), { code });
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 240 && !/[\u0000-\u001f\u007f]/.test(value);
  const clone = value => structuredClone(value);
  function jsonValue(value) {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw error('INVALID', 'A record must contain JSON data.');
    return JSON.parse(serialized);
  }
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(item => canonical(item) ?? 'null').join(',') + ']';
    if (isObject(value)) return '{' + Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    return JSON.stringify(value);
  }
  function name(value) { return String(value || 'Untitled').replace(/[\u0000-\u001f\u007f/\\]/g, '').trim().slice(0, 200) || 'Untitled'; }
  function kindFor(mime) { return mime.startsWith('image/') ? 'image' : mime.startsWith('audio/') ? 'audio' : mime.startsWith('video/') ? 'video' : mime.startsWith('text/') ? 'text' : 'file'; }
  function request(req) { return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
  function serialError(e) { return typeof e?.code === 'string' ? e : error(e?.name === 'QuotaExceededError' ? 'QUOTA' : 'STORAGE', e?.message || 'This change could not be saved locally.'); }
  function base64(bytes) {
    let out = ''; for (let i = 0; i < bytes.length; i += 32768) out += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(out);
  }
  function unbase64(text) {
    if (typeof text !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) throw error('BACKUP_INVALID', 'The backup contains invalid file encoding.');
    return Uint8Array.from(atob(text), c => c.charCodeAt(0));
  }
  function assertBlob(blob) {
    if (!(blob instanceof Blob) || blob.size > MAX_BLOB) throw error('INVALID', 'Choose a file at or below 150 MB.');
  }
  function createCore(options = {}) {
    const factory = options.indexedDB || globalThis.indexedDB;
    const crypto = options.crypto || globalThis.crypto;
    const now = options.now || Date.now;
    const uid = options.id || (() => crypto.randomUUID());
    const local = options.localStorage === undefined ? (() => { try { return globalThis.localStorage; } catch { return null; } })() : options.localStorage;
    const target = options.target || (typeof window === 'undefined' ? null : window);
    const dbName = options.dbName || DB_NAME;
    let database, closed = false;
    const channel = options.broadcast === false || typeof window === 'undefined' || typeof BroadcastChannel !== 'function' ? null : new BroadcastChannel(dbName + ':core');
    function emit(detail, broadcast = true) {
      target?.dispatchEvent(new CustomEvent('hole:core-change', { detail }));
      if (broadcast) channel?.postMessage(detail);
    }
    if (channel) channel.onmessage = event => emit(event.data, false);
    const hash = async blob => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('');
    async function transaction(stores, mode, work) {
      if (!database || closed) throw error('STORAGE', 'Local storage is unavailable. Reload Hole and try again.');
      return new Promise((resolve, reject) => {
        let tx, result, failure;
        try { tx = database.transaction(stores, mode); } catch (e) { reject(serialError(e)); return; }
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(serialError(failure || tx.error || error('STORAGE', 'The transaction was interrupted. Your previous work is unchanged.')));
        tx.onerror = () => {};
        Promise.resolve().then(() => work(tx)).then(value => { result = value; }, e => { failure = e; try { tx.abort(); } catch { reject(serialError(e)); } });
      });
    }
    const recordStore = tx => tx.objectStore('records');
    const readRecord = async (tx, type, id) => (await request(recordStore(tx).get([type, id])))?.record || null;
    function requireType(type) { if (!TYPES.has(type)) throw error('INVALID', 'Unknown record type: ' + type); }
    function revision(current, expected) {
      if (current ? expected !== current.revision : expected !== undefined && expected !== 0) throw error('CONFLICT', 'This item changed in another view. Reload its latest version before saving; your draft is retained.');
    }
    function preparedRecord(type, record, current, expected) {
      requireType(type);
      if (!isObject(record) || !validId(record.id)) throw error('INVALID', 'A record needs a valid identity.');
      revision(current, expected);
      return { ...jsonValue(record), revision: (current?.revision || 0) + 1, createdAt: current?.createdAt || record.createdAt || now(), updatedAt: now() };
    }
    function writeRecord(tx, type, record) { recordStore(tx).put({ type, id: record.id, record }); }
    async function preparedContent(blob) { assertBlob(blob); const mime = blob.type || 'application/octet-stream'; return { blob: blob.type ? blob : new Blob([blob], { type: mime }), mime, size: blob.size, hash: await hash(blob) }; }
    function makeAsset(input, content) {
      const at = now(), assetId = input.id || uid(), versionId = input.versionId || uid();
      if (!validId(assetId) || !validId(versionId)) throw error('INVALID', 'An asset needs valid identities.');
      const asset = { id: assetId, name: name(input.name), kind: input.kind || kindFor(content.mime), mime: content.mime, headVersionId: versionId, revision: 1, state: input.state || 'active', createdAt: at, updatedAt: at, projectId: input.projectId || null, spaceId: input.spaceId || null, provenance: jsonValue(input.provenance || {}) };
      const parents = input.parentVersionIds || [];
      if (!Array.isArray(parents) || parents.length > 100 || parents.some(id => !validId(id)) || new Set(parents).size !== parents.length) throw error('INVALID', 'Version parents must be valid, distinct identities.');
      const version = { id: versionId, assetId, parentVersionIds: [...parents], mime: content.mime, size: content.size, hash: content.hash, operation: input.operation || 'import', parameters: jsonValue(input.parameters || {}), createdAt: at, provenance: jsonValue(input.provenance || {}) };
      return { asset, version };
    }
    function writeAsset(tx, result, blob, add = true) {
      tx.objectStore('assets')[add ? 'add' : 'put'](result.asset);
      tx.objectStore('versions').add(result.version);
      tx.objectStore('versionContents').add(blob, result.version.id);
    }
    async function verifyParents(tx, version) {
      for (const id of version.parentVersionIds) if (!await request(tx.objectStore('versions').get(id))) throw error('NOT_FOUND', 'A source version is unavailable. The original work is unchanged.');
    }
    async function projectLegacy(tx, result, blob) {
      const { asset, version } = result, previous = await request(tx.objectStore('files').get(asset.id));
      const file = { ...(previous || {}), id: asset.id, name: asset.name, type: version.mime, size: version.size, createdAt: previous?.createdAt || asset.createdAt, modifiedAt: asset.updatedAt, state: asset.state, space: asset.spaceId || previous?.space || 'desk', rootId: previous?.rootId || asset.id, parentId: previous?.parentId || null, coreAsset: true, revision: (previous?.revision || 0) + 1, operation: version.operation, provenance: asset.provenance, history: [...(previous?.history || []), { id: version.id, type: version.operation, detail: 'Saved as an immutable file version', at: version.createdAt }] };
      tx.objectStore('files').put(file); tx.objectStore('contents').put(blob, file.id);
    }
    async function addMembership(tx, asset) {
      if (!asset.projectId) return;
      const project = await readRecord(tx, 'projects', asset.projectId);
      if (!project) throw error('NOT_FOUND', 'The destination project is unavailable.');
      if (!(project.assetIds || []).includes(asset.id)) writeRecord(tx, 'projects', { ...project, assetIds: [...(project.assetIds || []), asset.id], revision: project.revision + 1, updatedAt: now() });
    }
    function nextVersion(asset, input, content) {
      if (!asset) throw error('NOT_FOUND', 'This asset is unavailable.');
      if (asset.state === 'trashed') throw error('TRASHED', 'Restore this item from Trash before editing it.');
      if (asset.headVersionId !== input.baseVersionId) throw error('CONFLICT', 'A newer version exists. Your draft is retained; compare it with the latest version or create a branch.');
      const additional = input.parentVersionIds || [];
      if (!Array.isArray(additional) || additional.length > 100 || additional.some(id => !validId(id)) || new Set(additional).size !== additional.length) throw error('INVALID', 'Version parents must be valid, distinct identities.');
      const parents = [...new Set([asset.headVersionId, ...additional])];
      if (parents.length > 100) throw error('INVALID', 'A version supports at most 100 parents including its previous head.');
      const at = now(), version = { id: uid(), assetId: asset.id, parentVersionIds: parents, mime: content.mime, size: content.size, hash: content.hash, operation: input.operation || 'edit', parameters: jsonValue(input.parameters || {}), createdAt: at, provenance: jsonValue(input.provenance || {}), ...(input.jobId ? { jobId: input.jobId } : {}) };
      return { asset: { ...asset, ...(input.name ? { name: name(input.name) } : {}), mime: content.mime, headVersionId: version.id, revision: asset.revision + 1, updatedAt: at }, version };
    }
    async function migrateLegacy() {
      const saved = await transaction(['journal', 'files', 'contents', 'jobs'], 'readonly', async tx => {
        const journal = await request(tx.objectStore('journal').get('migration:legacy-v1'));
        if (journal?.state === 'committed') return null;
        const [files, keys, blobs, jobs] = await Promise.all(['files', 'contents', 'contents', 'jobs'].map((s, i) => request(tx.objectStore(s)[i === 1 ? 'getAllKeys' : 'getAll']())));
        return { files, jobs, contents: new Map(keys.map((key, i) => [key, blobs[i]])) };
      });
      if (!saved) return;
      let workspace = null;
      try { workspace = local?.getItem('hole-os:workspace:v1') || null; } catch { /* Importing the file library remains possible. */ }
      await transaction(['journal'], 'readwrite', tx => tx.objectStore('journal').put({ id: 'migration:legacy-v1', state: 'staged', at: now(), rawFiles: saved.files, rawJobs: saved.jobs, rawWorkspace: workspace, schema: SCHEMA }));
      const imports = [];
      for (const file of saved.files) {
        const blob = saved.contents.get(file.id);
        if (!validId(file.id) || !(blob instanceof Blob)) continue;
        const result = makeAsset({ id: file.id, versionId: file.id.length < 220 ? 'legacy-version:' + file.id : uid(), name: file.name, spaceId: file.space, state: file.state === 'trashed' ? 'trashed' : 'active', operation: file.operation || 'legacy-import', provenance: { ...(file.provenance || {}), legacy: { parentId: file.parentId || null, rootId: file.rootId || null } } }, await preparedContent(blob));
        result.asset.createdAt = file.createdAt || result.asset.createdAt;
        result.asset.updatedAt = file.modifiedAt || result.asset.updatedAt;
        imports.push({ ...result, blob: blob.type ? blob : new Blob([blob], { type: result.version.mime }) });
      }
      await transaction(['journal', 'assets', 'versions', 'versionContents', 'records'], 'readwrite', async tx => {
        const journal = await request(tx.objectStore('journal').get('migration:legacy-v1'));
        if (journal?.state === 'committed') return;
        for (const result of imports) if (!await request(tx.objectStore('assets').get(result.asset.id))) writeAsset(tx, result, result.blob);
        for (const job of saved.jobs) if (validId(job.id) && !await readRecord(tx, 'jobs', job.id)) writeRecord(tx, 'jobs', { ...job, revision: 1, legacy: true });
        if (workspace) {
          let value; try { value = JSON.parse(workspace); } catch { value = null; }
          if (isObject(value) && !await readRecord(tx, 'settings', 'legacy-workspace')) writeRecord(tx, 'settings', { id: 'legacy-workspace', value, revision: 1, createdAt: now(), updatedAt: now() });
        }
        tx.objectStore('journal').put({ ...journal, state: 'committed', committedAt: now(), assetIds: imports.map(item => item.asset.id), missingContentIds: saved.files.filter(file => !saved.contents.has(file.id)).map(file => file.id) });
      });
    }
    const ready = (async () => {
      if (!factory || !crypto?.subtle) throw error('STORAGE', 'This browser cannot open durable local storage. Keep your originals and try a supported secure browser.');
      const opening = factory.open(dbName, DB_VERSION);
      opening.onupgradeneeded = () => {
        const db = opening.result;
        for (const store of STORES) if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, store === 'records' ? { keyPath: ['type', 'id'] } : ['contents', 'versionContents'].includes(store) ? undefined : { keyPath: 'id' });
      };
      opening.onblocked = () => target?.dispatchEvent(new CustomEvent('hole:storage-status', { detail: { state: 'blocked', message: 'Close another older Hole tab to finish opening your work.' } }));
      database = await request(opening);
      database.onversionchange = () => { database.close(); closed = true; target?.dispatchEvent(new CustomEvent('hole:storage-status', { detail: { state: 'blocked', message: 'A newer Hole version is opening storage. Reload this tab before editing.' } })); };
      await migrateLegacy();
    })().catch(e => { throw serialError(e); });
    async function list(type) {
      await ready;
      if (type === 'assets' || type === 'versions') return transaction([type], 'readonly', tx => request(tx.objectStore(type).getAll()));
      requireType(type);
      return transaction(['records'], 'readonly', async tx => (await request(recordStore(tx).getAll())).filter(entry => entry.type === type).map(entry => entry.record));
    }
    async function get(type, id) {
      await ready;
      if (type === 'assets' || type === 'versions') return transaction([type], 'readonly', async tx => await request(tx.objectStore(type).get(id)) || null);
      requireType(type); return transaction(['records'], 'readonly', tx => readRecord(tx, type, id));
    }
    async function put(type, record, options = {}) {
      await ready; requireType(type);
      const saved = await transaction(['records'], 'readwrite', async tx => {
        const current = await readRecord(tx, type, record?.id), result = preparedRecord(type, record, current, options.expectedRevision);
        writeRecord(tx, type, result); return result;
      });
      emit({ type, id: saved.id, revision: saved.revision }); return saved;
    }
    async function deleteRecord(type, id, options = {}) {
      await ready; requireType(type);
      await transaction(['records'], 'readwrite', async tx => { const current = await readRecord(tx, type, id); if (!current) return; revision(current, options.expectedRevision); recordStore(tx).delete([type, id]); });
      emit({ type, id, deleted: true });
    }
    async function importAsset(input) {
      await ready; const content = await preparedContent(input.blob), result = makeAsset(input, content);
      await transaction(['assets', 'versions', 'versionContents', 'records', 'files', 'contents'], 'readwrite', async tx => { await verifyParents(tx, result.version); writeAsset(tx, result, content.blob); await projectLegacy(tx, result, content.blob); await addMembership(tx, result.asset); });
      emit({ type: 'assets', id: result.asset.id, revision: result.asset.revision }); return result;
    }
    async function readAsset(assetId, versionId) {
      await ready;
      return transaction(['assets', 'versions', 'versionContents'], 'readonly', async tx => {
        const asset = await request(tx.objectStore('assets').get(assetId)); if (!asset) throw error('NOT_FOUND', 'This asset is unavailable.');
        const version = await request(tx.objectStore('versions').get(versionId || asset.headVersionId));
        if (!version || version.assetId !== assetId) throw error('NOT_FOUND', 'That version does not belong to this asset.');
        const blob = await request(tx.objectStore('versionContents').get(version.id)); if (!(blob instanceof Blob)) throw error('MISSING_CONTENT', 'The saved file bytes are unavailable. Restore a private backup to recover them.');
        return { asset, version, blob };
      });
    }
    async function commitAsset(input) {
      await ready; const content = await preparedContent(input.blob);
      const result = await transaction(['assets', 'versions', 'versionContents', 'files', 'contents'], 'readwrite', async tx => { const result = nextVersion(await request(tx.objectStore('assets').get(input.assetId)), input, content); await verifyParents(tx, result.version); writeAsset(tx, result, content.blob, false); await projectLegacy(tx, result, content.blob); return result; });
      emit({ type: 'assets', id: result.asset.id, revision: result.asset.revision }); return result;
    }
    async function saveDraft(draft) {
      await ready;
      if (typeof draft?.text !== 'string' || new Blob([draft.text]).size > MAX_BLOB) throw error('INVALID', 'Draft text must fit within 150 MB.');
      const saved = await transaction(['records', 'assets', 'versions'], 'readwrite', async tx => {
        const asset = await request(tx.objectStore('assets').get(draft.assetId));
        const version = await request(tx.objectStore('versions').get(draft.baseVersionId));
        if (!asset || !version || version.assetId !== asset.id) throw error('NOT_FOUND', 'The draft source is unavailable.');
        const current = await readRecord(tx, 'drafts', draft.id), result = preparedRecord('drafts', draft, current, draft.revision);
        writeRecord(tx, 'drafts', result); return result;
      });
      emit({ type: 'drafts', id: saved.id, revision: saved.revision }); return saved;
    }
    async function commitDraft(draftId) {
      await ready;
      const draft = await get('drafts', draftId); if (!draft) throw error('NOT_FOUND', 'The saved draft is unavailable.');
      const original = await readAsset(draft.assetId, draft.baseVersionId);
      const blob = new Blob([draft.text], { type: original.version.mime }), content = await preparedContent(blob);
      const result = await transaction(['records', 'assets', 'versions', 'versionContents', 'files', 'contents'], 'readwrite', async tx => {
        const current = await readRecord(tx, 'drafts', draftId); revision(current, draft.revision);
        const result = nextVersion(await request(tx.objectStore('assets').get(draft.assetId)), { baseVersionId: draft.baseVersionId, operation: 'text-edit', parameters: {} }, content);
        writeAsset(tx, result, blob, false); await projectLegacy(tx, result, blob); recordStore(tx).delete(['drafts', draftId]); return result;
      });
      emit({ type: 'assets', id: result.asset.id, revision: result.asset.revision }); emit({ type: 'drafts', id: draftId, deleted: true }); return result;
    }
    async function branchAsset(assetId, versionId, options = {}) {
      const source = await readAsset(assetId, versionId);
      return importAsset({ name: options.name || source.asset.name + ' branch', kind: source.asset.kind, blob: source.blob, projectId: source.asset.projectId, spaceId: source.asset.spaceId, parentVersionIds: [source.version.id], operation: 'branch', provenance: { sourceAssetId: assetId, sourceVersionId: source.version.id } });
    }
    async function changeState(assetId, state) {
      await ready;
      const asset = await transaction(['assets', 'files'], 'readwrite', async tx => {
        const asset = await request(tx.objectStore('assets').get(assetId)); if (!asset) throw error('NOT_FOUND', 'This asset is unavailable.');
        if (asset.state === state) return asset;
        const next = { ...asset, state, revision: asset.revision + 1, updatedAt: now() }; tx.objectStore('assets').put(next);
        const file = await request(tx.objectStore('files').get(assetId));
        if (file) tx.objectStore('files').put({ ...file, state, revision: (file.revision || 0) + 1, modifiedAt: next.updatedAt });
        return next;
      });
      emit({ type: 'assets', id: asset.id, revision: asset.revision }); return asset;
    }
    async function commitJobOutputs({ jobId, idempotencyKey, outputs }) {
      await ready;
      if (!validId(jobId) || !validId(idempotencyKey) || !Array.isArray(outputs) || !outputs.length || outputs.length > 100) throw error('INVALID', 'A job needs an identity and 1–100 real outputs.');
      if (new Set(outputs.filter(o => o.assetId).map(o => o.assetId)).size !== outputs.filter(o => o.assetId).length) throw error('INVALID', 'A job may advance each asset only once.');
      for (const output of outputs) if (output.expectedProjectRevision !== undefined && (!validId(output.projectId) || !Number.isSafeInteger(output.expectedProjectRevision) || output.expectedProjectRevision < 1)) throw error('INVALID', 'A destination guard requires a project and positive revision.');
      const prepared = await Promise.all(outputs.map(async output => ({ input: { ...output }, content: await preparedContent(output.blob) })));
      const fingerprint = canonical(prepared.map(({ input, content }) => ({ assetId: input.assetId, baseVersionId: input.baseVersionId, name: input.name, kind: input.kind, projectId: input.projectId, parentVersionIds: input.parentVersionIds, operation: input.operation, parameters: input.parameters, hash: content.hash, mime: content.mime })));
      const result = await transaction(['records', 'assets', 'versions', 'versionContents', 'journal', 'files', 'contents', 'jobs'], 'readwrite', async tx => {
        const key = 'job:' + idempotencyKey, prior = await request(tx.objectStore('journal').get(key));
        if (prior) {
          if (prior.result?.job?.id !== jobId || prior.fingerprint && prior.fingerprint !== fingerprint) throw error('CONFLICT', 'This action key already belongs to a different result.');
          return { ...prior.result, replayed: true };
        }
        const job = await readRecord(tx, 'jobs', jobId);
        if (!job) throw error('NOT_FOUND', 'The job is unavailable.');
        if (['cancelled', 'canceled'].includes(job.status)) throw error('CANCELLED', 'This job was cancelled before its outputs committed.');
        if (job.status === 'completed') throw error('CONFLICT', 'This job already completed with another result.');
        // Check every destination against the same pre-write snapshot. A batch may add several members.
        for (const { input } of prepared) if (input.expectedProjectRevision !== undefined) {
          const project = await readRecord(tx, 'projects', input.projectId);
          if (!project || project.revision !== input.expectedProjectRevision) throw error('CONFLICT', 'The destination project changed before output commit. Review it before retrying.');
          if (input.assetId && (await request(tx.objectStore('assets').get(input.assetId)))?.projectId !== input.projectId) throw error('CONFLICT', 'The output asset moved to another project. Its current placement is retained.');
        }
        const results = [];
        for (const { input, content } of prepared) {
          const result = input.assetId ? nextVersion(await request(tx.objectStore('assets').get(input.assetId)), { ...input, jobId }, content) : makeAsset({ ...input, provenance: { ...(input.provenance || {}), jobId } }, content);
          await verifyParents(tx, result.version); writeAsset(tx, result, content.blob, !input.assetId); await projectLegacy(tx, result, content.blob); await addMembership(tx, result.asset); results.push(result);
        }
        const completed = { ...job, status: 'completed', progress: 100, step: 'Saved locally', outputs: results.map(r => ({ assetId: r.asset.id, versionId: r.version.id })), idempotencyKey, revision: job.revision + 1, updatedAt: now(), error: '' };
        writeRecord(tx, 'jobs', completed);
        tx.objectStore('jobs').put({ ...completed, name: completed.name || completed.label || completed.actionId || 'Completed action', outputId: completed.outputs[0]?.assetId });
        const result = { job: completed, assets: results.map(r => r.asset), versions: results.map(r => r.version), outputs: results, replayed: false };
        tx.objectStore('journal').add({ id: key, state: 'committed', fingerprint, result, at: now() }); return result;
      });
      emit({ type: 'jobs', id: result.job.id, revision: result.job.revision });
      result.assets.forEach(asset => emit({ type: 'assets', id: asset.id, revision: asset.revision })); return result;
    }
    async function saveLegacyFile({ file, blob, job, createOnly = false, draftId, draftRevision }) {
      await ready;
      if (!validId(file?.id)) throw error('INVALID', 'A file needs a valid identity.');
      const content = blob ? await preparedContent(blob) : null;
      const result = await transaction(['files', 'contents', 'jobs', 'assets', 'versions', 'versionContents', 'records'], 'readwrite', async tx => {
        const currentFile = await request(tx.objectStore('files').get(file.id));
        if (createOnly && currentFile) throw error('CONFLICT', 'A file with that identity already exists.');
        if (createOnly && await request(tx.objectStore('contents').get(file.id)) !== undefined) throw error('CONFLICT', 'Stored file bytes already use that identity.');
        if (currentFile && (currentFile.revision || 0) !== (file.revision || 0)) throw error('CONFLICT', 'This file changed in another view. Reload it before saving.');
        const savedFile = { ...file, revision: (currentFile?.revision || 0) + 1 };
        const currentAsset = await request(tx.objectStore('assets').get(file.id));
        if (createOnly && currentAsset) throw error('CONFLICT', 'An asset with that identity already exists.');
        let asset;
        if (!currentAsset) {
          if (!content) throw error('MISSING_CONTENT', 'The new file is missing its bytes.');
          const created = makeAsset({ id: file.id, name: file.name, spaceId: file.space, operation: file.operation || 'import', provenance: { ...(file.provenance || {}), legacy: { parentId: file.parentId || null, rootId: file.rootId || file.id } } }, content);
          writeAsset(tx, created, content.blob); asset = created.asset;
        } else {
          if (content) {
            const head = await request(tx.objectStore('versions').get(currentAsset.headVersionId));
            if (!head || head.hash !== content.hash || head.mime !== content.mime) throw error('CONFLICT', 'Use a new immutable version to change an existing file.');
          }
          asset = { ...currentAsset, name: name(file.name), revision: currentAsset.revision + 1, updatedAt: now(), state: file.state === 'trashed' ? 'trashed' : 'active' };
          tx.objectStore('assets').put(asset);
        }
        tx.objectStore('files').put(savedFile);
        if (blob) tx.objectStore('contents').put(blob, file.id);
        if (job) {
          tx.objectStore('jobs').put(job);
          const prior = await readRecord(tx, 'jobs', job.id);
          writeRecord(tx, 'jobs', { ...job, revision: (prior?.revision || 0) + 1, legacy: true });
        }
        if (draftId) {
          const draft = await readRecord(tx, 'settings', draftId); revision(draft, draftRevision);
          recordStore(tx).delete(['settings', draftId]);
        }
        return { file: savedFile, asset, job };
      });
      emit({ type: 'assets', id: result.asset.id, revision: result.asset.revision });
      if (job) emit({ type: 'jobs', id: job.id }); return result;
    }
    async function exportBackup() {
      await ready;
      const snapshot = await transaction(STORES.filter(s => s !== 'backupStage'), 'readonly', async tx => {
        const entries = await Promise.all(STORES.filter(s => s !== 'backupStage').map(async store => [store, await request(tx.objectStore(store).getAll()), ['contents', 'versionContents'].includes(store) ? await request(tx.objectStore(store).getAllKeys()) : null]));
        return Object.fromEntries(entries.map(([store, values, keys]) => [store, keys ? values.map((blob, i) => ({ id: keys[i], blob })) : values]));
      });
      const blobs = [];
      for (const store of ['contents', 'versionContents']) for (const item of snapshot[store]) {
        if (!(item.blob instanceof Blob)) throw error('MISSING_CONTENT', 'The library contains an unreadable file. Export stopped without changing it.');
        blobs.push({ store, id: item.id, mime: item.blob.type, size: item.blob.size, hash: await hash(item.blob), data: base64(new Uint8Array(await item.blob.arrayBuffer())) });
      }
      delete snapshot.contents; delete snapshot.versionContents;
      const payload = { format: 'hole-private-backup', schemaVersion: SCHEMA, exportedAt: now(), snapshot, blobs };
      const content = canonical(payload), integrity = await hash(new Blob([content]));
      return new Blob([JSON.stringify({ ...payload, integrity: { algorithm: 'SHA-256', hash: integrity } })], { type: 'application/json' });
    }
    async function inspectBackup(blob) {
      if (!(blob instanceof Blob) || blob.size > MAX_BACKUP) throw error('BACKUP_INVALID', 'Choose a Hole private backup at or below 600 MB.');
      let archive; try { archive = JSON.parse(await blob.text()); } catch { throw error('BACKUP_INVALID', 'The backup is incomplete or is not valid JSON.'); }
      if (!isObject(archive) || archive.format !== 'hole-private-backup' || archive.schemaVersion !== SCHEMA || archive.integrity?.algorithm !== 'SHA-256') throw error('BACKUP_INVALID', 'This is not a supported Hole private backup. Setup files do not contain a full backup.');
      const { integrity, ...payload } = archive;
      if (await hash(new Blob([canonical(payload)])) !== integrity.hash) throw error('BACKUP_INVALID', 'Backup integrity check failed. The existing library is unchanged.');
      const allowed = STORES.filter(s => !['contents', 'versionContents', 'backupStage'].includes(s));
      if (!isObject(archive.snapshot) || Object.keys(archive.snapshot).some(key => !allowed.includes(key)) || allowed.some(key => !Array.isArray(archive.snapshot[key])) || !Array.isArray(archive.blobs)) throw error('BACKUP_INVALID', 'The backup manifest is incomplete.');
      let count = 0, bytes = 0;
      for (const store of allowed) {
        const seen = new Set();
        for (const item of archive.snapshot[store]) {
          if (!isObject(item) || !validId(item.id)) throw error('BACKUP_INVALID', 'A backup record has an invalid identity.');
          const key = store === 'records' ? item.type + ':' + item.id : item.id;
          if (seen.has(key)) throw error('BACKUP_INVALID', 'The backup contains duplicate identities.'); seen.add(key);
          if (store === 'records' && (!TYPES.has(item.type) || !isObject(item.record) || item.record.id !== item.id || !Number.isInteger(item.record.revision) || item.record.revision < 1)) throw error('BACKUP_INVALID', 'A backup metadata record is invalid.');
          if (++count > MAX_RECORDS) throw error('BACKUP_INVALID', 'This backup exceeds the record limit.');
        }
      }
      const decoded = [], keys = new Set();
      for (const item of archive.blobs) {
        if (!isObject(item) || !['contents', 'versionContents'].includes(item.store) || !validId(item.id) || typeof item.mime !== 'string' || !Number.isInteger(item.size) || item.size < 0 || item.size > MAX_BLOB || typeof item.hash !== 'string' || typeof item.data !== 'string' || item.data.length > Math.ceil(MAX_BLOB / 3) * 4) throw error('BACKUP_INVALID', 'A backup file entry is invalid.');
        const key = item.store + ':' + item.id;
        if (keys.has(key)) throw error('BACKUP_INVALID', 'The backup contains duplicate file bytes.'); keys.add(key);
        bytes += item.size; if (bytes > MAX_BACKUP) throw error('BACKUP_INVALID', 'The expanded backup is too large.');
        const restored = new Blob([unbase64(item.data)], { type: item.mime });
        if (restored.size !== item.size || await hash(restored) !== item.hash) throw error('BACKUP_INVALID', 'A file failed its integrity check.');
        decoded.push({ store: item.store, id: item.id, blob: restored });
      }
      const assets = new Map(archive.snapshot.assets.map(a => [a.id, a])), versions = new Map(archive.snapshot.versions.map(v => [v.id, v]));
      for (const asset of assets.values()) if (!Number.isInteger(asset.revision) || asset.revision < 1 || !['active', 'trashed'].includes(asset.state) || !versions.has(asset.headVersionId) || versions.get(asset.headVersionId).assetId !== asset.id) throw error('BACKUP_INVALID', 'An asset has an invalid current version.');
      for (const version of versions.values()) {
        const content = archive.blobs.find(b => b.store === 'versionContents' && b.id === version.id);
        if (!assets.has(version.assetId) || !Array.isArray(version.parentVersionIds) || version.parentVersionIds.some(id => !versions.has(id)) || !content || content.hash !== version.hash || content.size !== version.size || content.mime !== version.mime) throw error('BACKUP_INVALID', 'A file version has missing content or lineage.');
      }
      for (const file of archive.snapshot.files) if (!keys.has('contents:' + file.id)) throw error('BACKUP_INVALID', 'A legacy file is missing its bytes.');
      const metadata = new Map(archive.snapshot.records.map(entry => [entry.type + ':' + entry.id, entry.record]));
      for (const { type, record } of archive.snapshot.records) {
        if (type === 'drafts' && (!versions.has(record.baseVersionId) || versions.get(record.baseVersionId).assetId !== record.assetId || typeof record.text !== 'string')) throw error('BACKUP_INVALID', 'A draft has a missing source.');
        if (type === 'projects' && (record.assetIds || []).some(id => !assets.has(id))) throw error('BACKUP_INVALID', 'A project references a missing asset.');
        if (type === 'placements' && ((record.resourceType === 'asset' && !assets.has(record.resourceId)) || (record.resourceType === 'project' && !metadata.has('projects:' + record.resourceId)) || (record.policy === 'pinned' && (!versions.has(record.versionId) || versions.get(record.versionId).assetId !== record.resourceId)))) throw error('BACKUP_INVALID', 'A placement has a missing resource.');
      }
      return { archive, decoded, report: { valid: true, schemaVersion: SCHEMA, assets: assets.size, versions: versions.size, drafts: archive.snapshot.records.filter(e => e.type === 'drafts').length, records: count, bytes } };
    }
    function bootstrapWorkspace(value) {
      if (!isObject(value) || Object.keys(value).some(key => !['modelContent', 'privateContent'].includes(key))) return false;
      const state = value.privateContent;
      if (!isObject(state) || state.note !== 'A computer that moves with you.\n\nAn idea becomes a note.\nA note becomes a project.\nYour whole world stays close.') return false;
      if (Object.keys(state).some(key => !['layout', 'note', 'playing', 'recentApps', 'views', 'projects', 'pins', 'appPins', 'clusters', 'clusterOpen', 'session', 'desk'].includes(key))) return false;
      if (state.layout !== undefined && !['desktop', 'pocket'].includes(state.layout) || state.playing !== undefined && typeof state.playing !== 'boolean' || state.recentApps !== undefined && (!Array.isArray(state.recentApps) || state.recentApps.some(app => typeof app !== 'string'))) return false;
      for (const key of ['projects', 'pins', 'appPins', 'clusters', 'session']) if (state[key] !== undefined && (!Array.isArray(state[key]) || state[key].length)) return false;
      if (state.clusterOpen) return false;
      const sampleIds = new Set(['thought', 'color', 'headspace', 'files', 'palette', 'project', 'canvas', 'calendar', 'memories', 'books']);
      if (state.desk && (!isObject(state.desk) || Object.keys(state.desk).some(key => !['view', 'panX', 'panY', 'files', 'placements'].includes(key)))) return false;
      for (const key of ['files', 'placements']) if (state.desk?.[key] && (!isObject(state.desk[key]) || Object.keys(state.desk[key]).some(id => !sampleIds.has(id)))) return false;
      for (const point of Object.values(state.desk?.files || {})) if (!isObject(point) || Object.keys(point).some(key => !['x', 'y', 'space'].includes(key)) || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !['desk', 'studio', 'life'].includes(point.space)) return false;
      for (const point of Object.values(state.desk?.placements || {})) if (!isObject(point) || Object.keys(point).some(key => !['x', 'y'].includes(key)) || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
      if (state.views && (!isObject(state.views) || Object.keys(state.views).some(key => !['desk', 'studio', 'life', 'overview', 'drawer'].includes(key)))) return false;
      for (const view of Object.values(state.views || {})) if (!isObject(view) || Object.keys(view).some(key => !['x', 'y', 'z'].includes(key)) || ![view.x, view.y, view.z].every(Number.isFinite)) return false;
      return !value.modelContent || isObject(value.modelContent) && Object.keys(value.modelContent).every(key => ['concept', 'layout', 'space'].includes(key));
    }
    async function planRestore(tx, inspected) {
      const records = await request(recordStore(tx).getAll());
      const counts = await Promise.all(['assets', 'versions', 'versionContents', 'files', 'contents', 'jobs'].map(store => request(tx.objectStore(store).count())));
      const localJournal = await request(tx.objectStore('journal').getAll());
      const bootstrapEligible = counts.every(count => count === 0) && records.every(item => item.type === 'settings' && ['navigation', 'legacy-workspace', 'relay:device', 'relay:endpoint'].includes(item.id) && (item.id !== 'legacy-workspace' || bootstrapWorkspace(item.record.value))) && localJournal.every(item => item.id.startsWith('restore:') || item.id === 'migration:legacy-v1' && !(item.rawFiles?.length || item.rawJobs?.length || item.assetIds?.length || item.missingContentIds?.length) && (!item.rawWorkspace || (() => { try { return bootstrapWorkspace(JSON.parse(item.rawWorkspace)); } catch { return false; } })()));
      const report = { bootstrapEligible, requiresBootstrapApproval: false, retainedSettings: [], omittedSettings: [], bootstrapSettings: [], conflicts: [] };
      const skip = new Set(), replacements = new Map(), archiveRecords = [], localRecords = [];
      const keyFor = (store, item) => store + ':' + (store === 'records' ? item.type + ':' : '') + item.id;
      for (const [store, incoming] of Object.entries(inspected.archive.snapshot)) for (const item of incoming) {
        const key = store === 'records' ? [item.type, item.id] : item.id, current = await request(tx.objectStore(store).get(key)), identity = keyFor(store, item);
        const same = current && canonical(current) === canonical(item);
        if (store === 'journal' && current) {
          if (!same && item.id !== 'migration:legacy-v1') report.conflicts.push({ store, id: item.id });
          else { skip.add(identity); if (!same) archiveRecords.push({ store, value: item }); }
          continue;
        }
        if (store === 'records' && item.type === 'settings') {
          // A restored profile gets its own Relay identity. Never clone a source device ID.
          if (item.id === 'relay:device') { skip.add(identity); archiveRecords.push({ store, value: item }); (current ? report.retainedSettings : report.omittedSettings).push(item.id); continue; }
          if (current && ['navigation', 'relay:endpoint'].includes(item.id)) { skip.add(identity); report.retainedSettings.push(item.id); if (!same) archiveRecords.push({ store, value: item }); continue; }
          if (current && item.id === 'legacy-workspace' && !same) {
            if (canonical(current.record.value) === canonical(item.record.value)) { skip.add(identity); report.retainedSettings.push(item.id); continue; }
            if (bootstrapEligible) {
              report.requiresBootstrapApproval = true; report.bootstrapSettings.push(item.id); localRecords.push({ store, value: current });
              replacements.set(identity, { ...item, record: { ...item.record, revision: Math.max(current.record.revision, item.record.revision) + 1, updatedAt: now() } }); continue;
            }
          }
        }
        if (current && !same) report.conflicts.push({ store, id: store === 'records' ? item.type + '/' + item.id : item.id });
      }
      return { report, skip, replacements, archiveRecords, localRecords, keyFor };
    }
    async function validateBackup(blob) {
      await ready; const inspected = await inspectBackup(blob), plan = await transaction(STORES.filter(store => store !== 'backupStage'), 'readonly', tx => planRestore(tx, inspected));
      return { ...inspected.report, restorePlan: plan.report };
    }
    async function restoreBackup(blob, options = {}) {
      await ready;
      const inspected = await inspectBackup(blob), stageId = uid();
      await transaction(['backupStage'], 'readwrite', tx => tx.objectStore('backupStage').add({ id: stageId, state: 'validated', archive: inspected.archive, createdAt: now() }));
      try {
        const result = await transaction(STORES, 'readwrite', async tx => {
          const plan = await planRestore(tx, inspected);
          if (plan.report.conflicts.length) { const first = plan.report.conflicts[0]; throw error('RESTORE_CONFLICT', 'The backup conflicts with local ' + first.store + '/' + first.id + '. Your current work is unchanged. Use a separate profile with no personal work to keep both copies.'); }
          if (plan.report.requiresBootstrapApproval && options.replaceBootstrapSettings !== true) throw error('RESTORE_REVIEW_REQUIRED', 'This profile contains only its initial desktop settings. Review and approve replacing those settings with the backup before restoring.');
          for (const [store, incoming] of Object.entries(inspected.archive.snapshot)) for (const item of incoming) {
            const identity = plan.keyFor(store, item); if (plan.skip.has(identity)) continue;
            tx.objectStore(store).put(plan.replacements.get(identity) || item);
          }
          for (const item of inspected.decoded) tx.objectStore(item.store).put(item.blob, item.id);
          tx.objectStore('backupStage').delete(stageId);
          tx.objectStore('journal').put({ id: 'restore:' + stageId, state: 'committed', at: now(), integrity: inspected.archive.integrity.hash, review: plan.report, preservedArchiveRecords: plan.archiveRecords, replacedBootstrapRecords: plan.localRecords });
          return plan.report;
        });
        inspected.report.restorePlan = result;
      } catch (e) {
        try { await transaction(['backupStage'], 'readwrite', tx => tx.objectStore('backupStage').delete(stageId)); } catch { /* An incomplete stage cannot affect the active stores. */ }
        throw e;
      }
      emit({ type: 'restore', id: stageId }); return { ...inspected.report, restored: true };
    }
    function close() { closed = true; database?.close(); channel?.close(); }
    return Object.freeze({ schemaVersion: SCHEMA, ready, list, get, put, deleteRecord, importAsset, readAsset, commitAsset, saveDraft, commitDraft, branchAsset, trashAsset: id => changeState(id, 'trashed'), restoreAsset: id => changeState(id, 'active'), exportBackup, validateBackup, restoreBackup, commitJobOutputs, saveLegacyFile, close });
  }
  globalThis.HoleCoreFactory = Object.freeze({ create: createCore, DB_NAME, DB_VERSION });
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.HoleCore = createCore();
    window.HoleCore.ready.catch(e => window.dispatchEvent(new CustomEvent('hole:storage-status', { detail: { state: 'failed', code: e.code, message: e.message } })));
  }
})();
