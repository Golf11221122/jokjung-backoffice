import { supabase } from './supabase.js'
import { requireBackoffice, setupShell, money, esc } from './auth.js'
const $=id=>document.getElementById(id)
const localDate=d=>{const x=new Date(d),y=x.getFullYear(),m=String(x.getMonth()+1).padStart(2,'0'),day=String(x.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}
const pct=v=>`${Number(v||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})}%`
async function load(){
  $('message').textContent='กำลังคำนวณ...'
  const {data,error}=await supabase.rpc('backoffice_pnl_v1',{p_date_from:$('dateFrom').value,p_date_to:$('dateTo').value})
  if(error){console.error(error);$('message').textContent=error.message;return}
  const d=data||{}
  $('revenue').textContent=money(d.revenue);$('bills').textContent=`${Number(d.bills||0).toLocaleString('th-TH')} บิล`
  $('cogs').textContent=money(d.cogs)
  const cogsPct=Number(d.revenue||0)?Number(d.cogs||0)/Number(d.revenue)*100:0
  $('cogsPct').textContent=`${pct(cogsPct)} ของยอดขาย`
  $('grossProfit').textContent=money(d.gross_profit);$('grossMargin').textContent=`Gross Margin ${pct(d.gross_margin_pct)}`
  $('operatingProfit').textContent=money(d.operating_profit);$('operatingMargin').textContent=`Operating Margin ${pct(d.operating_margin_pct)}`
  $('opCard').classList.toggle('loss',Number(d.operating_profit||0)<0);$('opCard').classList.toggle('profit',Number(d.operating_profit||0)>=0)
  $('sRevenue').textContent=money(d.revenue);$('sCogs').textContent=`(${money(d.cogs)})`;$('sGross').textContent=money(d.gross_profit)
  $('sExpenses').textContent=`(${money(d.operating_expenses)})`;$('sOperating').textContent=money(d.operating_profit)
  $('periodText').textContent=`${new Date(d.date_from+'T00:00:00').toLocaleDateString('th-TH')} - ${new Date(d.date_to+'T00:00:00').toLocaleDateString('th-TH')}`
  $('expenseRows').innerHTML=(d.expense_breakdown||[]).map(x=>`<div class="statement-row indent"><span>${esc(x.category_name)}</span><span class="num">(${money(x.amount)})</span></div>`).join('')
  $('message').textContent=''
}
function setToday(){const t=localDate(new Date());$('dateFrom').value=t;$('dateTo').value=t;load()}
function setMonth(){const t=new Date();$('dateFrom').value=`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-01`;$('dateTo').value=localDate(t);load()}
$('loadBtn').onclick=load;$('todayBtn').onclick=setToday;$('monthBtn').onclick=setMonth
const ctx=await requireBackoffice()
if(ctx){setupShell(ctx,'pnl');setMonth()}
