import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const scope = {}; vm.runInNewContext(fs.readFileSync(new URL('../src/extensions-model.js',import.meta.url),'utf8'), scope); const M=scope.HoleExtensionModel;
test('bounded utilities reject code-like operations and invalid values',()=>{assert.equal(M.calculate(8,'/',2),4);assert.throws(()=>M.calculate(1,'eval',2));assert.throws(()=>M.calculate(1,'/',0));assert.throws(()=>M.tool({type:'script',name:'bad'}));assert.throws(()=>M.tool({type:'timer',seconds:Infinity}));assert.equal(M.tool({type:'counter',name:'Reps',initial:3,step:2}).step,2);});
test('package manifest does not accept arbitrary grants or executable code',()=>{const valid={schema:'hole.package/1',id:'test.counter',name:'Counter',version:1,kind:'tool',permissions:[],component:{type:'counter',name:'Counter'}};assert.equal(M.manifest(valid).version,1);assert.throws(()=>M.manifest({...valid,permissions:['private.read']}));assert.throws(()=>M.manifest({...valid,kind:'script'}));assert.throws(()=>M.manifest({...valid,id:'../../escape'}));});
test('preview policy denies network/frames/workers/host storage through opaque sandbox contract',()=>{const preview=M.sandbox({schema:'hole.weblab/1',name:'probe',files:{'index.html':'<h1>Probe</h1>','style.css':'','script.js':'document.body.textContent="test";'}});assert.match(preview,/connect-src 'none'/);assert.match(preview,/frame-src 'none'/);assert.match(preview,/worker-src 'none'/);assert.match(preview,/form-action 'none'/);const ui=fs.readFileSync(new URL('../src/extensions.js',import.meta.url),'utf8');assert.match(ui,/setAttribute\('sandbox','allow-scripts'\)/);assert.doesNotMatch(ui,/allow-same-origin/);});
test('nonlinear pendulum follows gravity and retains bounded energy over a short run',()=>{let state={length:1,angle:.2,velocity:0};const energy=s=>.5*s.velocity*s.velocity+9.80665*(1-Math.cos(s.angle));const initial=energy(state);state=M.pendulum(state,.016);assert.ok(state.velocity<0);for(let i=0;i<1000;i++)state=M.pendulum(state,.016);assert.ok(Math.abs(energy(state)/initial-1)<.08);});

test('Lab signal produces bounded actual PCM samples, smooth endpoints and reproducible metrics',()=>{
  const input={schema:'hole.experiment/1',model:'signal-oscillator',parameters:{frequency:1000,amplitude:.4,duration:.1,waveform:'sine'}};
  const result=M.signal(input);assert.equal(result.samples.length,4800);assert.equal(result.samples[0],0);assert.equal(Math.abs(result.samples.at(-1)),0);assert.ok(result.summary.peak<=.400001);assert.ok(result.summary.rms>.2);
  let crossings=0;for(let i=481;i<4320;i++)if(result.samples[i-1]<0&&result.samples[i]>=0)crossings++;assert.ok(Math.abs(crossings-80)<=1);
  assert.deepEqual(result.samples,M.signal(input).samples);assert.throws(()=>M.signal({...input,parameters:{frequency:Infinity}}));assert.throws(()=>M.signal({...input,parameters:{duration:500}}));
});
test('Lab Lissajous points match equations and imported computed results cannot override parameters',()=>{
  const value={schema:'hole.experiment/1',model:'lissajous',parameters:{xFrequency:3,yFrequency:2,phase:90,samples:1000},result:{pointCount:999999}};
  const points=M.lissajous(value);assert.equal(points.length,1000);assert.equal(points[0][0],1);assert.equal(points[0][1],0);assert.ok(Math.abs(points.at(-1)[0]-1)<1e-10);assert.ok(points.every(p=>p.every(x=>Math.abs(x)<=1)));
  assert.equal(M.experiment(value).result,undefined);assert.throws(()=>M.experiment({...value,parameters:{samples:1000000}}));
});
