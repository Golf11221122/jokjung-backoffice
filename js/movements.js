import { supabase } from './supabase.js'
import { requireBackoffice, setupShell, money, number, esc } from './auth.js'

let rows = []
const ctx = await requireBackoffice()
if (ctx) { setupShell(ctx,'movements'); setMonth(); await load() }

function setMonth(){
 const n=new Date(),s=new Date(n.getFullYear(),n.getMonth(),1)
 const f=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
 document.getElementById('dateFrom').value=f(s);document.getElementById('dateTo').value=f(n)
}
async function load(){
 const {data,error}=await supabase.rpc('backoffice_list_movements',{p_limit:1000})
 if(error){document.getElementById('message').textContent=error.message;return}
 rows=Array.isArray(data)?data:[];render()
}
function typeText(t){return({stock_in:'รับเข้า',sale:'ขาย',waste:'ของเสีย',adjust_in:'ปรับเพิ่ม',adjust_out:'ปรับลด/เบิก',void:'คืนจากยกเลิก',production_in:'ผลิตเข้า',production_out:'ใช้ในการผลิต'})[t]||t}
function render(){
 const q=document.getElementById('search').value.trim().toLowerCase(),t=document.getElementById('type').value
 const from=document.getElementById('dateFrom').value,to=document.getElementById('dateTo').value
 const a=from?new Date(`${from}T00:00:00`):null,b=to?new Date(`${to}T23:59:59.999`):null
 const list=rows.filter(x=>{
   const d=new Date(x.created_at)
   return(!q||`${x.ingredient_name} ${x.note||''} ${x.created_by_name||''}`.toLowerCase().includes(q))
     &&(!t||x.movement_type===t)&&(!a||d>=a)&&(!b||d<=b)
 })
 document.getElementById('table').innerHTML=list.length?`<div class="table-wrap"><table><thead><tr><th>เวลา</th><th>วัตถุดิบ</th><th>ประเภท</th><th class="num">จำนวน</th><th class="num">ก่อน</th><th class="num">หลัง</th><th class="num">ต้นทุน/หน่วย</th><th>ผู้ทำ</th><th>หมายเหตุ</th></tr></thead><tbody>${list.map(x=>`<tr><td>${new Date(x.created_at).toLocaleString('th-TH')}</td><td><strong>${esc(x.ingredient_name)}</strong></td><td>${esc(typeText(x.movement_type))}</td><td class="num">${number(x.quantity)} ${esc(x.unit)}</td><td class="num">${number(x.stock_before)}</td><td class="num">${number(x.stock_after)}</td><td class="num">${money(x.unit_cost)}</td><td>${esc(x.created_by_name||'-')}</td><td>${esc(x.note||'')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">ไม่พบ Movement</div>'
}
['search','type','dateFrom','dateTo'].forEach(id=>document.getElementById(id).addEventListener(id==='search'?'input':'change',render))
document.getElementById('refreshBtn').onclick=load
