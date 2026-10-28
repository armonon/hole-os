/* Explicit refresh from installed Three.js; normal build uses committed bytes. */
import path from 'node:path';import {pathToFileURL} from 'node:url';import {copyFile,writeFile} from 'node:fs/promises';
const source=path.resolve(process.argv[2]||'../tcc-operations/repos/form-studio');
const {build}=await import(pathToFileURL(path.resolve('../tcc-operations/repos/luma-studio/node_modules/esbuild/lib/main.js')));
await build({stdin:{contents:`export * from 'three';export {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';`,resolveDir:source},outfile:'src/vendor/three/engine.js',bundle:true,format:'esm',platform:'browser',minify:true,legalComments:'eof'});
await copyFile(path.join(source,'node_modules/three/LICENSE'),'src/vendor/three/LICENSE');
