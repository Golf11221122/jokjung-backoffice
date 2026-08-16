import { supabase } from './supabase.js'
import { requireBackoffice, setupShell, money, number, esc } from './auth.js'

let products=[],ingredients=[],selected=null,recipe=[]
const ctx=await requireBackoffice()
if(ctx){setupShell(ctx,'recipes');await init()}

async function init(){
 const [p,i]=await Promise.all([supabase.rpc('backoffice_list_products'),supabase.rpc('backoffice_list_ingredients')])
 if(p.error)return msg(p.error.message);if(i.error)return msg(i.error.message)
 products=Array.isArray(p.data)?p.data:[];ingredients=(Array.isArray(i.data)?i.data:[]).filter(x=>x.is_active)
 renderProducts()
}
function msg(t=''){document.getElementById('message').textContent=t}
function renderProducts(){
 const q=document.getElementById('productSearch').value.trim().toLowerCase()
 const list=products.filter(x=>!q||`${x.name} ${x.sku||''}`.toLowerCase().includes(q))
 document.getElementById('products').innerHTML=list.length?list.map(x=>`<button class="product-item ${selected?.id===x.id?'active':''}" data-product="${x.id}"><strong>${esc(x.name)}</strong><br><small>ขาย ${money(x.price)} • Cost ${money(x.cost)}</small></button>`).join(''):'<div class="empty">ไม่พบสินค้า</div>'
}
async function selectProduct(id){
 selected=products.find(x=>x.id===id);renderProducts()
 document.getElementById('recipeTitle').textContent=selected.name
 document.getElementById('recipeSubtitle').textContent=`ราคาขาย ${money(selected.price)}`
 document.getElementById('addRowBtn').disabled=false;document.getElementById('saveRecipeBtn').disabled=false
 const{data,error}=await supabase.rpc('backoffice_get_product_recipe',{p_product_id:id})
 if(error)return msg(error.message)
 recipe=(Array.isArray(data)?data:[]).map(x=>({ingredient_id:x.ingredient_id,quantity_used:Number(x.quantity_used||0)}))
 renderRecipe()
}
function addRow(){recipe.push({ingredient_id:ingredients[0]?.id||'',quantity_used:0});renderRecipe()}
function renderRecipe(){
 const wrap=document.getElementById('recipeRows')
 if(!selected){wrap.innerHTML='<div class="empty">เลือกสินค้าก่อน</div>';return}
 wrap.innerHTML=recipe.length?recipe.map((r,i)=>`<div class="recipe-row"><label class="field"><span>วัตถุดิบ</span><select data-ing="${i}">${ingredients.map(x=>`<option value="${x.id}" ${x.id===r.ingredient_id?'selected':''}>${esc(x.name)} (${esc(x.unit)})</option>`).join('')}</select></label><label class="field"><span>จำนวนใช้</span><input data-qty="${i}" type="number" min="0" step="0.001" value="${r.quantity_used}"></label><button class="danger-btn" data-remove="${i}">ลบ</button></div>`).join(''):'<div class="empty">สินค้านี้ยังไม่มี Recipe</div>'
 renderCost()
}
function renderCost(){
 let cost=0
 for(const r of recipe){const ing=ingredients.find(x=>x.id===r.ingredient_id);cost+=Number(r.quantity_used||0)*Number(ing?.cost_per_unit||0)}
 const el=document.getElementById('costSummary');el.classList.remove('hidden')
 const margin=Number(selected?.price||0)-cost
 el.innerHTML=`<span>ต้นทุนจาก Recipe</span><strong>${money(cost)}</strong><small>ราคาขาย ${money(selected?.price)} • กำไรขั้นต้นก่อนค่าใช้จ่ายอื่น ${money(margin)}</small>`
}
async function save(){
 if(!selected)return
 const clean=recipe.filter(r=>r.ingredient_id&&Number(r.quantity_used)>0)
 const{error}=await supabase.rpc('backoffice_save_product_recipe',{p_product_id:selected.id,p_recipe:clean})
 if(error)return msg(error.message)
 msg('บันทึก Recipe สำเร็จ')
 await selectProduct(selected.id)
}
document.getElementById('productSearch').oninput=renderProducts
document.getElementById('products').onclick=e=>{const b=e.target.closest('[data-product]');if(b)selectProduct(b.dataset.product)}
document.getElementById('addRowBtn').onclick=addRow
document.getElementById('saveRecipeBtn').onclick=save
document.getElementById('recipeRows').oninput=e=>{if(e.target.dataset.qty!==undefined){recipe[Number(e.target.dataset.qty)].quantity_used=Number(e.target.value||0);renderCost()}}
document.getElementById('recipeRows').onchange=e=>{if(e.target.dataset.ing!==undefined){recipe[Number(e.target.dataset.ing)].ingredient_id=e.target.value;renderCost()}}
document.getElementById('recipeRows').onclick=e=>{const b=e.target.closest('[data-remove]');if(b){recipe.splice(Number(b.dataset.remove),1);renderRecipe()}}
