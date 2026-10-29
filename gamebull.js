const participation=(()=>{
 const config=window.GAMEBULL_CONFIG;
 const demo=config.mode==='demo';let attempt=null,completion=null,entryKey=null;
 const key='ponte-sequential-demo-v1';
 function load(){try{return JSON.parse(localStorage.getItem(key))||{completedStages:0}}catch{return {completedStages:0}}}
 function put(s){localStorage.setItem(key,JSON.stringify(s))}
 function host(){const h=window.GameBullIntegration;if(!h||typeof h.getProgress!=='function'||typeof h.enterStage!=='function'||typeof h.completeStage!=='function'||typeof h.endStage!=='function')throw Error('GameBull接続待ちです。GameBullから起動してください。');return h}
 async function call(method,data){let timer;try{return await Promise.race([Promise.resolve().then(()=>host()[method](data)),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('GameBullの応答を確認できません。再度お試しください。')),15000))])}finally{clearTimeout(timer)}}
 function validateProgress(p){if(!p||!Number.isInteger(p.completedStages)||p.completedStages<0||p.completedStages>1000)throw Error('進行データを確認できません。');return p}
 async function progress(){return validateProgress(demo?load():await call('getProgress',{gameId:config.gameId}))}
 async function enter(){const p=await progress();if(p.completedStages===1000)return {allComplete:true,completedStages:1000};const stage=p.completedStages+1;const data={gameId:config.gameId,stage,lifeCost:1,idempotencyKey:entryKey||(entryKey='entry:'+config.gameId+':'+stage+':'+(globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random()))};
  const r=demo?{authorized:true,stage,attemptId:'demo-'+stage}:await call('enterStage',data);
  if(!r||r.authorized!==true||r.stage!==stage||typeof r.attemptId!=='string'||!r.attemptId)throw Error(r?.message||'参加できません。ライフ残高をご確認ください。');attempt={stage,attemptId:r.attemptId};completion=null;return attempt;
 }
 async function complete(stage,trace){if(!attempt||attempt.stage!==stage)throw Error('参加情報を確認できません。');if(completion)return completion;
 const request={gameId:config.gameId,stage,attemptId:attempt.attemptId,idempotencyKey:'complete:'+attempt.attemptId,moves:trace};
 const r=demo?{accepted:true,completedStages:stage,nextStage:stage===1000?null:stage+1,rewardStatus:'none'}:await call('completeStage',request);
 if(!r||r.accepted!==true||r.completedStages!==stage||r.nextStage!==(stage===1000?null:stage+1))throw Error(r?.message||'クリア確認に失敗しました。再送信してください。');if(demo)put({completedStages:stage});completion=r;entryKey=null;return r;
 }
 async function end(stage){if(!attempt||attempt.stage!==stage)throw Error('参加情報を確認できません。');const r=demo?{ended:true}:await call('endStage',{gameId:config.gameId,stage,attemptId:attempt.attemptId,reason:'no_solution',idempotencyKey:'end:'+attempt.attemptId});if(!r||r.ended!==true)throw Error(r?.message||'終了確認に失敗しました。再送信してください。');attempt=null;completion=null;entryKey=null;return r}
 return {demo,progress,enter,complete,end,get attempt(){return attempt}};
})();
