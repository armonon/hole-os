/* Original experimental tonal-template scoring. Only FFT is third-party MIT.
 * No native key engine, fitted key profiles, or trained model is incorporated. */
import { fft } from './vendor/stems/demucs/fft.js';
const N = 8192, RATE = 22050, HOP = 2205;
const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const fail = (message, code) => Object.assign(new Error(message), { code });
export async function analyzeKey(channels, sampleRate, { maxSeconds = 60, budgetMs = 10000, signal } = {}) {
  const began = Date.now(), check = () => { if (signal?.aborted) throw fail('Key analysis cancelled.', 'CANCELLED'); if (Date.now() - began > budgetMs) throw fail('Key analysis exceeded its budget.', 'TIMEOUT'); };
  check();
  if (sampleRate !== RATE || !Array.isArray(channels) || channels.length < 1 || channels.length > 2 || channels.some(c => !(c instanceof Float32Array) || c.length !== channels[0].length) || !Number.isFinite(maxSeconds) || maxSeconds < 6 || maxSeconds > 60 || !Number.isFinite(budgetMs) || budgetMs < 1 || budgetMs > 10000) throw fail('Expected mono/stereo22.05kHz PCM and6–60second coverage.', 'RESOURCE_LIMIT');
  const count = Math.min(channels[0].length, Math.floor(maxSeconds * RATE));
  const report = { schema:'hole.key-analysis/1', engine:'hole-tonal-template/1', experimental:true, key:null, candidates:[], relativeAlternative:null, ambiguous:true, reason:null, scoreMeaning:'Cosine similarity to an original tonal template; margins are not probabilities or calibrated confidence.', coverage:{startSeconds:0,endSeconds:count/RATE,sourceDurationSeconds:channels[0].length/RATE,partial:count<channels[0].length,sampleRate:RATE,channels:channels.length}, chroma:Array(12).fill(0), limitations:['Western12-tone equal temperament, A4=440Hz; no tuning calibration.','Global pitch-class statistics cannot establish musical key or follow modulation reliably.','Percussion, harmonics, sparse notes and relative major/minor can confound estimates.','No native-engine parity, trained key profile or corpus accuracy claim.'] };
  if (count < RATE * 6) { report.reason='insufficient-duration'; return report; }
  const window=Float32Array.from({length:N},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/(N-1))), input=new Float32Array(N), real=new Float32Array(N), imag=new Float32Array(N), powers=new Float64Array(N/2);
  const first=Math.ceil(55*N/RATE),last=Math.floor(4000*N/RATE);let frames=0,tonalFrames=0,totalEnergy=0,flatnessSum=0;
  for(let start=0;start+N<=count;start+=HOP){
    check();powers.fill(0);let energy=0;
    for(const channel of channels){for(let i=0;i<N;i++){const value=channel[start+i];if(!Number.isFinite(value))throw fail('Non-finite audio sample.','INVALID_PCM');energy+=value*value;input[i]=value*window[i];}fft(real,imag,input,N);for(let k=first;k<=last;k++)powers[k]+=real[k]*real[k]+imag[k]*imag[k];}
    totalEnergy+=energy/(N*channels.length);frames++;
    let sum=0,logs=0,peak=0;for(let k=first;k<=last;k++){sum+=powers[k];logs+=Math.log(powers[k]+1e-20);peak=Math.max(peak,powers[k]);}
    const bins=last-first+1,flatness=Math.exp(logs/bins)/(sum/bins+1e-20);flatnessSum+=flatness;
    if(energy/(N*channels.length)>1e-9&&flatness<.25){
      const frame=Array(12).fill(0);let weight=0;
      for(let k=first+1;k<last;k++)if(powers[k]>=peak*.02&&powers[k]>powers[k-1]&&powers[k]>=powers[k+1]){
        const a=Math.log(powers[k-1]+1e-20),b=Math.log(powers[k]+1e-20),c=Math.log(powers[k+1]+1e-20),denom=a-2*b+c;
        const delta=Math.abs(denom)>1e-12?Math.max(-.5,Math.min(.5,.5*(a-c)/denom)):0;
        const midi=69+12*Math.log2((k+delta)*RATE/N/440),pc=((Math.round(midi)%12)+12)%12,w=Math.sqrt(powers[k]);frame[pc]+=w;weight+=w;
      }
      if(weight>0){tonalFrames++;for(let pc=0;pc<12;pc++)report.chroma[pc]+=frame[pc]/weight;}
    }
    if(frames%16===0){await new Promise(resolve=>setTimeout(resolve,0));check();}
  }
  const sum=report.chroma.reduce((a,b)=>a+b,0);if(sum)report.chroma=report.chroma.map(v=>v/sum);
  const entropy=-report.chroma.reduce((a,v)=>a+(v>0?v*Math.log(v):0),0)/Math.log(12),active=report.chroma.filter(v=>v>=.025).length;
  report.evidence={frames,tonalFrames,tonalFrameFraction:tonalFrames/frames,meanSpectralFlatness:flatnessSum/frames,rms:Math.sqrt(totalEnergy/frames),chromaEntropy:entropy,activePitchClasses:active};
  if(report.evidence.rms<.0001)report.reason='silence';
  else if(tonalFrames<frames*.25)report.reason='insufficient-tonal-evidence';
  else if(active<4)report.reason='insufficient-pitch-class-diversity';
  else if(entropy>.94)report.reason='diffuse-chromatic-evidence';
  if(report.reason)return report;
  for(let root=0;root<12;root++)for(const mode of ['major','minor']){
    const scale=mode==='major'?[0,2,4,5,7,9,11]:[0,2,3,5,7,8,10],template=Array(12).fill(0);
    for(const interval of scale)template[(root+interval)%12]=.35;
    template[root]+=1;template[(root+(mode==='major'?4:3))%12]+=.6;template[(root+7)%12]+=.5;
    let dot=0,aa=0,bb=0;for(let i=0;i<12;i++){dot+=template[i]*report.chroma[i];aa+=template[i]**2;bb+=report.chroma[i]**2;}
    report.candidates.push({key:`${names[root]} ${mode}`,root,mode,score:dot/Math.sqrt(aa*bb)});
  }
  report.candidates.sort((a,b)=>b.score-a.score);const best=report.candidates[0],second=report.candidates[1],relativeRoot=(best.root+(best.mode==='major'?9:3))%12;
  report.relativeAlternative=report.candidates.find(c=>c.root===relativeRoot&&c.mode!==best.mode);
  report.margin=best.score-second.score;report.ambiguous=report.margin<.08||best.score-report.relativeAlternative.score<.12;
  report.key=best.score>=.7?best.key:null;report.reason=report.key?(report.ambiguous?'competing-tonal-templates':'dominant-tonal-template'):'weak-template-match';
  if(!report.key)report.ambiguous=true;report.candidates=report.candidates.slice(0,6);check();return report;
}
if(typeof self!=='undefined'&&typeof self.postMessage==='function')self.onmessage=async({data})=>{try{self.postMessage({type:'done',report:await analyzeKey(data.channels,data.sampleRate,data.options)});}catch(error){self.postMessage({type:'error',code:error.code||'ANALYSIS_FAILED',message:error.message});}};
