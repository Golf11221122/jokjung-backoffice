import { supabase } from './supabase.js'
import { requireBackoffice, setupShell, money, esc } from './auth.js'

const $ = id => document.getElementById(id)
let ctx = null
let rows = []
let suppliers = []
let current = null
let history = []
let creditHistory = []

function today() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function dateText(v) {
    if (!v) return '-'
    return new Date(`${v}T00:00:00`).toLocaleDateString('th-TH')
}

function approvalText(v) {
    return ({
        pending:'รอตรวจ',
        approved:'อนุมัติแล้ว',
        hold:'พักไว้',
        rejected:'ไม่อนุมัติ'
    })[v] || v || '-'
}

function paymentText(v) {
    return ({
        unpaid:'ยังไม่ชำระ',
        partial:'ชำระบางส่วน',
        paid:'ชำระแล้ว'
    })[v] || v || '-'
}

function threeWayText(v) {
    return ({
        matched:'ผ่าน',
        no_po:'ไม่มี PO',
        items_missing:'ไม่มี Invoice Items',
        item_mismatch:'สินค้าไม่ตรง',
        not_fully_received:'รับของไม่ครบ',
        quantity_difference:'จำนวนต่าง',
        price_difference:'ราคาต่าง',
        amount_difference:'ยอดต่าง'
    })[v] || v || '-'
}

function message(t='') { $('message').textContent=t }
function detailMessage(t='') { $('detailMessage').textContent=t }

async function loadSuppliers() {
    const {data,error}=await supabase.rpc('backoffice_list_suppliers')
    if (error) throw error
    suppliers=(data||[]).filter(x=>x.is_active!==false)
    $('supplierFilter').innerHTML=
        '<option value="">Supplier ทั้งหมด</option>'+
        suppliers.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')
}

async function loadSummary() {
    const {data,error}=await supabase.rpc('backoffice_accounts_payable_summary_v17')
    if (error) throw error
    const x=data||{}
    $('kpis').innerHTML=`
        <article class="kpi-card"><span>เจ้าหนี้คงค้าง</span><strong>${money(x.open_balance)}</strong></article>
        <article class="kpi-card"><span>เกินกำหนด</span><strong>${money(x.overdue_balance)}</strong><small>${Number(x.overdue_count||0)} เอกสาร</small></article>
        <article class="kpi-card"><span>ครบกำหนดใน 7 วัน</span><strong>${money(x.due_7_balance)}</strong></article>
        <article class="kpi-card"><span>ครบกำหนดใน 30 วัน</span><strong>${money(x.due_30_balance)}</strong></article>
        <article class="kpi-card"><span>อนุมัติรอจ่าย</span><strong>${money(x.approved_open_balance)}</strong></article>
        <article class="kpi-card"><span>รออนุมัติ</span><strong>${Number(x.pending_approval_count||0).toLocaleString('th-TH')}</strong></article>
    `
}

async function loadRows() {
    message('กำลังโหลด...')
    const {data,error}=await supabase.rpc(
        'backoffice_accounts_payable_v17',
        {
            p_supplier_id:$('supplierFilter').value||null,
            p_approval_status:$('approvalFilter').value||null,
            p_payment_status:$('paymentFilter').value||null,
            p_due_filter:$('dueFilter').value||null
        }
    )
    if (error) {
        message(error.message)
        return
    }
    rows=Array.isArray(data)?data:[]
    render()
    message('')
}

function filtered() {
    const q=$('search').value.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(x=>[
        x.internal_no,x.document_no,x.supplier_name,x.po_no
    ].filter(Boolean).join(' ').toLowerCase().includes(q))
}

function dueBadge(x) {
    if (x.payment_status==='paid') return '<span class="ap-badge paid">Paid</span>'
    if (x.aging_bucket==='overdue') return `<span class="ap-badge overdue">เกิน ${Math.abs(Number(x.days_to_due||0))} วัน</span>`
    if (x.aging_bucket==='due_7') return `<span class="ap-badge due">อีก ${Number(x.days_to_due||0)} วัน</span>`
    if (x.due_date) return `<span class="ap-badge">${dateText(x.due_date)}</span>`
    return '<span class="ap-badge">ไม่มี Due Date</span>'
}

function render() {
    const list=filtered()

    $('table').innerHTML=list.length?`
    <div class="table-wrap"><table>
    <thead><tr>
        <th>เอกสาร</th><th>Supplier / PO</th><th>Due</th>
        <th class="num">Total</th><th class="num">Paid</th><th class="num">คงค้าง</th>
        <th>3-Way</th><th>Approval</th><th>Payment</th><th>จัดการ</th>
    </tr></thead>
    <tbody>${list.map(x=>`
        <tr class="${x.aging_bucket==='overdue'&&x.payment_status!=='paid'?'ap-overdue-row':''}">
            <td><strong>${esc(x.internal_no)}</strong><div class="mini-note">${esc(x.document_no||'-')}</div></td>
            <td>${esc(x.supplier_name||'-')}<div class="mini-note">${esc(x.po_no||'ไม่มี PO')}</div></td>
            <td>${dueBadge(x)}</td>
            <td class="num">${money(x.total_amount)}</td>
            <td class="num">${money(x.paid_amount)}</td>
            <td class="num"><strong>${money(x.balance_due)}</strong></td>
            <td><span class="ap-badge ${x.three_way_status==='matched'?'approved':''}">${esc(threeWayText(x.three_way_status))}</span></td>
            <td><span class="ap-badge ${esc(x.approval_status)}">${esc(approvalText(x.approval_status))}</span></td>
            <td><span class="ap-badge ${esc(x.payment_status)}">${esc(paymentText(x.payment_status))}</span></td>
            <td><button class="small-btn" data-open="${x.document_id}">เปิด</button></td>
        </tr>
    `).join('')}</tbody>
    </table></div>`:'<div class="empty">ไม่พบรายการเจ้าหนี้</div>'
}

async function openDetail(id) {
    current=rows.find(x=>x.document_id===id)||null
    if (!current) return

    $('detailModal').classList.remove('hidden')
    $('detailTitle').textContent=current.internal_no
    $('detailSub').textContent=`${current.document_no||'-'} • ${current.po_no||'ไม่มี PO'}`
    $('detailSupplier').textContent=current.supplier_name||'-'
    $('detailTotal').textContent=money(current.total_amount)
    $('detailPaid').textContent=money(current.paid_amount)
    $('detailBalance').textContent=money(current.balance_due)
    $('detailDue').textContent=dateText(current.due_date)
    $('detailThreeWay').textContent=threeWayText(current.three_way_status)

    $('approvalBadge').className=`ap-badge ${current.approval_status}`
    $('approvalBadge').textContent=approvalText(current.approval_status)
    $('paymentStatusBadge').className=`ap-badge ${current.payment_status}`
    $('paymentStatusBadge').textContent=paymentText(current.payment_status)

    $('paymentDate').value=today()
    $('paymentAmount').value=Number(current.balance_due||0).toFixed(2)
    $('paymentReference').value=''
    $('paymentNote').value=''
    detailMessage('')

    const canPay=current.approval_status==='approved'&&Number(current.balance_due)>0
    $('payBtn').disabled=!canPay
    $('paymentAmount').disabled=!canPay
    $('paymentMethod').disabled=!canPay
    $('paymentReference').disabled=!canPay
    $('paymentNote').disabled=!canPay

    await Promise.all([loadHistory(),loadCreditHistory()])
}

async function loadHistory() {
    if (!current) return
    const {data,error}=await supabase.rpc(
        'backoffice_ap_payment_history_v17',
        {p_document_id:current.document_id}
    )
    if (error) return detailMessage(error.message)

    history=Array.isArray(data)?data:[]
    $('historyCount').textContent=`${history.length} รายการ`

    $('paymentHistory').innerHTML=history.length?history.map(x=>`
        <div class="ap-history-row ${x.reversed_at?'reversed':''}">
            <div>
                <strong>${dateText(x.payment_date)} • ${money(x.amount)}</strong>
                <small>${esc(x.payment_method)} ${x.reference_no?'• '+esc(x.reference_no):''}</small>
                ${x.note?`<small>${esc(x.note)}</small>`:''}
                ${x.reversed_at?`<small>ย้อนรายการ: ${esc(x.reversal_reason||'-')}</small>`:''}
            </div>
            ${!x.reversed_at&&ctx.role==='admin'
                ?`<button class="danger-btn" data-reverse="${x.id}">ย้อนรายการ</button>`
                :''}
        </div>
    `).join(''):'<div class="empty">ยังไม่มีประวัติการจ่าย</div>'
}

async function setApproval(status) {
    if (!current) return
    let reason=null

    if (status==='approved') {
        if (current.purchase_order_id&&current.three_way_status!=='matched') {
            return detailMessage('เอกสารนี้ยังไม่ผ่าน 3-Way Match จึงอนุมัติจ่ายไม่ได้')
        }
        if (!confirm('อนุมัติเอกสารนี้สำหรับการจ่ายเงิน?')) return
    } else {
        reason=prompt(status==='hold'?'เหตุผลที่พักรายการ':'เหตุผลที่ไม่อนุมัติ')
        if (reason===null) return
    }

    const {error}=await supabase.rpc(
        'backoffice_set_ap_approval_v17',
        {p_document_id:current.document_id,p_status:status,p_reason:reason}
    )
    if (error) return detailMessage(error.message)

    await refreshAll()
    await openDetail(current.document_id)
    detailMessage('บันทึกสถานะอนุมัติแล้ว')
}

async function pay() {
    if (!current) return
    const amount=Number($('paymentAmount').value||0)
    if (amount<=0) return detailMessage('ยอดจ่ายต้องมากกว่า 0')
    if (amount>Number(current.balance_due)+0.01) return detailMessage('ยอดจ่ายเกินยอดคงค้าง')
    if (!confirm(`ยืนยันจ่าย ${money(amount)} ให้ ${current.supplier_name||'Supplier'}?`)) return

    $('payBtn').disabled=true
    const {error}=await supabase.rpc(
        'backoffice_record_ap_payment_v17',
        {
            p_document_id:current.document_id,
            p_payment_date:$('paymentDate').value,
            p_amount:amount,
            p_payment_method:$('paymentMethod').value,
            p_reference_no:$('paymentReference').value.trim()||null,
            p_note:$('paymentNote').value.trim()||null
        }
    )

    if (error) {
        $('payBtn').disabled=false
        return detailMessage(error.message)
    }

    await refreshAll()
    await openDetail(current.document_id)
    detailMessage('บันทึกการจ่ายสำเร็จ')
}

async function reversePayment(id) {
    if (ctx.role!=='admin') return
    const reason=prompt('เหตุผลในการย้อนรายการจ่าย')
    if (!reason?.trim()) return

    const {error}=await supabase.rpc(
        'backoffice_reverse_ap_payment_v17',
        {p_payment_id:id,p_reason:reason.trim()}
    )
    if (error) return detailMessage(error.message)

    await refreshAll()
    await openDetail(current.document_id)
    detailMessage('ย้อนรายการจ่ายแล้ว')
}


async function loadCreditHistory(){
    if(!current)return
    const{data,error}=await supabase.rpc(
        'backoffice_ap_credit_history_v18',
        {p_document_id:current.document_id}
    )
    if(error)return detailMessage(error.message)
    creditHistory=data||[]
    const box=document.getElementById('creditHistory')
    const count=document.getElementById('creditHistoryCount')
    if(!box||!count)return
    count.textContent=`${creditHistory.length} รายการ`
    box.innerHTML=creditHistory.length?creditHistory.map(x=>`
      <div class="ap-history-row ${x.reversed_at?'reversed':''}">
        <div>
          <strong>${dateText(x.credit_date)} • ${money(x.amount)}</strong>
          <small>Supplier Credit • ${esc(x.return_no)} ${x.credit_note_no?'• '+esc(x.credit_note_no):''}</small>
        </div>
      </div>`).join(''):'<div class="empty">ยังไม่มี Supplier Credit</div>'
}

async function refreshAll() {
    await Promise.all([loadSummary(),loadRows()])
}

async function init() {
    try {
        ctx=await requireBackoffice()
        if (!ctx) return
        setupShell(ctx,'accounts-payable')
        await loadSuppliers()
        await refreshAll()
    } catch(error) {
        console.error(error)
        message(error.message||'เปิด Accounts Payable ไม่สำเร็จ')
    }
}

$('refreshBtn').onclick=refreshAll
$('search').oninput=render
$('supplierFilter').onchange=refreshAll
$('approvalFilter').onchange=refreshAll
$('paymentFilter').onchange=refreshAll
$('dueFilter').onchange=refreshAll
$('closeDetailBtn').onclick=()=>$('detailModal').classList.add('hidden')
$('approveBtn').onclick=()=>setApproval('approved')
$('holdBtn').onclick=()=>setApproval('hold')
$('rejectBtn').onclick=()=>setApproval('rejected')
$('payBtn').onclick=pay

$('table').onclick=e=>{
    const b=e.target.closest('[data-open]')
    if (b) openDetail(b.dataset.open)
}

$('paymentHistory').onclick=e=>{
    const b=e.target.closest('[data-reverse]')
    if (b) reversePayment(b.dataset.reverse)
}

init()
