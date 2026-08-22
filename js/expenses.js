import { supabase } from './supabase.js'
import { requireBackoffice, setupShell, money, esc } from './auth.js'

let categories=[]
const $=id=>document.getElementById(id)
const localDate=d=>{const x=new Date(d),y=x.getFullYear(),m=String(x.getMonth()+1).padStart(2,'0'),day=String(x.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}

async function load(){
  $('message').textContent=''
  const {data,error}=await supabase.rpc('backoffice_expense_list',{
    p_date_from:$('dateFrom').value,p_date_to:$('dateTo').value,
    p_category_id:$('categoryFilter').value||null,p_include_void:$('includeVoid').checked
  })
  if(error){$('message').textContent=error.message;return}
  categories=data?.categories||[]
  renderCategories()
  $('totalAmount').textContent=money(data?.summary?.active_amount)
  $('totalCount').textContent=`${Number(data?.summary?.active_count||0).toLocaleString('th-TH')} รายการ`
  const rows=data?.items||[]
  $('table').innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>วันที่</th><th>หมวด</th><th>รายละเอียด</th><th>อ้างอิง</th><th>ผู้บันทึก</th><th>สถานะ</th><th class="num">จำนวนเงิน</th><th></th></tr></thead><tbody>${rows.map(x=>`<tr><td>${new Date(x.expense_date+'T00:00:00').toLocaleDateString('th-TH')}</td><td>${esc(x.category_name)}</td><td>${esc(x.description||'-')}</td><td>${esc(x.reference_no||'-')}</td><td>${esc(x.created_by_name||'-')}</td><td>${x.status==='active'?'<span class="badge ok">ปกติ</span>':'<span class="badge out">ยกเลิก</span>'}</td><td class="num"><strong>${money(x.amount)}</strong></td><td>${x.status==='active'?`<button class="outline-btn void-btn" data-id="${x.id}">ยกเลิก</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">ยังไม่มีค่าใช้จ่ายในช่วงนี้</div>'
  document.querySelectorAll('.void-btn').forEach(b=>b.onclick=()=>voidExpense(b.dataset.id))
}
function renderCategories(){
  const current=$('categoryFilter').value
  $('categoryFilter').innerHTML='<option value="">ทุกหมวด</option>'+categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')
  $('categoryFilter').value=current
  $('categoryId').innerHTML=categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')
}
async function save(){
  const amount=Number($('amount').value)
  if(!$('categoryId').value||!amount||amount<=0){alert('กรุณาเลือกหมวดและระบุจำนวนเงิน');return}
  $('saveBtn').disabled=true
  const {error}=await supabase.rpc('backoffice_expense_save',{
    p_expense_date:$('expenseDate').value,p_category_id:$('categoryId').value,p_amount:amount,
    p_description:$('description').value||null,p_payment_method:$('paymentMethod').value||null,
    p_reference_no:$('referenceNo').value||null
  })
  $('saveBtn').disabled=false
  if(error){alert(error.message);return}
  closeModal();await load()
}
async function voidExpense(id){
  const reason=prompt('เหตุผลที่ยกเลิกรายการค่าใช้จ่าย')
  if(reason===null)return
  if(!reason.trim()){alert('กรุณาระบุเหตุผล');return}
  if(!confirm('ยืนยันยกเลิกรายการนี้?'))return
  const {error}=await supabase.rpc('backoffice_expense_void',{p_expense_id:id,p_reason:reason.trim()})
  if(error){alert(error.message);return}
  await load()
}
function openModal(){
  $('expenseDate').value=localDate(new Date());$('amount').value='';$('description').value='';$('referenceNo').value='';$('paymentMethod').value=''
  $('modal').classList.remove('hidden')
}
function closeModal(){$('modal').classList.add('hidden')}

$('newBtn').onclick=openModal;$('closeBtn').onclick=closeModal;$('saveBtn').onclick=save;$('searchBtn').onclick=load
$('modal').addEventListener('click',e=>{if(e.target===$('modal'))closeModal()})

const ctx=await requireBackoffice()
if(ctx){
  setupShell(ctx,'expenses')
  const today=localDate(new Date()),first=today.slice(0,8)+'01'
  $('dateFrom').value=first;$('dateTo').value=today
  await supabase.rpc('backoffice_expense_seed_categories')
  await load()
}
