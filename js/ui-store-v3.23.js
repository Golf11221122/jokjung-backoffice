/* =========================================================
   JOKJUNG Back Office V3.23 — Operational UX Consistency
   Visual / interaction feedback only; business logic untouched.
   ========================================================= */
(() => {
  'use strict'

  const state = { dirty:false, pending:new WeakMap(), lastFeedback:'' }
  const ACTION = 'button:not([disabled]),[role="button"]:not([aria-disabled="true"])'

  const tnow = () => new Intl.DateTimeFormat('th-TH',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date())
  const clean = (s) => String(s || '').replace(/\s+/g,' ').trim()
  const labelOf = (el) => clean(el?.getAttribute?.('aria-label') || el?.getAttribute?.('title') || el?.textContent || 'คำสั่ง').slice(0,60)

  function feedbackRoot(){
    let root = document.getElementById('jk23Feedback')
    if(!root){ root=document.createElement('div'); root.id='jk23Feedback'; root.setAttribute('aria-live','polite'); root.setAttribute('aria-atomic','false'); document.body.appendChild(root) }
    return root
  }

  function notify(type='success', title='รับคำสั่งแล้ว', sub='', ttl=2200){
    const signature=`${type}|${title}|${sub}`
    if(state.lastFeedback===signature) return
    state.lastFeedback=signature; setTimeout(()=>{ if(state.lastFeedback===signature) state.lastFeedback='' },500)
    const n=document.createElement('div'); n.className=`jk23-note ${type}`; n.setAttribute('role',type==='error'?'alert':'status')
    const icon=type==='error'?'!':type==='warning'?'!':'✓'
    n.innerHTML=`<div class="jk23-note-icon">${icon}</div><div><div class="jk23-note-title"></div><div class="jk23-note-sub"></div></div><div class="jk23-note-time"></div>`
    n.querySelector('.jk23-note-title').textContent=title
    n.querySelector('.jk23-note-sub').textContent=sub
    n.querySelector('.jk23-note-time').textContent=tnow()
    feedbackRoot().appendChild(n)
    setTimeout(()=>{ n.style.opacity='0';n.style.transform='translateY(6px)';setTimeout(()=>n.remove(),180) },ttl)
  }

  function setupContextBar(){
    const content=document.querySelector('main.content,.content'); if(!content || content.querySelector('.jk23-contextbar')) return
    const title=clean(document.querySelector('.topbar h1,h1')?.textContent || document.title.split('|')[0] || 'Back Office')
    const bar=document.createElement('div'); bar.className='jk23-contextbar'
    bar.innerHTML='<span class="jk23-page"></span><span class="jk23-divider"></span><span class="jk23-dirty-badge">ยังไม่บันทึก</span><span class="jk23-spacer"></span><span class="jk23-sync">พร้อมใช้งาน • <span class="jk23-sync-time"></span></span>'
    bar.querySelector('.jk23-page').textContent=title
    content.prepend(bar)
    const sync=()=>{ document.body.classList.toggle('jk23-offline',!navigator.onLine); const el=bar.querySelector('.jk23-sync-time'); if(el) el.textContent=tnow() }
    sync(); addEventListener('online',sync); addEventListener('offline',sync); setInterval(sync,30000)
  }

  function setDirty(value){ state.dirty=!!value; document.body.classList.toggle('jk23-dirty',state.dirty) }
  function setupDirtyState(){
    document.addEventListener('input',e=>{ if(e.target.matches?.('input,textarea,select') && !e.target.matches('[type="search"]')) setDirty(true) },true)
    document.addEventListener('change',e=>{ if(e.target.matches?.('input,textarea,select')) setDirty(true) },true)
    document.addEventListener('submit',()=>setDirty(false),true)
    document.addEventListener('click',e=>{
      const b=e.target.closest?.('button'); if(!b) return
      const l=labelOf(b)
      if(/บันทึก|save|สร้าง|เพิ่ม|ยืนยัน|submit|อัปเดต|update/i.test(l)) setTimeout(()=>setDirty(false),250)
    },true)
  }

  function setupActionFeedback(){
    document.addEventListener('pointerdown',e=>{
      const el=e.target.closest?.(ACTION); if(!el) return
      el.classList.add('jk23-tapped'); setTimeout(()=>el.classList.remove('jk23-tapped'),150)
      try{ navigator.vibrate?.(8) }catch(_){ }
    },{passive:true,capture:true})

    document.addEventListener('click',e=>{
      const b=e.target.closest?.('button'); if(!b || b.disabled) return
      const label=labelOf(b)
      if(b.matches('.menu-btn,.close-btn,.icon-btn') || /ออกจากระบบ|logout/i.test(label)) return

      b.classList.add('jk23-working'); b.setAttribute('aria-busy','true')
      clearTimeout(state.pending.get(b))
      const timer=setTimeout(()=>{ b.classList.remove('jk23-working'); b.removeAttribute('aria-busy') },1800)
      state.pending.set(b,timer)
      notify('success',`รับคำสั่ง: ${label}`,'ระบบรับการแตะแล้ว กำลังดำเนินการ',1500)
    },true)
  }

  function finishButton(type){
    const candidates=[...document.querySelectorAll('button[aria-busy="true"]')]
    const b=candidates.at(-1); if(!b) return
    clearTimeout(state.pending.get(b)); b.classList.remove('jk23-working'); b.removeAttribute('aria-busy')
    const cls=type==='error'?'jk23-error':'jk23-complete'; b.classList.add(cls); setTimeout(()=>b.classList.remove(cls),900)
  }

  function classify(text){
    if(/error|failed|ผิดพลาด|ล้มเหลว|ไม่สำเร็จ|ไม่สามารถ|denied/i.test(text)) return 'error'
    if(/warning|เตือน|กรุณา|ต้องตรวจ|ไม่ครบ/i.test(text)) return 'warning'
    if(/success|สำเร็จ|เรียบร้อย|บันทึกแล้ว|สร้างแล้ว|อัปเดตแล้ว|ผ่าน/i.test(text)) return 'success'
    return ''
  }

  function setupResultObserver(){
    const seen=new WeakMap()
    const inspect=(el)=>{
      if(!(el instanceof Element)) return
      if(el.closest('#jk23Feedback,#jkStoreToast')) return
      const text=clean(el.textContent); if(!text || text.length>240 || seen.get(el)===text) return
      const type=classify(text); if(!type) return
      seen.set(el,text); finishButton(type)
      notify(type,type==='error'?'ดำเนินการไม่สำเร็จ':type==='warning'?'กรุณาตรวจสอบ':'ดำเนินการสำเร็จ',text.slice(0,120),type==='error'?3200:2400)
    }
    const selector='.message,.alert,.notice,.toast,[id*="message" i],[id*="error" i],[id*="status" i],[class*="message" i],[class*="alert" i]'
    document.querySelectorAll(selector).forEach(inspect)
    new MutationObserver(ms=>{
      for(const m of ms){
        const el=m.target.nodeType===1?m.target:m.target.parentElement
        const target=el?.matches?.(selector)?el:el?.closest?.(selector)
        if(target) inspect(target)
      }
    }).observe(document.body,{subtree:true,childList:true,characterData:true})
  }

  function setupDisabledHints(){
    const apply=()=>document.querySelectorAll('button:disabled').forEach(b=>{
      b.setAttribute('aria-disabled','true'); if(!b.title) b.title='ปุ่มนี้ยังใช้ไม่ได้ในสถานะปัจจุบัน'
    })
    apply(); new MutationObserver(apply).observe(document.body,{subtree:true,attributes:true,attributeFilter:['disabled']})
  }

  function setupForms(){
    document.querySelectorAll('form').forEach(f=>f.setAttribute('novalidate',''))
    document.addEventListener('submit',e=>{
      const f=e.target; if(!(f instanceof HTMLFormElement)) return
      const invalid=[...f.querySelectorAll(':invalid')]
      if(invalid.length){ e.preventDefault(); invalid[0].focus(); notify('warning','ข้อมูลยังไม่ครบ',`กรุณาตรวจสอบ ${invalid.length} ช่องที่จำเป็น`,2600) }
    },true)
  }

  function init(){ feedbackRoot();setupContextBar();setupDirtyState();setupActionFeedback();setupResultObserver();setupDisabledHints();setupForms() }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init()
})()
