import { supabase } from './supabase.js'
import { requireBackoffice, setupShell, money, number, esc } from './auth.js'

const ctx = await requireBackoffice()
if (ctx) {
    setupShell(ctx, 'dashboard')
    await load()
}

async function load() {
    const message = document.getElementById('message')
    message.textContent = ''
    try {
        const { data, error } = await supabase.rpc('backoffice_dashboard_summary')
        if (error) throw error
        const r = Array.isArray(data) ? data[0] : data

        document.getElementById('ingredientCount').textContent = number(r?.ingredient_count,0)
        document.getElementById('lowCount').textContent = number(r?.low_stock_count,0)
        document.getElementById('outCount').textContent = number(r?.out_stock_count,0)
        document.getElementById('stockValue').textContent = money(r?.stock_value)

        const alerts = Array.isArray(r?.alerts) ? r.alerts : []
        document.getElementById('alerts').innerHTML = alerts.length
            ? `<div class="table-wrap"><table><thead><tr><th>วัตถุดิบ</th><th>คงเหลือ</th><th>ขั้นต่ำ</th><th>สถานะ</th></tr></thead><tbody>${
                alerts.map(x => `<tr><td>${esc(x.name)}</td><td>${number(x.current_stock)} ${esc(x.unit)}</td><td>${number(x.min_stock)} ${esc(x.unit)}</td><td><span class="badge ${Number(x.current_stock)<=0?'out':'low'}">${Number(x.current_stock)<=0?'หมด':'ต่ำ'}</span></td></tr>`).join('')
              }</tbody></table></div>`
            : '<div class="empty">Stock ปกติ ไม่มีรายการเตือน</div>'

        const mv = Array.isArray(r?.recent_movements) ? r.recent_movements : []
        document.getElementById('movements').innerHTML = mv.length
            ? `<div class="table-wrap"><table><thead><tr><th>เวลา</th><th>วัตถุดิบ</th><th>ประเภท</th><th>จำนวน</th><th>คงเหลือ</th></tr></thead><tbody>${
                mv.map(x => `<tr><td>${new Date(x.created_at).toLocaleString('th-TH')}</td><td>${esc(x.ingredient_name)}</td><td>${esc(x.movement_type)}</td><td>${number(x.quantity)}</td><td>${number(x.stock_after)} ${esc(x.unit)}</td></tr>`).join('')
              }</tbody></table></div>`
            : '<div class="empty">ยังไม่มี Stock Movement</div>'
    } catch (error) {
        message.textContent = error.message || 'โหลด Dashboard ไม่สำเร็จ'
    }
}

document.getElementById('refreshBtn')?.addEventListener('click', load)
