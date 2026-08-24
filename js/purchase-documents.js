import { supabase } from './supabase.js'
import { requireBackoffice, setupShell, money, esc } from './auth.js'

const BUCKET = 'purchase-documents'
let ctx = null
let rows = []
let suppliers = []
let purchaseOrders = []
let currentAttachments = []
let documentItems = []
let currentPoDetail = null

const $ = id => document.getElementById(id)
const num = id => Number($(id).value || 0)

const documentTypeLabel = v => ({
    receipt:'Receipt / ใบเสร็จ',
    tax_invoice:'Tax Invoice / ใบกำกับภาษี',
    invoice:'Invoice',
    credit_note:'Credit Note',
    debit_note:'Debit Note',
    other:'Other'
})[v] || v

const paymentLabel = v => ({
    unpaid:'ยังไม่ชำระ',
    partial:'ชำระบางส่วน',
    paid:'ชำระแล้ว',
    void:'ยกเลิก'
})[v] || v || '-'

function today() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function toLocalInput(v) {
    if (!v) return ''
    const d = new Date(v)
    const local = new Date(d.getTime() - d.getTimezoneOffset()*60000)
    return local.toISOString().slice(0,16)
}

function message(text='') { $('message').textContent = text }
function formMessage(text='') { $('formMessage').textContent = text }

async function loadSuppliers() {
    const { data, error } = await supabase.rpc('backoffice_list_suppliers')
    if (error) throw error
    suppliers = (data || []).filter(x => x.is_active !== false)

    const options = '<option value="">-- ไม่ระบุ Supplier --</option>' +
        suppliers.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')

    $('supplier').innerHTML = options
    $('supplierFilter').innerHTML =
        '<option value="">Supplier ทั้งหมด</option>' +
        suppliers.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')
}

async function loadPurchaseOrders() {
    const { data, error } = await supabase.rpc('backoffice_list_purchase_orders')
    if (error) throw error
    purchaseOrders = Array.isArray(data) ? data : []
    renderPoOptions()
}

function renderPoOptions(selected='') {
    const supplierId = $('supplier').value
    const list = purchaseOrders.filter(x =>
        !supplierId || x.supplier_id === supplierId
    )
    $('purchaseOrder').innerHTML =
        '<option value="">-- ไม่อ้างอิง PO --</option>' +
        list.map(x => `<option value="${x.id}" ${x.id===selected?'selected':''}>${esc(x.po_no)} • ${esc(x.supplier_name || '')}</option>`).join('')
}

async function loadDocuments() {
    message('กำลังโหลด...')

    const { data, error } = await supabase.rpc(
        'backoffice_list_purchase_documents_v16',
        {
            p_from: $('dateFrom').value || null,
            p_to: $('dateTo').value || null,
            p_supplier_id: $('supplierFilter').value || null,
            p_document_type: $('typeFilter').value || null,
            p_payment_status: $('paymentFilter').value || null
        }
    )

    if (error) {
        message(error.message)
        return
    }

    rows = Array.isArray(data) ? data : []
    render()
    message('')
}

function filteredRows() {
    const q = $('search').value.trim().toLowerCase()
    return rows.filter(x => {
        if (!q) return true
        return [
            x.internal_no,x.document_no,x.supplier_name,x.po_no,x.document_type
        ].filter(Boolean).join(' ').toLowerCase().includes(q)
    })
}

function renderKpis(list) {
    const total = list.reduce((s,x)=>s+Number(x.total_amount||0),0)
    const paid = list.reduce((s,x)=>s+Number(x.paid_amount||0),0)
    const due = list.reduce((s,x)=>s+Number(x.balance_due||0),0)
    const files = list.reduce((s,x)=>s+Number(x.attachment_count||0),0)
    const matched = list.filter(x=>x.three_way_status==='matched').length
    const differences = list.filter(x=>x.purchase_order_id && x.three_way_status!=='matched').length

    $('kpis').innerHTML = `
        <article class="kpi-card"><span>เอกสาร</span><strong>${list.length.toLocaleString('th-TH')}</strong></article>
        <article class="kpi-card"><span>ยอดเอกสาร</span><strong>${money(total)}</strong></article>
        <article class="kpi-card"><span>ชำระแล้ว</span><strong>${money(paid)}</strong></article>
        <article class="kpi-card"><span>คงค้าง</span><strong>${money(due)}</strong></article>
        <article class="kpi-card"><span>PO ตรงกัน</span><strong>${matched.toLocaleString('th-TH')}</strong></article>
        <article class="kpi-card"><span>PO มีส่วนต่าง</span><strong>${differences.toLocaleString('th-TH')}</strong></article>
        <article class="kpi-card"><span>ไฟล์แนบ</span><strong>${files.toLocaleString('th-TH')}</strong></article>
    `
}

function render() {
    const list = filteredRows()
    renderKpis(list)

    $('table').innerHTML = list.length ? `
        <div class="table-wrap">
        <table>
        <thead><tr>
            <th>เลขภายใน</th><th>ประเภท / เลขเอกสาร</th><th>Supplier / PO</th><th>วันที่</th>
            <th class="num">Total</th><th class="num">คงค้าง</th><th>3-Way</th><th>ชำระ</th><th>ไฟล์</th><th>จัดการ</th>
        </tr></thead>
        <tbody>${list.map(x => `
            <tr>
                <td><strong>${esc(x.internal_no)}</strong></td>
                <td><strong>${esc(documentTypeLabel(x.document_type))}</strong><div class="mini-note">${esc(x.document_no || '-')}</div></td>
                <td>${esc(x.supplier_name || '-')}<div class="mini-note">${esc(x.po_no || 'ไม่อ้างอิง PO')}</div></td>
                <td>${new Date(x.document_date+'T00:00:00').toLocaleDateString('th-TH')}</td>
                <td class="num">${money(x.total_amount)}</td>
                <td class="num">${money(x.balance_due)}</td>
                <td>
                    <span class="reconcile-badge ${esc(x.three_way_status || 'no_po')}">${
                        ({
                            matched:'ผ่าน',
                            no_po:'ไม่มี PO',
                            items_missing:'ไม่มีรายการ',
                            item_mismatch:'สินค้าไม่ตรง',
                            not_fully_received:'รับไม่ครบ',
                            quantity_difference:'จำนวนต่าง',
                            price_difference:'ราคาต่าง',
                            amount_difference:'ยอดต่าง'
                        })[x.three_way_status] || '-'
                    }</span>
                    ${x.purchase_order_id ? `<div class="mini-note">${money(x.three_way_amount_variance || 0)}</div>` : ''}
                </td>
                <td><span class="doc-status ${esc(x.payment_status)}">${esc(paymentLabel(x.payment_status))}</span></td>
                <td>${Number(x.attachment_count||0)} ไฟล์</td>
                <td><button class="small-btn" data-edit="${x.id}">เปิด / แก้ไข</button></td>
            </tr>
        `).join('')}</tbody>
        </table></div>
    ` : '<div class="empty">ยังไม่มีเอกสารซื้อ</div>'
}

function resetForm() {
    $('documentId').value = ''
    $('modalTitle').textContent = 'เพิ่มเอกสารซื้อ'
    $('internalNoText').textContent = 'เลขภายในจะสร้างอัตโนมัติ'
    $('documentType').value = 'receipt'
    $('documentNo').value = ''
    $('supplier').value = ''
    renderPoOptions()
    $('purchaseOrder').value = ''
    $('documentDate').value = today()
    $('dueDate').value = ''
    $('currencyCode').value = 'THB'
    $('exchangeRate').value = '1'
    $('subtotal').value = '0'
    $('discountAmount').value = '0'
    $('shippingAmount').value = '0'
    $('taxMode').value = 'none'
    $('taxRate').value = '7'
    $('taxAmount').value = '0'
    $('withholdingTax').value = '0'
    $('totalAmount').value = '0'
    $('paidAmount').value = '0'
    $('paymentMethod').value = ''
    $('paymentStatus').value = 'unpaid'
    $('paidAt').value = ''
    $('note').value = ''
    $('files').value = ''
    currentAttachments = []
    documentItems = []
    currentPoDetail = null
    renderDocumentItems()
    renderThreeWay()
    formMessage('')
    renderAttachments()
    calculateAmounts(true)
}

function openNew() {
    resetForm()
    $('modal').classList.remove('hidden')
}

async function openEdit(id) {
    formMessage('กำลังโหลด...')
    $('modal').classList.remove('hidden')

    const { data, error } = await supabase.rpc(
        'backoffice_get_purchase_document_v16',
        { p_document_id:id }
    )

    if (error) {
        formMessage(error.message)
        return
    }

    $('documentId').value = data.id
    $('modalTitle').textContent = 'แก้ไขเอกสารซื้อ'
    $('internalNoText').textContent = `เลขภายใน: ${data.internal_no}`
    $('documentType').value = data.document_type
    $('documentNo').value = data.document_no || ''
    $('supplier').value = data.supplier_id || ''
    renderPoOptions(data.purchase_order_id || '')
    $('purchaseOrder').value = data.purchase_order_id || ''
    $('documentDate').value = data.document_date || today()
    $('dueDate').value = data.due_date || ''
    $('currencyCode').value = data.currency_code || 'THB'
    $('exchangeRate').value = Number(data.exchange_rate || 1)
    $('subtotal').value = Number(data.subtotal || 0)
    $('discountAmount').value = Number(data.discount_amount || 0)
    $('shippingAmount').value = Number(data.shipping_amount || 0)
    $('taxMode').value = data.tax_mode || 'none'
    $('taxRate').value = Number(data.tax_rate || 0)
    $('taxAmount').value = Number(data.tax_amount || 0)
    $('withholdingTax').value = Number(data.withholding_tax_amount || 0)
    $('totalAmount').value = Number(data.total_amount || 0)
    $('paidAmount').value = Number(data.paid_amount || 0)
    $('paymentMethod').value = data.payment_method || ''
    $('paymentStatus').value = data.payment_status || 'unpaid'
    $('paidAt').value = toLocalInput(data.paid_at)
    $('note').value = data.note || ''
    $('files').value = ''
    currentAttachments = Array.isArray(data.attachments) ? data.attachments : []
    documentItems = Array.isArray(data.document_items) ? data.document_items.map(x => ({...x})) : []
    currentPoDetail = null
    if (data.purchase_order_id) {
        const poResult = await supabase.rpc('backoffice_get_purchase_order',{p_purchase_order_id:data.purchase_order_id})
        if (!poResult.error) currentPoDetail = poResult.data
    }
    renderDocumentItems()
    renderThreeWay(data.three_way)
    formMessage('')
    renderAttachments()
    calculateAmounts(false)
    renderReconciliation(data)
}

function calculateAmounts(forceTotal=false) {
    const subtotal = num('subtotal')
    const discount = num('discountAmount')
    const shipping = num('shippingAmount')
    const rate = num('taxRate')
    const mode = $('taxMode').value
    const net = Math.max(subtotal-discount+shipping,0)

    let tax = num('taxAmount')
    let total = num('totalAmount')

    if (mode === 'none') {
        tax = 0
        if (forceTotal) total = net
    } else if (mode === 'exclusive') {
        tax = Math.round((net * rate/100 + Number.EPSILON)*100)/100
        if (forceTotal) total = net + tax
    } else if (mode === 'inclusive') {
        tax = rate > 0
            ? Math.round((net - net/(1+rate/100) + Number.EPSILON)*100)/100
            : 0
        if (forceTotal) total = net
    }

    $('taxAmount').value = tax.toFixed(2)
    if (forceTotal) $('totalAmount').value = Math.max(total,0).toFixed(2)

    $('basePreview').textContent = money(net)
    $('vatPreview').textContent = money(tax)
    $('balancePreview').textContent =
        money(Math.max(num('totalAmount')-num('paidAmount'),0))

    if ($('reconcilePanel')) renderReconciliation()
    if ($('threeWayPanel')) renderThreeWay()
}

function autoPaymentStatus() {
    const total = num('totalAmount')
    const paid = num('paidAmount')
    if ($('paymentStatus').value === 'void') return
    $('paymentStatus').value =
        paid <= 0 ? 'unpaid' :
        paid >= total && total > 0 ? 'paid' : 'partial'
}

async function saveDocument() {
    const btn = $('saveBtn')
    formMessage('')

    if (!$('documentDate').value) return formMessage('กรุณาระบุวันที่เอกสาร')
    if (!/^[A-Za-z]{3}$/.test($('currencyCode').value.trim())) {
        return formMessage('Currency Code ต้องเป็น 3 ตัวอักษร เช่น THB')
    }

    autoPaymentStatus()

    btn.disabled = true
    btn.textContent = 'กำลังบันทึก...'

    try {
        const { data:id, error } = await supabase.rpc(
            'backoffice_save_purchase_document_v16',
            {
                p_document_id: $('documentId').value || null,
                p_supplier_id: $('supplier').value || null,
                p_purchase_order_id: $('purchaseOrder').value || null,
                p_document_type: $('documentType').value,
                p_document_no: $('documentNo').value.trim() || null,
                p_document_date: $('documentDate').value,
                p_due_date: $('dueDate').value || null,
                p_currency_code: $('currencyCode').value.trim().toUpperCase(),
                p_exchange_rate: num('exchangeRate') || 1,
                p_subtotal: num('subtotal'),
                p_discount_amount: num('discountAmount'),
                p_shipping_amount: num('shippingAmount'),
                p_tax_mode: $('taxMode').value,
                p_tax_rate: num('taxRate'),
                p_tax_amount: num('taxAmount'),
                p_withholding_tax_amount: num('withholdingTax'),
                p_total_amount: num('totalAmount'),
                p_payment_method: $('paymentMethod').value || null,
                p_payment_status: $('paymentStatus').value,
                p_paid_amount: num('paidAmount'),
                p_paid_at: $('paidAt').value ? new Date($('paidAt').value).toISOString() : null,
                p_note: $('note').value.trim() || null,
                p_items: documentItems.filter(x => x.ingredient_id && Number(x.quantity)>0)
            }
        )

        if (error) throw error

        $('documentId').value = id

        const selectedFiles = [...$('files').files]
        if (selectedFiles.length) {
            await uploadFiles(id, selectedFiles)
            $('files').value = ''
        }

        await loadDocuments()
        await openEdit(id)
        formMessage('บันทึกสำเร็จ')
    } catch (error) {
        console.error(error)
        formMessage(error.message || 'บันทึกไม่สำเร็จ')
    } finally {
        btn.disabled = false
        btn.textContent = 'บันทึกเอกสาร'
    }
}

function safeFileName(name) {
    return String(name || 'file')
        .replace(/[^\w.\-ก-๙]+/g,'_')
        .slice(-120)
}

async function uploadFiles(documentId, files) {
    const allowed = new Set(['application/pdf','image/jpeg','image/png','image/webp'])

    for (const file of files) {
        if (!allowed.has(file.type)) throw new Error(`ไม่รองรับไฟล์ ${file.name}`)
        if (file.size > 10*1024*1024) throw new Error(`${file.name} ใหญ่เกิน 10MB`)

        const path = `${ctx.branch_id}/${documentId}/${crypto.randomUUID()}-${safeFileName(file.name)}`

        const { error:uploadError } = await supabase.storage
            .from(BUCKET)
            .upload(path,file,{upsert:false,contentType:file.type})

        if (uploadError) throw uploadError

        const { error:registerError } = await supabase.rpc(
            'backoffice_register_purchase_document_attachment',
            {
                p_document_id:documentId,
                p_storage_path:path,
                p_file_name:file.name,
                p_mime_type:file.type,
                p_size_bytes:file.size
            }
        )

        if (registerError) {
            await supabase.storage.from(BUCKET).remove([path])
            throw registerError
        }
    }
}

async function renderAttachments() {
    $('attachmentCount').textContent = `${currentAttachments.length} ไฟล์`

    if (!currentAttachments.length) {
        $('attachments').innerHTML = '<div class="empty">ยังไม่มีไฟล์แนบ</div>'
        return
    }

    $('attachments').innerHTML = currentAttachments.map(a => `
        <div class="attachment-row">
            <div>
                <strong>${esc(a.file_name)}</strong>
                <small>${esc(a.mime_type || '')} • ${(Number(a.size_bytes||0)/1024).toFixed(1)} KB</small>
            </div>
            <div class="action-row">
                <button class="small-btn" data-open-file="${a.id}">เปิด</button>
                <button class="danger-btn" data-delete-file="${a.id}">ลบ</button>
            </div>
        </div>
    `).join('')
}

async function openAttachment(id) {
    const a = currentAttachments.find(x => x.id===id)
    if (!a) return

    const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(a.storage_path,60)

    if (error) return formMessage(error.message)
    window.open(data.signedUrl,'_blank','noopener')
}

async function deleteAttachment(id) {
    const a = currentAttachments.find(x => x.id===id)
    if (!a || !confirm(`ลบไฟล์ ${a.file_name}?`)) return

    const { error:storageError } = await supabase.storage
        .from(BUCKET)
        .remove([a.storage_path])

    if (storageError) return formMessage(storageError.message)

    const { error } = await supabase.rpc(
        'backoffice_delete_purchase_document_attachment',
        { p_attachment_id:id }
    )

    if (error) return formMessage(error.message)

    currentAttachments = currentAttachments.filter(x => x.id!==id)
    renderAttachments()
    await loadDocuments()
}



function availableIngredientList() {
    if (currentPoDetail?.items?.length) {
        return currentPoDetail.items.map(x => ({
            id:x.ingredient_id,
            name:x.ingredient_name,
            unit:x.unit
        }))
    }
    return []
}

function renderDocumentItems() {
    const wrap = $('documentItems')
    if (!wrap) return

    if (!documentItems.length) {
        wrap.innerHTML = '<div class="empty">ยังไม่มีรายการสินค้าในเอกสาร</div>'
        return
    }

    const options = availableIngredientList()

    wrap.innerHTML = documentItems.map((row,i) => {
        const choices = options.length
            ? options.map(x => `<option value="${x.id}" ${x.id===row.ingredient_id?'selected':''}>${esc(x.name)} (${esc(x.unit||'')})</option>`).join('')
            : `<option value="${row.ingredient_id||''}">${esc(row.ingredient_name||'วัตถุดิบ')}</option>`

        return `
        <div class="document-item-row">
            <label class="field">
                <span>วัตถุดิบ</span>
                <select data-doc-ing="${i}">
                    <option value="">-- เลือก --</option>
                    ${choices}
                </select>
            </label>
            <label class="field">
                <span>จำนวนใน Invoice</span>
                <input data-doc-qty="${i}" type="number" min="0.001" step="0.001" value="${Number(row.quantity||0)}">
            </label>
            <label class="field">
                <span>ราคา/หน่วย</span>
                <input data-doc-cost="${i}" type="number" min="0" step="0.0001" value="${Number(row.unit_cost||0)}">
            </label>
            <div class="document-item-total">
                <span>รวม</span>
                <strong>${money(Number(row.quantity||0)*Number(row.unit_cost||0))}</strong>
            </div>
            <button class="danger-btn" data-doc-remove="${i}" type="button">ลบ</button>
        </div>`
    }).join('')
}

async function loadPoDetail() {
    const poId = $('purchaseOrder').value
    currentPoDetail = null
    if (!poId) {
        renderDocumentItems()
        renderThreeWay()
        return null
    }

    const {data,error} = await supabase.rpc(
        'backoffice_get_purchase_order',
        {p_purchase_order_id:poId}
    )
    if (error) {
        formMessage(error.message)
        return null
    }
    currentPoDetail = data
    renderDocumentItems()
    renderThreeWay()
    return data
}

async function importPoItems() {
    const po = currentPoDetail || await loadPoDetail()
    if (!po) return formMessage('กรุณาเลือก PO ก่อน')
    if (!Array.isArray(po.items) || !po.items.length) {
        return formMessage('PO นี้ไม่มีรายการสินค้า')
    }

    if (documentItems.length && !confirm('แทนที่รายการในเอกสารด้วยรายการจาก PO?')) {
        return
    }

    documentItems = po.items.map(x => ({
        ingredient_id:x.ingredient_id,
        ingredient_name:x.ingredient_name,
        unit:x.unit,
        quantity:Number(x.ordered_qty||0),
        unit_cost:Number(x.unit_cost||0)
    }))

    renderDocumentItems()
    renderThreeWay()
}

function localThreeWay() {
    const po = currentPoDetail
    if (!po) return {status:'no_po',po_item_count:0,invoice_item_count:documentItems.length,fully_received_item_count:0,amount_variance:null}

    const poItems = Array.isArray(po.items) ? po.items : []
    if (!documentItems.length) return {
        status:'items_missing',
        po_item_count:poItems.length,
        invoice_item_count:0,
        fully_received_item_count:poItems.filter(x=>Number(x.received_qty)>=Number(x.ordered_qty)).length,
        amount_variance:documentBaseAmount()-Number(po.total_amount||0)
    }

    const docMap = new Map(documentItems.filter(x=>x.ingredient_id).map(x=>[x.ingredient_id,x]))
    const poMap = new Map(poItems.map(x=>[x.ingredient_id,x]))
    const missing = [...poMap.keys()].some(id=>!docMap.has(id)) || [...docMap.keys()].some(id=>!poMap.has(id))
    const receivedFull = poItems.filter(x=>Number(x.received_qty)>=Number(x.ordered_qty)).length
    const qtyDiff = poItems.some(x=>{
        const d=docMap.get(x.ingredient_id)
        return d && Math.abs(Number(d.quantity||0)-Number(x.ordered_qty||0))>0.0005
    })
    const priceDiff = poItems.some(x=>{
        const d=docMap.get(x.ingredient_id)
        return d && Math.abs(Number(d.unit_cost||0)-Number(x.unit_cost||0))>0.0001
    })
    const variance = documentBaseAmount()-Number(po.total_amount||0)

    return {
        status:
            missing ? 'item_mismatch' :
            receivedFull<poItems.length ? 'not_fully_received' :
            qtyDiff ? 'quantity_difference' :
            priceDiff ? 'price_difference' :
            Math.abs(variance)>1 ? 'amount_difference' :
            'matched',
        po_item_count:poItems.length,
        invoice_item_count:documentItems.length,
        fully_received_item_count:receivedFull,
        amount_variance:variance
    }
}

function renderThreeWay(saved=null) {
    const x = saved || localThreeWay()
    if (!$('threeWayPanel')) return

    $('threeWayPoItems').textContent = Number(x.po_item_count||0).toLocaleString('th-TH')
    $('threeWayReceived').textContent = Number(x.fully_received_item_count||0).toLocaleString('th-TH')
    $('threeWayInvoiceItems').textContent = Number(x.invoice_item_count||0).toLocaleString('th-TH')
    $('threeWayVariance').textContent = x.amount_variance == null ? '-' : money(x.amount_variance)

    const badge = $('threeWayBadge')
    badge.className = `reconcile-badge ${x.status || 'no_po'}`
    badge.textContent = ({
        matched:'3-Way Match ผ่าน',
        no_po:'ไม่ได้อ้างอิง PO',
        items_missing:'ยังไม่มี Invoice Items',
        item_mismatch:'รายการสินค้าไม่ตรง',
        not_fully_received:'ยังรับของไม่ครบ',
        quantity_difference:'จำนวนไม่ตรง',
        price_difference:'ราคาไม่ตรง',
        amount_difference:'ยอดรวมไม่ตรง'
    })[x.status] || x.status || '-'

    $('threeWayMessage').textContent = ({
        matched:'✅ PO, ของที่รับจริง และรายการใน Invoice ตรงกัน',
        no_po:'เอกสารนี้ไม่มี PO จึงไม่ตรวจ 3-Way Match',
        items_missing:'เพิ่มรายการสินค้าในเอกสาร หรือกด “ดึงรายการจาก PO”',
        item_mismatch:'⚠️ มีวัตถุดิบใน PO/Invoice ที่จับคู่กันไม่ได้',
        not_fully_received:'⚠️ PO ยังมีรายการที่รับของไม่ครบ',
        quantity_difference:'⚠️ จำนวนใน Invoice ไม่เท่ากับจำนวนที่สั่งใน PO',
        price_difference:'⚠️ ราคา/หน่วยใน Invoice ไม่เท่ากับ PO',
        amount_difference:'⚠️ ยอดเอกสารก่อน VAT ไม่ตรงกับ PO เกิน ±฿1.00'
    })[x.status] || ''
}

function currentPo() {
    return purchaseOrders.find(x => x.id === $('purchaseOrder').value) || null
}

function documentBaseAmount() {
    const total = num('totalAmount')
    const tax = num('taxAmount')
    return $('taxMode').value === 'none'
        ? total
        : Math.max(total - tax, 0)
}

function renderReconciliation(savedData=null) {
    const po = currentPo()
    const poTotal = Number(savedData?.po_total_amount ?? po?.total_amount ?? 0)
    const docBase = Number(savedData?.document_base_amount ?? documentBaseAmount())
    const vat = num('taxAmount')
    const variance = savedData?.reconcile_variance != null
        ? Number(savedData.reconcile_variance)
        : (po ? docBase - poTotal : 0)

    let status = savedData?.reconcile_status || 'no_po'
    if (!savedData && po) {
        status = Math.abs(variance) <= 1 ? 'matched' : variance > 1 ? 'over' : 'under'
    }

    $('reconcilePoTotal').textContent = money(poTotal)
    $('reconcileDocBase').textContent = money(docBase)
    $('reconcileVat').textContent = money(vat)
    $('reconcileVariance').textContent = money(variance)

    const badge = $('reconcileBadge')
    badge.className = `reconcile-badge ${status}`
    badge.textContent = ({
        no_po:'ไม่ได้อ้างอิง PO',
        matched:'ตรงกับ PO',
        over:'เอกสารสูงกว่า PO',
        under:'เอกสารต่ำกว่า PO'
    })[status] || status

    if (!po && !savedData?.purchase_order_id) {
        $('reconcileMessage').textContent =
            'เอกสารนี้ไม่ได้อ้างอิง PO จึงไม่ต้องกระทบยอด'
    } else if (status === 'matched') {
        $('reconcileMessage').textContent =
            '✅ ยอดก่อน VAT ของเอกสารตรงกับยอด PO (Tolerance ±฿1.00)'
    } else if (status === 'over') {
        $('reconcileMessage').textContent =
            `⚠️ เอกสารสูงกว่า PO ${money(Math.abs(variance))} — ตรวจราคา/ค่าขนส่ง/ส่วนลด`
    } else if (status === 'under') {
        $('reconcileMessage').textContent =
            `⚠️ เอกสารต่ำกว่า PO ${money(Math.abs(variance))} — ตรวจรับของไม่ครบ/ส่วนลด/ยอดเอกสาร`
    }
}

async function autofillFromPo() {
    const poId = $('purchaseOrder').value
    if (!poId) {
        renderReconciliation()
        return
    }

    const po = currentPo()
    if (po?.supplier_id) {
        $('supplier').value = po.supplier_id
    }

    // เติมจาก PO เฉพาะเอกสารใหม่ หรือช่องยอดยังเป็น 0
    if (!$('documentId').value &&
        num('subtotal') === 0 &&
        num('totalAmount') === 0) {
        const { data, error } = await supabase.rpc(
            'backoffice_get_purchase_order',
            { p_purchase_order_id:poId }
        )
        if (!error && data) {
            $('subtotal').value = Number(data.subtotal || 0).toFixed(2)
            $('discountAmount').value = Number(data.discount_amount || 0).toFixed(2)
            $('shippingAmount').value = Number(data.shipping_amount || 0).toFixed(2)
            calculateAmounts(true)
        }
    }

    renderReconciliation()
}

function setDefaultDates() {
    const now = new Date()
    const first = new Date(now.getFullYear(),now.getMonth(),1)
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    $('dateFrom').value = fmt(first)
    $('dateTo').value = fmt(now)
}

async function init() {
    try {
        ctx = await requireBackoffice()
        if (!ctx) return
        setupShell(ctx,'purchase-documents')
        setDefaultDates()
        await Promise.all([loadSuppliers(),loadPurchaseOrders()])
        await loadDocuments()
    } catch (error) {
        console.error(error)
        message(error.message || 'เปิดระบบเอกสารซื้อไม่สำเร็จ')
    }
}

$('addBtn').onclick = openNew
$('closeBtn').onclick = () => $('modal').classList.add('hidden')
$('saveBtn').onclick = saveDocument
$('refreshBtn').onclick = loadDocuments
$('search').oninput = render
$('dateFrom').onchange = loadDocuments
$('dateTo').onchange = loadDocuments
$('supplierFilter').onchange = loadDocuments
$('typeFilter').onchange = loadDocuments
$('paymentFilter').onchange = loadDocuments

$('supplier').onchange = () => {
    renderPoOptions()
    const po = purchaseOrders.find(x => x.id===$('purchaseOrder').value)
    if (po && po.supplier_id!==$('supplier').value) $('purchaseOrder').value=''
    renderReconciliation()
}

$('purchaseOrder').onchange = async () => {
    const po = purchaseOrders.find(x => x.id===$('purchaseOrder').value)
    if (po?.supplier_id) {
        $('supplier').value = po.supplier_id
        renderPoOptions(po.id)
    }
    await autofillFromPo()
    await loadPoDetail()
}

for (const id of ['subtotal','discountAmount','shippingAmount','taxRate']) {
    $(id).addEventListener('input',()=>calculateAmounts(true))
}
$('taxMode').onchange = () => calculateAmounts(true)
$('totalAmount').addEventListener('input',()=>calculateAmounts(false))
$('paidAmount').addEventListener('input',()=>{
    autoPaymentStatus()
    calculateAmounts(false)
})

$('table').onclick = e => {
    const b = e.target.closest('[data-edit]')
    if (b) openEdit(b.dataset.edit)
}

$('attachments').onclick = e => {
    const open = e.target.closest('[data-open-file]')
    if (open) return openAttachment(open.dataset.openFile)
    const del = e.target.closest('[data-delete-file]')
    if (del) return deleteAttachment(del.dataset.deleteFile)
}


$('importPoItemsBtn')?.addEventListener('click',importPoItems)
$('addDocumentItemBtn')?.addEventListener('click',async()=>{
    if (!$('purchaseOrder').value) return formMessage('เลือก PO ก่อนเพื่อเพิ่มรายการสำหรับ 3-Way Match')
    const po = currentPoDetail || await loadPoDetail()
    const used = new Set(documentItems.map(x=>x.ingredient_id))
    const first = po?.items?.find(x=>!used.has(x.ingredient_id)) || po?.items?.[0]
    if (!first) return formMessage('PO ไม่มีรายการสินค้า')
    documentItems.push({
        ingredient_id:first.ingredient_id,
        ingredient_name:first.ingredient_name,
        unit:first.unit,
        quantity:Number(first.ordered_qty||0),
        unit_cost:Number(first.unit_cost||0)
    })
    renderDocumentItems()
    renderThreeWay()
})

$('documentItems')?.addEventListener('change',e=>{
    if (e.target.dataset.docIng!==undefined) {
        const i=Number(e.target.dataset.docIng)
        documentItems[i].ingredient_id=e.target.value
        const poItem=currentPoDetail?.items?.find(x=>x.ingredient_id===e.target.value)
        if (poItem) {
            documentItems[i].ingredient_name=poItem.ingredient_name
            documentItems[i].unit=poItem.unit
            documentItems[i].unit_cost=Number(poItem.unit_cost||0)
        }
        renderDocumentItems()
        renderThreeWay()
    }
})

$('documentItems')?.addEventListener('input',e=>{
    if (e.target.dataset.docQty!==undefined) {
        documentItems[Number(e.target.dataset.docQty)].quantity=Number(e.target.value||0)
    }
    if (e.target.dataset.docCost!==undefined) {
        documentItems[Number(e.target.dataset.docCost)].unit_cost=Number(e.target.value||0)
    }
    renderThreeWay()
})

$('documentItems')?.addEventListener('click',e=>{
    const b=e.target.closest('[data-doc-remove]')
    if (b) {
        documentItems.splice(Number(b.dataset.docRemove),1)
        renderDocumentItems()
        renderThreeWay()
    }
})


init()
