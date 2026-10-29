function lockPourScroll(){
 const body=document.body,html=document.documentElement,x=window.scrollX,y=window.scrollY,r=body.getBoundingClientRect();
 const previous={body:body.getAttribute('style'),html:html.getAttribute('style')};
 function prevent(e){if(e.cancelable)e.preventDefault()}
 function keys(e){if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End',' '].includes(e.key))prevent(e)}
 html.style.scrollBehavior='auto';html.style.overflow='hidden';html.style.overscrollBehavior='none';
 Object.assign(body.style,{position:'fixed',top:-y+'px',left:r.left+'px',right:'auto',width:r.width+'px',maxWidth:r.width+'px',margin:'0',overflow:'hidden',touchAction:'none'});
 window.addEventListener('wheel',prevent,{passive:false,capture:true});window.addEventListener('touchmove',prevent,{passive:false,capture:true});window.addEventListener('keydown',keys,true);
 let released=false;return ()=>{if(released)return;released=true;window.removeEventListener('wheel',prevent,true);window.removeEventListener('touchmove',prevent,true);window.removeEventListener('keydown',keys,true);if(previous.body===null)body.removeAttribute('style');else body.setAttribute('style',previous.body);if(previous.html===null)html.removeAttribute('style');else html.setAttribute('style',previous.html);const behavior=html.style.scrollBehavior;html.style.scrollBehavior='auto';window.scrollTo(x,y);html.style.scrollBehavior=behavior};
}
