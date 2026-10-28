/* Opt-in vendor refresh against the owned, inspected Luma source. Never runs during normal builds. */
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const source = path.resolve(process.argv[2] || '../tcc-operations/repos/luma-studio');
const { build } = await import(pathToFileURL(path.join(source, 'node_modules/esbuild/lib/main.js')));
const root = fileURLToPath(new URL('../', import.meta.url));
await build({entryPoints:[path.join(source,'app/engine/studio.ts')],outfile:path.join(root,'src/vendor/luma/engine.js'),bundle:true,format:'iife',globalName:'LumaEngine',platform:'browser',minify:true,legalComments:'eof',plugins:[{name:'bounded-features',setup(b){b.onResolve({filter:/.*/},a=>{if(a.kind==='dynamic-import' && a.path!=='./project')return {path:a.path,external:true};});}}]});
