/* Original, locally synthesized lounge music and game sounds. */
const gameAudio=(()=>{
 let ctx,master,music,fx,timer,step=0,next=0,enabled=true;
 try{enabled=localStorage.getItem('ponte-audio')!=='off'}catch{}
 const button=document.getElementById('sound');
 function label(){button.textContent=enabled?'♫ 音 ON':'♫ 音 OFF';button.setAttribute('aria-pressed',String(enabled))}label();
 function tone(midi,time,duration,volume=.06,bus=music,type='sine'){
  const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.value=440*2**((midi-69)/12);g.gain.setValueAtTime(0,time);g.gain.linearRampToValueAtTime(volume,time+.015);g.gain.exponentialRampToValueAtTime(.0001,time+duration);o.connect(g);g.connect(bus);o.start(time);o.stop(time+duration+.03);
 }
 function schedule(){if(!ctx||!enabled||document.hidden||ctx.state!=='running')return;
  const chords=[[48,55,59,62],[45,52,55,59],[50,57,60,64],[43,50,53,57]];
  while(next<ctx.currentTime+.35){const bar=Math.floor(step/8)%4,beat=step%8,chord=chords[bar];if(beat===0){chord.forEach((n,i)=>tone(n+12,next+i*.045,3.3,.022));tone(chord[0]-12,next,1.5,.065)}if(beat===4)tone(chord[0]-12,next,1.1,.045);if(beat%2===1)tone(chord[1+(Math.floor(step/2)%3)]+12,next,.85,.03);step++;next+=.375}
 }
 async function unlock(){if(!enabled||document.hidden)return;try{if(!ctx){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;ctx=new Audio();master=ctx.createGain();master.gain.value=.6;master.connect(ctx.destination);music=ctx.createGain();music.gain.value=.65;music.connect(master);fx=ctx.createGain();fx.gain.value=.6;fx.connect(master)}await ctx.resume();if(!timer){next=ctx.currentTime+.06;schedule();timer=setInterval(schedule,100)}}catch{}}
 function pause(){clearInterval(timer);timer=null;if(ctx)ctx.suspend().catch(()=>{})}
 button.onclick=()=>{enabled=!enabled;try{localStorage.setItem('ponte-audio',enabled?'on':'off')}catch{}label();if(enabled)unlock();else pause()};
 document.addEventListener('pointerdown',e=>{if(!e.target.closest('#sound'))unlock()},{passive:true});document.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')unlock()});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();else if(ctx&&enabled)unlock()});
 function effect(kind){if(!enabled||!ctx||ctx.state!=='running')return;const t=ctx.currentTime;
 if(kind==='select'){tone(79,t,.12,.045,fx);tone(86,t+.025,.16,.02,fx)}
 if(kind==='invalid')tone(48,t,.15,.035,fx,'triangle');
 if(kind==='complete'||kind==='win'){const notes=kind==='win'?[72,76,79,83,84]:[76,79,84];notes.forEach((n,i)=>tone(n,t+i*.12,.8,.07,fx))}
 if(kind==='pour'){

 // Rounded liquid bubbles: damped, rising resonances instead of dry noise.
 const bubbles=[0,.065,.14,.225,.31,.405,.49,.58];
 bubbles.forEach((offset,i)=>{
  const at=t+offset,duration=.12+(i%3)*.018;
  const base=[190,270,220,330,245,380,290,430][i];
  const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';
  o.frequency.setValueAtTime(base,at);
  o.frequency.exponentialRampToValueAtTime(base*1.85,at+duration*.65);
  o.frequency.exponentialRampToValueAtTime(base*1.35,at+duration);
  g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(.16-(i%3)*.018,at+.009);
  g.gain.exponentialRampToValueAtTime(.0001,at+duration);
  o.connect(g);g.connect(fx);o.start(at);o.stop(at+duration+.02);
  const drop=ctx.createOscillator(),dg=ctx.createGain();drop.type='sine';
  drop.frequency.setValueAtTime(base*3,at+.012);drop.frequency.exponentialRampToValueAtTime(base*1.6,at+.075);
  dg.gain.setValueAtTime(.025,at+.012);dg.gain.exponentialRampToValueAtTime(.0001,at+.09);
  drop.connect(dg);dg.connect(fx);drop.start(at+.012);drop.stop(at+.1);
 });

 }}
 return {effect};
})();
