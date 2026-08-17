import { supabase } from './supabase.js'
import { requireBackoffice, setupShell, money, number, esc } from './auth.js'

let rows = []
let categories = []

function isoDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function typeText(v) {
    return ({raw:'Raw',prep:'Prep',beverage:'เครื่องดื่ม',packaging:'Packaging',consumable:'Consumable'})[v] || v
}
function setMonth() {
    const n=new Date()
    document.getElementById('from').value=isoDate(new Date(n.getFullYear(),n.getMonth(),1))
    document.getElementById('to').value=isoDate(n)
}
function bounds() {
    return {
        from:new Date(`${document.getElementById('from').value}T00:00:00`).toISOString(),
        to:new Date(`${document.getElementById('to').value}T23:59:59.999`).toISOString()
    }
}
async function loadCategories() {
    const {data,error}=await supabase.rpc('backoffice_list_ingredient_categories')
    if(error) return message(error.message)
    categories=data||[]
    document.getElementById('category').innerHTML='<option value="">ทุกหมวด</option>'+
        categories.filter(x=>x.is_active).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')
}
async function load() {
    const b=bounds()
    const [{data,error},{data:prod,error:prodError}] = await Promise.all([
        supabase.rpc('backoffice_stock_report_v31',{
            p_from:b.from,p_to:b.to,
            p_category_id:document.getElementById('category').value||null,
            p_ingredient_type:document.getElementById('ingredientType').value||null
        }),
        supabase.rpc('backoffice_production_summary',{p_from:b.from,p_to:b.to})
    ])
    if(error) return message(error.message)
    rows=data||[]
    render(prodError?null:prod)
}
function message(t=''){document.getElementById('message').textContent=t}
function sum(k){return rows.reduce((s,x)=>s+Number(x[k]||0),0)}
function render(prod) {
    document.getElementById('stockValue').textContent=money(sum('stock_value'))
    document.getElementById('inValue').textContent=money(sum('stock_in_value'))
    document.getElementById('prodInValue').textContent=money(sum('production_in_value'))
    document.getElementById('prodOutValue').textContent=money(sum('production_out_value'))
    document.getElementById('saleValue').textContent=money(sum('sale_value'))
    document.getElementById('wasteValue').textContent=money(sum('waste_value'))
    document.getElementById('productionSummary').innerHTML=prod?`
        <article class="kpi-card"><span>Batch</span><strong>${number(prod.batch_count,0)}</strong></article>
        <article class="kpi-card"><span>Input Cost</span><strong>${money(prod.input_cost)}</strong></article>
        <article class="kpi-card"><span>Yield เฉลี่ย</span><strong>${Number(prod.avg_yield_pct||0).toFixed(2)}%</strong></article>
        <article class="kpi-card"><span>Yield Loss</span><strong class="${Number(prod.yield_loss_value)>0?'loss':''}">${money(prod.yield_loss_value)}</strong><small>ต่ำกว่ามาตรฐาน ${number(prod.below_standard_count,0)} Batch</small></article>`:
        '<div class="empty">ไม่มีข้อมูล Production</div>'
    renderCategories()
    renderTable()
}
function renderCategories() {
    const map=new Map()
    for(const x of rows){
        const k=x.category_name||'อื่นๆ'
        const o=map.get(k)||{stock:0,pin:0,pout:0,sale:0,waste:0}
        o.stock+=Number(x.stock_value||0);o.pin+=Number(x.production_in_value||0);o.pout+=Number(x.production_out_value||0);o.sale+=Number(x.sale_value||0);o.waste+=Number(x.waste_value||0)
        map.set(k,o)
    }
    document.getElementById('categorySummary').innerHTML=[...map].map(([k,o])=>`
        <article class="category-cost-card"><h4>${esc(k)}</h4>
        <div class="category-cost-row"><span>Stock</span><strong>${money(o.stock)}</strong></div>
        <div class="category-cost-row"><span>Production In</span><strong>${money(o.pin)}</strong></div>
        <div class="category-cost-row"><span>Production Out</span><strong>${money(o.pout)}</strong></div>
        <div class="category-cost-row"><span>ขายใช้</span><strong>${money(o.sale)}</strong></div>
        <div class="category-cost-row"><span>Waste</span><strong class="${o.waste>0?'loss':''}">${money(o.waste)}</strong></div></article>`).join('')
}
function renderTable() {
    const q=document.getElementById('search').value.trim().toLowerCase()
    const list=rows.filter(x=>!q||`${x.name} ${x.category_name} ${typeText(x.ingredient_type)}`.toLowerCase().includes(q))
    document.getElementById('table').innerHTML=list.length?`
    <div class="table-wrap"><table class="raw-table"><thead><tr>
    <th>วัตถุดิบ</th><th>ประเภท</th><th>หมวด</th><th class="num">คงเหลือ</th><th class="num">Stock ฿</th>
    <th class="num">รับเข้า Qty</th><th class="num">รับเข้า ฿</th>
    <th class="num">Prod In Qty</th><th class="num">Prod In ฿</th>
    <th class="num">Prod Out Qty</th><th class="num">Prod Out ฿</th>
    <th class="num">ขาย Qty</th><th class="num">ขาย ฿</th>
    <th class="num">Waste Qty</th><th class="num">Waste ฿</th>
    <th class="num">ปรับ+ ฿</th><th class="num">ปรับ- ฿</th><th>สถานะ</th>
    </tr></thead><tbody>${list.map(x=>`<tr>
    <td><strong>${esc(x.name)}</strong><br><small>${esc(x.unit)}</small></td>
    <td>${esc(typeText(x.ingredient_type))}</td><td>${esc(x.category_name)}</td>
    <td class="num">${number(x.current_stock)}</td><td class="num">${money(x.stock_value)}</td>
    <td class="num">${number(x.stock_in_qty)}</td><td class="num">${money(x.stock_in_value)}</td>
    <td class="num">${number(x.production_in_qty)}</td><td class="num">${money(x.production_in_value)}</td>
    <td class="num">${number(x.production_out_qty)}</td><td class="num">${money(x.production_out_value)}</td>
    <td class="num">${number(x.sale_qty)}</td><td class="num">${money(x.sale_value)}</td>
    <td class="num">${number(x.waste_qty)}</td><td class="num loss">${money(x.waste_value)}</td>
    <td class="num">${money(x.adjust_in_value)}</td><td class="num">${money(x.adjust_out_value)}</td>
    <td>${x.status==='ok'?'ปกติ':x.status==='low'?'ใกล้หมด':x.status==='out'?'หมด':'ปิด'}</td>
    </tr>`).join('')}</tbody></table></div>`:'<div class="empty">ไม่พบข้อมูล</div>'
}

document.getElementById('applyBtn').onclick=load
document.getElementById('refreshBtn').onclick=load
document.getElementById('search').oninput=renderTable

const ctx=await requireBackoffice()
if(ctx){
    setupShell(ctx,'reports')
    setMonth()
    await loadCategories()
    await load()
}
