# Explicit studio expiry renewal

This increment renews only the expiry of an existing live studio connection. It does not reconnect, create a grant, expand resources/operations, replace a nonce, clear receipts, advance a resource head, or reset the 256-request cap. No timer or child request automatically invokes renewal.

## Host and SDK protocol

The host calls `broker.renewExpiry(sessionId,{ttlMs})` after an explicit user action. TTL defaults to one hour and is restricted to one second through one hour. The call returns a Promise of the existing session descriptor. Missing, revoked, unready, known-closed window and disconnected/replaced sandbox sources are refused. One renewal offer can be pending per session.

The host sends an offer over the existing exact window/origin or MessagePort. Its payload repeats the original grant identity and exact initial resource/version/operation scope, plus a fresh bounded offer ID and proposed expiry. SDK checks the existing session/nonce/source, grant/instance/project, unchanged scope and bounded expiry; it acknowledges over the same transport. The host accepts that acknowledgement only for its current explicit offer, rechecks lifecycle, extends expiry, and sends confirmation. SDK updates its grant expiry only after the matching confirmation. An unresponsive/disposed client times out after five seconds with host expiry unchanged. Revocation rejects a pending renewal and stays terminal. No new handshake or independent grant is created.

`broker.accessInfo(sessionId)` returns only `{instanceId,projectId,status,expiresAt,requestCount,requestLimit,operations,resources}`. Each resource contains the initial `versionId`, exact `versionIds` already admitted through that session, and its operations. It excludes nonce, grant ID, session ID and receipt bodies. Form's adapter handle exposes `accessInfo()` and `renewAccess()` (fixed one hour) for the root-owned runtime review UI.

## Receipt safety

A native commit may finish durably just as expiry suppresses its acknowledgement. The original receipt remains in the same request map, and an exact retry after renewal replays that result without another commit. Previously admitted output versions remain granted; no latest-head lookup or unrelated asset is introduced.

There is one narrowly eligible retry of a failed request: cached `GRANT_EXPIRED` whose execution completed **before irreversible resource/output work began**, with an explicit increased expiry, identical request ID and identical fingerprint. It reuses the entry and count, retains its previous expired outcome, and re-executes under the renewed checks. Derive may already have created an Activity job: its exact receipt/metadata/revision is retained, compared against current Core, then resumed with atomic expectedRevision. Any concurrent edit or cancellation refuses without overwriting that job. Concurrent retries share that execution. Any request marked committing, successful receipt, generic error or different fingerprint is ineligible. The cap is never cleared or increased.

## Evidence

`node --test tests/bridge-renewal.test.mjs tests/runtime-bridge.test.mjs` passed 28 tests at `/tmp/bridge-renewal-tests.log`: exact-scope renewal and receipt replay, request 257 denial, invalid TTL/scope, missing/revoked/closed/unready sessions, wrong source/nonce/grant acknowledgements, five-second nonresponsive-client deadline, SDK denial defaults, proven-prestorage expiry/concurrent retries and no replay of committing failures.

`node scripts/verify-bridge-renewal-browser.mjs` passed against the actual shell with only bridge/client/Form sources overridden (`/tmp/bridge-renewal-source.log`). A real two-second grant expires while actual Core has committed native Form bytes; explicit host-button renewal followed by exact save retry yields one version. A separate expired editor retains dirty raw fields and refuses close until deliberate renewal permits recovery/save. Exact scopes/counts remain unchanged, request 257 remains denied even after renewal, revoked access cannot renew, and page errors are empty. This first qualifier uses a test host button. Root also qualified its actual runtime Review resource access → expired scope → explicit one-hour renewal → exact raw-field save → normal close path (`/tmp/hole-access-ui-source.log`); final generated-build verification remains pending.

The earlier read-only assessment `/tmp/bridge-lifetime-assessment.log` reproduced the original missing renewal path and demonstrated why creating a new session cannot safely substitute for receipt replay.

## Remaining limit

An exhausted 256-request session still refuses new checkpoints. Renewal is deliberately not request-budget rollover. Safe rollover needs a separate bounded unresolved-write/receipt acknowledgement design. Expiry renewal also does not revive a deliberately disposed editor or replace an unavailable original frame. No physical device, external popup/COOP deployment matrix or long-duration wall-clock soak is claimed by the two-second browser test.

Independent Relay found an initial derive-job resumption conflict after expiry; the fix retains and revision-checks the exact owned Activity job. Actual Core tests now cover success, concurrent double retry, prior external cancellation, and a mutation between job read and update. The independent Chrome reproduction now yields one derived output and completed job (`/tmp/bridge-derive-renewal-fixed.log`).

Independent Relay security review cleared the repaired derive path after rerunning all 28 tests and the actual Chrome/Core reproduction (`/tmp/relay-independent-derive-fixed.log`). The review checked full retained receipt equality, atomic expectedRevision, transactional cancellation checks, unchanged counts/scopes and refusal to rerun successful or committing work.

Final generated bridge and actual Form access-dialog checks pass without source overrides: `/tmp/hole-wave16-bridge-final.log`, `/tmp/hole-wave16-access-final.log`. Relay independently cleared actual-Core derive reconciliation and 28 targeted tests (`/tmp/relay-independent-derive-fixed.log`, `/tmp/relay-independent-renewal-fixed-units.log`).
