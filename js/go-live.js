import { supabase } from './supabase.js'
import { requireBackoffice, setupShell, money, number, esc } from './auth.js'

let ingredients = []
let status = null
let preview = null

function localDateTimeValue(d) {
    const pad = n => String(n).padStart(2,'0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function message(text='') {
    document.getElementById('message').textContent = text
}

async function loadStatus() {
    const { data, error } = await supabase.rpc('backoffice_get_go_live_status')
    if (error) throw error
    status = data || {}
    renderStatus()
}

async function loadIngredients() {
    const { data, error } = await supabase.rpc('backoffice_list_ingredients_v31')
    if (error) throw error
    ingredients = (data || []).filter(x => x.is_active)
    renderOpening()
}

function renderStatus() {
    const live = status?.status === 'live'
    const badge = document.getElementById('statusBadge')
    badge.className = `closing-status ${live ? 'closed' : 'draft'}`
    badge.textContent = live ? 'Go-Live แล้ว' : 'ยังไม่ Go-Live'
    document.getElementById('setupPanel').classList.toggle('hidden', live)
    document.getElementById('liveSummary').classList.toggle('hidden', !live)

    if (live) {
        document.getElementById('liveSummary').innerHTML = `
            <div class="kpi-grid">
                <article class="kpi-card"><span>Go-Live</span><strong>${new Date(status.go_live_at).toLocaleString('th-TH')}</strong></article>
                <article class="kpi-card"><span>Opening Items</span><strong>${number(status.opening_item_count,0)}</strong></article>
                <article class="kpi-card"><span>Opening Value</span><strong>${money(status.opening_value)}</strong></article>
                <article class="kpi-card"><span>ผู้เปิดระบบ</span><strong>${esc(status.activated_by_name || '-')}</strong><small>${status.activated_at ? new Date(status.activated_at).toLocaleString('th-TH') : ''}</small></article>
            </div>
            <p class="golive-ok">✅ ข้อมูลทดลองเดิมยังอยู่ แต่ Stock Report จะเริ่มนับธุรกรรมตั้งแต่ Go-Live เป็นต้นไป</p>`
    } else {
        const d = new Date(Date.now() + 2*60*1000)
        document.getElementById('goLiveAt').value = localDateTimeValue(d)
        document.getElementById('activateBtn').disabled = status?.can_activate !== true
        if (status?.can_activate !== true) message('การเปิด Go-Live ต้องใช้สิทธิ์ Admin')
    }
}

function filteredIngredients() {
    const q = document.getElementById('search').value.trim().toLowerCase()
    return ingredients.filter(x => !q || `${x.name} ${x.category_name || ''}`.toLowerCase().includes(q))
}

function renderOpening() {
    const list = filteredIngredients()
    document.getElementById('openingTable').innerHTML = list.length ? `
    <div class="table-wrap"><table><thead><tr>
        <th>วัตถุดิบ</th><th>ประเภท</th><th>หมวด</th><th class="num">ยอดทดลองตอนนี้</th>
        <th class="num">Opening Qty จริง</th><th class="num">Cost/Unit จริง</th><th class="num">มูลค่า</th>
    </tr></thead><tbody>${list.map(x => `
        <tr>
            <td><strong>${esc(x.name)}</strong><br><small>${esc(x.unit)}</small></td>
            <td>${esc(x.ingredient_type || 'raw')}</td>
            <td>${esc(x.category_name || 'อื่นๆ')}</td>
            <td class="num">${number(x.current_stock)} ${esc(x.unit)}</td>
            <td class="num"><input class="table-input" data-open-qty="${x.id}" type="number" min="0" step="0.001" placeholder="0"></td>
            <td class="num"><input class="table-input" data-open-cost="${x.id}" type="number" min="0" step="0.0001" value="${Number(x.cost_per_unit || 0)}"></td>
            <td class="num" data-open-value="${x.id}">${money(0)}</td>
        </tr>`).join('')}</tbody></table></div>` : '<div class="empty">ไม่พบวัตถุดิบ</div>'
    updateTotal()
}

function updateTotal() {
    let total = 0
    for (const x of ingredients) {
        const q = document.querySelector(`[data-open-qty="${x.id}"]`)
        const c = document.querySelector(`[data-open-cost="${x.id}"]`)
        if (!q || !c) continue
        const value = Number(q.value || 0) * Number(c.value || 0)
        total += value
        const cell = document.querySelector(`[data-open-value="${x.id}"]`)
        if (cell) cell.textContent = money(value)
    }
    document.getElementById('openingValue').textContent = money(total)
}

function selectedGoLiveIso() {
    const value = document.getElementById('goLiveAt').value
    if (!value) return null
    return new Date(value).toISOString()
}

async function runPreview() {
    const at = selectedGoLiveIso()
    if (!at) return message('กรุณาเลือกวัน/เวลา Go-Live')
    const { data, error } = await supabase.rpc('backoffice_go_live_preview', { p_go_live_at: at })
    if (error) return message(error.message)
    preview = data
    const conflict = preview?.has_conflict === true
    document.getElementById('previewBox').innerHTML = `
        <div class="golive-preview-card ${conflict ? 'bad' : 'good'}">
            <strong>${conflict ? '⚠️ เวลานี้ยังมีข้อมูลทดลองอยู่หลัง Go-Live' : '✅ เวลานี้พร้อมสำหรับ Go-Live'}</strong>
            <div>Stock Movement: ${number(preview.movement_count,0)} • Sales: ${number(preview.sales_count,0)} • Production: ${number(preview.production_count,0)}</div>
            <small>${conflict ? 'ให้เลือกเวลาใหม่หลังรายการทดลองล่าสุด เช่น เวลาปัจจุบัน + 1–2 นาที' : 'สามารถกรอก Opening Stock และยืนยันได้'}</small>
        </div>`
}

function openingPayload() {
    return ingredients.map(x => {
        const q = document.querySelector(`[data-open-qty="${x.id}"]`)
        const c = document.querySelector(`[data-open-cost="${x.id}"]`)
        return {
            ingredient_id: x.id,
            opening_qty: Number(q?.value || 0),
            unit_cost: Number(c?.value || 0)
        }
    })
}

async function activate() {
    const at = selectedGoLiveIso()
    if (!at) return message('กรุณาเลือกวัน/เวลา Go-Live')

    await runPreview()
    if (preview?.has_conflict) return message('ยังเปิด Go-Live ไม่ได้ เพราะมีธุรกรรมทดลองหลังเวลาที่เลือก')

    const items = openingPayload()
    if (!items.length) return message('ไม่พบวัตถุดิบสำหรับ Opening Stock')
    if (items.some(x => x.opening_qty < 0 || x.unit_cost < 0)) return message('Opening Stock และต้นทุนห้ามติดลบ')

    const emptyCount = ingredients.filter(x => {
        const q = document.querySelector(`[data-open-qty="${x.id}"]`)
        return !q || q.value === ''
    }).length
    if (emptyCount > 0) {
        return message(`ยังมี Opening Qty ว่าง ${emptyCount} รายการ กด “ใส่ 0 ช่องว่างทั้งหมด” หรือกรอกจำนวนจริงให้ครบ`)
    }

    const ok = confirm(
        'ยืนยัน Go-Live หรือไม่?\n\n' +
        'ระบบจะไม่ลบข้อมูลทดลอง แต่จะตั้ง Stock ปัจจุบันใหม่ตาม Opening Stock ที่กรอก และใช้เวลานี้เป็นจุดเริ่มข้อมูลจริง'
    )
    if (!ok) return

    const btn = document.getElementById('activateBtn')
    btn.disabled = true
    try {
        const { data, error } = await supabase.rpc('backoffice_activate_go_live', {
            p_go_live_at: at,
            p_items: items,
            p_note: document.getElementById('note').value.trim() || null
        })
        if (error) {
            const t = error.message || ''
            if (t.includes('GO_LIVE_TIME_HAS_EXISTING_TRANSACTIONS')) {
                return message('มีรายการเกิดขึ้นหลังเวลาที่เลือก กรุณาเลือกเวลาใหม่หลังรายการล่าสุด')
            }
            if (t.includes('ADMIN_REQUIRED')) return message('ต้องใช้สิทธิ์ Admin')
            throw error
        }
        message(`Go-Live สำเร็จ • ${data.opening_items} รายการ • Opening Value ${money(data.opening_value)}`)
        await loadStatus()
        await loadIngredients()
    } catch (error) {
        message(error.message || 'Go-Live ไม่สำเร็จ')
    } finally {
        btn.disabled = false
    }
}

document.getElementById('previewBtn').onclick = runPreview
document.getElementById('activateBtn').onclick = activate
document.getElementById('search').oninput = renderOpening
document.getElementById('openingTable').oninput = updateTotal
document.getElementById('fillZeroBtn').onclick = () => {
    document.querySelectorAll('[data-open-qty]').forEach(x => {
        if (x.value === '') x.value = '0'
    })
    updateTotal()
}
document.getElementById('goLiveAt').onchange = () => {
    preview = null
    document.getElementById('previewBox').innerHTML = ''
}

const ctx = await requireBackoffice()
if (ctx) {
    setupShell(ctx, 'go-live')
    try {
        await loadStatus()
        await loadIngredients()
    } catch (error) {
        message(error.message || 'เปิดหน้า Go-Live ไม่สำเร็จ')
    }
}
