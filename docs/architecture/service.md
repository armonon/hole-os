# Local account, sharing and Relay service

This service is a working local backend, not a production account deployment. It is separate from Netlify's static `public/` output. No production credentials, upstream NOW/Circle API, provider password, email sender, or remote computer is invented.

## Run and connect

```sh
node server/start.mjs
```

Default origin: `http://127.0.0.1:8787`. Default private data directory: `~/.local/share/hole-os-services`, outside this repository. `HOLE_DATA_DIR` accepts an absolute dedicated directory, `HOLE_SERVICE_PORT` changes the local port, and `HOLE_ALLOWED_ORIGINS` is a comma-separated list of exact permitted browser origins. The launcher deliberately binds loopback only. Defaults allow `http://127.0.0.1:5173` and `http://localhost:5173`; they do not grant the production website access to local personal data automatically.

`src/relay.js` provides `HoleRelay.render(ctx)` using the shared continuity UI context. Load it before continuity and route the Shared spaces view to it. The shell's `connect-src` must explicitly allow the configured local endpoint; do not use `*`. Browser local-network permissions/mixed-content behavior may still require a supported local development origin. The UI asks the user to enter/connect the service address, create or sign into a real account, select/create a remote project, queue local project file uploads, send queued changes, restore authorized file versions into a new local project, create/accept scoped invitations, revoke members, and send a deliberate 45-second presence heartbeat. Recovery codes are displayed privately once with a mobile-closeable dialog. Tokens are never Core settings or export data.

The pure client factory is `HoleRelayModel.createClient({endpoint,deviceId,fetch,loadQueue,saveQueue})`. Injected queue storage must be durable. The production UI uses revision-checked Core `runs` records. Pending changes remain local on network failure; committed receipts persist; conflicting payloads remain intact for review. A restarted client can reopen the queue. Account identity binds each queued change; changing accounts cannot upload another account's queued work. Authentication tokens live in memory and/or HttpOnly cookies, not the queue.

## Data and persistence

`server/store.mjs` uses a private directory, exclusive process lock, 0600 state/temporary files, whole-state copy-on-write transactions, file fsync, atomic same-directory rename and directory fsync. ACK follows that sequence. An ambiguous fsync failure retains the renamed state in memory; repeat the same change ID to reconcile instead of generating another write. Only one service process can own a data directory. Corrupt/unsupported storage fails closed and is preserved. A stale lock is not automatically removed; verify that no service is running before administrative recovery.

This is deliberately a bounded single-process development store: 16 MiB per uploaded file, 24 MiB HTTP body, 64 KiB record value, 100 queued changes per batch, 50,000 committed sync journal entries, 192 MiB total serialized store. Limits reject writes without silently dropping data. Administrative archival, distributed writes, object storage, quotas per tenant, and service backups are production work. Back up the stopped service's private directory as sensitive server data; it contains password hashes and file bytes. Hole's browser backup is a separate artifact.

Accounts use salted scrypt password hashes and random 256-bit session/recovery/invitation/guest tokens. Only token hashes are stored. Session cookies are HttpOnly and SameSite=Strict; a TLS deployment must pass `secureCookies:true`. Sessions expire after eight hours by default. Sign-out deletes the active session. One-time recovery codes replace the password, rotate the code and revoke all sessions. There is **no email delivery or verified-email claim**; losing both password and recovery code cannot be repaired through a simulated recovery flow. Owners can bind invitations to an existing account ID rather than treating an unverified email address as proof of identity. Bearer tokens are supported for explicit API clients. Authentication endpoints have a bounded per-IP/account attempt window.

All browser state-changing requests require an allowed exact Origin, when supplied, plus `X-Hole-Client: 1`. CORS never reflects arbitrary origins. Cookies/tokens are not logged. Responses and private/public byte endpoints use `Cache-Control: no-store`; file bytes are attachments with `nosniff` and a restrictive content CSP. This service does not claim storage encryption or E2EE: the server operator can read stored content. It is not the Vault.

## HTTP contract

All bodies are JSON. Non-GET requests need `X-Hole-Client: 1`. Authenticated clients use an HttpOnly session cookie or `Authorization: Bearer <sessionToken>`.

| Endpoint | Behavior |
| --- | --- |
| `GET /health` | Public service version and honest unconnected NOW/Circle capabilities. No user context. |
| `POST /accounts` | `{name,email,password}` → user/session and one-time recovery code. |
| `POST /sessions` | `{email,password}` → real session. |
| `GET /session`, `DELETE /session` | Inspect current account / sign out current session. |
| `POST /recovery` | `{email,recoveryCode,password}` → replacement code; revoke all sessions. |
| `GET /projects`, `POST /projects` | List permitted projects / create a private project with `{name}`. |
| `GET /projects/:id/publications` | Owner-only publication management manifests, status and expiry; no guest tokens or hashes. |
| `GET /projects/:id` | Permitted project summary, member names/roles, revision. |
| `GET /sync?projectId=:id` | Authorized snapshot, explicit version manifests, visible records and project cursor. Bytes are separate. |
| `POST /sync` | `{projectId,deviceId,changes:[{id,type,data}]}` → committed/conflict/failed receipts. |
| `GET /assets/:id/versions/:versionId` | Authorized immutable bytes; names/IDs do not confer access. |
| `POST /projects/:id/invitations` | Owner: `{role:'viewer'|'editor',recipientId?,resources,ttlMs?,expectedRevision}` → one-time invitation token. |
| `POST /invitations/:token/accept` | Authenticated explicit acceptance; exact optional recipient, expiry and one-use checks. |
| `DELETE /projects/:id/invitations/:invitationId` | Revoke an unused invitation. Revoke accepted access through membership. |
| `PATCH /projects/:id/members/:userId` | Owner: revision-checked `{role?,resources?,revoke?,expectedRevision}`. |
| `DELETE /projects/:id/membership` | Leave a project; owners must transfer ownership first. |
| `POST /projects/:id/ownership` | Owner transfers to an existing member with `{userId,expectedRevision}`. |
| `POST /projects/:id/approvals` | Owner replaces approved version sets with `{resources,expectedRevision}`. |
| `POST /projects/:id/guests` | Owner creates an expiring pinned guest selection. |
| `GET /guest/:token` | Anonymous read-only manifest of that selection; bytes at `/guest/:token/assets/:assetId/versions/:versionId`. |
| `POST /projects/:id/worlds` | Owner explicitly publishes `{name,resources,expectedRevision}` into a pinned public manifest. |
| `GET /worlds`, `GET /worlds/:id` | Active public discovery and selected manifest only; bytes under the same World path. |
| `DELETE /projects/:id/guests/:guestId`, `DELETE /projects/:id/worlds/:worldId` | Revoke guest publication / unpublish World and remove it from discovery. |
| `POST /projects/:id/presence` | `{deviceId,cursor?:{x,y}}` creates an actual 45-second heartbeat. |
| `GET /projects/:id/presence` | Currently authorized, unexpired heartbeat participants; no invented online people. |

`resources` is `[{assetId,versionIds:[...],followApproved?:boolean}]`. Invitation/member scopes may deliberately follow explicitly approved future versions. Guest links and Worlds accept **pinned versions only**. New heads, private branches and unselected dependencies do not enter a publication. Public manifest names are snapped at publication; later changes do not silently rewrite the public selection. Guest/public manifests omit private project identity, member details, author identity, drafts, notes, unrelated assets and internal parent references. A private nested reference never grants access to its bytes.

Owner access covers the project. Editor/viewer membership is narrowed by explicit resource versions. An editor gains access to versions they create while authorized; an owner can remove that scope later. Revocation is checked server-side for metadata, byte reads, writes and presence. Already downloaded copies cannot be retracted. Invited editors can create new resources in the shared project; peers do not automatically receive those resources without an explicit grant/approval stream.

## Sync and conflict policy

Supported queued operations:

- `asset.create`: `{name,mime,bytes,operation?}`; bytes are base64.
- `asset.commit`: `{assetId,baseVersionId,mime,bytes,operation?}`; exact head/base match, immutable new version.
- `asset.metadata`: `{assetId,name,expectedRevision}`; authorized creator/owner rename with revision conflict checks.
- `asset.trash` / `asset.restore`: `{assetId,expectedRevision}`; recoverable metadata state.
- `record.put`: `{id,type,value,visibility?,references?,expectedRevision?}`. Types: note/task/event/scene/draft/preference/workspace/memory. New records omit expectedRevision; updates require it. References are explicit `{assetId,versionId}` and independently authorized.
- `record.delete`: `{id,expectedRevision}` creates a tombstone.

Records default to private. Drafts/preferences remain private; shared records are an explicit audience choice. Visible shared records filter inaccessible references. Known secret credential fields are refused rather than exported as settings. Users must still avoid deliberately putting secrets in ordinary prose.

The service serializes authorization and commit against the latest membership. It refuses stale record revisions, stale file bases, concurrent permission updates and idempotency-key reuse with changed content. Each change is applied to an isolated draft; failure cannot leave half an asset inside a successful batch. Successful changes are journaled by account/device/change ID. A repeated identical change returns its actual committed receipt. Failed/conflicting changes are retained by the client; there is no blanket last-writer overwrite. The UI now exposes local/current remote review, explicit keep-remote with local history retained, retry, reviewed record JSON replacement, reviewed deletion/recovery-state updates, and separate-file preservation for conflicting file bytes. Every replacement has a new operation ID and a checked reviewed revision; the original payload remains in the durable queue as resolved history. Permission failures remain reviewable and cannot bypass server authorization.

The initial Relay UI uploads current selected-project file heads and restores all **authorized** versions into a new local project, preserving remote IDs/lineage in provenance. It deliberately does not overwrite an existing local project. Omitted private ancestors remain omitted; imported local version chains are not a claim that remote private history was transferred. Full continuous bidirectional merge, ongoing workspace arrangement sync, automatic collaborative text editing, and provider-specific app state remain unfinished. Selected private adapters transfer allowlisted theme/reducedMotion/language/fontScale preferences, workspace name/description plus explicitly selected remote version references, and explicitly selected unexpired memory with provenance/retention, consent=explicit, and syncAllowed=true. Memory that is excluded, expired, or not explicitly allowed for sync is absent from the selection. Restored memory starts with syncAllowed=false. Current welcome appearance/quiet preferences are read through HoleWelcome.preferences and restored through the validated HoleWelcome.applyPreferences hook, alongside a Core settings copy. They exclude workspace windows/device layout and arbitrary settings. Restore applies a selected preference explicitly, or creates a new workspace/memory record retaining remote provenance; workspace remote file references require separate authorized byte restoration. Scene records support explicit reviewed layout conflicts but automatic arrangement synchronization remains unfinished. Accounts, byte transfer, invitations and presence are real now.

## Verification and release gates

`node --test tests/service.test.mjs` runs real HTTP server/client instances in isolated temporary data directories. Cases cover password/session/recovery lifecycle, private byte/metadata access, owner/editor/viewer behavior, pinned and approved-stream permissions, competing version/metadata writes, idempotent queue receipts, deliberate guest/public version selection, unpublish/revoke, concurrent role changes, actual heartbeat expiry, service restart, CSRF/origin checks, secret-record rejection, and two-client offline/reconnect conflicts.

Production remains blocked on an explicitly chosen server/storage deployment, verified TLS/cookie/origin configuration, identity/email verification and recovery policy, backup/restore operations, abuse monitoring/rate-limit persistence, load/penetration testing, and account/data lifecycle operations. Static Netlify deployment does not deploy this service. Upstream NOW/Circle capabilities require their real supported API/OAuth contracts and deployment parity evidence; this backend is not a substitute for either social product. No third-party messaging/posting is performed by these modules.

Offline OS shell delivery/version-coherent service-worker updates are owned by the shell package. A retained Relay queue does not prove offline cold-start behavior. Safari/Chromium local-network behavior, physical mobile access and full end-to-end UI checks remain required integration evidence beyond the HTTP tests.

## Browser adapter verification (26 October 2026)

`scripts/verify-relay-browser.mjs` starts isolated source hosting and a private disposable service. Set `HOLE_PLAYWRIGHT_MODULE` to an installed Playwright module path and optionally `HOLE_CHROME` to the browser executable. It creates two disposable persistent browser profiles, uses actual Core IndexedDB and browser fetch, switches one browser offline, closes/reopens its profile, preserves a conflicting edit, explicitly resolves it, and verifies the other profile pulls the merged text. Observed passing with installed headless Chrome 155.0.0.0. The same test mounts the real Relay renderer with continuity context helpers and clicks its review dialog/keep-remote resolution control. This does not qualify full shell navigation, physical devices, Safari, or production deployment. Fourteen service HTTP tests pass including selected-adapter privacy and text/layout/audience/metadata/deletion conflicts.

Client additions: `HoleRelayModel.selectedRecord(kind, record, {remoteId, expectedRevision, references, permitMemory})`; client `review(projectId, changeId)` returns local item and currently authorized remote record/asset, and `resolve(projectId, changeId, {decision:'keep-remote'|'retry'|'replace', replacement?})` durably records a deliberate choice. Network failures persist `lastError` while the item remains pending. The existing `HoleRelay.render(ctx)` mounts the controls without new shell imports.

## Sharing controls

Relay now exposes explicit audience review before creating a 24-hour guest token or publishing a pinned World. Guest tokens are shown once, never saved in Core, and can be entered for a real guest manifest/download preview. Public discovery lists only active public Worlds. Owner publication management survives reload through `GET /projects/:id/publications`, which returns IDs/status/manifests but no guest credentials. Revoke/unpublish remains available after the token display closes. A revoked token or unpublished World cannot fetch new bytes; downloaded copies remain outside service control.

Owners can inspect current explicit member version scopes, change role and selected scope, revoke access, or explicitly confirm transfer of ownership to an existing member. Nonowners can confirm leaving. Revision checks reject a concurrent permission/ownership change. Transfer gives the recipient project asset ownership while private records remain private to their creator.

The Chrome two-profile source test additionally uses actual mounted controls to create/review a guest selection and revoke it. Anonymous browser fetch verifies exact pinned bytes before and after a new private version; the private version is refused, and revocation returns 404 for the previously allowed bytes. No invitation/token was sent to anyone, and these tests publish only disposable local fixtures.

The two-profile Chrome test also clicks public publication, discovery, preview and unpublish controls, changes an existing member role/scope, confirms ownership transfer, and leaves as the former owner. It then verifies the successor is owner and the former owner can no longer pull the project. All passed against the disposable local service; production and physical-device qualifications remain separate.
