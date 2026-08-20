import { supabase } from './supabase.js'
import { requireBackoffice, setupShell, money, number, esc } from './auth.js'

let ingredients = []
let recipes = []
let batches = []
let recipeInputs = []
let batchInputs = []

function typeText(value) {
    return ({ raw:'Raw', prep:'Prep', beverage:'เครื่องดื่ม', packaging:'Packaging', consumable:'Consumable' })[value] || value
}

function monthBounds() {
    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    const to = new Date(now.getFullYear(), now.getMonth()+1, 1)
    to.setMilliseconds(-1)
    return { from: from.toISOString(), to: to.toISOString() }
}

function ingredientOptions(selected = '', allowPrep = true) {
    return ingredients
        .filter(x => x.is_active && (allowPrep || x.ingredient_type !== 'prep'))
        .map(x => `<option value="${x.id}" ${x.id===selected?'selected':''}>${esc(x.name)} • ${esc(typeText(x.ingredient_type))} • ${number(x.current_stock)} ${esc(x.unit)}</option>`)
        .join('')
}

function prepOptions(selected = '') {
    return ingredients
        .filter(x => x.is_active && x.ingredient_type === 'prep')
        .map(x => `<option value="${x.id}" ${x.id===selected?'selected':''}>${esc(x.name)} (${esc(x.unit)})</option>`)
        .join('')
}

async function loadIngredients() {
    const { data, error } = await supabase.rpc('backoffice_list_ingredients_v31')
    if (error) throw error
    ingredients = data || []
    document.getElementById('recipeOutput').innerHTML = '<option value="">-- เลือก Prep --</option>' + prepOptions()
    document.getElementById('batchOutput').innerHTML = '<option value="">-- เลือก Prep --</option>' + prepOptions()
}

async function loadRecipes() {
    const { data, error } = await supabase.rpc('backoffice_list_production_recipes')
    if (error) throw error
    recipes = data || []
    document.getElementById('batchRecipe').innerHTML =
        '<option value="">-- Manual --</option>' +
        recipes.filter(x => x.is_active).map(x => `<option value="${x.id}">${esc(x.output_name)}</option>`).join('')
    renderRecipes()
}

async function loadBatches() {
    const b = monthBounds()
    const { data, error } = await supabase.rpc('backoffice_list_production_batches', { p_from:b.from, p_to:b.to })
    if (error) throw error
    batches = data || []
    renderBatches()
    const summary = await supabase.rpc('backoffice_production_summary', { p_from:b.from, p_to:b.to })
    if (!summary.error) {
        const s = summary.data || {}
        document.getElementById('batchCount').textContent = number(s.batch_count,0)
        document.getElementById('inputCost').textContent = money(s.input_cost)
        document.getElementById('avgYield').textContent = `${Number(s.avg_yield_pct||0).toFixed(2)}%`
        document.getElementById('yieldLoss').textContent = money(s.yield_loss_value)
    }
}

function renderRecipes() {
    document.getElementById('recipeList').innerHTML = recipes.length ? recipes.map(r => `
        <article class="production-card">
            <div>
                <strong>${esc(r.output_name)}</strong>
                <small>มาตรฐาน ${number(r.standard_output_qty)} ${esc(r.output_unit)} • ${number(r.input_count,0)} Inputs</small>
                <small>Yield ${r.standard_yield_pct ? Number(r.standard_yield_pct).toFixed(2)+'%' : '-'}</small>
            </div>
            <button class="small-btn" data-edit-recipe="${r.id}">แก้ไข</button>
        </article>`).join('') : '<div class="empty">ยังไม่มีสูตร Prep</div>'
}

function renderBatches() {
    document.getElementById('batchList').innerHTML = batches.length ? batches.map(b => `
        <article class="production-card">
            <div>
                <strong>${esc(b.batch_no)} • ${esc(b.output_name)}</strong>
                <small>${new Date(b.created_at).toLocaleString('th-TH')} • Output ${number(b.actual_output_qty)} ${esc(b.output_unit)}</small>
                <small>Input Cost ${money(b.total_input_cost)} • Unit Cost ${money(b.output_unit_cost)}
                    ${b.actual_yield_pct != null ? ` • Yield ${Number(b.actual_yield_pct).toFixed(2)}%` : ''}
                </small>
                ${Number(b.yield_loss_value||0)>0 ? `<small class="loss">Yield Loss ${money(b.yield_loss_value)}</small>` : ''}
            </div>
            <button class="small-btn" data-view-batch="${b.id}">ดู</button>
        </article>`).join('') : '<div class="empty">ยังไม่มี Production Batch เดือนนี้</div>'
}

function renderRecipeInputs() {
    document.getElementById('recipeInputs').innerHTML = recipeInputs.map((r,i) => `
        <div class="production-input-row">
            <label class="field"><span>Input</span><select data-r-ing="${i}">${ingredientOptions(r.ingredient_id)}</select></label>
            <label class="field"><span>Standard Qty</span><input data-r-qty="${i}" type="number" min="0.001" step="0.001" value="${r.input_qty||''}"></label>
            <label class="yield-basis"><input type="checkbox" data-r-basis="${i}" ${r.is_yield_basis?'checked':''}> Yield Basis</label>
            <button class="danger-btn" data-r-remove="${i}">ลบ</button>
        </div>`).join('')
}

function openNewRecipe() {
    document.getElementById('recipeId').value = ''
    document.getElementById('recipeOutput').value = ''
    document.getElementById('standardOutput').value = '1'
    document.getElementById('standardYield').value = ''
    document.getElementById('recipeNote').value = ''
    document.getElementById('recipeActive').checked = true
    document.getElementById('recipeFormMessage').textContent = ''
    recipeInputs = [{ ingredient_id: ingredients.find(x=>x.is_active && x.ingredient_type!=='prep')?.id || '', input_qty:1, is_yield_basis:true }]
    renderRecipeInputs()
    document.getElementById('recipeModal').classList.remove('hidden')
}

async function editRecipe(id) {
    const { data, error } = await supabase.rpc('backoffice_get_production_recipe', { p_recipe_id:id })
    if (error) return document.getElementById('recipeMessage').textContent = error.message
    document.getElementById('recipeId').value = data.id
    document.getElementById('recipeOutput').value = data.output_ingredient_id
    document.getElementById('standardOutput').value = data.standard_output_qty
    document.getElementById('standardYield').value = data.standard_yield_pct ?? ''
    document.getElementById('recipeNote').value = data.note || ''
    document.getElementById('recipeActive').checked = data.is_active !== false
    recipeInputs = (data.inputs||[]).map(x => ({ ingredient_id:x.ingredient_id, input_qty:Number(x.input_qty), is_yield_basis:x.is_yield_basis }))
    renderRecipeInputs()
    document.getElementById('recipeFormMessage').textContent = ''
    document.getElementById('recipeModal').classList.remove('hidden')
}

async function saveRecipe() {
    const output = document.getElementById('recipeOutput').value
    if (!output) return rmsg('กรุณาเลือก Prep Output')
    const clean = recipeInputs.filter(x => x.ingredient_id && Number(x.input_qty)>0)
    if (!clean.length) return rmsg('กรุณาเพิ่ม Input')

    const standardOutput = Number(document.getElementById('standardOutput').value || 0)
    if (standardOutput <= 0) return rmsg('Standard Output Qty ต้องมากกว่า 0')

    const yieldRaw = document.getElementById('standardYield').value
    const standardYield = yieldRaw === '' ? null : Number(yieldRaw)
    if (standardYield !== null && (!Number.isFinite(standardYield) || standardYield <= 0)) {
        return rmsg('Standard Yield % ต้องมากกว่า 0')
    }
    const seen = new Set()
    for (const x of clean) {
        if (seen.has(x.ingredient_id)) return rmsg('Input ห้ามซ้ำ')
        seen.add(x.ingredient_id)
    }
    const { error } = await supabase.rpc('backoffice_save_production_recipe', {
        p_recipe_id: document.getElementById('recipeId').value || null,
        p_output_ingredient_id: output,
        p_standard_output_qty: standardOutput,
        p_standard_yield_pct: standardYield,
        p_note: document.getElementById('recipeNote').value || null,
        p_is_active: document.getElementById('recipeActive').checked,
        p_inputs: clean
    })
    if (error) return rmsg(error.message)
    document.getElementById('recipeModal').classList.add('hidden')
    await loadRecipes()
}

function rmsg(text) { document.getElementById('recipeFormMessage').textContent = text }

function renderBatchInputs() {
    document.getElementById('batchInputs').innerHTML = batchInputs.map((r,i) => {
        const ing = ingredients.find(x=>x.id===r.ingredient_id)
        return `<div class="production-input-row">
            <label class="field"><span>Input</span><select data-b-ing="${i}">${ingredientOptions(r.ingredient_id)}</select></label>
            <label class="field"><span>Qty ใช้จริง</span><input data-b-qty="${i}" type="number" min="0.001" step="0.001" value="${r.quantity||''}"></label>
            <label class="yield-basis"><input type="checkbox" data-b-basis="${i}" ${r.is_yield_basis?'checked':''}> Yield Basis</label>
            <div class="mini-note">${ing ? `Stock ${number(ing.current_stock)} ${esc(ing.unit)} • ${money(ing.cost_per_unit)}/หน่วย` : ''}</div>
            <button class="danger-btn" data-b-remove="${i}">ลบ</button>
        </div>`
    }).join('')
    updateEstimate()
}

function updateEstimate() {
    const outputQty = Number(document.getElementById('actualOutput').value||0)
    const cost = batchInputs.reduce((s,r)=>{
        const ing=ingredients.find(x=>x.id===r.ingredient_id)
        return s+Number(r.quantity||0)*Number(ing?.cost_per_unit||0)
    },0)
    const basisQty = batchInputs
        .filter(x => x.is_yield_basis)
        .reduce((sum, x) => sum + Number(x.quantity || 0), 0)

    const actualYield = basisQty > 0 && outputQty > 0
        ? outputQty / basisQty * 100
        : null

    const selectedRecipe = recipes.find(
        x => x.id === document.getElementById('batchRecipe').value
    )
    const standard = Number(selectedRecipe?.standard_yield_pct || 0)

    const expectedOutput = basisQty > 0 && standard > 0
        ? basisQty * standard / 100
        : 0

    const lossQty = actualYield != null && standard > 0 && actualYield < standard
        ? Math.max(expectedOutput - outputQty, 0)
        : 0
    const unitCost = outputQty>0 ? cost/outputQty : 0
    document.getElementById('batchEstimate').innerHTML = `
        <div><span>Input Cost</span><strong>${money(cost)}</strong></div>
        <div><span>Output Unit Cost</span><strong>${money(unitCost)}</strong></div>
        <div><span>Actual Yield</span><strong>${actualYield==null?'-':actualYield.toFixed(2)+'%'}</strong></div>
        <div><span>Yield Loss ประมาณ</span><strong class="${lossQty>0?'loss':''}">${money(lossQty*unitCost)}</strong></div>`
}

function openNewBatch() {
    document.getElementById('batchRecipe').value = ''
    document.getElementById('batchOutput').value = ''
    document.getElementById('actualOutput').value = ''
    document.getElementById('batchNote').value = ''
    document.getElementById('batchFormMessage').textContent = ''
    batchInputs = [{ ingredient_id: ingredients.find(x=>x.is_active && x.ingredient_type!=='prep')?.id || '', quantity:1, is_yield_basis:true }]
    renderBatchInputs()
    document.getElementById('batchModal').classList.remove('hidden')
}

async function loadRecipeToBatch(id) {
    if (!id) return
    const { data, error } = await supabase.rpc('backoffice_get_production_recipe', { p_recipe_id:id })
    if (error) return bmsg(error.message)
    document.getElementById('batchOutput').value = data.output_ingredient_id
    document.getElementById('actualOutput').value = data.standard_output_qty
    batchInputs = (data.inputs||[]).map(x => ({ ingredient_id:x.ingredient_id, quantity:Number(x.input_qty), is_yield_basis:x.is_yield_basis }))
    renderBatchInputs()
}

async function postBatch() {
    const output = document.getElementById('batchOutput').value
    const qty = Number(document.getElementById('actualOutput').value||0)
    if (!output || qty<=0) return bmsg('กรุณาเลือก Output และจำนวนจริง')
    const clean = batchInputs.filter(x=>x.ingredient_id && Number(x.quantity)>0)
    if (!clean.length) return bmsg('กรุณาเพิ่ม Input ที่ใช้จริง')
    const seen = new Set()
    for (const x of clean) {
        if (seen.has(x.ingredient_id)) return bmsg('Input ห้ามซ้ำ')
        seen.add(x.ingredient_id)
        const ing = ingredients.find(i=>i.id===x.ingredient_id)
        if (Number(x.quantity)>Number(ing?.current_stock||0)) return bmsg(`${ing?.name||'วัตถุดิบ'} Stock ไม่พอ`)
    }
    if (!confirm('ยืนยัน Post Production? ระบบจะตัด Input และเพิ่ม Prep Output เข้า Stock ทันที')) return
    const { error } = await supabase.rpc('backoffice_post_production_batch', {
        p_recipe_id: document.getElementById('batchRecipe').value || null,
        p_output_ingredient_id: output,
        p_actual_output_qty: qty,
        p_note: document.getElementById('batchNote').value || null,
        p_inputs: clean
    })
    if (error) return bmsg(error.message.includes('INSUFFICIENT_STOCK') ? 'Stock วัตถุดิบไม่พอ' : error.message)
    document.getElementById('batchModal').classList.add('hidden')
    await loadIngredients()
    await loadBatches()
}

function bmsg(text) { document.getElementById('batchFormMessage').textContent = text }

async function viewBatch(id) {
    const { data, error } = await supabase.rpc('backoffice_get_production_batch', { p_batch_id:id })
    if (error) return document.getElementById('batchMessage').textContent = error.message
    document.getElementById('detailTitle').textContent = `${data.batch_no} • ${data.output_name}`
    document.getElementById('detailSub').textContent = new Date(data.created_at).toLocaleString('th-TH')
    document.getElementById('detailKpis').innerHTML = `
        <article class="kpi-card"><span>Output</span><strong>${number(data.actual_output_qty)} ${esc(data.output_unit)}</strong></article>
        <article class="kpi-card"><span>Input Cost</span><strong>${money(data.total_input_cost)}</strong></article>
        <article class="kpi-card"><span>Unit Cost</span><strong>${money(data.output_unit_cost)}</strong></article>
        <article class="kpi-card"><span>Yield</span><strong>${data.actual_yield_pct==null?'-':Number(data.actual_yield_pct).toFixed(2)+'%'}</strong><small>Standard ${data.standard_yield_pct==null?'-':Number(data.standard_yield_pct).toFixed(2)+'%'}</small></article>`
    document.getElementById('detailInputs').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Input</th><th class="num">Qty</th><th class="num">Cost/Unit</th><th class="num">Line Cost</th><th>Yield Basis</th></tr></thead><tbody>${(data.inputs||[]).map(x=>`<tr><td><strong>${esc(x.ingredient_name)}</strong><br><small>${esc(x.unit)}</small></td><td class="num">${number(x.quantity)}</td><td class="num">${money(x.unit_cost)}</td><td class="num">${money(x.line_cost)}</td><td>${x.is_yield_basis?'✓':'-'}</td></tr>`).join('')}</tbody></table></div>
        <div class="production-result"><span>Yield Loss</span><strong class="${Number(data.yield_loss_value)>0?'loss':''}">${money(data.yield_loss_value)}</strong></div>`
    document.getElementById('detailModal').classList.remove('hidden')
}

document.getElementById('newRecipeBtn').onclick = openNewRecipe
document.getElementById('newBatchBtn').onclick = openNewBatch
document.getElementById('closeRecipe').onclick = () => document.getElementById('recipeModal').classList.add('hidden')
document.getElementById('closeBatch').onclick = () => document.getElementById('batchModal').classList.add('hidden')
document.getElementById('closeDetail').onclick = () => document.getElementById('detailModal').classList.add('hidden')
document.getElementById('saveRecipeBtn').onclick = saveRecipe
document.getElementById('postBatchBtn').onclick = postBatch
document.getElementById('addRecipeInput').onclick = () => { recipeInputs.push({ingredient_id:'',input_qty:1,is_yield_basis:false}); renderRecipeInputs() }
document.getElementById('addBatchInput').onclick = () => { batchInputs.push({ingredient_id:'',quantity:1,is_yield_basis:false}); renderBatchInputs() }
document.getElementById('batchRecipe').onchange = e => loadRecipeToBatch(e.target.value)
document.getElementById('actualOutput').oninput = updateEstimate
document.getElementById('batchOutput').onchange = updateEstimate

document.getElementById('recipeInputs').oninput = e => {
    if (e.target.dataset.rQty !== undefined) recipeInputs[+e.target.dataset.rQty].input_qty = Number(e.target.value||0)
}
document.getElementById('recipeInputs').onchange = e => {
    if (e.target.dataset.rIng !== undefined) recipeInputs[+e.target.dataset.rIng].ingredient_id = e.target.value
    if (e.target.dataset.rBasis !== undefined) {
        const i = +e.target.dataset.rBasis
        recipeInputs[i].is_yield_basis = e.target.checked
        renderRecipeInputs()
    }
}
document.getElementById('recipeInputs').onclick = e => {
    const b=e.target.closest('[data-r-remove]')
    if(b){recipeInputs.splice(+b.dataset.rRemove,1);renderRecipeInputs()}
}

document.getElementById('batchInputs').oninput = e => {
    if (e.target.dataset.bQty !== undefined) batchInputs[+e.target.dataset.bQty].quantity = Number(e.target.value||0)
    updateEstimate()
}
document.getElementById('batchInputs').onchange = e => {
    if (e.target.dataset.bIng !== undefined) batchInputs[+e.target.dataset.bIng].ingredient_id = e.target.value
    if (e.target.dataset.bBasis !== undefined) {
        const i = +e.target.dataset.bBasis
        batchInputs[i].is_yield_basis = e.target.checked
        renderBatchInputs()
    } else updateEstimate()
}
document.getElementById('batchInputs').onclick = e => {
    const b=e.target.closest('[data-b-remove]')
    if(b){batchInputs.splice(+b.dataset.bRemove,1);renderBatchInputs()}
}
document.getElementById('recipeList').onclick = e => {
    const b=e.target.closest('[data-edit-recipe]')
    if(b) editRecipe(b.dataset.editRecipe)
}
document.getElementById('batchList').onclick = e => {
    const b=e.target.closest('[data-view-batch]')
    if(b) viewBatch(b.dataset.viewBatch)
}

const ctx = await requireBackoffice()
if (ctx) {
    setupShell(ctx, 'production')
    try {
        await loadIngredients()
        await loadRecipes()
        await loadBatches()
    } catch (error) {
        document.getElementById('batchMessage').textContent = error.message || 'โหลด Production ไม่สำเร็จ'
    }
}
