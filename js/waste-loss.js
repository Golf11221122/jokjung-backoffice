import { supabase } from './supabase.js'
import { requireBackoffice, setupShell, money, number, esc } from './auth.js'

const $=id=>document.getElementById(id)
const reasons={spoilage:'ของเสีย / เน่าเสีย',expired:'หมดอายุ',cooking_error:'ทำผิด / ปรุงเสีย',staff_meal:'พนักงานทาน',complimentary:'แจก / Complimentary',damaged:'เสียหาย',quality_reject:'คุณภาพไม่ผ่าน',other:'อื่นๆ'}
let ctx=null,ingredients=[],rows=[],draft=[],current=null

function iso(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function dtext(v){return v?new Date(v+'T00:00:00').toLocaleDateString('th-TH'):'-'}
function msg(t=''){$('message').textContent=t}
function nmsg(t=''){$('newMessage').textContent=t}
function detailMsg(t=''){$('detailMessage').textContent=t}
function statusText(s){return ({pending:'รออนุมัติ',approved:'อนุมัติแล้ว',cancelled:'ยกเลิก',reversed:'Reversed'})[s]||s}

function setupReasons(){
  const opts=Object.entries(reasons).map(([v,t])=>`<option value="${v}">${t}</option>`).join('')
  $('reasonCode').innerHTML=opts
  $('reasonFilter').insertAdjacentHTML('beforeend',opts)
}

async function loadIngredients(){
  const {data,error}=await supabase.rpc('backoffice_list_ingredients_v32')
  if(error){msg(error.message);return}
  ingredients=(data||[]).filter(x=>x.is_active)
  $('ingredientSelect').innerHTML='<option value="">เลือกวัตถุดิบ...</option>'+ingredients.map(x=>`<option value="${x.id}">${esc(x.category_name)} • ${esc(x.name)} (${number(x.current_stock)} ${esc(x.unit)})</option>`).join('')
}

function setMonth(){const n=new Date(),s=new Date(n.getFullYear(),n.getMonth(),1);$('dateFrom').value=iso(s);$('dateTo').value=iso(n);$('eventDate').value=iso(n)}

async function load(){
  msg('กำลังโหลด...')
  const from=$('dateFrom').value,to=$('dateTo').value
  const [listRes,sumRes]=await Promise.all([
    supabase.rpc('backoffice_list_waste_loss_v23',{p_date_from:from,p_date_to:to,p_status:$('statusFilter').value||null,p_reason_code:$('reasonFilter').value||null}),
    supabase.rpc('backoffice_waste_loss_summary_v23',{p_date_from:from,p_date_to:to})
  ])
  if(listRes.error||sumRes.error){msg((listRes.error||sumRes.error).message);return}
  rows=listRes.data||[];renderSummary(sumRes.data||{});renderList();msg('')
}

function renderSummary(x){
  const loss=Number(x.approved_loss_value||0),pct=Number(x.loss_pct_of_sales||0)
  $('wasteKpis').innerHTML=`
    <article class="kpi-card cash-out"><span>Waste / Loss</span><strong>${money(loss)}</strong><small>${Number(x.approved_count||0)} รายการที่อนุมัติ</small></article>
    <article class="kpi-card ${pct<=2?'cash-positive':'cash-negative'}"><span>% ต่อยอดขาย</span><strong>${pct.toFixed(2)}%</strong><small>ยอดขาย ${money(x.sales_revenue)}</small></article>
    <article class="kpi-card"><span>รออนุมัติ</span><strong>${Number(x.pending_count||0).toLocaleString('th-TH')}</strong><small>รายการ</small></article>
    <article class="kpi-card"><span>จำนวนสูญเสียรวม</span><strong>${number(x.approved_total_qty)}</strong><small>หลายหน่วยรวมกัน ใช้ดูแนวโน้มเท่านั้น</small></article>`
}

function renderList(){
  $('rowCount').textContent=`${rows.length} รายการ`
  $('list').innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>เลขที่</th><th>วันที่</th><th>เหตุผล</th><th>สถานะ</th><th class="num">รายการ</th><th class="num">มูลค่า Loss</th><th>ผู้บันทึก</th><th>จัดการ</th></tr></thead><tbody>${rows.map(x=>`<tr><td><strong>${esc(x.event_no)}</strong></td><td>${dtext(x.event_date)}</td><td>${esc(reasons[x.reason_code]||x.reason_code)}</td><td><span class="status-pill ${esc(x.status)}">${esc(statusText(x.status))}</span></td><td class="num">${Number(x.item_count||0).toLocaleString('th-TH')}</td><td class="num"><strong>${money(x.total_loss_value)}</strong></td><td>${esc(x.created_by_name||'-')}</td><td><button class="small-btn" data-open="${x.id}">ดู / จัดการ</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">ยังไม่มี Waste / Loss ในช่วงนี้</div>'
}

function renderDraft(){
  const total=draft.reduce((s,x)=>s+x.quantity*Number(x.unit_cost||0),0)
  $('draftTotal').textContent=money(total)
  $('draftItems').innerHTML=draft.length?`<div class="table-wrap"><table><thead><tr><th>วัตถุดิบ</th><th class="num">Stock ปัจจุบัน</th><th class="num">จำนวน Loss</th><th class="num">Cost/หน่วย</th><th class="num">มูลค่า</th><th></th></tr></thead><tbody>${draft.map(x=>`<tr><td><strong>${esc(x.name)}</strong><br><small>${esc(x.unit)}</small></td><td class="num">${number(x.current_stock)}</td><td class="num">${number(x.quantity)} ${esc(x.unit)}</td><td class="num">${money(x.unit_cost)}</td><td class="num">${money(x.quantity*x.unit_cost)}</td><td><button class="danger-btn tiny" data-remove="${x.id}">ลบ</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">เพิ่มวัตถุดิบที่สูญเสียอย่างน้อย 1 รายการ</div>'
}

function addItem(){
  nmsg('')
  const id=$('ingredientSelect').value,qty=Number($('qtyInput').value||0),ing=ingredients.find(x=>x.id===id)
  if(!ing)return nmsg('กรุณาเลือกวัตถุดิบ')
  if(qty<=0)return nmsg('จำนวนต้องมากกว่า 0')
  if(qty>Number(ing.current_stock||0))return nmsg(`Stock ไม่พอ • คงเหลือ ${number(ing.current_stock)} ${ing.unit}`)
  if(draft.some(x=>x.id===id))return nmsg('วัตถุดิบนี้อยู่ในรายการแล้ว')
  draft.push({id:ing.id,name:ing.name,unit:ing.unit,current_stock:Number(ing.current_stock||0),unit_cost:Number(ing.cost_per_unit||0),quantity:qty})
  $('qtyInput').value='';renderDraft()
}

async function saveDraft(){
  nmsg('')
  if(!draft.length)return nmsg('กรุณาเพิ่มรายการของเสีย')
  const {data,error}=await supabase.rpc('backoffice_create_waste_loss_v23',{
    p_event_date:$('eventDate').value,p_reason_code:$('reasonCode').value,p_note:$('eventNote').value||null,
    p_items:draft.map(x=>({ingredient_id:x.id,quantity:x.quantity}))
  })
  if(error)return nmsg(error.message)
  $('newModal').classList.add('hidden');draft=[];renderDraft();await Promise.all([loadIngredients(),load()]);await openDetail(data)
}

async function openDetail(id){
  const {data,error}=await supabase.rpc('backoffice_get_waste_loss_v23',{p_event_id:id})
  if(error)return msg(error.message)
  current=data
  $('detailTitle').textContent=data.event_no
  $('detailSub').textContent=`${dtext(data.event_date)} • ${reasons[data.reason_code]||data.reason_code} • ${statusText(data.status)}`
  $('detailItems').innerHTML=`<div class="table-wrap"><table><thead><tr><th>วัตถุดิบ</th><th class="num">จำนวน</th><th class="num">Cost/หน่วย</th><th class="num">Loss</th><th class="num">Stock ก่อน</th><th class="num">Stock หลัง</th></tr></thead><tbody>${(data.items||[]).map(x=>`<tr><td><strong>${esc(x.ingredient_name)}</strong><br><small>${esc(x.note||'')}</small></td><td class="num">${number(x.quantity)} ${esc(x.unit)}</td><td class="num">${money(x.unit_cost)}</td><td class="num"><strong>${money(x.loss_value)}</strong></td><td class="num">${x.stock_before==null?'-':number(x.stock_before)}</td><td class="num">${x.stock_after==null?'-':number(x.stock_after)}</td></tr>`).join('')}</tbody></table></div><div class="waste-total"><span>มูลค่ารวม</span><strong>${money(data.total_loss_value)}</strong></div>`
  $('detailAudit').className='finance-note '+(data.status==='approved'?'good':data.status==='pending'?'warn':'')
  $('detailAudit').textContent=data.status==='pending'?'ยังไม่ตัด Stock • รอผู้จัดการ/Admin อนุมัติ':data.status==='approved'?'อนุมัติแล้ว • Stock ถูกตัดและสร้าง Movement ประเภท waste แล้ว':data.status==='reversed'?`Reversed แล้ว • ${data.reversal_reason||''}`:'รายการถูกยกเลิกก่อนตัด Stock'
  $('approveBtn').classList.toggle('hidden',data.status!=='pending')
  $('cancelBtn').classList.toggle('hidden',data.status!=='pending')
  $('reverseBtn').classList.toggle('hidden',!(data.status==='approved'&&ctx.role==='admin'))
  detailMsg('');$('detailModal').classList.remove('hidden')
}

async function approve(){
  if(!current||!confirm(`ยืนยันอนุมัติ ${current.event_no}? ระบบจะตัด Stock จริงทันที`))return
  const {data,error}=await supabase.rpc('backoffice_approve_waste_loss_v23',{p_event_id:current.id})
  if(error)return detailMsg(error.message)
  detailMsg(`สำเร็จ • ตัด Stock ${data.movement_count||0} รายการ • Loss ${money(data.loss_value)}`)
  await Promise.all([loadIngredients(),load()]);await openDetail(current.id)
}

async function cancelEvent(){
  if(!current||!confirm(`ยกเลิก ${current.event_no}? รายการนี้ยังไม่ได้ตัด Stock`))return
  const {error}=await supabase.rpc('backoffice_cancel_waste_loss_v23',{p_event_id:current.id})
  if(error)return detailMsg(error.message)
  await load();await openDetail(current.id)
}

async function reverseEvent(){
  if(!current)return
  const reason=prompt('เหตุผลที่ Reverse (จำเป็น)')
  if(!reason?.trim())return
  if(!confirm('ยืนยัน Reverse? ระบบจะคืนจำนวนกลับเข้า Stock และเก็บ Audit ไว้'))return
  const {error}=await supabase.rpc('backoffice_reverse_waste_loss_v23',{p_event_id:current.id,p_reason:reason.trim()})
  if(error)return detailMsg(error.message)
  await Promise.all([loadIngredients(),load()]);await openDetail(current.id)
}

$('newBtn').onclick=()=>{draft=[];$('eventDate').value=iso(new Date());$('eventNote').value='';$('qtyInput').value='';renderDraft();nmsg('');$('newModal').classList.remove('hidden')}
$('closeNew').onclick=()=> $('newModal').classList.add('hidden')
$('addItemBtn').onclick=addItem
$('saveDraftBtn').onclick=saveDraft
$('draftItems').onclick=e=>{const b=e.target.closest('[data-remove]');if(!b)return;draft=draft.filter(x=>x.id!==b.dataset.remove);renderDraft()}
$('closeDetail').onclick=()=> $('detailModal').classList.add('hidden')
$('approveBtn').onclick=approve;$('cancelBtn').onclick=cancelEvent;$('reverseBtn').onclick=reverseEvent
$('list').onclick=e=>{const b=e.target.closest('[data-open]');if(b)openDetail(b.dataset.open)}
$('refreshBtn').onclick=load
;['dateFrom','dateTo','statusFilter','reasonFilter'].forEach(id=>$(id).onchange=load)

ctx=await requireBackoffice()
if(ctx){setupShell(ctx,'waste-loss');setupReasons();setMonth();await loadIngredients();renderDraft();await load()}
