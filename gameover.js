let deadlockWorker=null,deadlockVersion=0,ending=false;
function stopDeadlockCheck(){deadlockVersion++;deadlockWorker?.terminate();deadlockWorker=null}
async function endParticipation(){if(ending)return;ending=true;const button=$('gameover-home');button.disabled=true;try{await participation.end(current+1);playing=false;$('gameover-result').textContent='この参加は終了しました。再参加にはライフ1が必要です。';button.textContent='TOPへ戻る';button.onclick=()=>{$('gameover').close();showHome()}}catch(e){$('gameover-result').textContent=e.message;button.textContent='終了確認を再送信';button.onclick=endParticipation}finally{ending=false;button.disabled=false}}
function showGameOver(){if(!playing||won())return;stopDeadlockCheck();playing=false;clearCelebration();$('gameover-result').textContent='これ以上クリアできる手順がありません。';$('gameover').showModal();endParticipation()}
function checkDeadlock(){stopDeadlockCheck();if(!playing||won())return;
 let useful=false;for(let i=0;i<bottles.length;i++)for(let j=0;j<bottles.length;j++){if(i===j||solved(bottles[i]))continue;const n=amount(bottles[i],bottles[j]);if(n&&(bottles[j].length||n<bottles[i].length))useful=true}
 if(!useful){showGameOver();return}if(typeof Worker==='undefined')return;
 const id=deadlockVersion;try{deadlockWorker=new Worker('solvability-worker.js');deadlockWorker.onmessage=e=>{if(e.data.id!==deadlockVersion)return;const status=e.data.status;deadlockWorker?.terminate();deadlockWorker=null;if(status==='impossible')showGameOver()};deadlockWorker.onerror=()=>{deadlockWorker?.terminate();deadlockWorker=null};deadlockWorker.postMessage({id,bottles})}catch{deadlockWorker?.terminate();deadlockWorker=null}
}

document.getElementById('gameover').addEventListener('cancel',e=>e.preventDefault());

