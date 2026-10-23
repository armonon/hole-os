import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { build, projectRoot, publicRoot } from './build.mjs';

const args = process.argv.slice(2);
function option(name, fallback) {
  const inline = args.find(value => value.startsWith(name + '='));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}
const host = option('--host', process.env.HOST || '0.0.0.0');
const port = Number(option('--port', process.env.PORT || '5173'));
if (!host || !Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Use --host ADDRESS and --port NUMBER (0–65535).');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};
await build();
const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let filename = path.resolve(publicRoot, '.' + pathname);
    if (filename !== publicRoot && !filename.startsWith(publicRoot + path.sep)) throw new Error('Invalid path');
    if ((await stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
    const data = await readFile(filename);
    response.writeHead(200, {
      'Content-Type': mime[path.extname(filename)] || 'application/octet-stream',
      'Content-Length': data.byteLength,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; watcher.close(); });
server.listen(port, host, () => {
  const address = server.address();
  console.log('Hole OS: http://' + (host === '0.0.0.0' ? 'localhost' : host) + ':' + address.port);
  console.log('Watching src/. Refresh the browser after edits.');
});

let timer;
let rebuilding = Promise.resolve();
const watcher = watch(path.join(projectRoot, 'src'), () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    rebuilding = rebuilding.then(build).then(() => console.log('Rebuilt public/index.html')).catch(error => console.error('Build failed:', error.message));
  }, 100);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  clearTimeout(timer);
  watcher.close();
  server.close(() => process.exit());
});
