import { homedir } from 'node:os';
import path from 'node:path';
import { createService } from './service.mjs';

const directory = process.env.HOLE_DATA_DIR || path.join(homedir(), '.local', 'share', 'hole-os-services');
const origins = (process.env.HOLE_ALLOWED_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173').split(',');
const service = await createService({ directory, origins });
const address = await service.listen(Number(process.env.HOLE_SERVICE_PORT || 8787));
console.log(`Hole local service listening at ${address}. Private data directory: ${directory}`);
let closing = false;
const close = async () => { if (closing) return; closing = true; await service.close(); process.exit(0); };
process.on('SIGINT', close); process.on('SIGTERM', close);
