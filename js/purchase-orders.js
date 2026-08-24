import { supabase } from './supabase.js'
import { requireBackoffice, setupShell, money, esc } from './auth.js'

let pos = []
let suppliers = []
let ingredients = []
let supplierIngredients = []
let lines = []

const ctx = await requireBackoffice()
if (ctx) {
    setupShell(ctx,'purchase-orders')
    await init()
}

async function init() {
    await Promise.all([loadSuppliers(), loadIngredients(), loadPos()])
}

async function loadSuppliers() {
    const {data,error} = await supabase.rpc('backoffice_list_suppliers')
    if (error) throw error

    suppliers = (data||[]).filter(x=>x.is_active)
    document.getElementById('supplier').innerHTML =
        '<option value="">-- เลือก Supplier --</option>' +
        suppliers.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')
}

async function loadIngredients() {
    let result = await supabase.rpc('backoffice_list_ingredients_v32')
    if (result.error) result = await supabase.rpc('backoffice_list_ingredients')
    if (result.error) throw result.error
    ingredients = (result.data||[]).filter(x=>x.is_active)
}

async function loadSupplierIngredients(supplierId, extraIngredientIds=[]) {
    if (!supplierId) {
        supplierIngredients = []
        return
    }

    const {data,error} = await supabase.rpc(
        'backoffice_list_supplier_ingredients',
        {p_supplier_id:supplierId}
    )

    if (error) throw error

    supplierIngredients = Array.isArray(data) ? data : []

    // ตอนแก้ PO เดิม: ถ้ามีรายการเก่าที่ mapping ถูกเปลี่ยนไปแล้ว
    // ให้ยังคงเห็นรายการนั้นเพื่อแก้ PO ได้ ไม่ทำให้ข้อมูลเดิมหาย
    for (const id of extraIngredientIds) {
        if (!supplierIngredients.some(x=>x.id===id)) {
            const old = ingredients.find(x=>x.id===id)
            if (old) supplierIngredients.push(old)
        }
    }
}

async function loadPos() {
    const {data,error} = await supabase.rpc('backoffice_list_purchase_orders')
    if (error) return msg(error.message)
    pos = Array.isArray(data)?data:[]
    renderPos()
}

function msg(t='') {
    document.getElementById('message').textContent=t
}

function statusText(s) {
    return ({draft:'Draft',ordered:'สั่งแล้ว',partial:'รับบางส่วน',received:'รับครบ',cancelled:'ยกเลิก'})[s]||s
}

function renderPos() {
    const q=document.getElementById('search').value.trim().toLowerCase()
    const s=document.getElementById('status').value
    const list=pos.filter(x =>
        (!q||`${x.po_no} ${x.supplier_name||''}`.toLowerCase().includes(q))
        &&(!s||x.status===s)
    )

    document.getElementById('table').innerHTML=list.length
        ? `<div class="table-wrap"><table><thead><tr><th>PO</th><th>Supplier</th><th>วันที่</th><th>สถานะ</th><th class="num">ยอด</th><th>จัดการ</th></tr></thead><tbody>${
            list.map(x=>`<tr>
                <td><strong>${esc(x.po_no)}</strong></td>
                <td>${esc(x.supplier_name||'-')}</td>
                <td>${new Date(x.order_date).toLocaleDateString('th-TH')}</td>
                <td><span class="status-pill ${x.status}">${statusText(x.status)}</span></td>
                <td class="num">${money(x.total_amount)}</td>
                <td><div class="action-row">
                    ${x.status==='draft'?`
                        <button class="small-btn" data-edit="${x.id}">แก้ไข</button>
                        <button class="small-btn" data-order="${x.id}">ยืนยันสั่ง</button>
                        <button class="small-btn" data-cancel="${x.id}">ยกเลิก</button>`:''}
                    ${['ordered','partial'].includes(x.status)?`
                        <button class="small-btn" data-receive="${x.id}">รับของ</button>`:''}
                    <button class="small-btn" data-view="${x.id}">ดู</button>
                </div></td>
            </tr>`).join('')
        }</tbody></table></div>`
        : '<div class="empty">ยังไม่มี PO</div>'
}

function today() {
    const d=new Date()
    return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function setSupplierHint() {
    const el = document.getElementById('supplierIngredientHint')
    const supplierId = document.getElementById('supplier').value

    if (!supplierId) {
        el.textContent = 'เลือก Supplier ก่อน แล้วระบบจะแสดงเฉพาะวัตถุดิบของ Supplier นั้น'
        return
    }

    if (!supplierIngredients.length) {
        el.innerHTML = 'Supplier นี้ยังไม่ได้จัดกลุ่มวัตถุดิบ — ไปที่หน้า <strong>Supplier → 📦 วัตถุดิบ</strong> เพื่อกำหนดรายการก่อน'
        return
    }

    el.textContent = `แสดงเฉพาะวัตถุดิบของ Supplier นี้ ${supplierIngredients.length} รายการ`
}

async function openNew() {
    document.getElementById('poId').value=''
    document.getElementById('supplier').value=''
    document.getElementById('orderDate').value=today()
    document.getElementById('expectedDate').value=''
    document.getElementById('discount').value='0'
    document.getElementById('shipping').value='0'
    document.getElementById('note').value=''
    document.getElementById('editMessage').textContent=''

    supplierIngredients=[]
    lines=[]
    renderLines()
    setSupplierHint()

    document.getElementById('editModal').classList.remove('hidden')
}

function ingredientOptions(row) {
    const source = supplierIngredients

    if (!source.length) {
        return '<option value="">-- ไม่มีวัตถุดิบในกลุ่ม Supplier --</option>'
    }

    return '<option value="">-- เลือกวัตถุดิบ --</option>' +
        source.map(x=>`
            <option value="${x.id}" ${x.id===row.ingredient_id?'selected':''}>
                ${esc(x.name)} (${esc(x.unit)})
            </option>
        `).join('')
}

function renderLines() {
    const disabled = !document.getElementById('supplier').value || !supplierIngredients.length

    document.getElementById('addLineBtn').disabled = disabled

    document.getElementById('lines').innerHTML = lines.length
        ? lines.map((r,i)=>`
            <div class="line-editor">
                <label class="field">
                    <span>วัตถุดิบ</span>
                    <select data-ing="${i}">
                        ${ingredientOptions(r)}
                    </select>
                </label>
                <label class="field">
                    <span>จำนวน</span>
                    <input data-qty="${i}" type="number" min="0.001" step="0.001" value="${r.ordered_qty}">
                </label>
                <label class="field">
                    <span>ราคา/หน่วย</span>
                    <input data-cost="${i}" type="number" min="0" step="0.0001" value="${r.unit_cost}">
                </label>
                <div class="line-total">${money(Number(r.ordered_qty||0)*Number(r.unit_cost||0))}</div>
                <button class="danger-btn" data-remove="${i}">ลบ</button>
            </div>
        `).join('')
        : `<div class="empty po-supplier-empty">${
            document.getElementById('supplier').value
                ? (supplierIngredients.length
                    ? 'กด “＋ เพิ่มวัตถุดิบ” เพื่อเริ่มทำ PO'
                    : 'Supplier นี้ยังไม่มีวัตถุดิบในกลุ่ม')
                : 'กรุณาเลือก Supplier ก่อน'
        }</div>`

    renderSummary()
}

function renderSummary() {
    const sub=lines.reduce((s,r)=>s+Number(r.ordered_qty||0)*Number(r.unit_cost||0),0)
    const d=Number(document.getElementById('discount').value||0)
    const sh=Number(document.getElementById('shipping').value||0)
    document.getElementById('subtotal').textContent=money(sub)
    document.getElementById('discountText').textContent=money(d)
    document.getElementById('shippingText').textContent=money(sh)
    document.getElementById('total').textContent=money(Math.max(sub-d+sh,0))
}

async function onSupplierChange() {
    const supplierId = document.getElementById('supplier').value
    const poId = document.getElementById('poId').value

    if (poId && lines.length) {
        const ok = confirm('เปลี่ยน Supplier จะล้างรายการวัตถุดิบใน PO ปัจจุบัน ยืนยันหรือไม่?')
        if (!ok) {
            document.getElementById('supplier').value =
                document.getElementById('supplier').dataset.previous || ''
            return
        }
    }

    document.getElementById('supplier').dataset.previous = supplierId
    lines = []

    try {
        await loadSupplierIngredients(supplierId)
        setSupplierHint()
        renderLines()
    } catch (error) {
        editMsg(error.message)
    }
}

async function editPo(id) {
    const {data,error}=await supabase.rpc('backoffice_get_purchase_order',{p_purchase_order_id:id})
    if(error)return msg(error.message)

    document.getElementById('poId').value=data.id
    document.getElementById('supplier').value=data.supplier_id||''
    document.getElementById('supplier').dataset.previous=data.supplier_id||''
    document.getElementById('orderDate').value=data.order_date||today()
    document.getElementById('expectedDate').value=data.expected_date||''
    document.getElementById('discount').value=Number(data.discount_amount||0)
    document.getElementById('shipping').value=Number(data.shipping_amount||0)
    document.getElementById('note').value=data.note||''
    document.getElementById('editMessage').textContent=''

    lines=(data.items||[]).map(x=>({
        ingredient_id:x.ingredient_id,
        ordered_qty:Number(x.ordered_qty),
        unit_cost:Number(x.unit_cost),
        note:x.note||''
    }))

    try {
        await loadSupplierIngredients(
            data.supplier_id,
            lines.map(x=>x.ingredient_id)
        )
    } catch (e) {
        return msg(e.message)
    }

    setSupplierHint()
    renderLines()
    document.getElementById('editModal').classList.remove('hidden')
}

async function saveDraft() {
    const supplierId = document.getElementById('supplier').value
    if (!supplierId) return editMsg('กรุณาเลือก Supplier')

    const clean=lines.filter(x=>x.ingredient_id&&Number(x.ordered_qty)>0)
    if(!clean.length)return editMsg('กรุณาเพิ่มวัตถุดิบ')

    const seen=new Set()
    for(const x of clean){
        if(seen.has(x.ingredient_id))return editMsg('วัตถุดิบใน PO ห้ามซ้ำ')
        seen.add(x.ingredient_id)
    }

    const allowed = new Set(supplierIngredients.map(x=>x.id))
    const invalid = clean.find(x=>!allowed.has(x.ingredient_id))
    if (invalid) return editMsg('พบวัตถุดิบที่ไม่ได้อยู่ในกลุ่ม Supplier นี้')

    const{error}=await supabase.rpc('backoffice_save_purchase_order',{
        p_purchase_order_id:document.getElementById('poId').value||null,
        p_supplier_id:supplierId,
        p_order_date:document.getElementById('orderDate').value,
        p_expected_date:document.getElementById('expectedDate').value||null,
        p_discount_amount:Number(document.getElementById('discount').value||0),
        p_shipping_amount:Number(document.getElementById('shipping').value||0),
        p_note:document.getElementById('note').value||null,
        p_items:clean
    })

    if(error)return editMsg(error.message)

    document.getElementById('editModal').classList.add('hidden')
    await loadPos()
}

function editMsg(t) {
    document.getElementById('editMessage').textContent=t
}

async function setStatus(id,s) {
    if(s==='ordered'&&!confirm('ยืนยันส่ง PO ไปสั่งซื้อ?'))return
    if(s==='cancelled'&&!confirm('ยกเลิก PO นี้?'))return

    const{error}=await supabase.rpc('backoffice_set_purchase_order_status',{
        p_purchase_order_id:id,
        p_status:s
    })
    if(error)return msg(error.message)
    await loadPos()
}

async function openReceive(id) {
    const{data,error}=await supabase.rpc('backoffice_get_purchase_order',{p_purchase_order_id:id})
    if(error)return msg(error.message)

    document.getElementById('receivePoId').value=id
    document.getElementById('receiveTitle').textContent=`รับของ ${data.po_no}`
    document.getElementById('receiveLines').innerHTML=(data.items||[]).map(x=>{
        const remain=Number(x.ordered_qty)-Number(x.received_qty)
        return`<div class="line-editor">
            <div>
                <strong>${esc(x.ingredient_name)}</strong>
                <div class="mini-note">สั่ง ${x.ordered_qty} • รับแล้ว ${x.received_qty} • เหลือ ${remain} ${esc(x.unit)}</div>
            </div>
            <label class="field">
                <span>รับครั้งนี้</span>
                <input data-receive-item="${x.id}" data-max="${remain}" type="number" min="0" max="${remain}" step="0.001" value="${remain}">
            </label>
            <label class="field">
                <span>ต้นทุนจริง/หน่วย</span>
                <input data-receive-cost="${x.id}" type="number" min="0" step="0.0001" value="${x.unit_cost}">
            </label>
            <div></div><div></div>
        </div>`
    }).join('')

    document.getElementById('receiveNote').value=''
    document.getElementById('receiveMessage').textContent=''
    document.getElementById('receiveModal').classList.remove('hidden')
}

async function receive() {
    const id=document.getElementById('receivePoId').value
    const inputs=[...document.querySelectorAll('[data-receive-item]')]
    const items=inputs.map(i=>({
        item_id:i.dataset.receiveItem,
        receive_qty:Number(i.value||0),
        unit_cost:Number(document.querySelector(`[data-receive-cost="${i.dataset.receiveItem}"]`).value||0)
    })).filter(x=>x.receive_qty>0)

    if(!items.length)return receiveMsg('กรุณาระบุจำนวนรับอย่างน้อย 1 รายการ')

    for(const x of items){
        const inp=document.querySelector(`[data-receive-item="${x.item_id}"]`)
        if(x.receive_qty>Number(inp.dataset.max))
            return receiveMsg('จำนวนรับเกินจำนวนคงเหลือใน PO')
    }

    const{error}=await supabase.rpc('backoffice_receive_purchase_order',{
        p_purchase_order_id:id,
        p_items:items,
        p_note:document.getElementById('receiveNote').value||null
    })

    if(error)return receiveMsg(error.message)

    await supabase.rpc('backoffice_bulk_cost_sync_apply',{p_product_ids:null})
    document.getElementById('receiveModal').classList.add('hidden')
    await loadIngredients()
    await loadPos()
}

function receiveMsg(t) {
    document.getElementById('receiveMessage').textContent=t
}

document.getElementById('newBtn').onclick=openNew
document.getElementById('refreshBtn').onclick=loadPos
document.getElementById('search').oninput=renderPos
document.getElementById('status').onchange=renderPos
document.getElementById('closeEdit').onclick=()=>document.getElementById('editModal').classList.add('hidden')
document.getElementById('closeReceive').onclick=()=>document.getElementById('receiveModal').classList.add('hidden')
document.getElementById('supplier').onchange=onSupplierChange

document.getElementById('addLineBtn').onclick=()=>{
    if (!supplierIngredients.length) return editMsg('Supplier นี้ยังไม่มีวัตถุดิบในกลุ่ม')

    const used = new Set(lines.map(x=>x.ingredient_id))
    const first = supplierIngredients.find(x=>!used.has(x.id)) || supplierIngredients[0]

    lines.push({
        ingredient_id:first?.id||'',
        ordered_qty:1,
        unit_cost:Number(first?.cost_per_unit||0)
    })
    renderLines()
}

document.getElementById('saveDraftBtn').onclick=saveDraft
document.getElementById('confirmReceiveBtn').onclick=receive
document.getElementById('discount').oninput=renderSummary
document.getElementById('shipping').oninput=renderSummary

document.getElementById('lines').onchange=e=>{
    if(e.target.dataset.ing!==undefined){
        const i=+e.target.dataset.ing
        lines[i].ingredient_id=e.target.value
        const ing=supplierIngredients.find(x=>x.id===e.target.value)
        lines[i].unit_cost=Number(ing?.cost_per_unit||0)
        renderLines()
    }
}

document.getElementById('lines').oninput=e=>{
    if(e.target.dataset.qty!==undefined)
        lines[+e.target.dataset.qty].ordered_qty=Number(e.target.value||0)
    if(e.target.dataset.cost!==undefined)
        lines[+e.target.dataset.cost].unit_cost=Number(e.target.value||0)
    renderSummary()
}

document.getElementById('lines').onclick=e=>{
    const b=e.target.closest('[data-remove]')
    if(b){
        lines.splice(+b.dataset.remove,1)
        renderLines()
    }
}

document.getElementById('table').onclick=e=>{
    const edit=e.target.closest('[data-edit]')
    const order=e.target.closest('[data-order]')
    const cancel=e.target.closest('[data-cancel]')
    const rec=e.target.closest('[data-receive]')
    const view=e.target.closest('[data-view]')

    if(edit)return editPo(edit.dataset.edit)
    if(order)return setStatus(order.dataset.order,'ordered')
    if(cancel)return setStatus(cancel.dataset.cancel,'cancelled')
    if(rec)return openReceive(rec.dataset.receive)
    if(view)return editPo(view.dataset.view)
}
