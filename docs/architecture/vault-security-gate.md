# Vault qualification gate

Status: **not qualified; no credential-vault runtime is enabled**. This decision follows the master brief's explicit security gate. The local account service, a hidden folder, a lock-screen animation, browser IndexedDB, and an encrypted-looking icon do not satisfy it. No password-manager parity, storage encryption, or E2EE claim is made.

## Threat model to approve before implementation

Target protection: confidentiality and tamper detection for a locked vault's stored/exported bytes when an attacker obtains a browser-profile copy, cloud object-store copy, or backup. A server that stores ciphertext must not receive plaintext secrets or unwrapped data keys. Scope includes metadata leakage, replay/rollback, cross-record substitution, corrupted backups, password changes, recovery, device loss, and concurrent writers.

Explicit limits: an attacker controlling the unlocked device, browser extension, OS account, or the code delivered to the vault can capture typed secrets or use active keys. A nonextractable browser key does not prevent malicious same-origin JavaScript from invoking decryption. A web-delivered client cannot honestly promise protection from a malicious update of that same client. Screen captures, copied plaintext and already shared/downloaded secrets cannot be recalled. Private browsing/storage eviction can remove local copies. User-facing claims must state these limits without implying that an ordinary app lock encrypts the OS.

The main Hole origin executes many tools and handles imported content. Vault must have a separately reviewed origin/application boundary, a minimal dependency surface, a restrictive CSP without arbitrary inline/generated code, no general-purpose app plugin execution, and narrowly brokered operations. It must never expose a general “decrypt any record” capability to the OS bridge, Crew, Flow or generated utilities. OS search must not index secret fields or locked titles by default.

## Proposed key lifecycle for independent review

Use an audited authenticated-encryption implementation and a versioned envelope. Generate an independent random data key; derive a wrapping key from the unlock secret with a reviewed, salted, memory-hard KDF. Select and benchmark KDF parameters against supported mobile/desktop hardware; record parameters in the versioned envelope and make future migration explicit. Password hashing for server login is a separate process and must not be reused as the vault key. Guidance: [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

Each encrypted record needs fresh non-reused nonces, authenticated record identity/schema/key version and correct length/use limits. A password change rewraps the data key after successful unlock; compromised data keys require real content re-encryption and retirement of old key material. Backups retain the required key envelope; key deletion must account for older backups. Specify multiple-device nonce/rotation rules before supporting synchronization. Guidance: [OWASP cryptographic storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html) and [key management](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet).

Keep unlocked material in the smallest practical memory scope, clear application references on lock, and avoid promising reliable JavaScript memory erasure. Define idle lock, visibility/OS lock behavior, crash handling, clipboard timeouts and autofill origin binding explicitly. Never serialize live keys into Core settings, Relay queues, browser setup exports, logs, telemetry or agent context.

Recovery must be chosen before storing real secrets: a high-entropy user-held recovery secret can wrap a recovery copy of the data key; losing both unlock and recovery material means data loss. Administrative account-password reset must not secretly decrypt the vault. Any escrow/social recovery option changes the threat model and needs separate approval, key revocation rules and tests. Show recovery material once through an explicit private flow and verify the user can restore an encrypted backup in an isolated profile.

## Required release evidence

- Independent review of the threat model, protocol, primitive use, key derivation, storage format, dependencies and update supply chain. Fix findings before enabling real credentials.
- Known-answer/interoperability tests for encryption and key derivation; wrong-key/tampering/truncation/nonce-reuse defenses; record/tenant/backup substitution; version downgrade and rollback behavior.
- Fault-injection tests for quota, interrupted rotation, failed writes, partial backup restore and simultaneous changes. No acknowledged secret loss or silent overwrite.
- Browser tests proving locked plaintext is absent from IndexedDB, caches, exports, search, logs and network; generated apps cannot access the vault; exact autofill audience and clipboard behavior are qualified.
- A tested recovery drill, documented data-loss conditions, recovery-key rotation and compromised-device revocation. Existing downloaded ciphertext/old keys cannot be magically revoked.
- Supported browser/device matrix, performance/accessibility review and a narrowly worded security claim matching the evidence.

Until these gates pass, retain Vault as a clearly labelled planned capability. Continue independent OS work; do not implement a decorative credential store or ask users to place real passwords in ordinary Hole records.
