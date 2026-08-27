/* =========================================================
   JOKJUNG BACK OFFICE V3.21 — STORE OPERATIONS UX
   Visual / interaction feedback only. Does not change business logic.
   ========================================================= */
(() => {
  'use strict'

  const CLICKABLE = 'button:not([disabled]),a.quick-link,a.nav-link,[role="button"]:not([aria-disabled="true"])'
  let toastTimer = 0

  function nowTime(){ return new Intl.DateTimeFormat('th-TH',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date()) }
  function dateText(){ return new Intl.DateTimeFormat('th-TH',{weekday:'short',day:'numeric',month:'short',year:'numeric'}).format(new Date()) }

  function cleanLabel(el){
    const source = el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || 'คำสั่ง'
    return String(source).replace(/\s+/g,' ').replace(/[☰×✕＋+↻←→📤🖨️🔒✅✨💸↩️📊🧾📈📅💵🏦🧪🛠🔄📦🗂️🗑️🍳🏭🧮🚚🛒]/g,'').trim().slice(0,52) || 'คำสั่ง'
  }

  function ensureToast(){
    let el=document.getElementById('jkStoreToast')
    if(el) return el
    el=document.createElement('div'); el.id='jkStoreToast'; el.setAttribute('role','status'); el.setAttribute('aria-live','polite')
    el.innerHTML='<div class="jk-toast-icon">✓</div><div><div class="jk-toast-title">รับคำสั่งแล้ว</div><div class="jk-toast-sub">ระบบกำลังดำเนินการ</div></div><div class="jk-toast-time"></div>'
    document.body.appendChild(el); return el
  }

  function toast(type,title,sub,duration=1700){
    const el=ensureToast(); el.className=type||''
    el.querySelector('.jk-toast-icon').textContent=type==='error'?'!':type==='warning'?'!':'✓'
    el.querySelector('.jk-toast-title').textContent=title
    el.querySelector('.jk-toast-sub').textContent=sub||''
    el.querySelector('.jk-toast-time').textContent=nowTime()
    clearTimeout(toastTimer); el.classList.add('show'); toastTimer=setTimeout(()=>el.classList.remove('show'),duration)
  }

  function quiet(el){ return el.matches('.menu-btn,.close-btn,.icon-btn,.tab,.nav-link') || /cancel|close/i.test(el.id||'') }

  function setupOpsBar(){
    const main=document.querySelector('.content'); if(!main || document.querySelector('.jk-opsbar')) return
    const bar=document.createElement('div'); bar.className='jk-opsbar'; bar.setAttribute('aria-label','สถานะระบบ')
    bar.innerHTML=`<span class="jk-ops-chip"><span class="jk-status-dot" id="jkNetDot"></span><strong id="jkNetText">ออนไลน์</strong></span><span class="jk-ops-chip">วันที่ <strong id="jkDateText"></strong></span><span class="jk-ops-chip">เวลา <strong id="jkClock"></strong></span><span class="jk-ops-spacer"></span><span class="jk-ops-chip">JOKJUNG Back Office</span>`
    main.prepend(bar)
    const tick=()=>{ const c=document.getElementById('jkClock'),d=document.getElementById('jkDateText'); if(c)c.textContent=nowTime(); if(d)d.textContent=dateText() }
    tick(); setInterval(tick,1000)
    updateNet(); addEventListener('online',updateNet); addEventListener('offline',updateNet)
  }
  function updateNet(){
    const dot=document.getElementById('jkNetDot'),txt=document.getElementById('jkNetText'); if(!dot||!txt)return
    const ok=navigator.onLine; dot.classList.toggle('offline',!ok); txt.textContent=ok?'ออนไลน์':'ออฟไลน์'
  }

  function markDisabled(){
    document.querySelectorAll('button:disabled').forEach(b=>{b.setAttribute('aria-disabled','true');if(!b.title)b.title='ยังไม่พร้อมใช้งานในสถานะปัจจุบัน'})
  }

  function setupButtonFeedback(){
    document.addEventListener('pointerdown',e=>{ const el=e.target.closest?.(CLICKABLE); if(!el)return; el.classList.add('jk-pressed'); setTimeout(()=>el.classList.remove('jk-pressed'),150) },{passive:true})
    document.addEventListener('click',e=>{
      const el=e.target.closest?.(CLICKABLE); if(!el)return
      el.classList.remove('jk-action-pulse'); void el.offsetWidth; el.classList.add('jk-action-pulse'); setTimeout(()=>el.classList.remove('jk-action-pulse'),360)
      if(el.tagName==='BUTTON') el.dataset.jkLastClick=String(Date.now())
      if(!quiet(el)) toast('success',`รับคำสั่ง: ${cleanLabel(el)}`,'กดปุ่มแล้ว • รอผลการทำงาน')
    },true)
  }

  function setupBusyObserver(){
    const obs=new MutationObserver(ms=>{
      for(const m of ms){
        if(m.type==='attributes' && m.target instanceof HTMLButtonElement){
          const b=m.target
          if(b.disabled && b.dataset.jkLastClick && Date.now()-Number(b.dataset.jkLastClick)<3000) b.setAttribute('aria-busy','true')
          if(!b.disabled){ b.removeAttribute('aria-busy'); delete b.dataset.jkLastClick }
        }
      }
      markDisabled()
    })
    obs.observe(document.body,{subtree:true,attributes:true,attributeFilter:['disabled']})
  }

  function setupMessageObserver(){
    const targets=[...document.querySelectorAll('.message,[id*="message" i],[id*="error" i],[id*="status" i]')]
    const seen=new WeakMap()
    const inspect=el=>{
      const t=(el.textContent||'').trim(); if(!t || seen.get(el)===t) return; seen.set(el,t)
      if(/error|failed|ผิดพลาด|ไม่สำเร็จ|ไม่ได้|ล้มเหลว/i.test(t)) toast('error','ดำเนินการไม่สำเร็จ',t.slice(0,90),2600)
      else if(/success|สำเร็จ|บันทึกแล้ว|เรียบร้อย|ผ่าน/i.test(t)) toast('success','ดำเนินการสำเร็จ',t.slice(0,90),2200)
      else if(/เตือน|warning|กรุณา|ต้อง/i.test(t)) toast('warning','ตรวจสอบข้อมูล',t.slice(0,90),2300)
    }
    const mo=new MutationObserver(ms=>ms.forEach(m=>inspect(m.target.nodeType===1?m.target:m.target.parentElement)))
    targets.forEach(el=>mo.observe(el,{childList:true,subtree:true,characterData:true}))
  }

  function setupSidebar(){
    const sidebar=document.getElementById('sidebar'), btn=document.getElementById('menuBtn'); if(!sidebar)return
    let scrim=document.querySelector('.jk-sidebar-scrim'); if(!scrim){scrim=document.createElement('div');scrim.className='jk-sidebar-scrim';document.body.appendChild(scrim)}
    const sync=()=>{const open=sidebar.classList.contains('open');document.body.classList.toggle('sidebar-open',open);scrim.style.display=open&&innerWidth<=900?'block':''}
    btn?.addEventListener('click',()=>setTimeout(sync,0)); scrim.addEventListener('click',()=>{sidebar.classList.remove('open');sync()})
    addEventListener('resize',sync)
  }

  function normalizeButtons(){
    document.querySelectorAll('button:not([type])').forEach(b=>{ if(!b.closest('form')) b.type='button' })
    document.querySelectorAll('button').forEach(b=>{ if(!b.getAttribute('aria-label') && !(b.textContent||'').trim()) b.setAttribute('aria-label','ปุ่มคำสั่ง') })
  }

  function init(){ ensureToast();setupOpsBar();normalizeButtons();markDisabled();setupButtonFeedback();setupBusyObserver();setupMessageObserver();setupSidebar() }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init()
})()
