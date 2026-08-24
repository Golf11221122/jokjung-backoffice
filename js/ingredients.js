import { supabase } from './supabase.js'
import { requireBackoffice, setupShell, money, number, esc } from './auth.js'

let rows = []
let categories = []

function typeText(value) {
    return ({
        raw: 'Raw',
        prep: 'Prep',
        beverage: 'เครื่องดื่ม',
        packaging: 'Packaging',
        consumable: 'Consumable'
    })[value] || value
}

function freqText(value) {
    return ({
        daily: 'รายวัน',
        weekly: 'รายสัปดาห์',
        monthly: 'รายเดือน'
    })[value] || value
}

function show(text = '') {
    document.getElementById('message').textContent = text
}


function unitCost4(value) {
    return new Intl.NumberFormat('th-TH', {
        style: 'currency',
        currency: 'THB',
        minimumFractionDigits: 4,
        maximumFractionDigits: 4
    }).format(Number(value || 0))
}

function ingredientErrorText(error) {
    const text = String(error?.message || error || '')
    if (text.includes('INGREDIENT_NAME_EXISTS')) return 'มีวัตถุดิบชื่อนี้อยู่แล้วในสาขานี้'
    if (text.includes('INVALID_STANDARD_YIELD')) return 'Production Yield ต้องมากกว่า 0'
    if (text.includes('INVALID_USABLE_YIELD')) return 'Usable Yield ของ Raw ต้องมากกว่า 0 และไม่เกิน 100%' 
    return text || 'บันทึกข้อมูลไม่สำเร็จ'
}

async function loadCategories() {
    const { data, error } = await supabase.rpc('backoffice_list_ingredient_categories')
    if (error) return show(error.message)
    categories = data || []
    document.getElementById('categoryFilter').innerHTML =
        '<option value="">ทุกหมวด</option>' +
        categories.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')
    document.getElementById('ingredientCategory').innerHTML =
        '<option value="">-- ยังไม่ระบุ --</option>' +
        categories.filter(x => x.is_active).map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')
}

async function load() {
    const { data, error } = await supabase.rpc('backoffice_list_ingredients_v32')
    if (error) return show(error.message)
    rows = data || []
    render()
}

function filtered() {
    const q = document.getElementById('search').value.trim().toLowerCase()
    const status = document.getElementById('status').value
    const category = document.getElementById('categoryFilter').value
    const frequency = document.getElementById('frequencyFilter').value
    const type = document.getElementById('typeFilter').value

    return rows.filter(x => {
        const searchOk = !q || `${x.name} ${x.category_name || ''} ${typeText(x.ingredient_type)}`.toLowerCase().includes(q)
        let statusOk = true
        if (status === 'low') statusOk = x.is_active && Number(x.current_stock) > 0 && Number(x.current_stock) <= Number(x.min_stock)
        if (status === 'out') statusOk = x.is_active && Number(x.current_stock) <= 0
        if (status === 'inactive') statusOk = !x.is_active
        return searchOk && statusOk &&
            (!category || x.category_id === category) &&
            (!frequency || x.count_frequency === frequency) &&
            (!type || x.ingredient_type === type)
    })
}

function render() {
    const active = rows.filter(x => x.is_active)
    document.getElementById('totalCount').textContent = number(active.length, 0)
    document.getElementById('rawCount').textContent = number(active.filter(x => x.ingredient_type === 'raw').length, 0)
    document.getElementById('prepCount').textContent = number(active.filter(x => x.ingredient_type === 'prep').length, 0)
    document.getElementById('stockValue').textContent =
        money(active.reduce((sum, x) => sum + Number(x.current_stock || 0) * Number(x.cost_per_unit || 0), 0))

    const list = filtered()
    document.getElementById('table').innerHTML = list.length ? `
        <div class="table-wrap"><table>
        <thead><tr>
            <th>วัตถุดิบ</th><th>ประเภท</th><th>หมวด</th><th>รอบนับ</th><th>หน่วย</th>
            <th class="num">ต้นทุนซื้อ/หน่วย</th><th class="num">คงเหลือ</th>
            <th class="num">Usable Yield</th><th class="num">ต้นทุนใช้จริง</th><th class="num">Production Yield</th><th>สถานะ</th><th>จัดการ</th>
        </tr></thead>
        <tbody>${list.map(x => {
            const cur = Number(x.current_stock || 0)
            const min = Number(x.min_stock || 0)
            const badge = !x.is_active ? '<span class="badge">ปิด</span>' :
                cur <= 0 ? '<span class="badge out">หมด</span>' :
                cur <= min ? '<span class="badge low">ต่ำ</span>' :
                '<span class="badge ok">ปกติ</span>'
            return `<tr>
                <td><strong>${esc(x.name)}</strong></td>
                <td><span class="ingredient-type type-${esc(x.ingredient_type)}">${esc(typeText(x.ingredient_type))}</span></td>
                <td><span class="category-chip">${esc(x.category_name || 'อื่นๆ')}</span></td>
                <td><span class="freq-chip">${esc(freqText(x.count_frequency))}</span></td>
                <td>${esc(x.unit)}</td>
                <td class="num">${unitCost4(x.cost_per_unit)}</td>
                <td class="num">${number(x.current_stock)} ${esc(x.unit)}</td>
                <td class="num">${x.ingredient_type === 'raw' ? Number(x.usable_yield_pct || 100).toFixed(2) + '%' : '-'}</td>
                <td class="num">${unitCost4(x.effective_cost_per_unit ?? x.cost_per_unit)}</td>
                <td class="num">${x.ingredient_type === 'prep' && x.standard_yield_pct ? Number(x.standard_yield_pct).toFixed(2) + '%' : '-'}</td>
                <td>${badge}</td>
                <td><div class="action-row">
                    <button class="small-btn" data-adjust="${x.id}">ปรับ Stock</button>
                    <button class="small-btn" data-edit="${x.id}">แก้ไข</button>
                </div></td>
            </tr>`
        }).join('')}</tbody></table></div>
    ` : '<div class="empty">ไม่พบวัตถุดิบ</div>'
}

function updateYieldVisibility() {
    const type = document.getElementById('ingredientType').value
    const isPrep = type === 'prep'
    const isRaw = type === 'raw'
    document.getElementById('yieldWrap').classList.toggle('hidden', !isPrep)
    document.getElementById('rawYieldWrap').classList.toggle('hidden', !isRaw)
}

function openIngredient(row = null) {
    document.getElementById('ingredientId').value = row?.id || ''
    document.getElementById('ingredientName').value = row?.name || ''
    document.getElementById('ingredientUnit').value = row?.unit || ''
    document.getElementById('ingredientType').value = row?.ingredient_type || 'raw'
    document.getElementById('ingredientCategory').value = row?.category_id || ''
    document.getElementById('ingredientFrequency').value = row?.count_frequency || 'monthly'
    document.getElementById('ingredientCost').value = Number(row?.cost_per_unit || 0)
    document.getElementById('ingredientMin').value = Number(row?.min_stock || 0)
    document.getElementById('ingredientYield').value = row?.standard_yield_pct ?? ''
    document.getElementById('ingredientUsableYield').value = Number(row?.usable_yield_pct ?? 100)
    document.getElementById('ingredientActive').checked = row ? row.is_active !== false : true
    document.getElementById('ingredientModalTitle').textContent = row ? 'แก้ไขวัตถุดิบ' : 'เพิ่มวัตถุดิบ'
    document.getElementById('ingredientFormMessage').textContent = ''
    updateYieldVisibility()
    document.getElementById('ingredientModal').classList.remove('hidden')
}

async function saveIngredient() {
    const name = document.getElementById('ingredientName').value.trim()
    const unit = document.getElementById('ingredientUnit').value.trim()
    if (!name || !unit) {
        document.getElementById('ingredientFormMessage').textContent = 'กรุณาระบุชื่อและหน่วย'
        return
    }

    const type = document.getElementById('ingredientType').value
    const yieldRaw = document.getElementById('ingredientYield').value
    const usableYieldRaw = document.getElementById('ingredientUsableYield').value
    const { error } = await supabase.rpc('backoffice_save_ingredient_v32', {
        p_ingredient_id: document.getElementById('ingredientId').value || null,
        p_name: name,
        p_unit: unit,
        p_cost_per_unit: Number(document.getElementById('ingredientCost').value || 0),
        p_min_stock: Number(document.getElementById('ingredientMin').value || 0),
        p_is_active: document.getElementById('ingredientActive').checked,
        p_category_id: document.getElementById('ingredientCategory').value || null,
        p_count_frequency: document.getElementById('ingredientFrequency').value,
        p_ingredient_type: type,
        p_standard_yield_pct: type === 'prep' && yieldRaw !== '' ? Number(yieldRaw) : null,
        p_usable_yield_pct: type === 'raw' ? Number(usableYieldRaw || 100) : 100
    })
    if (error) {
        document.getElementById('ingredientFormMessage').textContent = ingredientErrorText(error)
        return
    }
    document.getElementById('ingredientModal').classList.add('hidden')
    await supabase.rpc('backoffice_bulk_cost_sync_apply', { p_product_ids: null })
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
    await supabase.rpc('backoffice_bulk_cost_sync_apply', { p_product_ids: null })
    await load()
}

document.getElementById('addBtn').onclick = () => openIngredient()
document.getElementById('refreshBtn').onclick = async () => { await loadCategories(); await load() }
document.getElementById('ingredientType').onchange = updateYieldVisibility
for (const id of ['search','typeFilter','categoryFilter','frequencyFilter','status']) {
    document.getElementById(id).addEventListener(id === 'search' ? 'input' : 'change', render)
}
document.getElementById('closeIngredientModal').onclick = () => document.getElementById('ingredientModal').classList.add('hidden')
document.getElementById('closeAdjustModal').onclick = () => document.getElementById('adjustModal').classList.add('hidden')
document.getElementById('saveIngredientBtn').onclick = saveIngredient
document.getElementById('saveAdjustBtn').onclick = saveAdjust
document.getElementById('table').onclick = event => {
    const edit = event.target.closest('[data-edit]')
    const adjust = event.target.closest('[data-adjust]')
    if (edit) return openIngredient(rows.find(x => x.id === edit.dataset.edit))
    if (adjust) return openAdjust(rows.find(x => x.id === adjust.dataset.adjust))
}

const ctx = await requireBackoffice()
if (ctx) {
    setupShell(ctx, 'ingredients')
    await loadCategories()
    await load()
}
