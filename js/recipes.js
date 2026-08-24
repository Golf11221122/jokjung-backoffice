import { supabase } from './supabase.js'
import { requireBackoffice, setupShell, money, esc } from './auth.js'

let products=[]
let ingredients=[]
let selected=null
let recipe=[]

function typeText(v){return({raw:'Raw',prep:'Prep',beverage:'เครื่องดื่ม',packaging:'Packaging',consumable:'Consumable'})[v]||v}
function recipeUnitCost(ing){return Number(ing?.effective_cost_per_unit ?? ing?.cost_per_unit ?? 0)}
function costHint(ing){
    if(!ing)return''
    if(ing.ingredient_type==='raw'){
        const y=Number(ing.usable_yield_pct||100)
        return ` • Yield ${y.toFixed(2)}% • ใช้จริง ${money(recipeUnitCost(ing))}/${esc(ing.unit)}`
    }
    return ` • ${money(recipeUnitCost(ing))}/${esc(ing.unit)}`
}
function msg(t=''){document.getElementById('message').textContent=t}

async function init(){
    const [p,i]=await Promise.all([
        supabase.rpc('backoffice_list_products'),
        supabase.rpc('backoffice_list_ingredients_v32')
    ])
    if(p.error)return msg(p.error.message)
    if(i.error)return msg(i.error.message)
    products=Array.isArray(p.data)?p.data:[]
    ingredients=(Array.isArray(i.data)?i.data:[]).filter(x=>x.is_active)
    renderProducts()

    // Cost Fix Center: เปิด Recipe ของเมนูที่เลือกให้อัตโนมัติ
    const requestedProductId =
        new URLSearchParams(
            window.location.search
        ).get('product_id')

    if (
        requestedProductId
        &&
        products.some(
            product =>
                product.id ===
                requestedProductId
        )
    ) {
        await selectProduct(
            requestedProductId
        )
    }
}
function renderProducts(){
    const q=document.getElementById('productSearch').value.trim().toLowerCase()
    const list=products.filter(x=>!q||`${x.name} ${x.sku||''}`.toLowerCase().includes(q))
    document.getElementById('products').innerHTML=list.length?list.map(x=>`
        <button class="product-item ${selected?.id===x.id?'active':''}" data-product="${x.id}">
        <strong>${esc(x.name)}</strong><br><small>ขาย ${money(x.price)} • ต้นทุนเดิม ${money(x.cost)}</small></button>`).join(''):'<div class="empty">ไม่พบสินค้า</div>'
}
async function selectProduct(id){
    selected=products.find(x=>x.id===id)
    renderProducts()
    document.getElementById('recipeTitle').textContent=selected.name
    document.getElementById('recipeSubtitle').textContent=`ราคาขาย ${money(selected.price)} • Prep จะใช้ต้นทุนที่คำนวณจาก Production`
    document.getElementById('addRowBtn').disabled=false
    document.getElementById('saveRecipeBtn').disabled=false
    const{data,error}=await supabase.rpc('backoffice_get_product_recipe',{p_product_id:id})
    if(error)return msg(error.message)
    recipe=(Array.isArray(data)?data:[]).map(x=>({ingredient_id:x.ingredient_id,quantity_used:Number(x.quantity_used||0)}))
    renderRecipe()
}
function addRow(){recipe.push({ingredient_id:ingredients[0]?.id||'',quantity_used:0});renderRecipe()}
function renderRecipe(){
    const w=document.getElementById('recipeRows')
    w.innerHTML=recipe.length?recipe.map((r,i)=>`<div class="recipe-row">
        <label class="field"><span>วัตถุดิบ</span><select data-ing="${i}">
        ${ingredients.map(x=>`<option value="${x.id}" ${x.id===r.ingredient_id?'selected':''}>${esc(x.name)} • ${esc(typeText(x.ingredient_type))} (${esc(x.unit)})${costHint(x)}</option>`).join('')}
        </select></label>
        <label class="field"><span>จำนวนใช้/1 หน่วยขาย</span><input data-qty="${i}" type="number" min="0" step="0.001" value="${r.quantity_used}"></label>
        <button class="danger-btn" data-remove="${i}">ลบ</button></div>`).join(''):'<div class="empty">ยังไม่มี Recipe</div>'
    renderCost()
}
function renderCost(){
    let cost=0,prepCost=0,rawCost=0
    for(const r of recipe){
        const ing=ingredients.find(x=>x.id===r.ingredient_id)
        const line=Number(r.quantity_used||0)*recipeUnitCost(ing)
        cost+=line
        if(ing?.ingredient_type==='prep')prepCost+=line;else rawCost+=line
    }
    const e=document.getElementById('costSummary')
    e.classList.remove('hidden')
    const price=Number(selected?.price||0),pct=price>0?cost/price*100:0
    e.innerHTML=`<span>ต้นทุน Recipe</span><strong>${money(cost)}</strong>
    <small>Food Cost ${pct.toFixed(2)}% • กำไรขั้นต้น ${money(price-cost)} • Prep ${money(prepCost)} • อื่นๆ ${money(rawCost)}</small>`
}
async function save(){
    if(!selected)return
    const clean=recipe.filter(r=>r.ingredient_id&&Number(r.quantity_used)>0)
    const seen=new Set()
    for(const r of clean){if(seen.has(r.ingredient_id))return msg('วัตถุดิบในสูตรห้ามซ้ำ');seen.add(r.ingredient_id)}
    const{error}=await supabase.rpc('backoffice_save_product_recipe',{p_product_id:selected.id,p_recipe:clean})
    if(error)return msg(error.message)
    const sync=await supabase.rpc('backoffice_bulk_cost_sync_apply',{p_product_ids:[selected.id]})
    if(sync.error)return msg('บันทึก Recipe แล้ว แต่ Sync ต้นทุนสินค้าไม่สำเร็จ: '+sync.error.message)
    msg('บันทึก Recipe และ Sync ต้นทุนสำเร็จ')
    await selectProduct(selected.id)
}

document.getElementById('productSearch').oninput=renderProducts
document.getElementById('products').onclick=e=>{const b=e.target.closest('[data-product]');if(b)selectProduct(b.dataset.product)}
document.getElementById('addRowBtn').onclick=addRow
document.getElementById('saveRecipeBtn').onclick=save
document.getElementById('recipeRows').oninput=e=>{if(e.target.dataset.qty!==undefined){recipe[+e.target.dataset.qty].quantity_used=Number(e.target.value||0);renderCost()}}
document.getElementById('recipeRows').onchange=e=>{if(e.target.dataset.ing!==undefined){recipe[+e.target.dataset.ing].ingredient_id=e.target.value;renderCost()}}
document.getElementById('recipeRows').onclick=e=>{const b=e.target.closest('[data-remove]');if(b){recipe.splice(+b.dataset.remove,1);renderRecipe()}}

const ctx=await requireBackoffice()
if(ctx){setupShell(ctx,'recipes');await init()}
