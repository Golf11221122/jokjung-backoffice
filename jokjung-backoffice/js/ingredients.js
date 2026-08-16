import { supabase } from './supabase.js'
import { requireBackoffice, setupShell, money, number, esc } from './auth.js'

let ctx = null
let rows = []

ctx = await requireBackoffice()
if (ctx) {
    setupShell(ctx, 'ingredients')
    await load()
}

async function load() {
    const { data, error } = await supabase.rpc('backoffice_list_ingredients')
    if (error) return show(error.message)
    rows = Array.isArray(data) ? data : []
    render()
}

function filtered() {
    const q = document.getElementById('search').value.trim().toLowerCase()
    const s = document.getElementById('status').value

    return rows.filter(x => {
        const searchOk = !q || String(x.name).toLowerCase().includes(q)
        let statusOk = true
        if (s === 'low') statusOk = x.is_active && Number(x.current_stock) > 0 && Number(x.current_stock) <= Number(x.min_stock)
        if (s === 'out') statusOk = x.is_active && Number(x.current_stock) <= 0
        if (s === 'inactive') statusOk = !x.is_active
        return searchOk && statusOk
    })
}

function render() {
    const active = rows.filter(x => x.is_active)
    document.getElementById('totalCount').textContent = number(active.length,0)
    document.getElementById('lowCount').textContent = number(active.filter(x => Number(x.current_stock)>0 && Number(x.current_stock)<=Number(x.min_stock)).length,0)
    document.getElementById('outCount').textContent = number(active.filter(x => Number(x.current_stock)<=0).length,0)
    document.getElementById('stockValue').textContent = money(active.reduce((s,x)=>s+Number(x.current_stock||0)*Number(x.cost_per_unit||0),0))

    const list = filtered()
    document.getElementById('table').innerHTML = list.length ? `
    <div class="table-wrap"><table><thead><tr><th>วัตถุดิบ</th><th>หน่วย</th><th class="num">ต้นทุน/หน่วย</th><th class="num">คงเหลือ</th><th class="num">ขั้นต่ำ</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
    <tbody>${list.map(x => {
        const current = Number(x.current_stock||0), min = Number(x.min_stock||0)
        const badge = !x.is_active ? '<span class="badge">ปิด</span>' : current<=0 ? '<span class="badge out">หมด</span>' : current<=min ? '<span class="badge low">ต่ำ</span>' : '<span class="badge ok">ปกติ</span>'
        return `<tr><td><strong>${esc(x.name)}</strong></td><td>${esc(x.unit)}</td><td class="num">${money(x.cost_per_unit)}</td><td class="num">${number(x.current_stock)} ${esc(x.unit)}</td><td class="num">${number(x.min_stock)}</td><td>${badge}</td><td><div class="action-row"><button class="small-btn" data-adjust="${x.id}">ปรับ Stock</button><button class="small-btn" data-edit="${x.id}">แก้ไข</button></div></td></tr>`
    }).join('')}</tbody></table></div>` : '<div class="empty">ไม่พบวัตถุดิบ</div>'
}

function show(text='') { document.getElementById('message').textContent = text }

function openIngredient(row=null) {
    document.getElementById('ingredientId').value = row?.id || ''
    document.getElementById('ingredientName').value = row?.name || ''
    document.getElementById('ingredientUnit').value = row?.unit || ''
    document.getElementById('ingredientCost').value = Number(row?.cost_per_unit || 0)
    document.getElementById('ingredientMin').value = Number(row?.min_stock || 0)
    document.getElementById('ingredientActive').checked = row ? row.is_active !== false : true
    document.getElementById('ingredientModalTitle').textContent = row ? 'แก้ไขวัตถุดิบ' : 'เพิ่มวัตถุดิบ'
    document.getElementById('ingredientFormMessage').textContent = ''
    document.getElementById('ingredientModal').classList.remove('hidden')
}

async function saveIngredient() {
    const name = document.getElementById('ingredientName').value.trim()
    const unit = document.getElementById('ingredientUnit').value.trim()
    if (!name || !unit) {
        document.getElementById('ingredientFormMessage').textContent = 'กรุณาระบุชื่อและหน่วย'
        return
    }

    const { error } = await supabase.rpc('backoffice_save_ingredient', {
        p_ingredient_id: document.getElementById('ingredientId').value || null,
        p_name: name,
        p_unit: unit,
        p_cost_per_unit: Number(document.getElementById('ingredientCost').value || 0),
        p_min_stock: Number(document.getElementById('ingredientMin').value || 0),
        p_is_active: document.getElementById('ingredientActive').checked
    })

    if (error) {
        document.getElementById('ingredientFormMessage').textContent = error.message
        return
    }

    document.getElementById('ingredientModal').classList.add('hidden')
    await load()
}

function openAdjust(row) {
    document.getElementById('adjustId').value = row.id
    document.getElementById('adjustName').textContent = `${row.name} • คงเหลือ ${number(row.current_stock)} ${row.unit}`
    document.getElementById('adjustQty').value = ''
    document.getElementById('adjustCost').value = Number(row.cost_per_unit || 0)
    document.getElementById('adjustNote').value = ''
    document.getElementById('adjustMessage').textContent = ''
    document.getElementById('adjustModal').classList.remove('hidden')
}

async function saveAdjust() {
    const qty = Number(document.getElementById('adjustQty').value || 0)
    if (qty <= 0) {
        document.getElementById('adjustMessage').textContent = 'จำนวนต้องมากกว่า 0'
        return
    }

    const { error } = await supabase.rpc('backoffice_adjust_stock', {
        p_ingredient_id: document.getElementById('adjustId').value,
        p_movement_type: document.getElementById('movementType').value,
        p_quantity: qty,
        p_unit_cost: Number(document.getElementById('adjustCost').value || 0),
        p_note: document.getElementById('adjustNote').value.trim() || null
    })

    if (error) {
        document.getElementById('adjustMessage').textContent = error.message
        return
    }

    document.getElementById('adjustModal').classList.add('hidden')
    await load()
}

document.getElementById('addBtn').onclick = () => openIngredient()
document.getElementById('refreshBtn').onclick = load
document.getElementById('search').oninput = render
document.getElementById('status').onchange = render
document.getElementById('closeIngredientModal').onclick = () => document.getElementById('ingredientModal').classList.add('hidden')
document.getElementById('closeAdjustModal').onclick = () => document.getElementById('adjustModal').classList.add('hidden')
document.getElementById('saveIngredientBtn').onclick = saveIngredient
document.getElementById('saveAdjustBtn').onclick = saveAdjust

document.getElementById('table').onclick = e => {
    const edit = e.target.closest('[data-edit]')
    if (edit) return openIngredient(rows.find(x => x.id === edit.dataset.edit))
    const adjust = e.target.closest('[data-adjust]')
    if (adjust) return openAdjust(rows.find(x => x.id === adjust.dataset.adjust))
}
