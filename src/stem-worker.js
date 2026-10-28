import './model-store.js';
import './stem-model.js';
import './actions-codecs.js';
import * as ort from './vendor/stems/ort/ort.wasm.min.mjs';
import { DemucsProcessor } from './vendor/stems/demucs/processor.js';
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = new URL('./vendor/stems/ort/', import.meta.url).href;
let used = false;
self.onmessage = async ({ data }) => {
  if (used) return; used = true;
  let processor, tensors = [];
  const release = () => { for (const tensor of tensors) tensor.dispose(); tensors = []; };
  try {
    const { left, right } = data;
    if (!(left instanceof Float32Array) || !(right instanceof Float32Array) || !left.length || left.length !== right.length || left.length > 44100 * 15) throw new Error('Expected up to15 seconds of stereo44.1kHz PCM.');
    for (let i = 0; i < left.length; i++) if (!Number.isFinite(left[i]) || !Number.isFinite(right[i])) throw new Error('Invalid PCM sample.');
    self.postMessage({ type: 'progress', stage: 'Verifying locally installed model' });
    const model = await HoleModelStore.read(HoleStemModel.manifest);
    processor = new DemucsProcessor({ ort, sessionOptions: { executionProviders: ['wasm'], enableCpuMemArena: false, enableMemPattern: false } });
    self.postMessage({ type: 'progress', stage: 'Initializing local CPU separation' });
    await processor.loadModel(model);
    const session = processor.session, original = session.run;
    session.run = async feeds => { release(); try { const result = await original.call(session, feeds); tensors = Object.values(result); return result; } finally { Object.values(feeds).forEach(t => t.dispose()); } };
    processor.onProgress = ({ currentSegment }) => self.postMessage({ type: 'progress', stage: `Separating local section ${currentSegment}` });
    const size = Math.max(343980, left.length), l = new Float32Array(size), r = new Float32Array(size); l.set(left); r.set(right);
    const result = await processor.separate(l, r), outputs = [];
    for (const id of ['drums', 'bass', 'other', 'vocals']) {
      const channels = [result[id].left.slice(0, left.length), result[id].right.slice(0, left.length)];
      if (channels.some(c => c.length !== left.length || c.some(v => !Number.isFinite(v)))) throw new Error('Invalid separated PCM output.');
      outputs.push({ id, blob: HoleActionCodecs.wav(channels, 44100) });
    }
    self.postMessage({ type: 'done', outputs, sampleRate: 44100, samples: left.length, channels: 2, model: HoleStemModel.manifest.id, revision: HoleStemModel.revision, sha256: HoleStemModel.manifest.sha256 });
  } catch (error) { self.postMessage({ type: 'error', message: error.message, code: error.code || 'SEPARATION_FAILED' }); }
  finally { release(); await processor?.session?.release().catch(() => {}); }
};
