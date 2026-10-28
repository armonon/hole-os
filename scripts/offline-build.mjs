import { readFile, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

export async function buildOffline(publicRoot, sourceRoot) {
  await rm(path.join(publicRoot, 'assets', 'service-worker.js'), { force: true });
  const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="44" fill="#ece9e2"/><circle cx="96" cy="96" r="61" fill="#3d3549"/><circle cx="96" cy="96" r="34" fill="#ece9e2"/></svg>';
  await writeFile(path.join(publicRoot, 'hole-icon.svg'), icon);
  await writeFile(path.join(publicRoot, 'manifest.webmanifest'), JSON.stringify({ id: '/', name: 'Hole OS', short_name: 'Hole', description: 'A personal workspace for your ideas, files, and everyday work.', start_url: '/', scope: '/', display: 'standalone', background_color: '#ece9e2', theme_color: '#ece9e2', icons: [{ src: '/assets/vendor/pwa/hole-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' }, { src: '/assets/vendor/pwa/hole-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }, { src: '/hole-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] }, null, 2));
  const files = [];
  async function visit(dir) { for (const entry of await readdir(dir, { withFileTypes: true })) { if (entry.name.startsWith('.') || entry.name.endsWith('.map') || entry.name === 'service-worker.js') continue; const full = path.join(dir, entry.name); if (entry.isDirectory()) await visit(full); else if (entry.isFile()) files.push(full); } }
  await visit(publicRoot);
  const assets = await Promise.all(files.sort().map(async file => { const bytes = await readFile(file); return { path: '/' + path.relative(publicRoot, file).split(path.sep).join('/'), hash: sha(bytes), bytes: bytes.length }; }));
  const template = await readFile(path.join(sourceRoot, 'service-worker.js'), 'utf8');
  const manifest = { version: sha(template + JSON.stringify(assets)).slice(0, 24), bytes: assets.reduce((n, a) => n + a.bytes, 0), assets };
  if (!template.includes('/*__HOLE_CACHE_MANIFEST__*/ null')) throw new Error('Service worker manifest placeholder is missing.');
  await writeFile(path.join(publicRoot, 'service-worker.js'), template.replace('/*__HOLE_CACHE_MANIFEST__*/ null', JSON.stringify(manifest)));
  return manifest;
}
