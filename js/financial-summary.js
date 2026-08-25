import { supabase } from './supabase.js'
import { requireBackoffice, setupShell, money, esc } from './auth.js'

const $=id=>document.getElementById(id)
let ctx=null

function iso(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function pct(v){return `${Number(v||0).toFixed(2)}%`}
function msg(t=''){$('message').textContent=t}

function setRange(type){
  const end=new Date(),start=new Date()
  if(type==='today'){
    $('dateFrom').value=iso(end)
    $('dateTo').value=iso(end)
  }else if(type==='month'){
    start.setDate(1)
    $('dateFrom').value=iso(start)
    $('dateTo').value=iso(end)
  }else{
    start.setDate(end.getDate()-(Number(type)-1))
    $('dateFrom').value=iso(start)
    $('dateTo').value=iso(end)
  }
  load()
}

function item(label,value,sub=''){
  return `<div class="finance-summary-row"><span>${esc(label)}</span><div><strong>${value}</strong>${sub?`<small>${esc(sub)}</small>`:''}</div></div>`
}

function health(status,text){
  return `<span class="finance-health ${status}">${esc(text)}</span>`
}

async function load(){
  const from=$('dateFrom').value,to=$('dateTo').value
  if(!from||!to)return
  msg('กำลังรวมข้อมูลการเงิน...')

  const [pnlRes,cashRes,apRes,forecastRes,reconRes,wasteRes]=await Promise.all([
    supabase.rpc('backoffice_pnl_v2',{p_date_from:from,p_date_to:to}),
    supabase.rpc('backoffice_cash_flow_summary_v20',{p_date_from:from,p_date_to:to}),
    supabase.rpc('backoffice_accounts_payable_summary_v17'),
    supabase.rpc('backoffice_payment_forecast_summary_v19'),
    supabase.rpc('backoffice_bank_cash_reconciliation_v21',{p_date_from:from,p_date_to:to}),
    supabase.rpc('backoffice_waste_loss_summary_v23',{p_date_from:from,p_date_to:to})
  ])

  const err=pnlRes.error||cashRes.error||apRes.error||forecastRes.error||reconRes.error||wasteRes.error
  if(err){msg(err.message);return}

  const pnl=pnlRes.data||{}
  const cash=cashRes.data||{}
  const ap=apRes.data||{}
  const forecast=forecastRes.data||{}
  const recon=Array.isArray(reconRes.data)?reconRes.data:[]
  const waste=wasteRes.data||{}

  renderHeadline(pnl,cash,ap,recon,waste)
  renderProfitability(pnl)
  renderCash(cash,forecast)
  renderAp(ap,forecast)
  renderRecon(recon)
  renderWaste(waste)
  renderAlerts(pnl,cash,ap,recon,waste)
  msg('')
}

function renderHeadline(pnl,cash,ap,recon,waste){
  const matched=recon.filter(x=>x.status==='matched').length
  const pending=recon.filter(x=>x.status==='pending').length
  const diff=recon.filter(x=>['short','over'].includes(x.status)).length
  const op=Number(pnl.operating_profit||0)
  const net=Number(cash.actual_net_cash_flow||0)

  $('headlineKpis').innerHTML=`
    <article class="kpi-card"><span>Revenue</span><strong>${money(pnl.revenue)}</strong><small>${Number(pnl.bills||0).toLocaleString('th-TH')} บิล</small></article>
    <article class="kpi-card ${op>=0?'cash-positive':'cash-negative'}"><span>Operating Profit</span><strong>${money(op)}</strong><small>Margin ${pct(pnl.operating_margin_pct)}</small></article>
    <article class="kpi-card ${net>=0?'cash-positive':'cash-negative'}"><span>Actual Net Cash Flow</span><strong>${money(net)}</strong></article>
    <article class="kpi-card"><span>AP คงค้าง</span><strong>${money(ap.open_balance)}</strong><small>Overdue ${money(ap.overdue_balance)}</small></article>
    <article class="kpi-card"><span>Bank/Cash Recon</span><strong>${matched}/${recon.length}</strong><small>Pending ${pending} • Difference ${diff}</small></article>
    <article class="kpi-card ${Number(waste.loss_pct_of_sales||0)<=2?'cash-positive':'cash-negative'}"><span>Waste / Loss</span><strong>${money(waste.approved_loss_value)}</strong><small>${Number(waste.loss_pct_of_sales||0).toFixed(2)}% ของยอดขาย</small></article>
  `
}

function renderProfitability(p){
  const actualCogs=p.actual_control_cogs
  $('profitability').innerHTML=
    item('Revenue',money(p.revenue))+
    item('Theoretical COGS',money(p.theoretical_cogs),`Food Cost ${pct(p.theoretical_food_cost_pct)}`)+
    item('Gross Profit',money(p.gross_profit),`Margin ${pct(p.gross_margin_pct)}`)+
    item('Operating Expenses',money(p.operating_expenses))+
    item('Operating Profit',money(p.operating_profit),`Margin ${pct(p.operating_margin_pct)}`)+
    (actualCogs==null
      ? `<div class="finance-note warn">ยังไม่มี Actual COGS ครบช่วง จึงใช้ Theoretical COGS</div>`
      : item('Actual Control COGS',money(actualCogs),`Food Cost ${pct(p.actual_food_cost_pct)}`))
}

function renderCash(c,f){
  $('cashFlow').innerHTML=
    item('Sales Inflow',money(c.sales_inflow),`Cash ${money(c.cash_sales)} • QR ${money(c.qr_sales)}`)+
    item('Operating Expenses',money(c.operating_expenses))+
    item('Supplier Payments',money(c.supplier_payments))+
    item('Actual Net',money(c.actual_net_cash_flow))+
    item('Planned Supplier Payments',money(c.planned_supplier_payments))+
    item('Net หลัง Plan',money(c.projected_net_after_plans))
}

function renderAp(a,f){
  $('apSummary').innerHTML=
    item('เจ้าหนี้คงค้าง',money(a.open_balance))+
    item('เกินกำหนด',money(a.overdue_balance),`${Number(a.overdue_count||0)} เอกสาร`)+
    item('Due ≤ 7 วัน',money(a.due_7_balance))+
    item('Due ≤ 30 วัน',money(a.due_30_balance))+
    item('อนุมัติรอจ่าย',money(a.approved_open_balance))+
    item('แผนจ่าย 30 วัน',money(f.planned_30))
}

function renderRecon(rows){
  const matched=rows.filter(x=>x.status==='matched')
  const pending=rows.filter(x=>x.status==='pending')
  const diff=rows.filter(x=>['short','over'].includes(x.status))
  const totalDiff=diff.reduce((s,x)=>s+Number(x.difference_amount||0),0)

  $('reconSummary').innerHTML=
    item('รายการที่ตรวจแล้วตรง',`${matched.length} รายการ`)+
    item('รอตรวจ',`${pending.length} รายการ`)+
    item('มีส่วนต่าง',`${diff.length} รายการ`)+
    item('ส่วนต่างสุทธิ',money(totalDiff))+
    (diff.length===0&&pending.length===0
      ? `<div class="finance-note good">✅ กระทบยอดทั้งหมดในช่วงนี้เรียบร้อย</div>`
      : `<div class="finance-note warn">⚠️ ยังมีรายการที่ควรตรวจสอบ</div>`)
}


function renderWaste(w){
  const pct=Number(w.loss_pct_of_sales||0)
  $('wasteSummary').innerHTML=
    item('Waste / Loss ที่อนุมัติ',money(w.approved_loss_value),`${Number(w.approved_count||0)} รายการ`)+
    item('% ต่อยอดขาย',`${pct.toFixed(2)}%`,`ยอดขาย ${money(w.sales_revenue)}`)+
    item('รออนุมัติ',`${Number(w.pending_count||0)} รายการ`)+
    (pct>2?`<div class="finance-note warn">⚠️ Waste มากกว่า 2% ของยอดขาย ควรตรวจสาเหตุ</div>`:`<div class="finance-note good">✅ Waste อยู่ไม่เกิน 2% ของยอดขาย</div>`)
}

function renderAlerts(p,c,a,recon,waste){
  const alerts=[]

  if(Number(a.overdue_balance||0)>0)
    alerts.push({level:'danger',title:'เจ้าหนี้เกินกำหนด',detail:`${money(a.overdue_balance)} • ${Number(a.overdue_count||0)} เอกสาร`,href:'./accounts-payable.html'})

  const diff=recon.filter(x=>['short','over'].includes(x.status))
  if(diff.length)
    alerts.push({level:'danger',title:'Bank/Cash มีส่วนต่าง',detail:`${diff.length} รายการ`,href:'./bank-cash-reconciliation.html'})

  const pending=recon.filter(x=>x.status==='pending')
  if(pending.length)
    alerts.push({level:'warn',title:'Bank/Cash ยังไม่กระทบยอด',detail:`${pending.length} รายการ`,href:'./bank-cash-reconciliation.html'})

  if(Number(c.actual_net_cash_flow||0)<0)
    alerts.push({level:'warn',title:'Net Cash Flow ติดลบ',detail:money(c.actual_net_cash_flow),href:'./cash-flow.html'})

  if(Number(p.operating_profit||0)<0)
    alerts.push({level:'warn',title:'Operating Profit ติดลบ',detail:money(p.operating_profit),href:'./pnl.html'})

  if(Number(waste.pending_count||0)>0)
    alerts.push({level:'warn',title:'Waste / Loss รออนุมัติ',detail:`${Number(waste.pending_count||0)} รายการ`,href:'../stock/waste-loss.html'})

  if(Number(waste.loss_pct_of_sales||0)>2)
    alerts.push({level:'warn',title:'Waste / Loss สูงกว่า 2% ของยอดขาย',detail:`${Number(waste.loss_pct_of_sales||0).toFixed(2)}% • ${money(waste.approved_loss_value)}`,href:'../stock/waste-loss.html'})

  if(p.actual_control_cogs==null)
    alerts.push({level:'info',title:'Actual COGS ยังไม่ครบช่วง',detail:'P&L ยังใช้ Theoretical COGS',href:'./pnl.html'})

  $('alertCount').textContent=`${alerts.length} รายการ`
  $('alertsList').innerHTML=alerts.length?alerts.map(x=>`
    <a class="finance-alert ${x.level}" href="${x.href}">
      <div><strong>${esc(x.title)}</strong><small>${esc(x.detail)}</small></div>
      <span>เปิดดู →</span>
    </a>`).join(''):'<div class="finance-note good">✅ ไม่มีรายการการเงินที่ต้องแจ้งเตือนในช่วงนี้</div>'
}

async function init(){
  ctx=await requireBackoffice()
  if(!ctx)return
  setupShell(ctx,'financial-summary')
  setRange('month')
}

$('refreshBtn').onclick=load
$('dateFrom').onchange=load
$('dateTo').onchange=load
document.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>setRange(b.dataset.range))
init()
