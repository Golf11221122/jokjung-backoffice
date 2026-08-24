import { supabase } from './supabase.js'
import { requireBackoffice, setupShell, money, esc } from './auth.js'

const $ = id => document.getElementById(id)
let dashboard = { latest: null, recent: [] }

function pct(v) {
    return `${Number(v || 0).toFixed(2)}%`
}

function dateText(v) {
    if (!v) return '-'
    return new Date(v).toLocaleDateString('th-TH', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    })
}

function kpi(label, value, note = '', cls = '') {
    return `
        <article class="cost-kpi ${cls}">
            <span>${esc(label)}</span>
            <strong>${value}</strong>
            <small>${esc(note)}</small>
        </article>
    `
}

function renderLatest() {
    const d = dashboard.latest
    if (!d) {
        $('latestKpis').innerHTML = kpi('Cost Control', '-', 'ยังไม่มีรอบ Stock ที่ปิดแล้ว')
        $('latestTitle').textContent = '-'
        $('latestSummary').innerHTML = '<div class="empty">ยังไม่มีข้อมูล Cost Control</div>'
        return
    }

    $('latestKpis').innerHTML =
        kpi('ยอดขายสุทธิ', money(d.net_sales)) +
        kpi('Theoretical Cost', money(d.theoretical_cost), pct(d.theoretical_cost_pct)) +
        kpi('Actual Cost', money(d.actual_control_cost), pct(d.actual_cost_pct), 'cost-warn') +
        kpi('Cost Gap', pct(d.variance_cost_pct), money(Number(d.actual_control_cost || 0) - Number(d.theoretical_cost || 0)),
            Number(d.variance_cost_pct || 0) > 0 ? 'cost-danger' : 'cost-good') +
        kpi('Waste', money(d.waste_cost)) +
        kpi('Yield Loss', money(d.production_yield_loss_value || 0), 'Production')

    $('latestTitle').textContent =
        `${d.closing_no || '-'} • ${dateText(d.period_end)}`

    $('latestSummary').innerHTML = `
        <div class="summary-list">
            <div><span>ยอดขายสุทธิ</span><strong>${money(d.net_sales)}</strong></div>
            <div><span>Theoretical Cost</span><strong>${money(d.theoretical_cost)} (${pct(d.theoretical_cost_pct)})</strong></div>
            <div><span>Actual Control Cost</span><strong>${money(d.actual_control_cost)} (${pct(d.actual_cost_pct)})</strong></div>
            <div><span>Cost Gap</span><strong>${pct(d.variance_cost_pct)}</strong></div>
            <div><span>Waste</span><strong>${money(d.waste_cost)}</strong></div>
            <div><span>Stock Shortage</span><strong>${money(d.shortage_value)}</strong></div>
            <div><span>Production Yield Loss</span><strong>${money(d.production_yield_loss_value || 0)}</strong></div>
            <div><span>Coverage</span><strong>${pct(d.coverage_pct)}</strong></div>
        </div>
        <p class="mini-note" style="margin-top:10px">
            Theoretical Cost ใช้ต้นทุน Snapshot ตอนขาย และ Raw จะใช้ Effective Cost หลังหัก Usable Yield
        </p>
    `
}

function renderChart() {
    const rows = dashboard.recent || []
    if (!rows.length) {
        $('chart').innerHTML = '<div class="empty">ยังไม่มีข้อมูลย้อนหลัง</div>'
        return
    }

    const max = Math.max(
        1,
        ...rows.flatMap(x => [
            Number(x.theoretical_cost_pct || 0),
            Number(x.actual_cost_pct || 0)
        ])
    )

    $('chart').innerHTML = rows.map(x => {
        const theo = Number(x.theoretical_cost_pct || 0)
        const actual = Number(x.actual_cost_pct || 0)
        return `
            <div class="cost-chart-row">
                <div class="cost-chart-label">
                    <strong>${esc(x.closing_no || '')}</strong>
                    <small>${dateText(x.period_end)}</small>
                </div>
                <div class="cost-chart-bars">
                    <div class="cost-chart-line">
                        <span>Theo ${theo.toFixed(2)}%</span>
                        <i style="width:${Math.min(100, theo / max * 100)}%"></i>
                    </div>
                    <div class="cost-chart-line actual">
                        <span>Actual ${actual.toFixed(2)}%</span>
                        <i style="width:${Math.min(100, actual / max * 100)}%"></i>
                    </div>
                </div>
            </div>
        `
    }).join('')
}

function renderTable() {
    const rows = [...(dashboard.recent || [])].reverse()
    if (!rows.length) {
        $('table').innerHTML = '<div class="empty">ยังไม่มีรอบปิด Stock</div>'
        return
    }

    $('table').innerHTML = `
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>รอบ</th>
                        <th>วันที่</th>
                        <th class="num">ยอดขาย</th>
                        <th class="num">Theo Cost</th>
                        <th class="num">Theo %</th>
                        <th class="num">Actual Cost</th>
                        <th class="num">Actual %</th>
                        <th class="num">Gap %</th>
                        <th class="num">Waste</th>
                        <th class="num">Yield Loss</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(x => `
                        <tr>
                            <td><strong>${esc(x.closing_no || '-')}</strong></td>
                            <td>${dateText(x.period_end)}</td>
                            <td class="num">${money(x.net_sales)}</td>
                            <td class="num">${money(x.theoretical_cost)}</td>
                            <td class="num">${pct(x.theoretical_cost_pct)}</td>
                            <td class="num">${money(x.actual_control_cost)}</td>
                            <td class="num">${pct(x.actual_cost_pct)}</td>
                            <td class="num">${pct(x.variance_cost_pct)}</td>
                            <td class="num">${money(x.waste_cost)}</td>
                            <td class="num">${money(x.production_yield_loss_value || 0)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `
}

async function load() {
    $('message').textContent = 'กำลังโหลด...'

    let { data, error } =
        await supabase.rpc('backoffice_cost_control_dashboard_v31')

    // fallback สำหรับฐานข้อมูลเก่าที่ยังไม่มี V3.1
    if (error) {
        const fallback = await supabase.rpc('backoffice_cost_control_dashboard')
        data = fallback.data
        error = fallback.error
    }

    if (error) {
        $('message').textContent = error.message || 'โหลด Cost Control ไม่สำเร็จ'
        return
    }

    dashboard = data || { latest: null, recent: [] }
    renderLatest()
    renderChart()
    renderTable()
    $('message').textContent = ''
}

async function init() {
    try {
        const ctx = await requireBackoffice()
        if (!ctx) return
        setupShell(ctx, 'cost-control')
        await load()
    } catch (error) {
        console.error(error)
        $('message').textContent = error.message || 'เปิดหน้า Cost Control ไม่สำเร็จ'
    }
}

$('refreshBtn')?.addEventListener('click', load)
init()
