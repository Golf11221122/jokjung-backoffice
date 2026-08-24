import { supabase } from './supabase.js'
import { requireBackoffice, setupShell, money, esc } from './auth.js'

const $=id=>document.getElementById(id)
let ctx=null,rows=[],suppliers=[],daily=[],current=null

function isoDate(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function today(){return isoDate(new Date())}
function plusDays(n){const d=new Date();d.setDate(d.getDate()+Number(n));return isoDate(d)}
function dateText(v){return v?new Date(v+'T00:00:00').toLocaleDateString('th-TH'):'-'}
function msg(t=''){$('message').textContent=t}
function pmsg(t=''){$('planMessage').textContent=t}

function urgencyText(v){
  return ({overdue:'เกินกำหนด',today:'วันนี้',due_7:'≤ 7 วัน',due_30:'≤ 30 วัน',future:'อนาคต',no_due_date:'ไม่มี Due'})[v]||v
}

async function loadSuppliers(){
  const{data,error}=await supabase.rpc('backoffice_list_suppliers')
  if(error)throw error
  suppliers=(data||[]).filter(x=>x.is_active!==false)
  $('supplierFilter').innerHTML='<option value="">Supplier ทั้งหมด</option>'+
    suppliers.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')
}

async function loadSummary(){
  const{data,error}=await supabase.rpc('backoffice_payment_forecast_summary_v19')
  if(error)throw error
  const x=data||{}
  $('kpis').innerHTML=`
    <article class="kpi-card"><span>เจ้าหนี้คงค้าง</span><strong>${money(x.open_ap)}</strong></article>
    <article class="kpi-card"><span>เกินกำหนด</span><strong>${money(x.overdue)}</strong></article>
    <article class="kpi-card"><span>ครบกำหนดวันนี้</span><strong>${money(x.due_today)}</strong></article>
    <article class="kpi-card"><span>Due ภายใน 7 วัน</span><strong>${money(x.due_7)}</strong></article>
    <article class="kpi-card"><span>Due ภายใน 30 วัน</span><strong>${money(x.due_30)}</strong></article>
    <article class="kpi-card"><span>วางแผนจ่าย 30 วัน</span><strong>${money(x.planned_30)}</strong></article>`
}

async function loadRows(){
  const days=Number($('windowFilter').value||30)
  const{data,error}=await supabase.rpc('backoffice_payment_forecast_items_v19',{
    p_from:today(),
    p_to:plusDays(days),
    p_supplier_id:$('supplierFilter').value||null
  })
  if(error)return msg(error.message)
  rows=data||[]
  renderTable()
}

async function loadDaily(){
  const{data,error}=await supabase.rpc('backoffice_payment_forecast_daily_v19',{p_days:30})
  if(error)throw error
  daily=data||[]
  renderBars()
}

function renderBars(){
  const max=Math.max(1,...daily.map(x=>Math.max(Number(x.due_amount||0),Number(x.planned_amount||0))))
  const active=daily.filter(x=>Number(x.due_amount)>0||Number(x.planned_amount)>0)

  $('forecastBars').innerHTML=active.length?active.map(x=>{
    const due=Number(x.due_amount||0),plan=Number(x.planned_amount||0)
    return `<div class="forecast-row">
      <div class="forecast-date">${dateText(x.forecast_date)}</div>
      <div class="forecast-track">
        <div class="forecast-line due-line" style="width:${Math.max(due/max*100,due?2:0)}%"><span>Due ${money(due)}</span></div>
        <div class="forecast-line plan-line" style="width:${Math.max(plan/max*100,plan?2:0)}%"><span>Plan ${money(plan)}</span></div>
      </div>
    </div>`
  }).join(''):'<div class="empty">30 วันนี้ยังไม่มียอด Due หรือแผนจ่าย</div>'
}

function filtered(){
  const q=$('search').value.trim().toLowerCase()
  if(!q)return rows
  return rows.filter(x=>[x.internal_no,x.document_no,x.supplier_name,x.po_no].filter(Boolean).join(' ').toLowerCase().includes(q))
}

function renderTable(){
  const list=filtered()
  $('table').innerHTML=list.length?`
  <div class="table-wrap"><table>
  <thead><tr>
  <th>เอกสาร</th><th>Supplier / PO</th><th>Due</th><th class="num">คงค้าง</th>
  <th>Approval</th><th>3-Way</th><th>แผนจ่าย</th><th>จัดการ</th>
  </tr></thead>
  <tbody>${list.map(x=>`
    <tr class="${x.urgency==='overdue'?'ap-overdue-row':''}">
      <td><strong>${esc(x.internal_no)}</strong><div class="mini-note">${esc(x.document_no||'-')}</div></td>
      <td>${esc(x.supplier_name||'-')}<div class="mini-note">${esc(x.po_no||'ไม่มี PO')}</div></td>
      <td><span class="ap-badge ${x.urgency==='overdue'?'overdue':x.urgency==='due_7'?'due':''}">${esc(urgencyText(x.urgency))}</span><div class="mini-note">${dateText(x.due_date)}</div></td>
      <td class="num"><strong>${money(x.balance_due)}</strong></td>
      <td><span class="ap-badge ${esc(x.approval_status)}">${esc(x.approval_status)}</span></td>
      <td><span class="ap-badge ${x.three_way_status==='matched'?'approved':''}">${esc(x.three_way_status)}</span></td>
      <td>${Number(x.planned_amount||0)>0
        ?`<strong>${money(x.planned_amount)}</strong><div class="mini-note">${dateText(x.planned_date)}</div>`
        :'<span class="mini-note">ยังไม่วางแผน</span>'}</td>
      <td><button class="small-btn" data-plan="${x.document_id}">วางแผน</button></td>
    </tr>`).join('')}
  </tbody></table></div>`:'<div class="empty">ไม่มีเจ้าหนี้ในช่วงวันที่นี้</div>'
}

function openPlan(id){
  current=rows.find(x=>x.document_id===id)
  if(!current)return
  $('planDocumentId').value=current.document_id
  $('planSub').textContent=`${current.supplier_name||'-'} • ${current.internal_no}`
  $('planBalance').value=Number(current.balance_due||0).toFixed(2)
  $('planDueDate').value=current.due_date||''
  $('planDate').value=current.planned_date||current.due_date||today()
  $('planAmount').value=Number(current.planned_amount||current.balance_due||0).toFixed(2)
  $('planNote').value=''
  pmsg('')
  $('cancelPlanBtn').disabled=Number(current.planned_amount||0)<=0
  $('planModal').classList.remove('hidden')
}

async function savePlan(){
  if(!current)return
  const amount=Number($('planAmount').value||0)
  if(!$('planDate').value)return pmsg('กรุณาเลือกวันที่วางแผนจ่าย')
  if(amount<=0)return pmsg('ยอดแผนจ่ายต้องมากกว่า 0')
  if(amount>Number(current.balance_due)+0.01)return pmsg('ยอดแผนจ่ายเกินยอดคงค้าง')

  const{error}=await supabase.rpc('backoffice_save_payment_plan_v19',{
    p_document_id:current.document_id,
    p_planned_date:$('planDate').value,
    p_planned_amount:amount,
    p_note:$('planNote').value.trim()||null
  })
  if(error)return pmsg(error.message)

  $('planModal').classList.add('hidden')
  await refreshAll()
}

async function cancelPlan(){
  if(!current||!confirm('ยกเลิกแผนจ่ายของเอกสารนี้?'))return
  const{error}=await supabase.rpc('backoffice_cancel_payment_plan_v19',{p_document_id:current.document_id})
  if(error)return pmsg(error.message)
  $('planModal').classList.add('hidden')
  await refreshAll()
}

async function refreshAll(){
  msg('กำลังโหลด...')
  try{
    await Promise.all([loadSummary(),loadRows(),loadDaily()])
    msg('')
  }catch(e){console.error(e);msg(e.message||'โหลด Payment Forecast ไม่สำเร็จ')}
}

async function init(){
  ctx=await requireBackoffice()
  if(!ctx)return
  setupShell(ctx,'payment-forecast')
  await loadSuppliers()
  await refreshAll()
}

$('refreshBtn').onclick=refreshAll
$('search').oninput=renderTable
$('supplierFilter').onchange=loadRows
$('windowFilter').onchange=loadRows
$('closePlanBtn').onclick=()=>$('planModal').classList.add('hidden')
$('savePlanBtn').onclick=savePlan
$('cancelPlanBtn').onclick=cancelPlan
$('table').onclick=e=>{
  const b=e.target.closest('[data-plan]')
  if(b)openPlan(b.dataset.plan)
}
init()
