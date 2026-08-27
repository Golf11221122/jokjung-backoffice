(function(){
  const state = {
    head: null,
    title: null,
    wrap: null,
    placeholder: null,
    sentinel: null,
    dock: null,
    inner: null,
    fixed: false,
    ticking: false,
    observer: null,
    mo: null,
    thresholdTop: 74
  };

  function ensureDock(){
    let dock = document.getElementById('jk27Dock');
    if(!dock){
      dock = document.createElement('div');
      dock.id = 'jk27Dock';
      dock.className = 'no-print';
      dock.innerHTML = '<div id="jk27DockInner"></div>';
      document.body.appendChild(dock);
    }
    state.dock = dock;
    state.inner = dock.querySelector('#jk27DockInner');
  }

  function isValidNode(node){
    return node instanceof HTMLElement;
  }

  function collectLateNodes(){
    if(!state.head || !state.wrap) return;
    Array.from(state.head.children).forEach((node) => {
      if(!isValidNode(node)) return;
      if(node === state.title || node === state.wrap || node === state.placeholder || node === state.sentinel) return;
      state.wrap.appendChild(node);
    });
  }

  function build(){
    const head = document.querySelector('.page-head');
    if(!head || head.dataset.jk27Ready === '1') return false;
    const children = Array.from(head.children).filter(isValidNode);
    if(children.length < 2) return false;

    const title = children[0];
    title.classList.add('jk27-title-block');

    const sentinel = document.createElement('div');
    sentinel.className = 'jk27-sentinel';

    const placeholder = document.createElement('div');
    placeholder.className = 'jk27-placeholder no-print';

    const wrap = document.createElement('div');
    wrap.className = 'jk27-action-wrap no-print';

    children.slice(1).forEach((node) => wrap.appendChild(node));

    head.appendChild(sentinel);
    head.appendChild(placeholder);
    head.appendChild(wrap);
    head.classList.add('jk27-ready');
    head.dataset.jk27Ready = '1';

    state.head = head;
    state.title = title;
    state.wrap = wrap;
    state.placeholder = placeholder;
    state.sentinel = sentinel;

    ensureDock();
    return true;
  }

  function measurePlaceholder(){
    if(!state.wrap || !state.placeholder) return;
    const h = Math.max(1, Math.ceil(state.wrap.getBoundingClientRect().height));
    state.placeholder.style.height = h + 'px';
  }

  function setFixed(on){
    if(!state.wrap || !state.head || !state.placeholder || !state.inner) return;
    if(state.fixed === on) return;
    state.fixed = on;
    if(on){
      measurePlaceholder();
      state.placeholder.classList.add('jk27-active');
      state.inner.appendChild(state.wrap);
      state.dock.classList.add('jk27-show');
      state.wrap.setAttribute('data-jk27-fixed','1');
    }else{
      state.head.appendChild(state.wrap);
      state.placeholder.classList.remove('jk27-active');
      state.placeholder.style.height = '';
      state.dock.classList.remove('jk27-show');
      state.wrap.removeAttribute('data-jk27-fixed');
    }
  }

  function update(){
    state.ticking = false;
    if(!state.sentinel) return;
    collectLateNodes();
    const rect = state.sentinel.getBoundingClientRect();
    const shouldFix = rect.top < state.thresholdTop;
    if(shouldFix && !state.fixed) setFixed(true);
    else if(!shouldFix && state.fixed) setFixed(false);
    if(state.fixed) measurePlaceholder();
  }

  function requestUpdate(){
    if(state.ticking) return;
    state.ticking = true;
    requestAnimationFrame(update);
  }

  function initObserver(){
    if(!('IntersectionObserver' in window) || !state.sentinel) return;
    if(state.observer) state.observer.disconnect();
    state.observer = new IntersectionObserver(() => requestUpdate(), {
      root: null,
      threshold: [0, 1],
      rootMargin: '-' + state.thresholdTop + 'px 0px 0px 0px'
    });
    state.observer.observe(state.sentinel);
  }

  function initMutationObserver(){
    if(!state.head) return;
    if(state.mo) state.mo.disconnect();
    state.mo = new MutationObserver(() => {
      collectLateNodes();
      requestUpdate();
    });
    state.mo.observe(state.head, { childList: true, subtree: false });
  }

  function init(){
    if(!build()) return;
    collectLateNodes();
    initObserver();
    initMutationObserver();
    requestUpdate();

    window.addEventListener('scroll', requestUpdate, { passive:true });
    window.addEventListener('resize', requestUpdate, { passive:true });
    window.addEventListener('orientationchange', requestUpdate, { passive:true });

    setTimeout(() => { collectLateNodes(); requestUpdate(); }, 120);
    setTimeout(() => { collectLateNodes(); requestUpdate(); }, 600);
    setTimeout(() => { collectLateNodes(); requestUpdate(); }, 1400);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
