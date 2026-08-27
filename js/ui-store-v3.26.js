(function(){
  const STATE = { head:null, title:null, wrap:null, placeholder:null, dock:null, inner:null, fixed:false, ticking:false };

  function ensureDock(){
    let dock = document.getElementById('jk26Dock');
    if(!dock){
      dock = document.createElement('div');
      dock.id = 'jk26Dock';
      dock.className = 'no-print';
      dock.innerHTML = '<div id="jk26DockInner"></div>';
      document.body.appendChild(dock);
    }
    STATE.dock = dock;
    STATE.inner = dock.querySelector('#jk26DockInner');
  }

  function buildHead(){
    const head = document.querySelector('.page-head');
    if(!head || head.dataset.jk26Ready === '1') return false;
    const children = Array.from(head.children).filter(el => el instanceof HTMLElement);
    if(children.length < 2) return false;

    const title = children[0];
    title.classList.add('jk26-title-block');

    const wrap = document.createElement('div');
    wrap.className = 'jk26-action-wrap no-print';
    children.slice(1).forEach(node => wrap.appendChild(node));

    const placeholder = document.createElement('div');
    placeholder.className = 'jk26-placeholder no-print';

    head.appendChild(placeholder);
    head.appendChild(wrap);
    head.classList.add('jk26-ready');
    head.dataset.jk26Ready = '1';

    STATE.head = head; STATE.title = title; STATE.wrap = wrap; STATE.placeholder = placeholder;
    ensureDock();
    return true;
  }

  function captureLateActions(){
    if(!STATE.head || !STATE.wrap) return;
    Array.from(STATE.head.children).forEach(node => {
      if(node === STATE.title || node === STATE.wrap || node === STATE.placeholder) return;
      if(node instanceof HTMLElement) STATE.wrap.appendChild(node);
    });
  }

  function setFixed(on){
    if(!STATE.wrap || !STATE.head || STATE.fixed === on) return;
    STATE.fixed = on;
    if(on){
      const h = STATE.wrap.getBoundingClientRect().height;
      STATE.placeholder.style.height = Math.max(1,h) + 'px';
      STATE.placeholder.classList.add('jk26-active');
      STATE.inner.appendChild(STATE.wrap);
      STATE.dock.classList.add('jk26-show');
      STATE.wrap.setAttribute('data-jk26-fixed','1');
    }else{
      STATE.dock.classList.remove('jk26-show');
      STATE.head.appendChild(STATE.wrap);
      STATE.placeholder.classList.remove('jk26-active');
      STATE.placeholder.style.height = '';
      STATE.wrap.removeAttribute('data-jk26-fixed');
    }
  }

  function update(){
    STATE.ticking = false;
    if(!STATE.head || !STATE.wrap || !STATE.placeholder) return;
    captureLateActions();

    if(!STATE.fixed){
      const r = STATE.wrap.getBoundingClientRect();
      if(r.bottom < 8) setFixed(true);
    }else{
      const p = STATE.placeholder.getBoundingClientRect();
      if(p.top > 70) setFixed(false);
    }
  }

  function requestUpdate(){
    if(STATE.ticking) return;
    STATE.ticking = true;
    requestAnimationFrame(update);
  }

  function init(){
    if(!buildHead()) return;
    captureLateActions();
    requestUpdate();

    window.addEventListener('scroll', requestUpdate, {passive:true});
    window.addEventListener('resize', requestUpdate, {passive:true});
    window.addEventListener('orientationchange', requestUpdate, {passive:true});

    const obs = new MutationObserver(() => {
      captureLateActions();
      requestUpdate();
    });
    obs.observe(STATE.head, {childList:true});

    setTimeout(()=>{captureLateActions();requestUpdate();},100);
    setTimeout(()=>{captureLateActions();requestUpdate();},500);
    setTimeout(()=>{captureLateActions();requestUpdate();},1200);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
