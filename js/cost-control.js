import { supabase } from './supabase.js'
import { requireBackoffice, setupShell, money, esc } from './auth.js'

let data=null

function k(label,value,small='',cls=''){
    return `<article class="cost-kpi ${cls}"><span>${label}</span><strong>${value}</strong><small>${small}</small></article>`
}

async function load(){
    const {data:d,error}=await supabase.rpc('backoffice_cost_control_dashboard_v31')
    if(error){
        document.getElementById('message').textContent=error.message
        return
    }
    data=d
    render()
}

function render(){
    const latest=data?.latest
    const recent=(data?.recent||[]).slice().reverse()
    if(!latest){
        document.getElementById('latestKpis').innerHTML=k('ยังไม่มีรอบปิด','-','ไปที่ ปิดรอบ Stock')
        document.getElementById('chart').innerHTML='<div class="empty">ยังไม่มีข้อมูล</div>'
        document.getElementById('table').innerHTML=''
        return
    }

    document.getElementById('latestKpis').innerHTML=
        k('ยอดขายสุทธิ',money(latest.net_sales))+
        k('Theoretical Cost',money(latest.theoretical_cost),`${Number(latest.theoretical_cost_pct).toFixed(2)}%`)+
        k('Actual Cost',money(latest.actual_control_cost),`${Number(latest.actual_cost_pct).toFixed(2)}%`,'cost-warn')+
        k('Cost Gap',`${Number(latest.variance_cost_pct).toFixed(2)}%`,money(Number(latest.actual_control_cost)-Number(latest.theoretical_cost)),Number(latest.variance_cost_pct)>0?'cost-danger':'cost-good')+
        k('Waste',money(latest.waste_cost),'บันทึกของเสีย')+
        k('Production Yield Loss',money(latest.production_yield_loss_value||0),'Yield ต่ำกว่ามาตรฐาน',Number(latest.production_yield_loss_value)>0?'cost-danger':'')+
        k('Stock Shortage',money(latest.shortage_value),`Coverage ${Number(latest.coverage_pct).toFixed(0)}%`,'cost-danger')

    document.getElementById('latestTitle').textContent=`${latest.closing_no} • ${new Date(latest.period_end).toLocaleDateString('th-TH')}`
    document.getElementById('latestSummary').innerHTML=`
        <div class="category-cost-row"><span>Opening Stock</span><strong>${money(latest.opening_value)}</strong></div>
        <div class="category-cost-row"><span>Purchases</span><strong>${money(latest.purchase_value)}</strong></div>
        <div class="category-cost-row"><span>Expected Closing</span><strong>${money(latest.expected_closing_value)}</strong></div>
        <div class="category-cost-row"><span>Actual/Estimated Closing</span><strong>${money(latest.actual_closing_value)}</strong></div>
        <div class="category-cost-row"><span>Overage</span><strong class="gain">${money(latest.overage_value)}</strong></div>`

    const max=Math.max(...recent.flatMap(x=>[Number(x.theoretical_cost_pct||0),Number(x.actual_cost_pct||0)]),1)
    document.getElementById('chart').innerHTML=recent.map(x=>`
        <div class="chart-bar-col">
            <div class="chart-value">${Number(x.actual_cost_pct).toFixed(1)}%</div>
            <div class="chart-bar-pair">
                <div class="bar-a" title="Theo ${Number(x.theoretical_cost_pct).toFixed(2)}%" style="height:${Number(x.theoretical_cost_pct)/max*100}%"></div>
                <div class="bar-b" title="Actual ${Number(x.actual_cost_pct).toFixed(2)}%" style="height:${Number(x.actual_cost_pct)/max*100}%"></div>
            </div>
            <div class="chart-label">${new Date(x.period_end).toLocaleDateString('th-TH',{day:'2-digit',month:'short'})}</div>
        </div>`).join('')

    document.getElementById('table').innerHTML=`<div class="table-wrap"><table><thead><tr>
        <th>รอบ</th><th>วันที่</th><th class="num">ยอดขาย</th><th class="num">Theo %</th>
        <th class="num">Actual %</th><th class="num">Gap %</th><th class="num">Waste</th>
        <th class="num">Production Loss</th><th class="num">Shortage</th><th class="num">Coverage</th>
        </tr></thead><tbody>${(data.recent||[]).map(x=>`<tr>
        <td><strong>${esc(x.closing_no)}</strong></td><td>${new Date(x.period_end).toLocaleDateString('th-TH')}</td>
        <td class="num">${money(x.net_sales)}</td><td class="num">${Number(x.theoretical_cost_pct).toFixed(2)}%</td>
        <td class="num">${Number(x.actual_cost_pct).toFixed(2)}%</td>
        <td class="num ${Number(x.variance_cost_pct)>0?'loss':'gain'}">${Number(x.variance_cost_pct).toFixed(2)}%</td>
        <td class="num">${money(x.waste_cost)}</td><td class="num ${Number(x.production_yield_loss_value)>0?'loss':''}">${money(x.production_yield_loss_value)}</td>
        <td class="num loss">${money(x.shortage_value)}</td><td class="num">${Number(x.coverage_pct).toFixed(0)}%</td>
        </tr>`).join('')}</tbody></table></div>`
}

document.getElementById('refreshBtn').onclick=load

const ctx=await requireBackoffice()
if(ctx){setupShell(ctx,'cost-control');await load()}
