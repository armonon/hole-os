/* Explicit refresh of owned browser StemDeck engine; no native JUCE sources. */
import path from 'node:path';import {pathToFileURL} from 'node:url';
const source=path.resolve(process.argv[2]||'../sattari-seo-20261026/source/src/utils');
const {build}=await import(pathToFileURL(path.resolve('../tcc-operations/repos/luma-studio/node_modules/esbuild/lib/main.js')));
await build({stdin:{contents:`export {readProjectArchive} from './projectArchive.js';export {validateStudioProject,dataUrlToBlob} from './audioProjectStore.js';export {hashLibraryAudio} from './libraryFiles.js';export {INSTRUMENTS,instrumentVoice} from './arrangementInstruments.js';export {wavBytes,peakOf} from './arrangementExport.js';export {emptyArrangement,audioTrack,audioClip} from './arrangementModel.js';`,resolveDir:source},outfile:'src/vendor/stemdeck/engine.js',bundle:true,format:'iife',globalName:'StemDeckEngine',platform:'browser',minify:true,legalComments:'eof'});
