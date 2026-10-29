const home=document.getElementById('home');const backHome=document.getElementById('back-home');
function showHome(){if(pouring||submitting)return;clearCelebration();document.body.classList.add('home-open');document.getElementById('home-progress').textContent=playing?'現在のステージ '+(current+1)+' / '+LEVELS.length:'1,000 STAGES · 順番に挑戦';document.getElementById('continue-game').firstChild.textContent=playing?'RESUME ':'START ';window.scrollTo(0,0)}
function enterGame(){document.body.classList.remove('home-open');window.scrollTo(0,0)}
document.getElementById('continue-game').onclick=()=>{if(playing){if(won()){enterGame();if(!$('win').open)$('win').showModal()}else enterGame()}else beginParticipation()};backHome.onclick=showHome;showHome();
document.getElementById('participation-note').textContent=participation.demo?'DEMO · ライフ消費なし · ギフト券対象外':'参加にはライフ1が必要です。次のステージもライフ1を使用します。';
document.querySelectorAll('.city-lights').forEach(layer=>{for(let i=0;i<35;i++){const dot=document.createElement('i');dot.style.cssText='left:'+(15+(i*37%72))+'%;top:'+(42+(i*17%28))+'%;--delay:'+(-i*.41)+'s;--duration:'+(2.8+(i%5)*.7)+'s;--size:'+(i%7===0?4:2)+'px';layer.append(dot)}});
