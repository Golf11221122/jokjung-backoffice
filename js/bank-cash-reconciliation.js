import { supabase } from './supabase.js'
import { requireBackoffice, setupShell, money, esc } from './auth.js'

const $=id=>document.getElementById(id)
let ctx=null,rows=[],current=null

function iso(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function dateText(v){return v?new Date(v+'T00:00:00').toLocaleDateString('th-TH'):'-'}
function msg(t=''){$('message').textContent=t}
function fmsg(t=''){$('formMessage').textContent=t}

function channelText(v){
  return ({
    cash:'เงินสด',
    qr:'QR',
    bank_transfer:'โอนธนาคาร',
    card:'บัตร',
    other:'อื่น ๆ'
  })[v]||v
}

function statusText(v){
  return ({
    pending:'ยังไม่ตรวจ',
    matched:'ตรง',
    short:'ขาด',
    over:'เกิน'
  })[v]||v
}

function setRange(type){
  const end=new Date(),start=new Date()
  if(type==='today'){
    $('dateFrom').value=iso(end)
    $('dateTo').value=iso(end)
  }else{
    start.setDate(end.getDate()-(Number(type)-1))
    $('dateFrom').value=iso(start)
    $('dateTo').value=iso(end)
  }
  load()
}

async function load(){
  const from=$('dateFrom').value,to=$('dateTo').value
  if(!from||!to)return
  msg('กำลังโหลด...')

  const [r,s]=await Promise.all([
    supabase.rpc('backoffice_bank_cash_reconciliation_v21',{
      p_date_from:from,p_date_to:to
    }),
    supabase.rpc('backoffice_bank_cash_reconciliation_summary_v21',{
      p_date_from:from,p_date_to:to
    })
  ])

  if(r.error||s.error){
    msg((r.error||s.error).message)
    return
  }

  rows=r.data||[]
  renderSummary(s.data||{})
  renderRows()
  msg('')
}

function renderSummary(x){
  $('kpis').innerHTML=`
    <article class="kpi-card">
      <span>ยอดตาม POS</span>
      <strong>${money(x.expected_amount)}</strong>
    </article>
    <article class="kpi-card">
      <span>เงินจริงที่บันทึก</span>
      <strong>${money(x.actual_amount)}</strong>
    </article>
    <article class="kpi-card">
      <span>ค่าธรรมเนียม</span>
      <strong>${money(x.fee_amount)}</strong>
    </article>
    <article class="kpi-card ${Math.abs(Number(x.difference_amount||0))<=0.01?'cash-positive':'cash-negative'}">
      <span>ส่วนต่างรวม</span>
      <strong>${money(x.difference_amount)}</strong>
    </article>
    <article class="kpi-card">
      <span>ตรง</span>
      <strong>${Number(x.matched_count||0)}</strong>
    </article>
    <article class="kpi-card">
      <span>ยังไม่ตรวจ / มีส่วนต่าง</span>
      <strong>${Number(x.pending_count||0)+Number(x.difference_count||0)}</strong>
    </article>`
}

function filteredRows(){
  const f=$('statusFilter').value
  return rows.filter(x=>!f||x.status===f)
}

function renderRows(){
  const list=filteredRows()
  $('reconList').innerHTML=list.length?list.map(x=>`
    <article class="bank-recon-card">
      <div class="bank-recon-card-head">
        <div>
          <strong>${channelText(x.payment_channel)}</strong>
          <span>${dateText(x.recon_date)} • ${Number(x.bill_count||0)} บิล</span>
        </div>
        <span class="recon-status ${esc(x.status)}">${statusText(x.status)}</span>
      </div>

      <div class="bank-recon-values">
        <div><span>POS</span><strong>${money(x.expected_amount)}</strong></div>
        <div><span>เงินจริง</span><strong>${x.saved?money(x.actual_amount):'-'}</strong></div>
        <div><span>Fee</span><strong>${x.saved?money(x.fee_amount):'-'}</strong></div>
        <div><span>Diff</span><strong class="${x.status==='matched'?'cash-text-positive':x.saved?'cash-text-negative':''}">${x.saved?money(x.difference_amount):'-'}</strong></div>
      </div>

      ${x.reference_no?`<div class="mini-note">Ref: ${esc(x.reference_no)}</div>`:''}

      <button class="outline-btn bank-recon-open" data-open="${x.recon_date}|${x.payment_channel}">
        ${x.saved?'แก้ไข / ตรวจสอบ':'บันทึกเงินจริง'}
      </button>
    </article>
  `).join(''):'<div class="empty">ไม่พบรายการตามตัวกรอง</div>'
}

function openModal(key){
  const [date,channel]=key.split('|')
  current=rows.find(x=>x.recon_date===date&&x.payment_channel===channel)
  if(!current)return

  $('reconDate').value=date
  $('reconChannel').value=channel
  $('modalTitle').textContent=`กระทบยอด ${channelText(channel)}`
  $('modalSub').textContent=`${dateText(date)} • ${Number(current.bill_count||0)} บิล`
  $('expectedText').textContent=money(current.expected_amount)

  $('actualAmount').value=current.saved?Number(current.actual_amount||0).toFixed(2):Number(current.expected_amount||0).toFixed(2)
  $('feeAmount').value=Number(current.fee_amount||0).toFixed(2)
  $('adjustmentAmount').value=Number(current.adjustment_amount||0).toFixed(2)
  $('referenceNo').value=current.reference_no||''
  $('note').value=current.note||''

  $('actualLabel').textContent=channel==='cash'
    ? 'เงินสดที่นับจริง'
    : 'ยอดเงินเข้าจริง / Bank Credit'

  fmsg('')
  preview()
  $('modal').classList.remove('hidden')
}

function preview(){
  if(!current)return
  const actual=Number($('actualAmount').value||0)
  const fee=Number($('feeAmount').value||0)
  const adj=Number($('adjustmentAmount').value||0)
  const expected=Number(current.expected_amount||0)
  const diff=Math.round((actual+fee+adj-expected+Number.EPSILON)*100)/100

  $('actualPreview').textContent=money(actual)
  $('feePreview').textContent=money(fee)
  $('differencePreview').textContent=money(diff)

  const box=$('resultBox')
  if(Math.abs(diff)<=0.01){
    box.className='bank-recon-result matched'
    box.innerHTML='<strong>✅ ตรงกัน</strong><span>ยอดเงินจริงกระทบกับ POS แล้ว</span>'
  }else if(diff<0){
    box.className='bank-recon-result short'
    box.innerHTML=`<strong>⚠️ ขาด ${money(Math.abs(diff))}</strong><span>ตรวจเงินสด / Bank Credit / Fee / Adjustment</span>`
  }else{
    box.className='bank-recon-result over'
    box.innerHTML=`<strong>⚠️ เกิน ${money(diff)}</strong><span>ตรวจยอดรับเงินจริงและรายการปรับปรุง</span>`
  }
}

async function save(){
  if(!current)return

  const actual=Number($('actualAmount').value||0)
  const fee=Number($('feeAmount').value||0)
  const adj=Number($('adjustmentAmount').value||0)

  if(actual<0)return fmsg('ยอดเงินจริงต้องไม่น้อยกว่า 0')
  if(fee<0)return fmsg('Fee ต้องไม่น้อยกว่า 0')

  $('saveBtn').disabled=true
  const{data,error}=await supabase.rpc(
    'backoffice_save_bank_cash_reconciliation_v21',
    {
      p_recon_date:$('reconDate').value,
      p_payment_channel:$('reconChannel').value,
      p_actual_amount:actual,
      p_fee_amount:fee,
      p_adjustment_amount:adj,
      p_reference_no:$('referenceNo').value.trim()||null,
      p_note:$('note').value.trim()||null
    }
  )
  $('saveBtn').disabled=false

  if(error)return fmsg(error.message)

  fmsg(data.status==='matched'
    ? 'บันทึกสำเร็จ • ยอดตรงกัน'
    : `บันทึกสำเร็จ • ส่วนต่าง ${money(data.difference_amount)}`)

  await load()
  current=rows.find(x=>
    x.recon_date===$('reconDate').value&&
    x.payment_channel===$('reconChannel').value
  )||current
  preview()
}

async function init(){
  ctx=await requireBackoffice()
  if(!ctx)return
  setupShell(ctx,'bank-cash-reconciliation')
  setRange('7')
}

$('refreshBtn').onclick=load
$('dateFrom').onchange=load
$('dateTo').onchange=load
$('statusFilter').onchange=renderRows
$('closeBtn').onclick=()=>$('modal').classList.add('hidden')
$('saveBtn').onclick=save
$('actualAmount').oninput=preview
$('feeAmount').oninput=preview
$('adjustmentAmount').oninput=preview
$('reconList').onclick=e=>{
  const b=e.target.closest('[data-open]')
  if(b)openModal(b.dataset.open)
}
document.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>setRange(b.dataset.range))

init()
