/* =========================================================
   JOKJUNG BACK OFFICE — INTERACTION FEEDBACK V3.20
   Gives every clickable control immediate visual acknowledgement.
   Does not replace existing business logic.
   ========================================================= */
(() => {
  'use strict'

  const ACTION_SELECTOR = [
    'button:not([disabled])',
    'a.quick-link',
    'a.nav-link',
    '[role="button"]:not([aria-disabled="true"])'
  ].join(',')

  let toastTimer = 0

  function ensureToast() {
    let el = document.getElementById('jkActionToast')
    if (el) return el

    el = document.createElement('div')
    el.id = 'jkActionToast'
    el.setAttribute('role', 'status')
    el.setAttribute('aria-live', 'polite')
    el.innerHTML = '<span class="jk-toast-dot"></span><span class="jk-toast-text">รับคำสั่งแล้ว</span>'
    document.body.appendChild(el)
    return el
  }

  function controlLabel(el) {
    const aria = el.getAttribute('aria-label')
    if (aria) return aria.trim()

    const title = el.getAttribute('title')
    if (title) return title.trim()

    return String(el.textContent || '')
      .replace(/\s+/g, ' ')
      .replace(/[✓✔︎☰×✕＋+↻←→📤🖨️🔒✅✨💸↩️]/g, '')
      .trim()
      .slice(0, 54)
  }

  function isQuietControl(el) {
    return Boolean(
      el.matches('.menu-btn,.close-btn,.icon-btn,.tab') ||
      el.id === 'menuBtn' ||
      /^close/i.test(el.id || '') ||
      /^cancel/i.test(el.id || '')
    )
  }

  function showAcknowledgement(el) {
    el.classList.remove('jk-clicked')
    void el.offsetWidth
    el.classList.add('jk-clicked')
    window.setTimeout(() => el.classList.remove('jk-clicked'), 720)

    if (isQuietControl(el)) return

    const toast = ensureToast()
    const text = toast.querySelector('.jk-toast-text')
    const label = controlLabel(el)
    text.textContent = label ? `กดแล้ว • ${label}` : 'กดแล้ว • รับคำสั่งแล้ว'

    window.clearTimeout(toastTimer)
    toast.classList.add('show')
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 1200)
  }

  function markDisabledControls() {
    document.querySelectorAll('button:disabled').forEach(btn => {
      if (!btn.getAttribute('title')) btn.setAttribute('title', 'ปุ่มนี้ยังไม่พร้อมใช้งานในสถานะปัจจุบัน')
      btn.setAttribute('aria-disabled', 'true')
    })
  }

  function setupSidebarScrim() {
    if (!document.getElementById('sidebar')) return
    if (document.querySelector('.jk-sidebar-scrim')) return

    const scrim = document.createElement('div')
    scrim.className = 'jk-sidebar-scrim'
    scrim.setAttribute('aria-hidden', 'true')
    document.body.appendChild(scrim)

    scrim.addEventListener('click', () => {
      document.getElementById('sidebar')?.classList.remove('open')
      document.body.classList.remove('sidebar-open')
    })
  }

  document.addEventListener('pointerdown', event => {
    const el = event.target.closest?.(ACTION_SELECTOR)
    if (!el) return
    el.classList.add('jk-pressed')
    window.setTimeout(() => el.classList.remove('jk-pressed'), 180)
  }, { passive: true })

  document.addEventListener('click', event => {
    const el = event.target.closest?.(ACTION_SELECTOR)
    if (!el) return
    showAcknowledgement(el)
  }, true)

  // If existing page logic disables a control while awaiting Supabase,
  // show the spinner without changing the button's label.
  const observer = new MutationObserver(mutations => {
    for (const m of mutations) {
      if (m.type !== 'attributes') continue
      const el = m.target
      if (!(el instanceof HTMLButtonElement)) continue

      if (el.disabled && el.dataset.jkClicked === '1') {
        el.setAttribute('aria-busy', 'true')
      } else if (!el.disabled) {
        el.removeAttribute('aria-busy')
        delete el.dataset.jkClicked
      }
    }
    markDisabledControls()
  })

  document.addEventListener('click', event => {
    const btn = event.target.closest?.('button:not([disabled])')
    if (btn) btn.dataset.jkClicked = '1'
  }, true)

  function init() {
    ensureToast()
    setupSidebarScrim()
    markDisabledControls()
    observer.observe(document.body, { subtree:true, attributes:true, attributeFilter:['disabled'] })

    // Improve semantics for buttons missing a type to avoid accidental form submit.
    document.querySelectorAll('button:not([type])').forEach(btn => {
      if (!btn.closest('form')) btn.type = 'button'
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once:true })
  } else {
    init()
  }
})()
