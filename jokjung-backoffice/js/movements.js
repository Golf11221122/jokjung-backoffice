import { supabase } from './supabase.js'
import { requireBackoffice, setupShell, money, number, esc } from './auth.js'
let rows=[]
const ctx=await requireBackoffice()
if(ctx){setupShell(ctx,'movements');await load()}
async function load(){const{data,error}=await supabase.rpc('backoffice_list_movements',{p_limit:500});if(error)return msg(error.message);rows=Array.isArray(data)?data:[];render()}
function msg(t=''){document.getElementById('message').textContent=t}
function render(){const q=document.getElementById('search').value.trim().toLowerCase(),type=document.getElementById('type').value;const list=rows.filter(x=>(!q||`${x.ingredient_name} ${x.note||''} ${x.created_by_name||''}`.toLowerCase().includes(q))&&(!type||x.movement_type===type));document.getElementById('table').innerHTML=list.length?`<div class="table-wrap"><table><thead><tr><th>วันเวลา</th><th>วัตถุดิบ</th><th>ประเภท</th><th class="num">จำนวน</th><th class="num">ก่อน</th><th class="num">หลัง</th><th class="num">ต้นทุน</th><th>ผู้ทำ</th><th>หมายเหตุ</th></tr></thead><tbody>${list.map(x=>`<tr><td>${new Date(x.created_at).toLocaleString('th-TH')}</td><td>${esc(x.ingredient_name)}</td><td>${esc(x.movement_type)}</td><td class="num">${number(x.quantity)} ${esc(x.unit)}</td><td class="num">${number(x.stock_before)}</td><td class="num">${number(x.stock_after)}</td><td class="num">${money(x.unit_cost)}</td><td>${esc(x.created_by_name||'-')}</td><td>${esc(x.note||'')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">ไม่พบ Movement</div>'}
document.getElementById('refreshBtn').onclick=load;document.getElementById('search').oninput=render;document.getElementById('type').onchange=render
