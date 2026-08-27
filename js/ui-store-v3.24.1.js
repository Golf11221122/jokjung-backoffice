(function(){
  function wrapActionsInPageHead(){
    document.querySelectorAll('.page-head').forEach((head) => {
      if (head.dataset.jk241Ready === '1') return;
      const children = Array.from(head.children).filter(Boolean);
      if (children.length <= 1) return;

      head.classList.add('jk241-page-head');
      const sticky = document.createElement('div');
      sticky.className = 'jk241-sticky-actions no-print';

      children.slice(1).forEach((node) => {
        if (!(node instanceof HTMLElement)) {
          sticky.appendChild(node);
          return;
        }
        node.classList.add('jk241-toolbar-group');
        sticky.appendChild(node);
      });

      head.appendChild(sticky);
      head.dataset.jk241Ready = '1';
    });
  }

  function runPasses(){
    wrapActionsInPageHead();
    setTimeout(wrapActionsInPageHead, 80);
    setTimeout(wrapActionsInPageHead, 400);
    setTimeout(wrapActionsInPageHead, 900);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runPasses);
  } else {
    runPasses();
  }

  window.addEventListener('load', wrapActionsInPageHead);
})();
