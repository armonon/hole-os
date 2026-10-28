/* Explicit refresh of the owned Glyph model, native codec and real font compilers. */
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
const source = path.resolve(process.argv[2] || '../tcc-operations/repos/glyph-studio');
const { build } = await import(pathToFileURL(path.resolve('../tcc-operations/repos/luma-studio/node_modules/esbuild/lib/main.js')));
const root = fileURLToPath(new URL('../', import.meta.url));
await build({ stdin: { contents: `export {parseProjectFile, serializeProject, validateEditableProject, newProject} from './src/engine/project-store'; export {GLYPH_CHARSET, GLYPH_LIMITS} from './src/engine/glyph-model'; export {glyphContours, layoutText} from './src/engine/geometry'; export {setKerningPair, removeKerningPair} from './src/engine/kerning'; export {buildOtf, buildTtf} from './src/engine/font-export';`, resolveDir:source, loader:'ts' }, outfile:path.join(root,'src/vendor/glyph/engine.js'), bundle:true, format:'iife',globalName:'GlyphEngine',platform:'browser',minify:true,legalComments:'eof' });
const notices=[];
for(const pkg of ['opentype.js','idb']) {
 for(const name of ['LICENSE','LICENSE.txt','LICENSE.md']) { try { notices.push(`${pkg}\n${await readFile(path.join(source,'node_modules',pkg,name),'utf8')}`);break; } catch {} }
}
await writeFile(path.join(root,'src/vendor/glyph/THIRD-PARTY-NOTICES.txt'),notices.join('\n\n'));
