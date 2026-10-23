import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const publicRoot = path.join(projectRoot, 'public');
const sourceRoot = path.join(projectRoot, 'src');
const placeholder = '<!--__HOLE_FRAGMENT__-->';

export async function build() {
  const [shell, fragment] = await Promise.all([
    readFile(path.join(sourceRoot, 'shell.html'), 'utf8'),
    readFile(path.join(sourceRoot, 'hole-fluid-os.html'), 'utf8')
  ]);
  if (shell.split(placeholder).length !== 2) throw new Error('Shell needs exactly one fragment placeholder.');
  if (/<!doctype\s|<\s*(html|head|body)(?:\s|>)/i.test(fragment)) throw new Error('Expected an HTML fragment in src/hole-fluid-os.html.');
  if (/<iframe\b/i.test(shell + fragment)) throw new Error('Standalone output must not contain an iframe.');
  await mkdir(path.join(publicRoot, 'assets'), { recursive: true });
  await Promise.all((await readdir(sourceRoot)).filter(name => /\.(js|css)$/.test(name)).map(name => copyFile(path.join(sourceRoot, name), path.join(publicRoot, 'assets', name))));
  await Promise.all([
    copyFile(path.join(sourceRoot, 'standalone.css'), path.join(publicRoot, 'assets', 'standalone.css')),
    copyFile(path.join(sourceRoot, 'persistence.js'), path.join(publicRoot, 'assets', 'persistence.js')),
    // Vendored files are committed under public/assets and never fetched by builds.
    readFile(path.join(publicRoot, 'assets', 'lucide-1.17.0.js')),
    readFile(path.join(publicRoot, 'assets', 'LUCIDE-LICENSE.txt'))
  ]);
  await writeFile(path.join(publicRoot, 'index.html'), shell.replace(placeholder, () => fragment), 'utf8');
  return path.join(publicRoot, 'index.html');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log('Built ' + path.relative(projectRoot, await build()));
}
