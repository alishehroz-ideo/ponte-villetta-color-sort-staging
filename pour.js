let pouring=false;
async function animatePour(from,to,count,color){const release=lockPourScroll();try{return await animatePourVisual(from,to,count,color)}finally{release()}}
async function animatePourVisual(from,to,count,color){
 const source=$('board').children[from],target=$('board').children[to];
 if(matchMedia('(prefers-reduced-motion: reduce)').matches){gameAudio.effect('pour');return;}
 const a=source.getBoundingClientRect(),b=target.getBoundingClientRect();
 const ghost=source.cloneNode(true);ghost.className='bottle pouring-bottle';ghost.removeAttribute('data-i');ghost.removeAttribute('aria-pressed');ghost.setAttribute('aria-hidden','true');
 Object.assign(ghost.style,{position:'fixed',left:a.left+'px',top:a.top+'px',width:a.width+'px',height:a.height+'px',margin:'0',zIndex:1100,transform:'none',pointerEvents:'none'});
 const side=b.left>=a.left?1:-1,dx=b.left+b.width*.5-(a.left+a.width*.5)-side*18,dy=b.top+b.height*.43-(a.top+a.height*.43)-50;
 const pose=`translate(${dx}px,${dy}px) rotate(${side*68}deg)`;
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('class','pour-stream');svg.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);
 const x=b.left+b.width*.5,y=b.top+b.height*.43;
 svg.innerHTML=`<path d="M ${x-side*18} ${y-50} Q ${x} ${y-35} ${x} ${y+10} L ${x} ${b.top+b.height*(.96-bottles[to].length*.09)}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"/><circle cx="${x}" cy="${b.top+b.height*(.96-bottles[to].length*.09)}" r="5" fill="${color}"/>`;
 let fill;
 try{
 document.body.append(ghost);source.classList.add('pour-source');
 await ghost.animate([{transform:'none'},{transform:`translate(${dx*.55}px,${dy-45}px) rotate(0deg)`,offset:.55},{transform:pose}],{duration:520,easing:'ease-in-out',fill:'forwards'}).finished;
 document.body.append(svg);gameAudio.effect('pour');
 svg.animate([{opacity:0},{opacity:1,offset:.12},{opacity:1,offset:.88},{opacity:0}],{duration:700,fill:'forwards'});
 const layers=[...ghost.querySelectorAll('.layer')].reverse();
 for(let k=0;k<count;k++)layers[k].animate([{height:'25%'},{height:'0%'}],{duration:680,easing:'linear',fill:'forwards'});
 fill=document.createElement('div');fill.className='layer incoming-water';fill.style.setProperty('--c',color);target.querySelector('.liquid').append(fill);
 await fill.animate([{height:'0%'},{height:count*25+'%'}],{duration:700,easing:'linear',fill:'forwards'}).finished;
 svg.remove();
 await ghost.animate([{transform:pose},{transform:`translate(${dx*.45}px,${dy-45}px) rotate(0deg)`,offset:.5},{transform:'none'}],{duration:480,easing:'ease-in-out',fill:'forwards'}).finished;
 }finally{ghost.remove();svg.remove();fill?.remove();source.classList.remove('pour-source')}
}

