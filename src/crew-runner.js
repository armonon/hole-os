/* Local delegated Actions with explicit grants, bounded output commits and durable checkpoints. */
(() => {
  'use strict';
  const fail=(message,code='CREW_LIMIT')=>Object.assign(new Error(message),{code});
  const clone=value=>JSON.parse(JSON.stringify(value));
  const active=new Map();
  function create(core, actions=globalThis.HoleActions, {now=()=>Date.now()}={}) {
    async function get(id){const record=await core.get('settings','crew:'+id);if(!record)throw fail('Crew task not found.','NOT_FOUND');return record;}
    async function update(id,patch){for(let attempt=0;attempt<4;attempt++){const old=await get(id);try{return await core.put('settings',{...old,...(typeof patch==='function'?patch(old):patch)},{expectedRevision:old.revision});}catch(error){if(error.code!=='CONFLICT'||attempt===3)throw error;}}}
    async function preview(recipe,request,budgets={}){
      const limits={inputBytes:budgets.inputBytes??20971520,outputBytes:budgets.outputBytes??67108864,maxMs:budgets.maxMs??60000,maxSteps:budgets.maxSteps??8,cost:0};
      if(!Number.isInteger(limits.inputBytes)||limits.inputBytes<1||limits.inputBytes>104857600||!Number.isInteger(limits.outputBytes)||limits.outputBytes<1||limits.outputBytes>268435456||!Number.isInteger(limits.maxMs)||limits.maxMs<100||limits.maxMs>300000||!Number.isInteger(limits.maxSteps)||limits.maxSteps<1||limits.maxSteps>8)throw fail('Use input up to 100 MiB, output up to 256 MiB, runtime 0.1–300 seconds, and 1–8 steps.');
      const plan=await actions.previewFlow(recipe,request);if(plan.steps.length>limits.maxSteps)throw fail('The plan exceeds the approved step limit.');
      let bytes=0;for(const ref of plan.inputs)bytes+=(await core.readAsset(ref.assetId,ref.versionId)).blob.size;if(bytes>limits.inputBytes)throw fail('The selected sources exceed the input budget.');
      const grants=[...new Set(plan.steps.map(step=>step.actionId))];for(const id of grants){const definition=actions.get(id);if(!definition?.available||definition.kind!=='transform'||definition.permissionScope!=='selected-immutable-inputs-and-output-project')throw fail('This action cannot run under the local Crew grant.','GRANT_DENIED');}
      return {schema:'hole.crew/1',recipe:plan.recipe,inputs:plan.inputs,projectId:plan.projectId,grants,budgets:limits,inputBytes:bytes,preview:plan.steps.map(step=>({id:step.id,actionId:step.actionId,from:step.from||'inputs',preview:step.preview,parameters:step.parameters||{}}))};
    }
    async function approve(plan){const verified=await preview(plan.recipe,{inputs:plan.inputs,projectId:plan.projectId},plan.budgets);const id=crypto.randomUUID();return core.put('settings',{id:'crew:'+id,crewId:id,...verified,status:'approved',approvedAt:now(),outputBytes:0,stepStates:verified.recipe.steps.map(step=>({id:step.id,status:'queued',outputs:[]})),outputs:[],checkpoint:0});}
    async function revoke(id){const state=await update(id,current=>({status:current.status==='completed'?'completed':'revoked',revokedAt:now(),grants:[]}));const jobs=(await core.list('jobs')).filter(job=>job.idempotencyKey?.startsWith(`crew:${id}:`)&&['queued','running'].includes(job.status));const activeJob=active.get(id)?.jobId;if(activeJob&&!jobs.some(job=>job.id===activeJob))jobs.push({id:activeJob});for(const job of jobs)await actions.cancel(job.id);return state;}
    async function run(id){
      if(active.has(id))throw fail('This Crew task is already running.','CREW_RUNNING');const session={jobId:null};active.set(id,session);
      const execute=async()=>{
        let record=await get(id);if(record.status==='completed')return record;if(record.status==='revoked'||record.revokedAt)throw fail('This grant was revoked. Review a new task to continue.','GRANT_REVOKED');
        const startedAt=now(),deadline=startedAt+record.budgets.maxMs;record=await update(id,{status:'running',startedAt,deadline,error:null});
        const timer=setTimeout(()=>{session.timedOut=true;if(session.jobId)actions.cancel(session.jobId).catch(()=>{});},record.budgets.maxMs);
        const check=async(actionId)=>{const latest=await get(id);if(latest.status==='revoked'||!latest.grants.includes(actionId))throw fail('The action grant was revoked.','GRANT_REVOKED');if(session.timedOut||now()>deadline)throw fail('Crew runtime budget exhausted. Completed checkpoints remain available.','TIME_BUDGET');return latest;};
        try{
          for(let index=0;index<record.recipe.steps.length;index++){
            const step=record.recipe.steps[index];record=await check(step.actionId);if(record.stepStates[index].status==='completed')continue;
            let inputs=step.actionId==='release.asset-pack'?record.inputs:[record.inputs[step.inputIndex||0]];
            if(step.from&&step.from!=='inputs'){const prior=record.stepStates.find(state=>state.id===step.from),output=prior?.outputs?.[step.outputIndex||0];if(!output)throw fail('The previous checkpoint output is missing.','MISSING_OUTPUT');inputs=[output];if(step.actionId==='release.asset-pack'&&record.inputs[1])inputs.push(record.inputs[1]);}
            const states=clone(record.stepStates);states[index].status='running';record=await update(id,{stepStates:states,currentStep:step.id});
            const promise=actions.run(step.actionId,{inputs,parameters:step.parameters||{},projectId:record.projectId,idempotencyKey:`crew:${id}:${step.id}`,retry:true,onJob:job=>{session.jobId=job.id;},beforeCommit:async result=>{const current=await check(step.actionId);const bytes=result.outputs.reduce((sum,item)=>sum+item.bytes,0);if(bytes+current.outputBytes>current.budgets.outputBytes)throw fail('Crew output budget would be exceeded; this step committed no outputs.','OUTPUT_BUDGET');}});session.jobId=promise.jobId;
            const result=await promise,outputs=result.outputs.map(item=>({assetId:item.asset.id,versionId:item.version.id}));let bytes=0;for(const ref of outputs)bytes+=(await core.readAsset(ref.assetId,ref.versionId)).blob.size;
            record=await update(id,current=>{const next=clone(current.stepStates);next[index]={id:step.id,status:'completed',jobId:result.jobId,outputs};return {stepStates:next,checkpoint:index+1,outputBytes:current.outputBytes+bytes,outputs:[...current.outputs,...outputs]};});session.jobId=null;
          }
          record=await update(id,current=>({status:current.status==='revoked'?'revoked':'completed',finishedAt:now()}));return record;
        }catch(error){record=await update(id,current=>({status:current.status==='revoked'?'revoked':'failed',error:{code:session.timedOut?'TIME_BUDGET':error.code||'ACTION_FAILED',message:error.message},finishedAt:now()}));throw Object.assign(error,{crewId:id});}finally{clearTimeout(timer);}
      };
      try{if(globalThis.navigator?.locks?.request)return await navigator.locks.request('hole-crew:'+id,{ifAvailable:true},lock=>{if(!lock)throw fail('Crew task is active in another tab.','CREW_RUNNING');return execute();});return await execute();}finally{active.delete(id);}
    }
    return Object.freeze({preview,approve,run,revoke,get,list:async()=> (await core.list('settings')).filter(item=>item.schema==='hole.crew/1')});
  }
  globalThis.HoleCrew=Object.freeze({create});
})();
