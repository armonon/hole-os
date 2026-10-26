/* Guest code executes only inside QuickJS WASM, never Worker JavaScript eval. */
import QuickJS from './vendor/weblab-quickjs/quickjs-eval.js';
let used=false;
self.onmessage=async({data})=>{
 if(used)return;used=true;
 const maxOutput=32768,maxLogs=100,logs=[];let bytes=0,result=null,received=false,failure=null,module;
 const fail=(message,code)=>{failure||={message:String(message).slice(0,1000),code};return JSON.stringify({error:failure.message});};
 const runtimeErrors=[];
 // The retained adapter's diagnostics refer to window.console. This host-only
 // shim is not installed in the QuickJS guest realm and exposes no DOM.
 globalThis.window={console:{error:value=>{if(runtimeErrors.length<8)runtimeErrors.push(String(value).slice(0,1000));},log:()=>{}},alert:()=>{}};
 try{
  if(typeof data.source!=='string'||data.source.length>100000||typeof data.inputJSON!=='string'||data.inputJSON.length>16384)throw Error('Script/input bounds exceeded.');
  module=await QuickJS({locateFile:name=>new URL('./vendor/weblab-quickjs/'+name,import.meta.url).href});
  module.externalCall=(name,args)=>{
   if(failure)return JSON.stringify({error:failure.message});
   if(!['log','result','error'].includes(name)||!Array.isArray(args)||args.length!==1)return fail('The requested host capability is unavailable.','CAPABILITY_DENIED');
   const text=JSON.stringify(args[0]);
   if(text===undefined)return fail('Output must be JSON-compatible.','OUTPUT_INVALID');
   const length=new TextEncoder().encode(text).length;bytes+=length;
   if(bytes>maxOutput)return fail('Script output exceeds 32 KiB.','OUTPUT_LIMIT');
   if(name==='log'){if(logs.length>=maxLogs)return fail('Script exceeds 100 log records.','OUTPUT_LIMIT');logs.push(args[0]);}
   else if(name==='result'){if(received)return fail('Only one result is allowed.','OUTPUT_LIMIT');result=args[0];received=true;}
   else return fail(String(args[0]),'SCRIPT_ERROR');
   return 'null';
  };
  const prelude=`(()=>{const send=callExternalFunction;const emit=(name,value)=>send(name,[value]);globalThis.console=Object.freeze({log:(...v)=>emit('log',v),warn:(...v)=>emit('log',v),error:(...v)=>emit('log',v)});try{const value=(function(input){"use strict";\n${data.source}\n})(JSON.parse(${JSON.stringify(data.inputJSON)}));if(value&&typeof value.then==='function')throw Error('Async results are unsupported in the bounded console.');emit('result',value===undefined?null:value);}catch(error){emit('error',String(error&&error.message||error));}return()=>{};})()`;
  const pointer=module.stringToNewUTF8(prelude);
  let success;try{success=module.ccall('init','number',['number','number'],[pointer,0]);}finally{module.ccall('free',null,['number'],[pointer]);}
  if(!success||runtimeErrors.length)failure||={code:'SCRIPT_ERROR',message:runtimeErrors.join('\n').slice(0,1000)||'The script could not be evaluated.'};
  if(!received&&!failure)failure={code:'SCRIPT_ERROR',message:'The script returned no result.'};
  if(failure)self.postMessage({type:'error',...failure});else self.postMessage({type:'done',result,logs,outputBytes:bytes,engine:'QuickJS / PDF.js 6.4.299 retained WASM'});
 }catch(error){self.postMessage({type:'error',code:'ENGINE_ERROR',message:String(error.message||error).slice(0,1000)});}
 finally{try{module?.ccall('nukeSandbox',null,[]);}catch{}}
};
