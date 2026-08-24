import { supabase } from './supabase.js'
import { requireBackoffice, setupShell, money, esc } from './auth.js'

const $=id=>document.getElementById(id)
let ctx=null, pos=[], docs=[], rows=[], returnable=[]

function today(){
  const d=new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function msg(t=''){$('message').textContent=t}
function fmsg(t=''){$('formMessage').textContent=t}

async function loadBase(){
  const [poRes,docRes]=await Promise.all([
    supabase.rpc('backoffice_list_purchase_orders'),
    supabase.rpc('backoffice_list_purchase_documents_v16',{
      p_from:null,p_to:null,p_supplier_id:null,p_document_type:null,p_payment_status:null
    })
  ])
  if(poRes.error) throw poRes.error
  if(docRes.error) throw docRes.error
  pos=(poRes.data||[]).filter(x=>['partial','received'].includes(x.status))
  docs=docRes.data||[]
  $('po').innerHTML='<option value="">-- เลือก PO --</option>'+
    pos.map(x=>`<option value="${x.id}">${esc(x.po_no)} • ${esc(x.supplier_name||'')}</option>`).join('')
}

async function loadRows(){
  const{data,error}=await supabase.rpc('backoffice_list_purchase_returns_v18')
  if(error)return msg(error.message)
  rows=data||[]
  render()
}

function render(){
  const q=$('search').value.trim().toLowerCase()
  const list=rows.filter(x=>!q||[
    x.return_no,x.supplier_name,x.po_no,x.document_internal_no,x.supplier_credit_no,x.reason
  ].filter(Boolean).join(' ').toLowerCase().includes(q))

  const total=list.reduce((s,x)=>s+Number(x.credit_amount||0),0)
  $('kpis').innerHTML=`
    <article class="kpi-card"><span>รายการคืน</span><strong>${list.length}</strong></article>
    <article class="kpi-card"><span>Supplier Credit</span><strong>${money(total)}</strong></article>`

  $('table').innerHTML=list.length?`
  <div class="table-wrap"><table>
  <thead><tr><th>Return</th><th>Supplier / PO</th><th>วันที่</th><th>เหตุผล</th><th>Credit Note</th><th class="num">เครดิต</th><th>สถานะ</th></tr></thead>
  <tbody>${list.map(x=>`<tr>
    <td><strong>${esc(x.return_no)}</strong></td>
    <td>${esc(x.supplier_name)}<div class="mini-note">${esc(x.po_no)} ${x.document_internal_no?'• '+esc(x.document_internal_no):''}</div></td>
    <td>${new Date(x.return_date+'T00:00:00').toLocaleDateString('th-TH')}</td>
    <td>${esc(x.reason)}</td>
    <td>${esc(x.supplier_credit_no||'-')}</td>
    <td class="num">${money(x.credit_amount)}</td>
    <td><span class="ap-badge approved">${esc(x.status)}</span></td>
  </tr>`).join('')}</tbody></table></div>`:'<div class="empty">ยังไม่มี Purchase Return</div>'
}

function openNew(){
  $('po').value=''
  $('document').innerHTML='<option value="">-- ไม่ผูก Invoice --</option>'
  $('returnDate').value=today()
  $('creditNo').value=''
  $('reason').value=''
  $('note').value=''
  returnable=[]
  renderItems()
  fmsg('')
  $('modal').classList.remove('hidden')
}

async function onPo(){
  const poId=$('po').value
  returnable=[]
  $('document').innerHTML='<option value="">-- ไม่ผูก Invoice --</option>'
  if(!poId){renderItems();return}

  const po=pos.find(x=>x.id===poId)
  const linkedDocs=docs.filter(x=>x.purchase_order_id===poId)
  $('document').innerHTML='<option value="">-- ไม่ผูก Invoice / ไม่ลด AP --</option>'+
    linkedDocs.map(x=>`<option value="${x.id}">${esc(x.internal_no)} • ${esc(x.document_no||'-')} • ${money(x.total_amount)}</option>`).join('')

  const{data,error}=await supabase.rpc('backoffice_purchase_returnable_items_v18',{p_purchase_order_id:poId})
  if(error)return fmsg(error.message)
  returnable=(data||[]).map(x=>({...x,return_qty:0}))
  renderItems()
}

function renderItems(){
  $('items').innerHTML=returnable.length?returnable.map((x,i)=>`
    <div class="return-item-row">
      <div><strong>${esc(x.ingredient_name)}</strong><small>รับ ${Number(x.received_qty)} • คืนแล้ว ${Number(x.already_returned_qty)} • คืนได้ ${Number(x.returnable_qty)} ${esc(x.unit||'')}</small></div>
      <label class="field"><span>จำนวนคืน</span><input data-return-qty="${i}" type="number" min="0" max="${Number(x.returnable_qty)}" step="0.001" value="${Number(x.return_qty||0)}"></label>
      <div class="return-cost"><span>ต้นทุน/หน่วย</span><strong>${Number(x.unit_cost||0).toFixed(4)}</strong></div>
      <div class="return-cost"><span>มูลค่าคืน</span><strong>${money(Number(x.return_qty||0)*Number(x.unit_cost||0))}</strong></div>
    </div>`).join(''):'<div class="empty">เลือก PO ก่อน</div>'
  renderTotal()
}

function renderTotal(){
  const total=returnable.reduce((s,x)=>s+Number(x.return_qty||0)*Number(x.unit_cost||0),0)
  $('returnTotal').textContent=money(total)
}

async function postReturn(){
  const poId=$('po').value
  if(!poId)return fmsg('กรุณาเลือก PO')
  if(!$('reason').value.trim())return fmsg('กรุณาระบุเหตุผลการคืน')

  const items=returnable.filter(x=>Number(x.return_qty)>0).map(x=>({
    po_item_id:x.po_item_id,
    quantity:Number(x.return_qty)
  }))
  if(!items.length)return fmsg('กรุณาระบุจำนวนคืนอย่างน้อย 1 รายการ')

  for(const x of returnable){
    if(Number(x.return_qty)>Number(x.returnable_qty)+0.0005)
      return fmsg(`จำนวนคืน ${x.ingredient_name} เกินจำนวนที่คืนได้`)
  }

  const total=returnable.reduce((s,x)=>s+Number(x.return_qty||0)*Number(x.unit_cost||0),0)
  const text=$('document').value
    ? `ยืนยันคืนสินค้า ${money(total)} และนำเครดิตไปลดเจ้าหนี้?`
    : `ยืนยันคืนสินค้า ${money(total)}? (ยังไม่ผูก Invoice จึงยังไม่ลดเจ้าหนี้)`
  if(!confirm(text))return

  $('postBtn').disabled=true
  const{data,error}=await supabase.rpc('backoffice_post_purchase_return_v18',{
    p_purchase_order_id:poId,
    p_purchase_document_id:$('document').value||null,
    p_return_date:$('returnDate').value,
    p_reason:$('reason').value.trim(),
    p_supplier_credit_no:$('creditNo').value.trim()||null,
    p_note:$('note').value.trim()||null,
    p_items:items
  })
  $('postBtn').disabled=false
  if(error)return fmsg(error.message)

  $('modal').classList.add('hidden')
  await loadRows()
  alert(`คืนสินค้าสำเร็จ ${data.return_no} • เครดิต ${money(data.credit_amount)}`)
}

async function init(){
  try{
    ctx=await requireBackoffice()
    if(!ctx)return
    setupShell(ctx,'purchase-returns')
    await loadBase()
    await loadRows()
  }catch(e){console.error(e);msg(e.message||'เปิด Purchase Returns ไม่สำเร็จ')}
}

$('newBtn').onclick=openNew
$('closeBtn').onclick=()=>$('modal').classList.add('hidden')
$('refreshBtn').onclick=loadRows
$('search').oninput=render
$('po').onchange=onPo
$('postBtn').onclick=postReturn
$('items').oninput=e=>{
  if(e.target.dataset.returnQty!==undefined){
    const i=Number(e.target.dataset.returnQty)
    returnable[i].return_qty=Number(e.target.value||0)
    renderTotal()
    const row=e.target.closest('.return-item-row')
    if(row) row.querySelectorAll('.return-cost strong')[1].textContent=
      money(returnable[i].return_qty*Number(returnable[i].unit_cost||0))
  }
}

init()
