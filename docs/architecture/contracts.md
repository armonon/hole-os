# Hole services v1

Base: `7d98b7251718b5615196bad2c793554f8573b6b1`. Keep the existing plain JS stack and legacy formats. The supplied master brief is authoritative; recent decisions keep Day, Capture, and Paperwork as everyday surfaces, with Create/Forge, Actions/Flow, and History/Time available across the OS. Paper is the document engine inside Paperwork. No feature is complete merely because it has a tile.

## Durable service: `window.HoleCore`

`ready: Promise<void>` resolves after opening storage and additive, recoverable legacy import. All mutators acknowledge only transaction completion; conflict/error throws carry `code` and a readable message. Events: `hole:core-change` on window with `{type,id,revision}` after commit.

- `list(type): Promise<Record[]>`, `get(type,id): Promise<Record|null>`.
- `put(type,record,{expectedRevision}={}): Promise<Record>`; adds with revision 1, updates require current expectedRevision. Record includes id, revision, createdAt, updatedAt. Types: spaces, projects, placements, scenes, drafts, snapshots, jobs, recipes, runs, carry, events, tasks, contacts, links, instruments, packages, memory, settings. Asset/version writes use dedicated methods.
- `deleteRecord(type,id,{expectedRevision}={})`: metadata deletion with revision check; never use for asset purge.
- `importAsset({name,blob,kind,projectId,spaceId,provenance}): Promise<{asset,version}>`.
- `readAsset(assetId,versionId?): Promise<{asset,version,blob}>`.
- `commitAsset({assetId,baseVersionId,blob,operation,parameters,jobId}): Promise<{asset,version}>`; refuses stale base, immutable version, updates stable asset head atomically.
- `saveDraft({id,assetId,baseVersionId,text,selection,scroll,revision,...}): Promise<Draft>`; revision checked; durable independently of checkpoint. UI must retain unsaved text on rejection.
- `commitDraft(draftId): Promise<{asset,version}>`; transaction commits content and removes only acknowledged draft.
- `branchAsset(assetId,versionId,{name}={}): Promise<{asset,version}>`.
- `trashAsset(assetId)`, `restoreAsset(assetId)`; no automatic irreversible purge.
- `exportBackup(): Promise<Blob>`, `validateBackup(blob): Promise<Report>`, `restoreBackup(blob): Promise<Report>`; versioned integrity checked private backup, no secrets, staged atomic import and no silent overwrite of unrelated work.
- `commitJobOutputs({jobId,idempotencyKey,outputs}): Promise<Result>`; outputs `{name,blob,kind,projectId,parentVersionIds,operation,parameters,provenance}`; commits outputs plus successful job exactly once. Derived outputs must explicitly name their selected immutable source versions in `parentVersionIds`; job inputs and provenance do not implicitly populate the version graph. Reusing an idempotency key requires identical output bytes and semantic metadata.

Asset: `{id,name,kind,mime,headVersionId,revision,state:'active'|'trashed',createdAt,updatedAt,provenance?}`. Version: `{id,assetId,parentVersionIds,mime,size,hash,operation,parameters,createdAt,provenance?}` with associated immutable Blob. Project: `{id,name,spaceId,assetIds,kit:{colors,fonts,logoAssetId?},revision,...}`. Placement: `{id,sceneId,resourceId,resourceType:'asset'|'project',policy:'latest'|'pinned',versionId?,x,y,depth,rotation,scale,...}`. Camera zoom and spatial depth are separate fields. Draft: `{id,assetId,baseVersionId,text,selection:{start,end},scroll,revision,...}`. Navigation persists in settings `navigation`, containing scope, spaceId, projectId, assetId, placementId, presentation and return path; editor and history state are explicit.

Implementers may add compatible APIs; coordinate breaking changes. Core owner decides storage mechanics and exports injection/model helpers for meaningful Node tests. Do not invent durable success in an in-memory production fallback.

## Actions: `window.HoleActions`

`list()`, `get(id)`, `run(id,{inputs:[{assetId,versionId}],parameters,projectId,idempotencyKey})`, `cancel(jobId)`. Versioned typed verbs use immutable inputs, explicit output policy, abort/progress and actual outputs via Core. `releasePack({assetId,versionId,projectId,focalPoint,allowUpscale,format})` produces 3000x3000,1080x1920,1200x630 images plus valid ZIP/manifest; no silent stretching. No unverified engine in the available registry.

## Runtime/bridge: `window.HoleRuntime`, `window.HoleBridge`

Stable app instance identities, serialization and grant-scoped requests. Exact origin/source/session nonce/request/schema checks; per-resource and operation grants; revocation and idempotency. Connected external launch is distinct from manual handoff. Standalone bridge SDK may be supplied to owned studios after inspecting their source. Generated tools use sandbox isolation, never same-origin ambient privileges.

## Ownership

Lead owns shell, build wiring, `continuity.js/.css`, contracts and integration. Continuity worker owns `core.js`, storage models/tests and existing persistence/file/text storage fixes. Actions worker owns `actions.js`, codecs/ZIP helper/tests. Runtime worker owns runtime/bridge modules, SDK/tests and integration inventory. No worker edits shell or another worker's module without agreement.
