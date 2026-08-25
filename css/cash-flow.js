import { supabase } from './supabase.js'
import { requireBackoffice, setupShell, money, esc } from './auth.js'

const $=id=>document.getElementById(id)
let ctx=null,daily=[],outflows=[]

function iso(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function dateText(v){return v?new Date(v+'T00:00:00').toLocaleDateString('th-TH'):'-'}
function msg(t=''){$('message').textContent=t}

function setRange(days){
  const end=new Date(),start=new Date()
  start.setDate(end.getDate()-Number(days))
  $('dateFrom').value=iso(start)
  $('dateTo').value=iso(end)
  load()
}

async function load(){
  const from=$('dateFrom').value,to=$('dateTo').value
  if(!from||!to)return
  msg('กำลังโหลด...')
  const [s,d,o]=await Promise.all([
    supabase.rpc('backoffice_cash_flow_summary_v20',{p_date_from:from,p_date_to:to}),
    supabase.rpc('backoffice_cash_flow_daily_v20',{p_date_from:from,p_date_to:to}),
    supabase.rpc('backoffice_cash_flow_outflows_v20',{p_date_from:from,p_date_to:to})
  ])
  if(s.error||d.error||o.error){msg((s.error||d.error||o.error).message);return}
  daily=d.data||[]
  outflows=o.data||[]
  renderSummary(s.data||{})
  renderDaily()
  renderOutflows()
  msg('')
}

function renderSummary(x){
  const actual=Number(x.actual_net_cash_flow||0),projected=Number(x.projected_net_after_plans||0)
  $('kpis').innerHTML=`
    <article class="kpi-card cash-in"><span>เงินเข้าจากยอดขาย</span><strong>${money(x.sales_inflow)}</strong><small>Cash ${money(x.cash_sales)} • QR ${money(x.qr_sales)}</small></article>
    <article class="kpi-card cash-out"><span>ค่าใช้จ่ายดำเนินงาน</span><strong>${money(x.operating_expenses)}</strong></article>
    <article class="kpi-card cash-out"><span>จ่าย Supplier จริง</span><strong>${money(x.supplier_payments)}</strong></article>
    <article class="kpi-card ${actual>=0?'cash-positive':'cash-negative'}"><span>Net Cash Flow จริง</span><strong>${money(actual)}</strong></article>
    <article class="kpi-card cash-plan"><span>แผนจ่าย Supplier</span><strong>${money(x.planned_supplier_payments)}</strong><small>Approved plans</small></article>
    <article class="kpi-card ${projected>=0?'cash-positive':'cash-negative'}"><span>Net หลังแผนจ่าย</span><strong>${money(projected)}</strong><small>ไม่ใช่ยอดเงินคงเหลือบัญชี</small></article>`
}

function renderDaily(){
  $('dayCount').textContent=`${daily.length} วัน`
  const max=Math.max(1,...daily.map(x=>Math.max(Number(x.sales_inflow||0),Number(x.actual_outflow||0),Number(x.planned_supplier_payments||0))))
  const active=daily.filter(x=>Number(x.sales_inflow)||Number(x.actual_outflow)||Number(x.planned_supplier_payments))
  $('dailyChart').innerHTML=active.length?active.map(x=>{
    const sales=Number(x.sales_inflow||0),out=Number(x.actual_outflow||0),plan=Number(x.planned_supplier_payments||0)
    const w=v=>Math.max(v/max*100,v?2:0)
    return `<div class="cashflow-chart-row"><div class="cashflow-date">${dateText(x.flow_date)}</div><div class="cashflow-tracks">
      <div class="cashflow-bar inflow" style="width:${w(sales)}%"><span>เข้า ${money(sales)}</span></div>
      <div class="cashflow-bar outflow" style="width:${w(out)}%"><span>ออก ${money(out)}</span></div>
      <div class="cashflow-bar planned" style="width:${w(plan)}%"><span>Plan ${money(plan)}</span></div>
    </div></div>`
  }).join(''):'<div class="empty">ช่วงนี้ยังไม่มี Cash Flow</div>'

  $('dailyTable').innerHTML=daily.length?`<div class="table-wrap"><table>
  <thead><tr><th>วันที่</th><th class="num">Sales In</th><th class="num">ค่าใช้จ่าย</th><th class="num">Supplier Paid</th><th class="num">Actual Net</th><th class="num">Planned</th><th class="num">Net หลัง Plan</th></tr></thead>
  <tbody>${daily.map(x=>`<tr><td>${dateText(x.flow_date)}</td><td class="num">${money(x.sales_inflow)}</td><td class="num">${money(x.operating_expenses)}</td><td class="num">${money(x.supplier_payments)}</td><td class="num ${Number(x.actual_net)>=0?'cash-text-positive':'cash-text-negative'}"><strong>${money(x.actual_net)}</strong></td><td class="num">${money(x.planned_supplier_payments)}</td><td class="num ${Number(x.projected_net)>=0?'cash-text-positive':'cash-text-negative'}"><strong>${money(x.projected_net)}</strong></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">ไม่มีข้อมูล</div>'
}

function renderOutflows(){
  $('outflowCount').textContent=`${outflows.length} รายการ`
  $('outflowTable').innerHTML=outflows.length?`<div class="table-wrap"><table>
  <thead><tr><th>วันที่</th><th>ประเภท</th><th>รายละเอียด</th><th>คู่ค้า/หมวด</th><th>วิธีจ่าย</th><th>Ref</th><th class="num">จำนวน</th></tr></thead>
  <tbody>${outflows.map(x=>`<tr><td>${dateText(x.flow_date)}</td><td><span class="ap-badge">${x.flow_type==='supplier_payment'?'Supplier Payment':'Operating Expense'}</span></td><td>${esc(x.description||'-')}</td><td>${esc(x.counterparty||'-')}</td><td>${esc(x.payment_method||'-')}</td><td>${esc(x.reference_no||'-')}</td><td class="num">${money(x.amount)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">ไม่มีรายการเงินออก</div>'
}

async function init(){
  ctx=await requireBackoffice()
  if(!ctx)return
  setupShell(ctx,'cash-flow')
  setRange(29)
}

$('refreshBtn').onclick=load
$('dateFrom').onchange=load
$('dateTo').onchange=load
document.querySelectorAll('[data-days]').forEach(b=>b.onclick=()=>setRange(b.dataset.days))
init()
