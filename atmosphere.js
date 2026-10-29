let celebrationLayer;
function clearCelebration(){celebrationLayer?.remove();celebrationLayer=null}
function butterflySmoke(){
 clearCelebration();if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const layer=document.createElement('div');layer.className='butterfly-celebration';layer.setAttribute('aria-hidden','true');celebrationLayer=layer;
 const frame=document.body.getBoundingClientRect(),sources=[...document.querySelectorAll('#board .bottle')];
 sources.forEach((b,i)=>{const r=b.getBoundingClientRect();for(let j=0;j<2;j++){
  const butterfly=document.createElement('span');butterfly.className='smoke-butterfly';
  butterfly.style.cssText=`left:${r.left+r.width*.8125}px;top:${r.top+r.height*.54}px;--dx:${frame.left+frame.width*.5-(r.left+r.width*.8125)+(j?25:-25)}px;--dy:${Math.min(-100,35-(r.top+r.height*.54))}px;--delay:${(i%4)*.1+j*.25}s`;
  butterfly.innerHTML='<span class="smoke-trail"></span><span class="butterfly-shape"><i class="wing left-wing"></i><i class="wing right-wing"></i><i class="butterfly-body"></i></span>';
  layer.append(butterfly);
 }});document.body.append(layer);setTimeout(()=>{layer.remove();if(celebrationLayer===layer)celebrationLayer=null},3500);
}
