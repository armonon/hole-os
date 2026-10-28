/* Explicit refresh from the retained owned Form native project/Fabric source. */
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const source=path.resolve(process.argv[2] || '../tcc-operations/repos/form-studio');
const {build}=await import(pathToFileURL(path.resolve('../tcc-operations/repos/luma-studio/node_modules/esbuild/lib/main.js')));
await build({stdin:{contents:`export * from './app/project-format.ts';export {ProjectSaveSession,emptySceneWorkspace} from './app/project-save-session.ts';export {parseGarment,serializeGarment,createGarmentTemplate,recalculateSeamEase} from './app/fabric-engine.ts';export {patternOutline,movePatternPoint} from './app/fabric-pattern-geometry.ts';export {exportGarmentDxf,exportTiledPatternPdf} from './app/garment-export.ts';`,resolveDir:source,loader:'ts'},outfile:path.join(fileURLToPath(new URL('../',import.meta.url)),'src/vendor/form/engine.js'),bundle:true,format:'iife',globalName:'FormEngine',platform:'browser',minify:true,legalComments:'eof'});
