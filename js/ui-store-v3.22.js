/* JOKJUNG Back Office V3.22 — Command Center interaction layer */
(() => {
  'use strict'

  const parseNum = (el) => {
    if (!el) return 0
    const n = Number(String(el.textContent || '').replace(/[^0-9.-]/g, ''))
    return Number.isFinite(n) ? n : 0
  }

  function setupNavProgress() {
    const bar = document.createElement('div')
    bar.id = 'jkNavProgress'
    document.body.appendChild(bar)
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]')
      if (!a || a.target === '_blank' || a.getAttribute('href')?.startsWith('#')) return
      bar.classList.remove('done')
      void bar.offsetWidth
      bar.classList.add('active')
    }, true)
    window.addEventListener('pageshow', () => { bar.classList.remove('active'); bar.classList.add('done'); setTimeout(() => bar.classList.remove('done'), 450) })
  }

  function confirmTap(el) {
    if (!(el instanceof HTMLButtonElement)) return
    if (el.disabled || el.matches('.menu-btn,.close-btn,.icon-btn')) return
    el.querySelector('.jk-confirm-mark')?.remove()
    const mark = document.createElement('span')
    mark.className = 'jk-confirm-mark'
    mark.textContent = '✓'
    mark.setAttribute('aria-hidden','true')
    el.appendChild(mark)
    setTimeout(() => mark.remove(), 900)
    try { navigator.vibrate?.(10) } catch (_) {}
  }

  function setupConfirmMarks() {
    document.addEventListener('click', (e) => confirmTap(e.target.closest('button')), true)
  }

  function syncDashboardStatus() {
    const alerts = document.getElementById('alerts')
    const po = document.getElementById('openPo')
    const pendingText = document.getElementById('pendingCount')
    const alertOut = document.getElementById('jkAlertSummary')
    const poOut = document.getElementById('jkPoSummary')
    const countOut = document.getElementById('jkCountSummary')
    if (!alertOut || !poOut || !countOut) return

    const render = () => {
      const a = parseNum(alerts)
      const p = parseNum(po)
      const c = parseNum(pendingText)
      alertOut.textContent = a > 0 ? `${a} รายการต้องตรวจ` : 'ปกติ'
      poOut.textContent = p > 0 ? `${p} PO ยังเปิด` : 'ไม่มี PO ค้าง'
      countOut.textContent = c > 0 ? `${c} งานค้าง` : 'ไม่มีงานค้าง'
      const setState = (el, n) => {
        const card = el.closest('.jk-attention-card')
        card.classList.remove('is-ok','is-warning','is-danger')
        card.classList.add(n <= 0 ? 'is-ok' : n >= 5 ? 'is-danger' : 'is-warning')
      }
      setState(alertOut,a); setState(poOut,p); setState(countOut,c)
    }
    render()
    const observer = new MutationObserver(render)
    ;[alerts, po, pendingText].filter(Boolean).forEach(el => observer.observe(el,{childList:true,subtree:true,characterData:true}))
  }

  function init() {
    setupNavProgress()
    setupConfirmMarks()
    syncDashboardStatus()
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true})
  else init()
})()
