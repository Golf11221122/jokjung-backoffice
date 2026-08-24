import { supabase } from './supabase.js'
import { requireBackoffice, setupShell, esc } from './auth.js'

let rows = []
let supplierIngredientRows = []
let currentSupplierId = null

const ctx = await requireBackoffice()
if (ctx) {
    setupShell(ctx, 'suppliers')
    await load()
}

async function load() {
    const { data, error } = await supabase.rpc('backoffice_list_suppliers')
    if (error) return msg(error.message)
    rows = Array.isArray(data) ? data : []
    render()
}

function msg(t='') {
    document.getElementById('message').textContent = t
}

function render() {
    const q = document.getElementById('search').value.trim().toLowerCase()
    const s = document.getElementById('status').value

    const list = rows.filter(x =>
        (!q || `${x.name} ${x.contact_name||''} ${x.phone||''}`.toLowerCase().includes(q))
        && (!s || (s === 'active' ? x.is_active : !x.is_active))
    )

    document.getElementById('table').innerHTML = list.length
        ? `<div class="table-wrap"><table>
            <thead><tr>
                <th>Supplier</th><th>ผู้ติดต่อ</th><th>โทร</th><th>เงื่อนไข</th><th>สถานะ</th><th>จัดการ</th>
            </tr></thead>
            <tbody>
                ${list.map(x => `<tr>
                    <td><strong>${esc(x.name)}</strong></td>
                    <td>${esc(x.contact_name||'-')}</td>
                    <td>${esc(x.phone||'-')}</td>
                    <td>${esc(x.payment_terms||'-')}</td>
                    <td><span class="badge ${x.is_active?'ok':''}">${x.is_active?'ใช้งาน':'ปิด'}</span></td>
                    <td>
                        <div class="action-row">
                            <button class="small-btn" data-ingredients="${x.id}">📦 วัตถุดิบ</button>
                            <button class="small-btn" data-edit="${x.id}">แก้ไข</button>
                        </div>
                    </td>
                </tr>`).join('')}
            </tbody>
        </table></div>`
        : '<div class="empty">ยังไม่มี Supplier</div>'
}

function open(r=null) {
    document.getElementById('supplierId').value = r?.id || ''
    for (const [id,k] of [
        ['name','name'],['contactName','contact_name'],['phone','phone'],
        ['email','email'],['taxId','tax_id'],['paymentTerms','payment_terms'],
        ['address','address'],['note','note']
    ]) {
        document.getElementById(id).value = r?.[k] || ''
    }
    document.getElementById('active').checked = r ? r.is_active !== false : true
    document.getElementById('formMessage').textContent = ''
    document.getElementById('modal').classList.remove('hidden')
}

async function save() {
    const name = document.getElementById('name').value.trim()
    if (!name) return formMsg('กรุณาระบุชื่อ Supplier')

    const { error } = await supabase.rpc('backoffice_save_supplier',{
        p_supplier_id: document.getElementById('supplierId').value || null,
        p_name: name,
        p_contact_name: document.getElementById('contactName').value || null,
        p_phone: document.getElementById('phone').value || null,
        p_email: document.getElementById('email').value || null,
        p_tax_id: document.getElementById('taxId').value || null,
        p_address: document.getElementById('address').value || null,
        p_payment_terms: document.getElementById('paymentTerms').value || null,
        p_note: document.getElementById('note').value || null,
        p_is_active: document.getElementById('active').checked
    })

    if (error) {
        return formMsg(error.message.includes('SUPPLIER_NAME_EXISTS')
            ? 'มี Supplier ชื่อนี้แล้ว'
            : error.message
        )
    }

    document.getElementById('modal').classList.add('hidden')
    await load()
}

function formMsg(t) {
    document.getElementById('formMessage').textContent = t
}

function typeText(t) {
    return ({
        raw:'Raw',
        prep:'Prep',
        beverage:'เครื่องดื่ม',
        packaging:'Packaging',
        consumable:'ของใช้'
    })[t] || t || '-'
}

async function openIngredients(supplierId) {
    const supplier = rows.find(x => x.id === supplierId)
    if (!supplier) return

    currentSupplierId = supplierId
    document.getElementById('supplierIngredientTitle').textContent =
        `วัตถุดิบของ ${supplier.name}`
    document.getElementById('supplierIngredientMessage').textContent = 'กำลังโหลด...'
    document.getElementById('supplierIngredientSearch').value = ''
    document.getElementById('supplierIngredientModal').classList.remove('hidden')

    const { data, error } = await supabase.rpc(
        'backoffice_supplier_ingredient_list',
        { p_supplier_id: supplierId }
    )

    if (error) {
        document.getElementById('supplierIngredientMessage').textContent = error.message
        return
    }

    supplierIngredientRows = Array.isArray(data) ? data : []
    document.getElementById('supplierIngredientMessage').textContent = ''
    renderSupplierIngredients()
}

function renderSupplierIngredients() {
    const q = document.getElementById('supplierIngredientSearch').value
        .trim().toLowerCase()

    const list = supplierIngredientRows.filter(x =>
        !q || `${x.ingredient_name} ${x.unit} ${x.ingredient_type}`
            .toLowerCase().includes(q)
    )

    const grouped = new Map()
    for (const row of list) {
        const key = row.ingredient_type || 'other'
        if (!grouped.has(key)) grouped.set(key, [])
        grouped.get(key).push(row)
    }

    const order = ['raw','beverage','packaging','consumable','prep','other']

    document.getElementById('supplierIngredientList').innerHTML =
        order.filter(k => grouped.has(k)).map(k => `
            <section class="supplier-ing-group">
                <div class="supplier-ing-group-title">
                    <strong>${esc(typeText(k))}</strong>
                    <span>${grouped.get(k).length} รายการ</span>
                </div>
                <div class="supplier-ing-grid">
                    ${grouped.get(k).map(x => `
                        <label class="supplier-ing-item">
                            <input
                                type="checkbox"
                                data-supplier-ing="${x.ingredient_id}"
                                ${x.is_linked ? 'checked' : ''}
                            >
                            <span>
                                <strong>${esc(x.ingredient_name)}</strong>
                                <small>${esc(x.unit || '')} • ${esc(typeText(x.ingredient_type))}</small>
                            </span>
                        </label>
                    `).join('')}
                </div>
            </section>
        `).join('') || '<div class="empty">ไม่พบวัตถุดิบ</div>'
}

async function saveSupplierIngredients() {
    if (!currentSupplierId) return

    const ingredientIds = [...document.querySelectorAll('[data-supplier-ing]:checked')]
        .map(x => x.dataset.supplierIng)

    const btn = document.getElementById('saveSupplierIngredientsBtn')
    btn.disabled = true
    btn.textContent = 'กำลังบันทึก...'
    document.getElementById('supplierIngredientMessage').textContent = ''

    const { error } = await supabase.rpc(
        'backoffice_save_supplier_ingredients',
        {
            p_supplier_id: currentSupplierId,
            p_ingredient_ids: ingredientIds
        }
    )

    btn.disabled = false
    btn.textContent = 'บันทึกกลุ่มวัตถุดิบ'

    if (error) {
        document.getElementById('supplierIngredientMessage').textContent = error.message
        return
    }

    document.getElementById('supplierIngredientMessage').textContent =
        `บันทึกแล้ว ${ingredientIds.length} รายการ`
}

document.getElementById('addBtn').onclick = () => open()
document.getElementById('closeBtn').onclick =
    () => document.getElementById('modal').classList.add('hidden')
document.getElementById('saveBtn').onclick = save
document.getElementById('search').oninput = render
document.getElementById('status').onchange = render

document.getElementById('closeSupplierIngredientBtn').onclick =
    () => document.getElementById('supplierIngredientModal').classList.add('hidden')
document.getElementById('supplierIngredientSearch').oninput = renderSupplierIngredients
document.getElementById('saveSupplierIngredientsBtn').onclick = saveSupplierIngredients
document.getElementById('selectAllSupplierIngredientsBtn').onclick = () => {
    document.querySelectorAll('[data-supplier-ing]').forEach(x => x.checked = true)
}
document.getElementById('clearSupplierIngredientsBtn').onclick = () => {
    document.querySelectorAll('[data-supplier-ing]').forEach(x => x.checked = false)
}

document.getElementById('table').onclick = e => {
    const ing = e.target.closest('[data-ingredients]')
    if (ing) return openIngredients(ing.dataset.ingredients)

    const b = e.target.closest('[data-edit]')
    if (b) open(rows.find(x => x.id === b.dataset.edit))
}
