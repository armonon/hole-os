import { mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const MAX_STORE_BYTES = 192 * 1024 * 1024;
export const serviceError = (status, code, message) => Object.assign(new Error(message), { status, code });
export async function openStore(directory) {
  if (!path.isAbsolute(directory)) throw new Error('The service data directory must be absolute.');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lockPath = path.join(directory, 'service.lock');
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (cause) { throw new Error('The service data directory is locked. Verify that no service is running before removing a stale service.lock.', { cause }); }
  await lock.writeFile(String(process.pid));
  const file = path.join(directory, 'state.json');
  let state, tail = Promise.resolve(), closed = false;
  try {
    try {
      if ((await stat(file)).size > MAX_STORE_BYTES) throw new Error('The service store exceeds its configured limit.');
      state = JSON.parse(await readFile(file, 'utf8'));
      if ((state.forms !== undefined && (!state.forms || typeof state.forms !== 'object' || Array.isArray(state.forms))) || state.schema !== 1 || !['users', 'sessions', 'projects', 'assets', 'versions', 'invitations', 'guests', 'worlds', 'records', 'journal'].every(key => state[key] && typeof state[key] === 'object' && !Array.isArray(state[key]))) throw new Error('Unsupported or corrupt service state. Preserve this directory for recovery.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      state = { schema: 1, users: {}, sessions: {}, projects: {}, assets: {}, versions: {}, invitations: {}, guests: {}, worlds: {}, records: {}, journal: {} };
    }
  } catch (error) { await lock.close(); await unlink(lockPath); throw error; }
  async function persist(next) {
    const bytes = Buffer.from(JSON.stringify(next));
    if (bytes.length > MAX_STORE_BYTES) throw serviceError(507, 'STORAGE_LIMIT', 'The local service store is full.');
    const temp = path.join(directory, `.state-${randomUUID()}.tmp`);
    let handle;
    try {
      handle = await open(temp, 'wx', 0o600);
      await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = null;
      await rename(temp, file);
      // A rename is already visible even if a subsequent directory fsync fails.
      // Keep memory aligned; callers must retry the same idempotency key when
      // durability could not be confirmed, never overwrite with an older state.
      state = next;
      const parent = await open(directory, 'r');
      try { await parent.sync(); } finally { await parent.close(); }
    } finally { if (handle) await handle.close(); await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  return {
    async read() { await tail; if (closed) throw new Error('Service store is closed.'); return structuredClone(state); },
    transact(change) {
      const task = tail.then(async () => {
        if (closed) throw new Error('Service store is closed.');
        const next = structuredClone(state);
        const result = await change(next);
        await persist(next); state = next;
        return structuredClone(result);
      });
      tail = task.catch(() => {});
      return task;
    },
    async close() { await tail; if (closed) return; closed = true; await lock.close(); await unlink(lockPath); }
  };
}
