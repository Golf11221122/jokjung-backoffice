import { supabase } from './supabase.js'
import { PROMPTPAY_PHONE } from './config.js'

/* CANCELLED BILLING SYNC V3 - RPC AUTHORITATIVE STATUS */

/* ========================================
   STATE
======================================== */

const state = {
    session: null,
    profile: null,
    branch: null,

    // VAT Ready: ค่าเริ่มต้นปิดจนกว่าสาขาจะจด VAT
    taxSettings: { vat_enabled: false, vat_rate: 7, vat_included: true },

    categories: [],
    products: [],

    // จำนวนสินค้าที่สามารถขายได้จาก BOM
    availability: new Map(),

    selectedCategory: '',

    // ตะกร้าสินค้า
    cart: new Map(),

    // วิธีชำระเงิน
    paymentMethod: 'cash',

    // ส่วนลด / โปรโมชั่นของหน้าชำระเงิน
    activePromotions: [],
    discountAuthorizationId: null,
    discountSource: null,
    discountLabel: '',
    discountReason: '',
    discountApprovedBy: null,

    // บิลล่าสุด
    lastSale: null,

    // กะขายปัจจุบัน
    currentShift: null,

    // ระบบออเดอร์ร้านอาหาร
    tables: [],
    currentOrder: null,
    orderType: 'dine_in',
    selectedTableId: null,
    guestCount: 1,

    // Modifier / ตัวเลือกสินค้า
    modifierCache: new Map(),
    modifierProduct: null,

    // Sync รายการที่ครัวยกเลิกกลับมาที่ POS
    orderItemRealtimeChannel: null,
    cancelledItemPollTimer: null,

}


/* ========================================
   ELEMENT HELPERS
======================================== */

const $ = id =>
    document.getElementById(id)


const el = {

    /* HEADER */

    backBtn:
        $('backBtn'),

    logoutBtn:
        $('logoutBtn'),

    branchText:
        $('branchText'),

    userName:
        $('userName'),


    /* CATALOG */

    searchInput:
        $('searchInput'),

    refreshBtn:
        $('refreshBtn'),

    categoryTabs:
        $('categoryTabs'),

    loading:
        $('loading'),

    empty:
        $('empty'),

    productGrid:
        $('productGrid'),


    /* CART */

    cartCount:
        $('cartCount'),

    clearCartBtn:
        $('clearCartBtn'),

    emptyCart:
        $('emptyCart'),

    cartItems:
        $('cartItems'),

    subtotalText:
        $('subtotalText'),

    discountInput:
        $('discountInput'),

    totalText:
        $('totalText'),

    confirmOrderBtn:
        $('confirmOrderBtn'),

    checkoutBtn:
        $('checkoutBtn'),

    pageMessage:
        $('pageMessage'),


    /* ========================================
       MOBILE CART
    ======================================== */

    mobileCartBar:
        $('mobileCartBar'),

    mobileCartCount:
        $('mobileCartCount'),

    mobileCartTotal:
        $('mobileCartTotal'),

    mobileCartClose:
        $('mobileCartClose'),

    cartPanel:
        $('cartPanel'),

    cartBackdrop:
        $('cartBackdrop'),


    /* START ORDER */

    orderStartModal:
        $('orderStartModal'),

    closeOrderStartBtn:
        $('closeOrderStartBtn'),

    tableSelectSection:
        $('tableSelectSection'),

    tableGrid:
        $('tableGrid'),

    guestMinusBtn:
        $('guestMinusBtn'),

    guestPlusBtn:
        $('guestPlusBtn'),

    guestCountText:
        $('guestCountText'),

    orderStartMessage:
        $('orderStartMessage'),

    startOrderBtn:
        $('startOrderBtn'),

    holdTableBtn:
        $('holdTableBtn'),


    /* PAYMENT */

    /* PAYMENT */

    paymentModal:
        $('paymentModal'),

    closePaymentBtn:
        $('closePaymentBtn'),

    cancelPaymentBtn:
        $('cancelPaymentBtn'),

    paymentTotalText:
        $('paymentTotalText'),

    paymentVatBreakdown: $('paymentVatBreakdown'),
    paymentBeforeVat: $('paymentBeforeVat'),
    paymentVatLabel: $('paymentVatLabel'),
    paymentVatAmount: $('paymentVatAmount'),

    cashSection:
        $('cashSection'),

    qrSection:
        $('qrSection'),

    receivedInput:
        $('receivedInput'),

    quickCash:
        $('quickCash'),

    changeText:
        $('changeText'),

    saleNote:
        $('saleNote'),

    paymentMessage:
        $('paymentMessage'),

    activePromotionSelect:
        $('activePromotionSelect'),

    applyPromotionBtn:
        $('applyPromotionBtn'),

    clearPaymentDiscountBtn:
        $('clearPaymentDiscountBtn'),

    couponCodeInput:
        $('couponCodeInput'),

    applyCouponBtn:
        $('applyCouponBtn'),

    manualDiscountBtn:
        $('manualDiscountBtn'),

    paymentDiscountSummary:
        $('paymentDiscountSummary'),

    paymentDiscountLabel:
        $('paymentDiscountLabel'),

    paymentDiscountAmount:
        $('paymentDiscountAmount'),

    manualDiscountModal:
        $('manualDiscountModal'),

    closeManualDiscountBtn:
        $('closeManualDiscountBtn'),

    cancelManualDiscountBtn:
        $('cancelManualDiscountBtn'),

    manualDiscountAmount:
        $('manualDiscountAmount'),

    manualDiscountReason:
        $('manualDiscountReason'),

    manualDiscountPin:
        $('manualDiscountPin'),

    manualDiscountMessage:
        $('manualDiscountMessage'),

    confirmManualDiscountBtn:
        $('confirmManualDiscountBtn'),

    confirmPaymentBtn:
        $('confirmPaymentBtn'),


    /* PROMPTPAY */

    promptpayQr:
        $('promptpayQr'),

    qrAmountText:
        $('qrAmountText'),


    /* SUCCESS */

    successModal:
        $('successModal'),

    invoiceText:
        $('invoiceText'),

    successTotal:
        $('successTotal'),

    successChange:
        $('successChange'),

    newSaleBtn:
        $('newSaleBtn'),


    /* RECEIPT */

    printReceiptBtn:
        $('printReceiptBtn'),

    receiptPrint:
        $('receiptPrint'),

    receiptBranch:
        $('receiptBranch'),

    receiptInvoice:
        $('receiptInvoice'),

    receiptDate:
        $('receiptDate'),

    receiptCashier:
        $('receiptCashier'),

    receiptOrderType:
        $('receiptOrderType'),

    receiptTable:
        $('receiptTable'),

    receiptGuestCount:
        $('receiptGuestCount'),

    receiptOrderId:
        $('receiptOrderId'),

    receiptOrderNote:
        $('receiptOrderNote'),

    receiptItems:
        $('receiptItems'),

    receiptSubtotal:
        $('receiptSubtotal'),

    receiptDiscount:
        $('receiptDiscount'),

    receiptTotal:
        $('receiptTotal'),

    receiptVatBreakdown: $('receiptVatBreakdown'),
    receiptBeforeVat: $('receiptBeforeVat'),
    receiptVatLabel: $('receiptVatLabel'),
    receiptVatAmount: $('receiptVatAmount'),

    receiptReceived:
        $('receiptReceived'),

    receiptChange:
        $('receiptChange'),

    receiptPayment:
        $('receiptPayment')
}


/* ========================================
   HELPERS
======================================== */

const esc = value =>
    String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;')


const money = value =>
    new Intl.NumberFormat(
        'th-TH',
        {
            style: 'currency',
            currency: 'THB',
            minimumFractionDigits: 2
        }
    ).format(
        Number(value || 0)
    )


const items = () =>
    [...state.cart.values()]


const draftItems = () =>
    items().filter(
        item =>
            !item.restaurant_item_id
    )


const confirmedItems = () =>
    items().filter(
        item =>
            Boolean(
                item.restaurant_item_id
            )
    )


const hasDraftItems = () =>
    draftItems().length > 0


const subtotal = () =>
    items().reduce(
        (sum, item) =>
            sum +
            (
                Number(item.price) *
                Number(item.quantity)
            ),
        0
    )


const discount = () =>
    Math.max(
        Number(
            el.discountInput?.value ||
            0
        ),
        0
    )


const total = () =>
    Math.max(
        subtotal() -
        discount(),
        0
    )


const vatSnapshot = (amount = total()) => {
    const settings = state.taxSettings || {}
    const enabled = settings.vat_enabled === true
    const rate = Number(settings.vat_rate || 0)
    const included = settings.vat_included !== false
    const gross = Math.max(Number(amount || 0), 0)
    if (!enabled || rate <= 0) return { vat_enabled:false, vat_rate:rate || 7, vat_included:included, amount_before_vat:gross, vat_amount:0 }
    if (included) {
        const vat = Math.round((gross * rate / (100 + rate)) * 100) / 100
        return { vat_enabled:true, vat_rate:rate, vat_included:true, amount_before_vat:Math.round((gross-vat)*100)/100, vat_amount:vat }
    }
    const vat = Math.round((gross * rate / 100) * 100) / 100
    return { vat_enabled:true, vat_rate:rate, vat_included:false, amount_before_vat:gross, vat_amount:vat }
}

function renderVatUi() {
    const v = vatSnapshot(total())
    el.paymentVatBreakdown?.classList.toggle('hidden', !v.vat_enabled)
    if (el.paymentBeforeVat) el.paymentBeforeVat.textContent = money(v.amount_before_vat)
    if (el.paymentVatLabel) el.paymentVatLabel.textContent = `VAT ${v.vat_rate}%`
    if (el.paymentVatAmount) el.paymentVatAmount.textContent = money(v.vat_amount)
}

async function loadTaxSettings() {
    try {
        const { data, error } = await supabase.rpc('get_branch_tax_settings', { p_branch_id: state.profile.branch_id })
        if (error) throw error
        const row = Array.isArray(data) ? data[0] : data
        if (row) state.taxSettings = {
            vat_enabled: row.vat_enabled === true,
            vat_rate: Number(row.vat_rate || 7),
            vat_included: row.vat_included !== false
        }
    } catch (error) {
        console.warn('Load VAT settings error; VAT remains disabled:', error)
        state.taxSettings = { vat_enabled:false, vat_rate:7, vat_included:true }
    }
    renderVatUi()
}

async function saveSaleTaxSnapshot(invoiceNo, snapshot) {
    if (!invoiceNo) return
    try {
        const { error } = await supabase.rpc('save_sale_tax_snapshot', {
            p_invoice_no: invoiceNo,
            p_vat_enabled: snapshot.vat_enabled,
            p_vat_rate: snapshot.vat_rate,
            p_vat_included: snapshot.vat_included,
            p_amount_before_vat: snapshot.amount_before_vat,
            p_vat_amount: snapshot.vat_amount
        })
        if (error) throw error
    } catch (error) {
        console.error('Save sale VAT snapshot error:', error)
    }
}

function msg(
    target,
    text = ''
) {

    if (!target) {
        return
    }

    target.textContent =
        text
}


/* ========================================
   PAYMENT PERMISSIONS
======================================== */

function normalizedRole() {

    return String(
        state.profile?.role
        ||
        ''
    )
        .trim()
        .toLowerCase()
}


function canProcessPayment() {

    /*
     * ตอนนี้อนุญาตเฉพาะ:
     * - admin
     * - manager
     *
     * staff รับออเดอร์/ส่งเข้าครัวได้
     * แต่ห้ามคิดเงิน
     */
    return [
        'admin',
        'manager'
    ].includes(
        normalizedRole()
    )
}


function applyPaymentPermissionUi() {

    const allowed =
        canProcessPayment()


    if (
        el.checkoutBtn
    ) {

        el.checkoutBtn.dataset
            .paymentLocked =
            allowed
                ? '0'
                : '1'


        if (!allowed) {

            el.checkoutBtn.disabled =
                true

            el.checkoutBtn.textContent =
                '🔒 ชำระเงิน — ผู้จัดการเท่านั้น'

            el.checkoutBtn.title =
                'บัญชี Staff ไม่มีสิทธิ์รับชำระเงิน'

        } else {

            el.checkoutBtn.textContent =
                'ชำระเงิน'

            el.checkoutBtn.title =
                ''
        }
    }


    /*
     * Staff ไม่ควรแก้ส่วนลดด้วย
     * เพราะส่วนลดมีผลต่อยอดชำระ
     */
    if (
        el.discountInput
    ) {

        el.discountInput.disabled =
            !allowed
    }


    if (
        el.manualDiscountBtn
    ) {

        el.manualDiscountBtn.disabled =
            !allowed
    }
}


function showPaymentDeniedMessage(
    target = el.pageMessage
) {

    msg(
        target,
        'บัญชีพนักงานไม่มีสิทธิ์รับชำระเงิน กรุณาให้ผู้จัดการหรือผู้ดูแลระบบเป็นผู้คิดเงิน'
    )
}


/* ========================================
   PROMPTPAY QR
======================================== */

function formatTLV(
    id,
    value
) {

    return (
        `${id}${String(
            value.length
        ).padStart(
            2,
            '0'
        )}${value}`
    )
}


function crc16(
    payload
) {

    let crc =
        0xFFFF


    for (
        let i = 0;
        i < payload.length;
        i++
    ) {

        crc ^=
            payload.charCodeAt(i)
            <<
            8


        for (
            let j = 0;
            j < 8;
            j++
        ) {

            if (
                (crc & 0x8000)
                !==
                0
            ) {

                crc =
                    (crc << 1)
                    ^
                    0x1021

            } else {

                crc <<=
                    1
            }


            crc &=
                0xFFFF
        }
    }


    return crc
        .toString(16)
        .toUpperCase()
        .padStart(
            4,
            '0'
        )
}


function normalizePromptPayPhone(
    phone
) {

    const cleaned =
        String(
            phone || ''
        )
            .replace(
                /\D/g,
                ''
            )


    if (
        !/^0\d{9}$/.test(
            cleaned
        )
    ) {

        throw new Error(
            'เบอร์ PromptPay ต้องเป็นเบอร์ไทย 10 หลัก'
        )
    }


    return (
        `0066${cleaned.substring(1)}`
    )
}


function generatePromptPayPayload(
    phone,
    amount
) {

    const numericAmount =
        Number(amount)


    if (
        !Number.isFinite(
            numericAmount
        )
        ||
        numericAmount <= 0
    ) {

        throw new Error(
            'ยอดเงินสำหรับ QR ไม่ถูกต้อง'
        )
    }


    const target =
        normalizePromptPayPhone(
            phone
        )


    const merchantAccount =
        formatTLV(
            '00',
            'A000000677010111'
        )
        +
        formatTLV(
            '01',
            target
        )


    let payload =
        ''


    payload +=
        formatTLV(
            '00',
            '01'
        )


    payload +=
        formatTLV(
            '01',
            '12'
        )


    payload +=
        formatTLV(
            '29',
            merchantAccount
        )


    payload +=
        formatTLV(
            '53',
            '764'
        )


    payload +=
        formatTLV(
            '54',
            numericAmount.toFixed(2)
        )


    payload +=
        formatTLV(
            '58',
            'TH'
        )


    payload +=
        formatTLV(
            '59',
            'PROMPTPAY'
        )


    payload +=
        formatTLV(
            '60',
            'BANGKOK'
        )


    payload +=
        '6304'


    return (
        payload +
        crc16(payload)
    )
}


function renderPromptPayQr() {

    if (
        !el.promptpayQr
        ||
        !el.qrAmountText
    ) {

        console.warn(
            'ไม่พบ promptpayQr หรือ qrAmountText ใน pos.html'
        )

        return
    }


    const amount =
        total()


    el.promptpayQr.innerHTML =
        ''


    el.qrAmountText.textContent =
        money(amount)


    try {

        if (
            !window.QRCode
        ) {

            throw new Error(
                'ไม่พบ QRCode library'
            )
        }


        const payload =
            generatePromptPayPayload(
                PROMPTPAY_PHONE,
                amount
            )


        new window.QRCode(
            el.promptpayQr,
            {
                text:
                    payload,

                width:
                    220,

                height:
                    220,

                correctLevel:
                    window
                        .QRCode
                        .CorrectLevel
                        .M
            }
        )

    } catch (error) {

        console.error(
            'PromptPay QR error:',
            error
        )


        el.promptpayQr.innerHTML =
            `
            <p style="
                color:#d93025;
                text-align:center;
                padding:15px;
            ">
                ${esc(error.message)}
            </p>
            `
    }
}


/* ========================================
   SESSION
======================================== */

async function requireSession() {

    const {
        data: {
            session
        },
        error
    } =
        await supabase
            .auth
            .getSession()


    if (error) {
        throw error
    }


    if (!session) {

        location.replace(
            './index.html'
        )

        return null
    }


    state.session =
        session


    return session
}


/* ========================================
   PROFILE
======================================== */

async function loadProfile(
    id
) {

    const {
        data,
        error
    } =
        await supabase
            .from(
                'profiles'
            )
            .select(
                'id,full_name,role,branch_id'
            )
            .eq(
                'id',
                id
            )
            .maybeSingle()


    if (error) {
        throw error
    }


    if (
        !data?.branch_id
    ) {

        throw new Error(
            'บัญชียังไม่ได้กำหนดสาขา'
        )
    }


    state.profile =
        data
}


/* ========================================
   BRANCH
======================================== */

async function loadBranch() {

    const {
        data,
        error
    } =
        await supabase
            .from(
                'branches'
            )
            .select(
                'id,name'
            )
            .eq(
                'id',
                state.profile.branch_id
            )
            .maybeSingle()


    if (error) {
        throw error
    }


    if (!data) {

        throw new Error(
            'ไม่พบสาขา'
        )
    }


    state.branch =
        data
}


/* ========================================
   CURRENT SHIFT
======================================== */

async function loadCurrentShift() {

    const {
        data,
        error
    } =
        await supabase.rpc(
            'get_current_shift'
        )


    if (error) {

        console.error(
            'Load current shift error:',
            error
        )


        state.currentShift =
            null


        updateShiftSaleState()


        throw error
    }


    const shift =
        Array.isArray(data)

            ? (
                data[0]
                ||
                null
            )

            : (
                data
                ||
                null
            )


    /*
     * ป้องกันกรณี RPC
     * ส่งกะของสาขาอื่นกลับมา
     */
    if (
        shift?.branch_id
        &&
        state.profile?.branch_id
        &&
        shift.branch_id
        !==
        state.profile.branch_id
    ) {

        console.warn(
            'Current shift belongs to another branch:',
            shift
        )


        state.currentShift =
            null

    } else {

        state.currentShift =
            shift
    }


    updateShiftSaleState()


    return state.currentShift
}


/* ========================================
   CHECK OPEN SHIFT
======================================== */

function hasOpenShift() {

    const shift =
        state.currentShift


    if (!shift) {
        return false
    }


    if (
        shift.status !== undefined
        &&
        shift.status !== null
    ) {

        const status =
            String(
                shift.status
            )
                .trim()
                .toLowerCase()


        if (
            ![
                'open',
                'opened',
                'active'
            ].includes(
                status
            )
        ) {

            return false
        }
    }


    if (
        shift.closed_at
        ||
        shift.close_at
        ||
        shift.ended_at
    ) {

        return false
    }


    return true
}


/* ========================================
   UPDATE POS SALE STATE
======================================== */

function updateShiftSaleState() {

    const canSell =
        hasOpenShift()


    const hasItems =
        items().length >
        0


    if (
        el.confirmOrderBtn
    ) {

        el.confirmOrderBtn.disabled =
            !canSell
            ||
            !state.currentOrder
            ||
            !hasDraftItems()
    }


    if (
        el.checkoutBtn
    ) {

        el.checkoutBtn.disabled =
            !canProcessPayment()
            ||
            !canSell
            ||
            !hasItems
            ||
            hasDraftItems()
    }


    if (
        !canSell
        &&
        el.pageMessage
    ) {

        msg(
            el.pageMessage,
            'ยังไม่ได้เปิดกะ กรุณาเปิดกะก่อนเริ่มขาย'
        )

    } else if (
        canSell
        &&
        el.pageMessage?.textContent?.includes(
            'ยังไม่ได้เปิดกะ'
        )
    ) {

        msg(
            el.pageMessage,
            ''
        )
    }


    applyPaymentPermissionUi()
}


/* ========================================
   REQUIRE OPEN SHIFT
======================================== */

async function requireOpenShift() {

    try {

        await loadCurrentShift()

    } catch (error) {

        console.error(
            'Shift check error:',
            error
        )


        msg(
            el.pageMessage,
            'ตรวจสอบกะไม่สำเร็จ กรุณาลองใหม่'
        )


        return false
    }


    if (
        !hasOpenShift()
    ) {

        msg(
            el.pageMessage,
            'ยังไม่ได้เปิดกะ หรือกะถูกปิดแล้ว กรุณาเปิดกะก่อนขาย'
        )


        return false
    }


    return true
}

/* ========================================
   MOBILE CART
======================================== */

function openMobileCart() {

    if (
        window.innerWidth >
        760
    ) {
        return
    }


    el.cartPanel
        ?.classList
        .add(
            'mobile-open'
        )


    el.cartBackdrop
        ?.classList
        .add(
            'show'
        )


    document.body.style.overflow =
        'hidden'
}


function closeMobileCart() {

    el.cartPanel
        ?.classList
        .remove(
            'mobile-open'
        )


    el.cartBackdrop
        ?.classList
        .remove(
            'show'
        )


    document.body.style.overflow =
        ''
}


/* ========================================
   TABLE HOLD UI STYLE
======================================== */

function ensureTableHoldStyle() {

    if (
        document.getElementById(
            'tableHoldDynamicStyle'
        )
    ) {
        return
    }

    const style =
        document.createElement(
            'style'
        )

    style.id =
        'tableHoldDynamicStyle'

    style.textContent =
        `
        .table-select-btn.occupied {
            border-color: #f5b400 !important;
            background: #fff8df !important;
        }

        .table-select-btn.occupied strong,
        .table-select-btn.occupied small {
            color: #a96500 !important;
        }

        .table-select-btn.occupied small {
            font-weight: 700;
        }
        `

    document.head.appendChild(style)
}


/* ========================================
   ORDER SYSTEM
======================================== */

function resetOrderDraft() {

    state.orderType =
        'dine_in'

    state.selectedTableId =
        null

    state.guestCount =
        1


    renderOrderType()

    renderGuestCount()

    renderTables()
}


function orderTypeText() {

    return state.orderType ===
        'dine_in'

        ? 'ทานที่ร้าน'

        : 'กลับบ้าน'
}


function getSelectedTable() {

    return state.tables.find(
        table =>
            table.id ===
            state.selectedTableId
    ) || null
}


function renderOrderContext() {

    if (
        !el.branchText
        ||
        !state.branch
    ) {
        return
    }


    /*
     * ไม่มีออเดอร์
     */
    if (
        !state.currentOrder
    ) {

        el.branchText.textContent =
            `สาขา: ${state.branch.name}`


        if (
            el.holdTableBtn
        ) {

            el.holdTableBtn
                .classList
                .add(
                    'hidden'
                )
        }


        return
    }


    /*
     * ทานที่ร้าน
     */
    if (
        state.currentOrder.order_type ===
        'dine_in'
    ) {

        const tableName =
            state.currentOrder.table_name
            ||
            'โต๊ะ'


        el.branchText.textContent =
            `${state.branch.name} • ${tableName} • ${state.currentOrder.guest_count} คน`

    } else {

        /*
         * กลับบ้าน
         */
        el.branchText.textContent =
            `${state.branch.name} • กลับบ้าน • ${state.currentOrder.guest_count} คน`
    }


    /*
     * แสดงปุ่มพักโต๊ะ
     * เฉพาะทานที่ร้าน
     */
    if (
        el.holdTableBtn
    ) {

        el.holdTableBtn
            .classList
            .toggle(
                'hidden',
                state.currentOrder.order_type !==
                'dine_in'
            )
    }
}

function renderOrderType() {

    document
        .querySelectorAll(
            '.order-type-btn'
        )
        .forEach(
            button => {

                button
                    .classList
                    .toggle(
                        'active',
                        button.dataset.orderType ===
                        state.orderType
                    )
            }
        )


    if (
        el.tableSelectSection
    ) {

        el.tableSelectSection
            .classList
            .toggle(
                'hidden',
                state.orderType !==
                'dine_in'
            )
    }
}


function renderGuestCount() {

    if (
        el.guestCountText
    ) {

        el.guestCountText.textContent =
            `${state.guestCount.toLocaleString('th-TH')} คน`
    }


    if (
        el.guestMinusBtn
    ) {

        el.guestMinusBtn.disabled =
            state.guestCount <= 1
    }
}


function tableStatusText(
    status
) {

    const value =
        String(
            status ||
            'available'
        )
            .trim()
            .toLowerCase()


    const map = {
        available: 'ว่าง',
        occupied: 'มีลูกค้า',
        reserved: 'จอง',
        disabled: 'ปิดใช้งาน'
    }


    return map[value]
        ||
        value
}



function renderTables() {

    if (!el.tableGrid) {
        return
    }

    if (!state.tables.length) {
        el.tableGrid.innerHTML =
            `
            <div class="state">
                ยังไม่มีโต๊ะในสาขานี้
            </div>
            `
        return
    }

    el.tableGrid.innerHTML =
        state.tables
            .map(
                table => {

                    const status =
                        String(
                            table.status || 'available'
                        )
                            .trim()
                            .toLowerCase()

                    const selectable =
                        ['available', 'occupied']
                            .includes(status)

                    const selected =
                        table.id ===
                        state.selectedTableId

                    const helperText =
                        status ===
                            'occupied'

                            ? (
                                selected

                                    ? '✓ กำลังเลือก • เปิดบิลเดิม'

                                    : 'แตะเพื่อเปิดบิลเดิม'
                            )

                            : `${Number(
                                table.capacity
                                ||
                                0
                            ).toLocaleString(
                                'th-TH'
                            )} ที่`

                    return `
                        <button
                            type="button"
                            class="table-select-btn ${selected ? 'active' : ''} ${status === 'occupied' ? 'occupied' : ''}"
                            data-table-id="${esc(table.id)}"
                            ${selectable ? '' : 'disabled'}
                        >
                            <strong>
                                ${esc(
                        table.table_name
                        || `โต๊ะ ${table.table_no}`
                    )}
                            </strong>

                            <small>
                                ${tableStatusText(status)}
                                • ${helperText}
                            </small>
                        </button>
                    `
                }
            )
            .join('')
}



async function loadRestaurantTables() {

    const {
        data,
        error
    } =
        await supabase
            .from('restaurant_tables')
            .select(`
                id,
                branch_id,
                table_no,
                table_name,
                capacity,
                status,
                qr_token,
                is_active
            `)
            .eq(
                'branch_id',
                state.profile.branch_id
            )
            .eq(
                'is_active',
                true
            )
            .order(
                'table_no',
                {
                    ascending: true
                }
            )

    if (error) {
        throw error
    }

    state.tables =
        data || []

    if (state.selectedTableId) {

        const stillSelectable =
            state.tables.some(
                table =>
                    table.id ===
                    state.selectedTableId
                    &&
                    ['available', 'occupied']
                        .includes(
                            String(
                                table.status || ''
                            ).toLowerCase()
                        )
            )

        if (!stillSelectable) {
            state.selectedTableId = null
        }
    }

    renderTables()

    return state.tables
}


async function openOrderStartModal() {

    if (
        !el.orderStartModal
    ) {
        return
    }


    closeMobileCart()


    msg(
        el.orderStartMessage,
        ''
    )


    try {

        await loadRestaurantTables()

    } catch (error) {

        console.error(
            'Load restaurant tables error:',
            error
        )


        msg(
            el.orderStartMessage,
            error.message ||
            'โหลดข้อมูลโต๊ะไม่สำเร็จ'
        )
    }


    renderOrderType()

    renderGuestCount()

    renderTables()


    if (
        el.closeOrderStartBtn
    ) {

        el.closeOrderStartBtn.disabled =
            !state.currentOrder
    }


    el.orderStartModal
        .classList
        .remove(
            'hidden'
        )
}


function closeOrderStartModal() {

    if (
        !state.currentOrder
    ) {

        msg(
            el.orderStartMessage,
            'กรุณาเริ่มออเดอร์ก่อนเลือกสินค้า'
        )

        return
    }


    el.orderStartModal
        ?.classList
        .add(
            'hidden'
        )
}



function isHeldDineInOrder() {
    return (
        state.currentOrder?.order_type === 'dine_in'
        &&
        Boolean(state.currentOrder?.id)
    )
}


/*
 * ออเดอร์ที่เปิดอยู่ทั้ง:
 * - ทานที่ร้าน
 * - กลับบ้าน
 *
 * ต้องบันทึกรายการลง restaurant_order_items ทันที
 * เพื่อให้ Kitchen / Realtime / Print Queue เห็นออเดอร์ทันที
 */
function isLiveRestaurantOrder() {

    return (
        Boolean(
            state.currentOrder?.id
        )
        &&
        String(
            state.currentOrder?.status || ''
        )
            .trim()
            .toLowerCase()
        ===
        'open'
    )
}



/* ========================================
   CANCELLED ITEM SYNC
======================================== */

/*
 * Kitchen สามารถยกเลิกรายการหลังจาก POS เปิดโต๊ะไว้แล้วได้
 * ดังนั้นห้ามเชื่อ state.cart อย่างเดียวก่อนคิดเงิน
 *
 * ฟังก์ชันนี้อ่าน item_status ล่าสุดจาก restaurant_order_items
 * แล้วเอารายการ cancelled ออกจากตะกร้า POS
 *
 * return:
 * {
 *   removedCount,
 *   removedItemIds
 * }
 */

async function fetchPosOrderItemStatuses(
    orderId
) {

    if (!orderId) {
        return []
    }


    const {
        data,
        error
    } =
        await supabase.rpc(
            'pos_get_order_item_statuses',
            {
                p_order_id:
                    orderId
            }
        )


    if (error) {
        throw error
    }


    /*
     * RPC คืนค่าเป็น:
     * {
     *   order_id,
     *   items: [...]
     * }
     *
     * รองรับกรณี Supabase client คืน array ด้วย
     * เพื่อให้โค้ดทนต่อรูปแบบ response
     */
    const payload =
        Array.isArray(data)
            ? (
                data.length === 1
                    ? data[0]
                    : data
            )
            : data


    if (
        Array.isArray(payload)
    ) {
        return payload
    }


    if (
        Array.isArray(
            payload?.items
        )
    ) {
        return payload.items
    }


    return []
}


async function syncCancelledRestaurantItems({
    rerender = true
} = {}) {

    const orderId =
        state.currentOrder?.id

    if (!orderId) {
        return {
            removedCount: 0,
            removedItemIds: []
        }
    }


    const confirmedCartItems =
        items().filter(
            item =>
                Boolean(
                    item.restaurant_item_id
                )
        )


    if (!confirmedCartItems.length) {
        return {
            removedCount: 0,
            removedItemIds: []
        }
    }


    const itemIds =
        confirmedCartItems
            .map(
                item =>
                    item.restaurant_item_id
            )
            .filter(Boolean)


    const statusRows =
        await fetchPosOrderItemStatuses(
            orderId
        )


    const requestedIds =
        new Set(
            itemIds
        )


    const cancelledIds =
        new Set(
            (statusRows || [])
                .filter(
                    row =>
                        requestedIds.has(
                            row.id
                        )
                )
                .filter(
                    row =>
                        String(
                            row.item_status || ''
                        )
                            .trim()
                            .toLowerCase()
                        ===
                        'cancelled'
                )
                .map(
                    row =>
                        row.id
                )
        )


    if (!cancelledIds.size) {
        return {
            removedCount: 0,
            removedItemIds: []
        }
    }


    const removedItemIds = []


    for (
        const [
            cartKey,
            item
        ]
        of
        [...state.cart.entries()]
    ) {

        if (
            item.restaurant_item_id
            &&
            cancelledIds.has(
                item.restaurant_item_id
            )
        ) {

            removedItemIds.push(
                item.restaurant_item_id
            )

            state.cart.delete(
                cartKey
            )
        }
    }


    if (rerender) {

        /*
         * ถ้ารายการถูกยกเลิกจนยอดลดลง
         * ส่วนลดเก่าต้องไม่มากกว่ายอดสินค้าใหม่
         */
        if (
            discount() >
            subtotal()
        ) {
            resetPaymentDiscount()
        }


        renderCart()
        updateShiftSaleState()
        renderVatUi()
    }


    return {
        removedCount:
            removedItemIds.length,

        removedItemIds
    }
}


/*
 * ใช้ตอน load โต๊ะเดิม:
 * RPC get_restaurant_order รุ่นปัจจุบันอาจยังไม่ส่ง item_status กลับมา
 * จึงอ่านสถานะจริงจากตารางโดยใช้ id ของ order.items
 */
async function getCancelledItemIdSetForOrder(
    orderId,
    orderRows = []
) {

    const ids =
        (orderRows || [])
            .map(
                row =>
                    row?.id
            )
            .filter(Boolean)


    if (
        !orderId
        ||
        !ids.length
    ) {
        return new Set()
    }


    const statusRows =
        await fetchPosOrderItemStatuses(
            orderId
        )


    const requestedIds =
        new Set(
            ids
        )


    return new Set(
        (statusRows || [])
            .filter(
                row =>
                    requestedIds.has(
                        row.id
                    )
            )
            .filter(
                row =>
                    String(
                        row.item_status || ''
                    )
                        .trim()
                        .toLowerCase()
                    ===
                    'cancelled'
            )
            .map(
                row =>
                    row.id
            )
    )
}



/* ========================================
   CANCELLED ITEM REALTIME SYNC
======================================== */

function removeCancelledItemFromCurrentBill(
    itemId,
    {
        showMessage = true
    } = {}
) {

    if (!itemId) {
        return false
    }


    let removed = false


    for (
        const [
            cartKey,
            item
        ]
        of
        [...state.cart.entries()]
    ) {

        if (
            item.restaurant_item_id ===
            itemId
        ) {

            state.cart.delete(
                cartKey
            )

            removed = true
        }
    }


    if (!removed) {
        return false
    }


    /*
     * ถ้าส่วนลดเดิมสูงกว่ายอดใหม่
     * ให้ล้างส่วนลดเพื่อไม่ให้ยอดติดลบ/ผิด
     */
    if (
        discount() >
        subtotal()
    ) {
        resetPaymentDiscount()
    }


    renderCart()
    updateShiftSaleState()
    renderVatUi()


    /*
     * ถ้า Payment Modal เปิดอยู่
     * ต้องเปลี่ยนยอดทันทีด้วย
     */
    if (
        el.paymentModal
        &&
        !el.paymentModal
            .classList
            .contains(
                'hidden'
            )
    ) {

        if (
            el.paymentTotalText
        ) {
            el.paymentTotalText.textContent =
                money(
                    total()
                )
        }


        renderQuickCash()
        updateChange()


        if (
            state.paymentMethod ===
            'qr'
        ) {
            renderPromptPayQr()
        }


        if (showMessage) {
            msg(
                el.paymentMessage,
                'ครัวยกเลิกรายการแล้ว ระบบตัดออกจากยอดชำระให้อัตโนมัติ'
            )
        }
    }


    if (showMessage) {

        msg(
            el.pageMessage,
            'ครัวยกเลิกรายการแล้ว ระบบตัดออกจากบิลให้อัตโนมัติ'
        )


        setTimeout(
            () => {

                if (
                    el.pageMessage
                        ?.textContent
                        ?.includes(
                            'ครัวยกเลิกรายการแล้ว'
                        )
                ) {
                    msg(
                        el.pageMessage,
                        ''
                    )
                }
            },
            2200
        )
    }


    return true
}


async function refreshCancelledItemsForCurrentOrder({
    showMessage = false
} = {}) {

    if (
        !state.currentOrder?.id
    ) {
        return 0
    }


    const confirmed =
        items().filter(
            item =>
                Boolean(
                    item.restaurant_item_id
                )
        )


    if (!confirmed.length) {
        return 0
    }


    const statusRows =
        await fetchPosOrderItemStatuses(
            state.currentOrder.id
        )


    const confirmedIds =
        new Set(
            confirmed.map(
                item =>
                    item.restaurant_item_id
            )
        )


    let removedCount = 0


    for (
        const row
        of
        statusRows || []
    ) {

        if (
            !confirmedIds.has(
                row.id
            )
        ) {
            continue
        }

        if (
            String(
                row.item_status || ''
            )
                .trim()
                .toLowerCase()
            !==
            'cancelled'
        ) {
            continue
        }


        const removed =
            removeCancelledItemFromCurrentBill(
                row.id,
                {
                    showMessage
                }
            )


        if (removed) {
            removedCount += 1
        }
    }


    return removedCount
}


function subscribePosOrderItemRealtime() {

    if (
        state.orderItemRealtimeChannel
    ) {

        supabase.removeChannel(
            state.orderItemRealtimeChannel
        )
    }


    state.orderItemRealtimeChannel =
        supabase
            .channel(
                `pos-order-items-${state.profile.branch_id}`
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'restaurant_order_items'
                },
                payload => {

                    const row =
                        payload.new
                        ||
                        null


                    if (
                        !row
                        ||
                        !state.currentOrder?.id
                        ||
                        row.order_id !==
                            state.currentOrder.id
                    ) {
                        return
                    }


                    if (
                        String(
                            row.item_status || ''
                        )
                            .trim()
                            .toLowerCase()
                        ===
                        'cancelled'
                    ) {

                        removeCancelledItemFromCurrentBill(
                            row.id,
                            {
                                showMessage: true
                            }
                        )
                    }
                }
            )
            .subscribe()
}


function startCancelledItemFallbackPolling() {

    if (
        state.cancelledItemPollTimer
    ) {
        clearInterval(
            state.cancelledItemPollTimer
        )
    }


    /*
     * เผื่อ Realtime หลุด/Browser sleep:
     * ตรวจซ้ำทุก 3 วินาทีเฉพาะตอนมี order เปิดอยู่
     */
    state.cancelledItemPollTimer =
        setInterval(
            async () => {

                if (
                    document.hidden
                    ||
                    !state.currentOrder?.id
                ) {
                    return
                }


                try {

                    await refreshCancelledItemsForCurrentOrder({
                        showMessage: true
                    })

                } catch (error) {

                    console.warn(
                        'Cancelled item fallback polling error:',
                        error
                    )
                }
            },
            3000
        )
}


function heldItemToCartItem(row) {

    const modifiers =
        Array.isArray(row.modifiers)
            ? row.modifiers
            : []

    const itemNote =
        row.item_note || ''

    /*
     * IMPORTANT
     * รายการที่ถูกบันทึกลง restaurant_order_items แล้ว
     * ต้องแยก key ตาม row.id ด้วย
     *
     * เหตุผล:
     * ลูกค้าอาจสั่งเมนูเดิม + modifier เดิม + หมายเหตุเดิม
     * หลายรอบในโต๊ะเดียวกัน เช่น
     *
     * รอบแรก  บะหมี่หมูแดง x1
     * พักโต๊ะ
     * รอบสอง  บะหมี่หมูแดง x1
     *
     * ถ้าใช้ buildCartKey อย่างเดียว key จะเหมือนกัน
     * และ state.cart.set() จะทับรายการรอบก่อน
     */
    const baseCartKey =
        buildCartKey(
            row.product_id,
            modifiers,
            itemNote
        )

    const cartKey =
        `${baseCartKey}::${row.id}`

    const product =
        state.products.find(
            item => item.id === row.product_id
        )

    return {
        ...(product || {}),

        id:
            row.product_id,

        name:
            row.product_name
            || product?.name
            || 'สินค้า',

        cartKey,

        restaurant_item_id:
            row.id,

        is_confirmed:
            true,

        item_status:
            row.item_status
            ||
            null,

        base_price:
            Number(
                row.base_price
                ?? product?.price
                ?? 0
            ),

        modifier_total:
            Number(
                row.modifier_total || 0
            ),

        price:
            Number(
                row.unit_price
                ?? (
                    Number(
                        row.base_price
                        ?? product?.price
                        ?? 0
                    )
                    +
                    Number(
                        row.modifier_total || 0
                    )
                )
            ),

        quantity:
            Number(
                row.quantity || 0
            ),

        modifiers,

        item_note:
            itemNote
    }
}


async function loadHeldRestaurantOrder(
    orderId,
    selectedTable = null
) {

    const {
        data,
        error
    } =
        await supabase.rpc(
            'get_restaurant_order',
            {
                p_order_id:
                    orderId
            }
        )

    if (error) {
        throw error
    }

    const order =
        Array.isArray(data)
            ? data[0]
            : data

    if (!order?.order_id) {
        throw new Error(
            'ไม่พบออเดอร์โต๊ะ'
        )
    }

    state.currentOrder = {
        id:
            order.order_id,

        branch_id:
            order.branch_id,

        table_id:
            order.table_id,

        order_type:
            order.order_type,

        guest_count:
            Number(order.guest_count || 1),

        status:
            order.status,

        order_source:
            order.order_source || 'pos',

        note:
            order.note || null,

        opened_at:
            order.opened_at || null,

        table_name:
            selectedTable?.table_name
            ||
            (
                selectedTable
                    ? `โต๊ะ ${selectedTable.table_no}`
                    : null
            )
    }

    state.orderType =
        state.currentOrder.order_type

    state.selectedTableId =
        state.currentOrder.table_id

    state.guestCount =
        state.currentOrder.guest_count

    state.cart.clear()


    /*
     * สำคัญ:
     * รายการที่ Kitchen ยกเลิกแล้วต้องไม่กลับเข้าตะกร้า
     * และต้องไม่ถูกรวมในยอดชำระ
     */
    const cancelledItemIds =
        await getCancelledItemIdSetForOrder(
            order.order_id,
            order.items || []
        )


    for (
        const row
        of
        order.items || []
    ) {

        if (
            cancelledItemIds.has(
                row.id
            )
        ) {
            continue
        }


        const cartItem =
            heldItemToCartItem(row)

        if (
            cartItem.quantity > 0
        ) {
            state.cart.set(
                cartItem.cartKey,
                cartItem
            )
        }
    }

    renderOrderContext()
    renderGuestCount()
    renderCart()

    return state.currentOrder
}


async function holdCurrentTableAndChooseAnother() {

    if (!isHeldDineInOrder()) {
        location.href =
            './dashboard.html'
        return
    }

    closeMobileCart()
    closeModifierModal()

    state.cart.clear()
    state.currentOrder = null
    state.selectedTableId = null
    state.guestCount = 1
    state.orderType = 'dine_in'

    renderCart()
    renderOrderContext()
    resetOrderDraft()

    await openOrderStartModal()
}



async function startRestaurantOrder() {

    if (state.currentOrder) {
        el.orderStartModal
            ?.classList
            .add('hidden')
        return
    }

    const shiftReady =
        await requireOpenShift()

    if (!shiftReady) {
        msg(
            el.orderStartMessage,
            'กรุณาเปิดกะก่อนเริ่มออเดอร์'
        )
        return
    }

    if (
        state.orderType === 'dine_in'
        &&
        !state.selectedTableId
    ) {
        msg(
            el.orderStartMessage,
            'กรุณาเลือกโต๊ะ'
        )
        return
    }

    if (state.guestCount < 1) {
        msg(
            el.orderStartMessage,
            'จำนวนลูกค้าไม่ถูกต้อง'
        )
        return
    }

    if (el.startOrderBtn) {
        el.startOrderBtn.disabled = true
        el.startOrderBtn.textContent =
            state.orderType === 'dine_in'
                ? 'กำลังเปิดโต๊ะ...'
                : 'กำลังเริ่มออเดอร์...'
    }

    try {

        const selectedTable =
            getSelectedTable()

        /*
         * DINE-IN
         * เปิดโต๊ะใหม่ หรือเปิดออเดอร์เดิม
         */
        if (
            state.orderType === 'dine_in'
        ) {

            const {
                data,
                error
            } =
                await supabase.rpc(
                    'open_restaurant_order',
                    {
                        p_branch_id:
                            state.profile.branch_id,

                        p_table_id:
                            state.selectedTableId,

                        p_guest_count:
                            state.guestCount,

                        p_order_type:
                            'dine_in'
                    }
                )

            if (error) {
                throw error
            }

            const result =
                Array.isArray(data)
                    ? data[0]
                    : data

            if (!result?.order_id) {
                throw new Error(
                    'เปิดโต๊ะไม่สำเร็จ'
                )
            }

            await loadHeldRestaurantOrder(
                result.order_id,
                selectedTable
            )

            const table =
                state.tables.find(
                    item =>
                        item.id ===
                        state.selectedTableId
                )

            if (table) {
                table.status = 'occupied'
            }

            renderTables()
            renderOrderContext()
            renderCart()

            el.orderStartModal
                .classList
                .add('hidden')

            msg(
                el.pageMessage,
                result.is_existing
                    ? `${state.currentOrder.table_name} • เปิดออเดอร์เดิมแล้ว`
                    : `${state.currentOrder.table_name} • เปิดโต๊ะแล้ว`
            )

            setTimeout(
                () => msg(el.pageMessage, ''),
                1600
            )

            return
        }

        /*
         * TAKEAWAY
         *
         * สำคัญ:
         * ต้องสร้างใน public.restaurant_orders
         * เพื่อให้ add_restaurant_order_item / Kitchen
         * ใช้ Order ID ชุดเดียวกัน
         */
        const {
            data,
            error
        } =
            await supabase.rpc(
                'create_takeaway_restaurant_order',
                {
                    p_branch_id:
                        state.profile.branch_id,

                    p_shift_id:
                        state.currentShift?.id
                        || null,

                    p_guest_count:
                        state.guestCount,

                    p_note:
                        null
                }
            )

        if (error) {
            throw error
        }

        const order =
            Array.isArray(data)
                ? data[0]
                : data

        if (!order?.id) {
            throw new Error(
                'สร้างออเดอร์กลับบ้านไม่สำเร็จ'
            )
        }

        state.currentOrder = {
            ...order,

            order_type:
                'takeaway',

            order_source:
                order.order_source
                || 'pos',

            status:
                order.status
                || 'open',

            table_id:
                null,

            table_name:
                null
        }

        renderOrderContext()

        el.orderStartModal
            .classList
            .add('hidden')

        msg(
            el.pageMessage,
            `กลับบ้าน • ${state.currentOrder.guest_count} คน`
        )

        setTimeout(
            () => msg(el.pageMessage, ''),
            1600
        )

    } catch (error) {

        console.error(
            'Start restaurant order error:',
            error
        )

        let errorMessage =
            error.message
            || 'เริ่มออเดอร์ไม่สำเร็จ'

        if (
            errorMessage.includes(
                'TABLE_REQUIRED'
            )
        ) {
            errorMessage =
                'กรุณาเลือกโต๊ะ'
        }

        if (
            errorMessage.includes(
                'TABLE_NOT_FOUND'
            )
            ||
            errorMessage.includes(
                'INVALID_TABLE'
            )
        ) {
            errorMessage =
                'โต๊ะนี้ไม่สามารถใช้งานได้ กรุณาเลือกโต๊ะใหม่'

            await loadRestaurantTables()
        }

        if (
            errorMessage.includes(
                'INVALID_GUEST_COUNT'
            )
        ) {
            errorMessage =
                'จำนวนลูกค้าไม่ถูกต้อง'
        }

        msg(
            el.orderStartMessage,
            errorMessage
        )

    } finally {

        if (el.startOrderBtn) {
            el.startOrderBtn.disabled = false
            el.startOrderBtn.textContent =
                'เริ่มออเดอร์'
        }
    }
}


async function completeCurrentOrder() {

    if (
        !state.currentOrder?.id
    ) {
        return
    }


    try {

        const {
            error
        } =
            await supabase.rpc(
                'complete_restaurant_order',
                {
                    p_order_id:
                        state.currentOrder.id
                }
            )


        if (error) {
            throw error
        }


        /*
         * ป้องกัน Browser ค้างสถานะออเดอร์เก่า
         * หลัง complete_restaurant_order สำเร็จ
         */
        state.currentOrder.status =
            'completed'


        if (
            state.currentOrder.table_id
        ) {

            const table =
                state.tables.find(
                    item =>
                        item.id ===
                        state.currentOrder.table_id
                )


            if (table) {
                table.status =
                    'available'
            }
        }


    } catch (error) {

        console.error(
            'Complete restaurant order error:',
            error
        )

        /*
         * การขายถูกบันทึกไปแล้ว จึงไม่ throw ซ้ำ
         * เพื่อป้องกันการสร้างบิลซ้ำ
         */
    }
}


/* ========================================
   CATALOG
======================================== */

async function loadCatalog() {

    el.loading
        .classList
        .remove(
            'hidden'
        )


    el.empty
        .classList
        .add(
            'hidden'
        )


    el.productGrid
        .classList
        .add(
            'hidden'
        )


    try {

        const [
            categoriesResult,
            productsResult
        ] =
            await Promise.all([
                supabase
                    .from(
                        'categories'
                    )
                    .select(
                        'id,name,display_order'
                    )
                    .eq(
                        'branch_id',
                        state.profile.branch_id
                    )
                    .eq(
                        'is_active',
                        true
                    )
                    .order(
                        'display_order'
                    ),

                supabase
                    .from(
                        'products'
                    )
                    .select(`
                        id,
                        category_id,
                        name,
                        sku,
                        barcode,
                        price,
                        cost,
                        image_url,
                        display_order
                    `)
                    .eq(
                        'branch_id',
                        state.profile.branch_id
                    )
                    .eq(
                        'is_active',
                        true
                    )
                    .order(
                        'display_order'
                    )
                    .order(
                        'name'
                    )
            ])


        if (
            categoriesResult.error
        ) {

            throw categoriesResult.error
        }


        if (
            productsResult.error
        ) {

            throw productsResult.error
        }


        state.categories =
            categoriesResult.data
            ||
            []


        state.products =
            productsResult.data
            ||
            []


        renderCategories()


        await loadAvailability()


        renderProducts()


    } finally {

        el.loading
            .classList
            .add(
                'hidden'
            )
    }
}


/* ========================================
   AVAILABILITY / BOM
======================================== */

async function loadAvailability() {

    const {
        data,
        error
    } =
        await supabase.rpc(
            'get_pos_product_availability',
            {
                p_branch_id:
                    state.profile.branch_id
            }
        )


    if (error) {

        console.error(
            'Load availability error:',
            error
        )


        throw error
    }


    state.availability
        .clear()


    for (
        const row
        of
        data || []
    ) {

        state.availability.set(
            row.product_id,
            {
                available_qty:
                    Math.max(
                        Number(
                            row.available_qty
                            ||
                            0
                        ),
                        0
                    ),

                limiting_ingredient_id:
                    row.limiting_ingredient_id
                    ||
                    null,

                limiting_ingredient_name:
                    row.limiting_ingredient_name
                    ||
                    null
            }
        )
    }
}


function getAvailability(
    productId
) {

    return (
        state.availability
            .get(
                productId
            )
        ||
        {
            available_qty:
                0,

            limiting_ingredient_id:
                null,

            limiting_ingredient_name:
                null
        }
    )
}


/* ========================================
   USER
======================================== */

function renderUser() {

    el.userName.textContent =
        state.profile.full_name
        ||
        state.session
            .user
            .email
            .split('@')[0]


    el.branchText.textContent =
        `สาขา: ${state.branch.name}`
}


/* ========================================
   CATEGORIES
======================================== */

function renderCategories() {

    el.categoryTabs.innerHTML =
        `
        <button
            class="tab ${!state.selectedCategory
            ? 'active'
            : ''
        }"
            data-cat=""
            type="button"
        >
            ทั้งหมด
        </button>
        `
        +
        state.categories
            .map(
                category =>
                    `
                    <button
                        class="tab ${state.selectedCategory
                        ===
                        category.id
                        ? 'active'
                        : ''
                    }"
                        data-cat="${esc(
                        category.id
                    )}"
                        type="button"
                    >
                        ${esc(
                        category.name
                    )}
                    </button>
                    `
            )
            .join('')
}


/* ========================================
   FILTER PRODUCTS
======================================== */

function filtered() {

    const keyword =
        el.searchInput
            .value
            .trim()
            .toLowerCase()


    return state.products
        .filter(
            product => {

                const categoryMatch =
                    !state.selectedCategory
                    ||
                    product.category_id
                    ===
                    state.selectedCategory


                const searchText =
                    [
                        product.name,
                        product.sku,
                        product.barcode
                    ]
                        .filter(
                            Boolean
                        )
                        .join(' ')
                        .toLowerCase()


                const searchMatch =
                    !keyword
                    ||
                    searchText.includes(
                        keyword
                    )


                return (
                    categoryMatch
                    &&
                    searchMatch
                )
            }
        )
}


/* ========================================
   PRODUCTS
======================================== */

function renderProducts() {

    const list =
        filtered()


    if (
        !list.length
    ) {

        el.empty
            .classList
            .remove(
                'hidden'
            )


        el.productGrid
            .classList
            .add(
                'hidden'
            )


        return
    }


    el.empty
        .classList
        .add(
            'hidden'
        )


    el.productGrid
        .classList
        .remove(
            'hidden'
        )


    el.productGrid.innerHTML =
        list
            .map(
                product => {

                    const availability =
                        getAvailability(
                            product.id
                        )


                    const availableQty =
                        Math.floor(
                            availability
                                .available_qty
                        )


                    const soldOut =
                        availableQty <=
                        0


                    /*
                     * บนมือถือ:
                     * แสดงเฉพาะ
                     * - หมด
                     * - ใกล้หมด <= 10
                     */
                    let stockText =
                        ''


                    if (
                        soldOut
                    ) {

                        stockText =
                            `
        <div
            class="stock-status stock-out"
            style="
                margin-top:6px;
                font-size:13px;
                font-weight:700;
                color:#d93025;
            "
        >
            สินค้าหมด
        </div>
        `

                    } else {

                        stockText =
                            `
        <div
            class="stock-status stock-available"
            style="
                margin-top:6px;
                font-size:12px;
                font-weight:700;
                color:#188038;
            "
        >
            ขายได้อีก
            ${availableQty.toLocaleString(
                                'th-TH'
                            )}
            จาน
        </div>
        `
                    }


                    return `
                        <article
                            class="
                                product-card
                                ${soldOut
                            ? 'sold-out'
                            : ''
                        }
                            "
                        >

                            <button
                                type="button"
                                data-add="${esc(
                            product.id
                        )}"
                                ${soldOut
                            ? 'disabled'
                            : ''
                        }
                            >

                                <div
                                    class="product-image"
                                >

                                    ${product.image_url

                            ? `
                                                <img
                                                    src="${esc(
                                product.image_url
                            )}"
                                                    alt="${esc(
                                product.name
                            )}"
                                                    onerror="
                                                        this.parentElement.innerHTML='🍽️'
                                                    "
                                                >
                                            `

                            : '🍽️'
                        }

                                </div>


                                <div
                                    class="product-info"
                                >

                                    <h3>
                                        ${esc(
                            product.name
                        )}
                                    </h3>


                                    ${stockText}


                                    <div>

                                        <strong>
                                            ${money(
                            product.price
                        )}
                                        </strong>


                                        ${soldOut

                            ? `
                                                    <span
                                                        style="
                                                            color:#d93025;
                                                            font-weight:700;
                                                        "
                                                    >
                                                        หมด
                                                    </span>
                                                `

                            : `
                                                    <span
                                                        class="plus"
                                                    >
                                                        ＋
                                                    </span>
                                                `
                        }

                                    </div>

                                </div>

                            </button>

                        </article>
                    `
                }
            )
            .join('')
}



/* ========================================
   PRODUCT MODIFIERS
======================================== */

function ensureModifierModal() {

    let modal =
        document.getElementById(
            'modifierModal'
        )


    if (modal) {
        return modal
    }


    modal =
        document.createElement(
            'div'
        )


    modal.id =
        'modifierModal'


    modal.className =
        'modal hidden'


    modal.innerHTML =
        `
        <div class="modal-card modifier-modal-card">

            <div class="modal-head">

                <div>
                    <h2 id="modifierProductName">
                        ตัวเลือกสินค้า
                    </h2>

                    <small id="modifierBasePrice">
                        -
                    </small>
                </div>

                <button
                    id="closeModifierBtn"
                    class="icon-btn"
                    type="button"
                >
                    ×
                </button>

            </div>


            <div
                id="modifierGroups"
                class="modifier-groups"
            ></div>


            <label
                class="modifier-note-label"
                for="modifierItemNote"
            >
                หมายเหตุเฉพาะรายการ
            </label>

            <textarea
                id="modifierItemNote"
                rows="2"
                placeholder="เช่น ไม่ใส่ผัก"
            ></textarea>


            <div class="modifier-total-row">

                <span>
                    ราคารายการ
                </span>

                <strong id="modifierTotalText">
                    ฿0.00
                </strong>

            </div>


            <p
                id="modifierMessage"
                class="message"
            ></p>


            <button
                id="confirmModifierBtn"
                class="primary-btn"
                type="button"
            >
                เพิ่มลงตะกร้า
            </button>


        </div>
        `


    document.body.appendChild(
        modal
    )


    if (
        !document.getElementById(
            'modifierDynamicStyle'
        )
    ) {

        const style =
            document.createElement(
                'style'
            )


        style.id =
            'modifierDynamicStyle'


        style.textContent =
            `
            .modifier-groups {
                display: grid;
                gap: 18px;
                margin-top: 18px;
            }

            .modifier-group {
                padding: 14px;
                border: 1px solid var(--border, #e2e5e9);
                border-radius: 14px;
                background: #fff;
            }

            .modifier-group-head {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 10px;
                margin-bottom: 10px;
            }

            .modifier-group-head strong {
                font-size: 16px;
            }

            .modifier-required {
                color: #d93025;
                font-size: 12px;
                font-weight: 700;
            }

            .modifier-options {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 8px;
            }

            .modifier-option {
                position: relative;
                display: block !important;
                margin: 0 !important;
                cursor: pointer;
            }

            .modifier-option input {
                position: absolute;
                opacity: 0;
                pointer-events: none;
            }

            .modifier-option-box {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                min-height: 50px;
                padding: 10px 12px;
                border: 1px solid var(--border, #e2e5e9);
                border-radius: 11px;
                background: #fff;
            }

            .modifier-option input:checked + .modifier-option-box {
                border-color: var(--p, #f5b400);
                background: var(--pl, #fff4c7);
                box-shadow: inset 0 0 0 1px var(--p, #f5b400);
            }

            .modifier-option-price {
                white-space: nowrap;
                font-weight: 700;
            }

            .modifier-note-label {
                display: block;
                margin-top: 18px !important;
            }

            .modifier-total-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: 16px;
                padding: 14px;
                border-radius: 12px;
                background: var(--pl, #fff4c7);
                font-size: 18px;
            }

            .modifier-total-row strong {
                font-size: 22px;
            }

            @media (max-width: 760px) {

                body:has(#modifierModal:not(.hidden))
                .mobile-cart-bar {
                    display: none !important;
                }

                #modifierModal {
                    align-items: flex-end !important;
                    padding: 0 !important;
                    z-index: 31000 !important;
                }

                #modifierModal .modifier-modal-card {
                    width: 100% !important;
                    max-width: none !important;
                    max-height: 92dvh !important;
                    overflow-y: auto !important;
                    padding:
                        18px 18px
                        calc(22px + env(safe-area-inset-bottom))
                        !important;
                    border-radius: 24px 24px 0 0 !important;
                    -webkit-overflow-scrolling: touch;
                }

                #modifierModal .modal-head {
                    position: sticky !important;
                    top: -18px !important;
                    z-index: 5 !important;
                    margin: -18px -18px 12px !important;
                    padding: 18px !important;
                    background: #fff !important;
                }

                .modifier-options {
                    grid-template-columns: 1fr 1fr;
                }

                #confirmModifierBtn {
                    position: sticky;
                    bottom: 0;
                    z-index: 5;
                    min-height: 54px;
                    margin-top: 10px;
                }
            }
            `


        document.head.appendChild(
            style
        )
    }


    modal
        .querySelector(
            '#closeModifierBtn'
        )
        ?.addEventListener(
            'click',
            closeModifierModal
        )


    modal
        .querySelector(
            '#confirmModifierBtn'
        )
        ?.addEventListener(
            'click',
            confirmModifierSelection
        )




    modal
        .querySelector(
            '#modifierGroups'
        )
        ?.addEventListener(
            'change',
            updateModifierTotal
        )


    modal.addEventListener(
        'click',
        event => {

            if (
                event.target ===
                modal
            ) {

                closeModifierModal()
            }
        }
    )


    return modal
}


function closeModifierModal() {

    const modal =
        document.getElementById(
            'modifierModal'
        )


    modal
        ?.classList
        .add(
            'hidden'
        )


    state.modifierProduct =
        null
}


function cartProductQuantity(
    productId
) {

    return items()
        .filter(
            item =>
                item.id ===
                productId
        )
        .reduce(
            (
                sum,
                item
            ) =>
                sum +
                Number(
                    item.quantity
                    ||
                    0
                ),
            0
        )
}


async function loadProductModifiers(
    productId
) {

    if (
        state.modifierCache.has(
            productId
        )
    ) {

        return state.modifierCache.get(
            productId
        )
    }


    const {
        data: links,
        error: linkError
    } =
        await supabase
            .from(
                'product_modifier_groups'
            )
            .select(
                'modifier_group_id,display_order'
            )
            .eq(
                'product_id',
                productId
            )
            .order(
                'display_order',
                {
                    ascending: true
                }
            )


    if (linkError) {
        throw linkError
    }


    if (
        !links?.length
    ) {

        state.modifierCache.set(
            productId,
            []
        )


        return []
    }


    const groupIds =
        [
            ...new Set(
                links.map(
                    item =>
                        item.modifier_group_id
                )
            )
        ]


    const [
        groupResult,
        optionResult
    ] =
        await Promise.all([
            supabase
                .from(
                    'modifier_groups'
                )
                .select(`
                    id,
                    name,
                    selection_type,
                    is_required,
                    min_select,
                    max_select,
                    display_order,
                    is_active
                `)
                .in(
                    'id',
                    groupIds
                )
                .eq(
                    'is_active',
                    true
                ),

            supabase
                .from(
                    'modifier_options'
                )
                .select(`
                    id,
                    modifier_group_id,
                    name,
                    price_adjustment,
                    display_order,
                    is_active
                `)
                .in(
                    'modifier_group_id',
                    groupIds
                )
                .eq(
                    'is_active',
                    true
                )
        ])


    if (groupResult.error) {
        throw groupResult.error
    }


    if (optionResult.error) {
        throw optionResult.error
    }


    const linkOrder =
        new Map(
            links.map(
                link => [
                    link.modifier_group_id,
                    Number(
                        link.display_order
                        ||
                        0
                    )
                ]
            )
        )


    const groups =
        (groupResult.data || [])
            .map(
                group => ({
                    ...group,

                    product_display_order:
                        linkOrder.get(
                            group.id
                        )
                        ??
                        Number(
                            group.display_order
                            ||
                            0
                        ),

                    options:
                        (optionResult.data || [])
                            .filter(
                                option =>
                                    option.modifier_group_id ===
                                    group.id
                            )
                            .sort(
                                (
                                    a,
                                    b
                                ) =>
                                    Number(
                                        a.display_order
                                        ||
                                        0
                                    )
                                    -
                                    Number(
                                        b.display_order
                                        ||
                                        0
                                    )
                            )
                })
            )
            .sort(
                (
                    a,
                    b
                ) =>
                    a.product_display_order
                    -
                    b.product_display_order
            )


    state.modifierCache.set(
        productId,
        groups
    )


    return groups
}


function renderModifierGroups(
    groups
) {

    const container =
        document.getElementById(
            'modifierGroups'
        )


    if (!container) {
        return
    }


    container.innerHTML =
        groups
            .map(
                group => {

                    const type =
                        group.selection_type ===
                            'multiple'

                            ? 'checkbox'

                            : 'radio'


                    const requiredText =
                        group.is_required

                            ? 'จำเป็น'

                            : 'ไม่บังคับ'


                    return `
                        <section
                            class="modifier-group"
                            data-modifier-group="${esc(
                        group.id
                    )}"
                            data-selection-type="${esc(
                        group.selection_type
                    )}"
                            data-required="${group.is_required ? 'true' : 'false'}"
                            data-min="${Number(
                        group.min_select
                        ||
                        0
                    )}"
                            data-max="${Number(
                        group.max_select
                        ||
                        0
                    )}"
                        >

                            <div class="modifier-group-head">

                                <strong>
                                    ${esc(
                        group.name
                    )}
                                </strong>

                                <span class="modifier-required">
                                    ${requiredText}
                                </span>

                            </div>


                            <div class="modifier-options">

                                ${group.options
                            .map(
                                (
                                    option,
                                    index
                                ) => {

                                    /*
                                     * กลุ่ม single ที่บังคับเลือก
                                     * เลือกตัวเลือกแรกเป็นค่าเริ่มต้น
                                     * เช่น "ธรรมดา"
                                     */
                                    const defaultChecked =
                                        group.selection_type ===
                                        'single'
                                        &&
                                        group.is_required
                                        &&
                                        index ===
                                        0


                                    const price =
                                        Number(
                                            option.price_adjustment
                                            ||
                                            0
                                        )


                                    return `
                                                <label class="modifier-option">

                                                    <input
                                                        type="${type}"
                                                        name="modifier-${esc(
                                        group.id
                                    )}"
                                                        value="${esc(
                                        option.id
                                    )}"
                                                        data-group-id="${esc(
                                        group.id
                                    )}"
                                                        data-group-name="${esc(
                                        group.name
                                    )}"
                                                        data-option-name="${esc(
                                        option.name
                                    )}"
                                                        data-price="${price}"
                                                        ${defaultChecked ? 'checked' : ''}
                                                    >

                                                    <span class="modifier-option-box">

                                                        <span>
                                                            ${esc(
                                        option.name
                                    )}
                                                        </span>

                                                        <span class="modifier-option-price">
                                                            ${price > 0

                                            ? `+${money(
                                                price
                                            )}`

                                            : ''
                                        }
                                                        </span>

                                                    </span>

                                                </label>
                                            `
                                }
                            )
                            .join('')}

                            </div>

                        </section>
                    `
                }
            )
            .join('')
}


function selectedModifierPrice() {

    return [
        ...document.querySelectorAll(
            '#modifierModal input[data-price]:checked'
        )
    ]
        .reduce(
            (
                sum,
                input
            ) =>
                sum +
                Number(
                    input.dataset.price
                    ||
                    0
                ),
            0
        )
}


function updateModifierTotal() {

    const product =
        state.modifierProduct


    const target =
        document.getElementById(
            'modifierTotalText'
        )


    if (
        !product
        ||
        !target
    ) {
        return
    }


    target.textContent =
        money(
            Number(
                product.price
                ||
                0
            )
            +
            selectedModifierPrice()
        )


    msg(
        document.getElementById(
            'modifierMessage'
        ),
        ''
    )
}


async function openModifierModal(
    product,
    groups
) {

    const modal =
        ensureModifierModal()


    state.modifierProduct =
        product


    const title =
        document.getElementById(
            'modifierProductName'
        )


    const basePrice =
        document.getElementById(
            'modifierBasePrice'
        )


    const note =
        document.getElementById(
            'modifierItemNote'
        )


    if (title) {

        title.textContent =
            product.name
    }


    if (basePrice) {

        basePrice.textContent =
            `ราคาเริ่มต้น ${money(
                product.price
            )}`
    }


    if (note) {

        note.value =
            ''
    }


    renderModifierGroups(
        groups
    )


    updateModifierTotal()


    msg(
        document.getElementById(
            'modifierMessage'
        ),
        ''
    )


    closeMobileCart()


    modal.classList.remove(
        'hidden'
    )
}


function buildCartKey(
    productId,
    modifiers,
    itemNote
) {

    const optionKey =
        modifiers
            .map(
                item =>
                    item.option_id
            )
            .sort()
            .join(
                ','
            )


    const noteKey =
        String(
            itemNote
            ||
            ''
        )
            .trim()
            .toLowerCase()


    return `${productId}::${optionKey}::${noteKey}`
}



async function addConfiguredProduct(
    product,
    modifiers = [],
    itemNote = ''
) {

    if (!isLiveRestaurantOrder()) {
        msg(
            el.pageMessage,
            'กรุณาเริ่มออเดอร์ก่อนเลือกสินค้า'
        )
        return false
    }

    const availability =
        getAvailability(product.id)

    const availableQty =
        Math.floor(
            availability.available_qty
        )

    const currentProductQty =
        cartProductQuantity(product.id)

    if (availableQty <= 0) {
        msg(
            el.pageMessage,
            'สินค้านี้หมด เนื่องจากวัตถุดิบไม่เพียงพอ'
        )
        return false
    }

    if (currentProductQty >= availableQty) {
        msg(
            el.pageMessage,
            `เพิ่มไม่ได้ สามารถขาย ${product.name} ได้สูงสุด ${availableQty} จาน`
        )
        return false
    }

    const modifierTotal =
        modifiers.reduce(
            (sum, modifier) =>
                sum +
                Number(
                    modifier.price_adjustment || 0
                ),
            0
        )

    const unitPrice =
        Number(product.price || 0)
        +
        modifierTotal

    const baseCartKey =
        buildCartKey(
            product.id,
            modifiers,
            itemNote
        )

    /*
     * Draft แยก key จากรายการที่ส่งครัวแล้ว
     * เพื่อให้การสั่งเพิ่มภายหลังสร้างใบครัวรอบใหม่
     */
    const cartKey =
        `draft::${baseCartKey}`

    const oldDraft =
        state.cart.get(cartKey)

    if (
        oldDraft
        &&
        !oldDraft.restaurant_item_id
    ) {
        oldDraft.quantity =
            Number(oldDraft.quantity || 0) + 1
    } else {
        state.cart.set(
            cartKey,
            {
                ...product,
                cartKey,
                restaurant_item_id: null,
                is_confirmed: false,
                base_price: Number(product.price || 0),
                price: unitPrice,
                modifier_total: modifierTotal,
                modifiers,
                item_note: String(itemNote || '').trim(),
                quantity: 1
            }
        )
    }

    msg(el.pageMessage, '')
    renderCart()
    return true
}


async function confirmModifierSelection() {

    const product =
        state.modifierProduct


    if (!product) {
        return
    }


    const modal =
        document.getElementById(
            'modifierModal'
        )


    const message =
        document.getElementById(
            'modifierMessage'
        )


    const groups =
        [
            ...modal.querySelectorAll(
                '[data-modifier-group]'
            )
        ]


    for (
        const group
        of
        groups
    ) {

        const checked =
            [
                ...group.querySelectorAll(
                    'input:checked'
                )
            ]


        const required =
            group.dataset.required ===
            'true'


        const min =
            Number(
                group.dataset.min
                ||
                0
            )


        const max =
            Number(
                group.dataset.max
                ||
                0
            )


        const selectionType =
            group.dataset.selectionType


        const groupTitle =
            group
                .querySelector(
                    '.modifier-group-head strong'
                )
                ?.textContent
                ?.trim()
            ||
            'ตัวเลือก'


        if (
            (
                required
                &&
                checked.length <
                Math.max(
                    min,
                    1
                )
            )
            ||
            checked.length <
            min
        ) {

            msg(
                message,
                `กรุณาเลือก ${groupTitle}`
            )


            return
        }


        if (
            (
                max > 0
                &&
                checked.length >
                max
            )
            ||
            (
                selectionType ===
                'single'
                &&
                checked.length >
                1
            )
        ) {

            msg(
                message,
                `เลือก ${groupTitle} เกินจำนวนที่กำหนด`
            )


            return
        }
    }


    const modifiers =
        [
            ...modal.querySelectorAll(
                'input[data-group-id]:checked'
            )
        ]
            .map(
                input => ({
                    group_id:
                        input.dataset.groupId,

                    group_name:
                        input.dataset.groupName,

                    option_id:
                        input.value,

                    option_name:
                        input.dataset.optionName,

                    price_adjustment:
                        Number(
                            input.dataset.price
                            ||
                            0
                        )
                })
            )


    const itemNote =
        document.getElementById(
            'modifierItemNote'
        )
            ?.value
            ?.trim()
        ||
        ''


    const added =
        await addConfiguredProduct(
            product,
            modifiers,
            itemNote
        )


    if (added) {

        closeModifierModal()
    }
}


/* ========================================
   ADD PRODUCT
======================================== */

async function add(
    id
) {

    if (
        !state.currentOrder
    ) {

        msg(
            el.pageMessage,
            'กรุณาเริ่มออเดอร์ก่อนเลือกสินค้า'
        )


        openOrderStartModal()


        return
    }


    const product =
        state.products.find(
            item =>
                item.id ===
                id
        )


    if (!product) {
        return
    }


    const availability =
        getAvailability(
            id
        )


    const availableQty =
        Math.floor(
            availability
                .available_qty
        )


    if (
        availableQty <=
        0
    ) {

        msg(
            el.pageMessage,
            'สินค้านี้หมด เนื่องจากวัตถุดิบไม่เพียงพอ'
        )


        return
    }


    try {

        const groups =
            await loadProductModifiers(
                product.id
            )


        /*
         * เมนูไม่มี Modifier
         * เพิ่มลงตะกร้าได้ทันทีเหมือนเดิม
         */
        if (
            !groups.length
        ) {

            await addConfiguredProduct(
                product,
                [],
                ''
            )


            return
        }


        /*
         * เมนูมี Modifier
         * เปิด Popup ให้เลือกก่อน
         */
        await openModifierModal(
            product,
            groups
        )


    } catch (error) {

        console.error(
            'Load product modifiers error:',
            error
        )


        msg(
            el.pageMessage,
            error.message
            ||
            'โหลดตัวเลือกสินค้าไม่สำเร็จ'
        )
    }
}


/* ========================================
   CHANGE CART QTY
======================================== */


async function qty(
    cartKey,
    change
) {

    const item =
        state.cart.get(cartKey)

    if (!item) return

    if (item.restaurant_item_id) {
        msg(
            el.pageMessage,
            'รายการนี้ส่งเข้าครัวแล้ว หากต้องการเพิ่มให้กดสินค้าเป็นรอบใหม่'
        )
        return
    }

    if (change > 0) {
        const availability =
            getAvailability(item.id)

        const availableQty =
            Math.floor(
                availability.available_qty
            )

        const currentProductQty =
            cartProductQuantity(item.id)

        if (currentProductQty >= availableQty) {
            msg(
                el.pageMessage,
                `เพิ่มไม่ได้ สามารถขาย ${item.name} ได้สูงสุด ${availableQty} จาน`
            )
            return
        }
    }

    item.quantity =
        Number(item.quantity || 0) + change

    if (item.quantity <= 0) {
        state.cart.delete(cartKey)
    }

    msg(el.pageMessage, '')
    renderCart()
}



async function removeCartItem(
    cartKey
) {

    const item =
        state.cart.get(cartKey)

    if (!item) return

    if (item.restaurant_item_id) {
        msg(
            el.pageMessage,
            'รายการนี้ส่งเข้าครัวแล้ว ไม่สามารถลบจากตะกร้าโดยตรง'
        )
        return
    }

    state.cart.delete(cartKey)
    renderCart()
}



async function clearCurrentCart() {

    const drafts =
        draftItems()

    if (!drafts.length) {
        msg(
            el.pageMessage,
            'ไม่มีรายการ Draft ที่จะล้าง'
        )
        return
    }

    for (const item of drafts) {
        state.cart.delete(item.cartKey)
    }

    msg(el.pageMessage, '')
    renderCart()
}



/* ========================================
   CONFIRM ORDER / SEND TO KITCHEN
======================================== */

async function confirmCurrentOrder() {

    if (!isLiveRestaurantOrder()) {
        msg(
            el.pageMessage,
            'กรุณาเริ่มออเดอร์ก่อน'
        )
        return
    }

    const shiftReady =
        await requireOpenShift()

    if (!shiftReady) return

    const drafts =
        draftItems()

    if (!drafts.length) {
        msg(
            el.pageMessage,
            'ไม่มีรายการใหม่ที่รอยืนยัน'
        )
        return
    }

    if (el.confirmOrderBtn) {
        el.confirmOrderBtn.disabled = true
        el.confirmOrderBtn.textContent =
            'กำลังส่งเข้าครัว...'
    }

    let sentCount = 0

    try {
        for (const draft of drafts) {

            const {
                data,
                error
            } =
                await supabase.rpc(
                    'add_restaurant_order_item',
                    {
                        p_order_id:
                            state.currentOrder.id,

                        p_product_id:
                            draft.id,

                        p_quantity:
                            Number(draft.quantity || 0),

                        p_modifiers:
                            (draft.modifiers || [])
                                .map(
                                    modifier => ({
                                        group_id:
                                            modifier.group_id,

                                        option_id:
                                            modifier.option_id
                                    })
                                ),

                        p_item_note:
                            String(
                                draft.item_note || ''
                            ).trim() || null
                    }
                )

            if (error) throw error

            const saved =
                Array.isArray(data)
                    ? data[0]
                    : data

            if (!saved?.item_id) {
                throw new Error(
                    `ส่ง ${draft.name} เข้าครัวไม่สำเร็จ`
                )
            }

            state.cart.delete(
                draft.cartKey
            )

            const baseCartKey =
                buildCartKey(
                    draft.id,
                    draft.modifiers || [],
                    draft.item_note || ''
                )

            const confirmedKey =
                `${baseCartKey}::${saved.item_id}`

            state.cart.set(
                confirmedKey,
                {
                    ...draft,
                    cartKey: confirmedKey,
                    restaurant_item_id: saved.item_id,
                    is_confirmed: true,
                    price:
                        Number(
                            saved.unit_price
                            ?? draft.price
                            ?? 0
                        )
                }
            )

            sentCount++
        }

        renderCart()
        closeMobileCart()

        msg(
            el.pageMessage,
            `✅ ยืนยันออเดอร์แล้ว • ส่งเข้าครัว ${sentCount.toLocaleString('th-TH')} รายการ`
        )

        setTimeout(
            () => {
                if (
                    el.pageMessage?.textContent?.includes(
                        'ยืนยันออเดอร์แล้ว'
                    )
                ) {
                    msg(el.pageMessage, '')
                }
            },
            2200
        )

    } catch (error) {
        console.error(
            'Confirm order error:',
            error
        )

        renderCart()

        msg(
            el.pageMessage,
            error.message ||
            'ส่งออเดอร์เข้าครัวไม่สำเร็จ'
        )

    } finally {
        if (el.confirmOrderBtn) {
            el.confirmOrderBtn.textContent =
                '✅ ยืนยันออเดอร์'

            el.confirmOrderBtn.disabled =
                !hasOpenShift()
                ||
                !state.currentOrder
                ||
                !hasDraftItems()
        }
    }
}


/* ========================================
   CART
======================================== */

function renderCart() {

    const list =
        items()


    const count =
        list.reduce(
            (
                sum,
                item
            ) =>
                sum +
                item.quantity,
            0
        )


    /*
     * Desktop count
     */
    if (
        el.cartCount
    ) {

        el.cartCount.textContent =
            `${count.toLocaleString(
                'th-TH'
            )} รายการ`
    }


    /*
     * Mobile count
     */
    if (
        el.mobileCartCount
    ) {

        el.mobileCartCount.textContent =
            `${count.toLocaleString(
                'th-TH'
            )} รายการ`
    }


    /*
     * Mobile total
     */
    if (
        el.mobileCartTotal
    ) {

        el.mobileCartTotal.textContent =
            money(
                total()
            )
    }


    el.emptyCart
        .classList
        .toggle(
            'hidden',
            Boolean(
                list.length
            )
        )


    el.cartItems
        .classList
        .toggle(
            'hidden',
            !list.length
        )


    el.cartItems.innerHTML =
        list
            .map(
                item => {

                    const modifierText =
                        (item.modifiers || [])
                            .map(
                                modifier => {

                                    const price =
                                        Number(
                                            modifier.price_adjustment
                                            ||
                                            0
                                        )


                                    return (
                                        esc(
                                            modifier.option_name
                                        )
                                        +
                                        (
                                            price > 0

                                                ? ` (+${money(
                                                    price
                                                )})`

                                                : ''
                                        )
                                    )
                                }
                            )
                            .join(
                                ' • '
                            )


                    const noteText =
                        item.item_note
                            ? `หมายเหตุ: ${esc(
                                item.item_note
                            )}`
                            : ''


                    const isConfirmed =
                        Boolean(
                            item.restaurant_item_id
                        )


                    const itemStatusHtml =
                        isConfirmed
                            ? `
                                <small class="cart-order-status confirmed">
                                    ✓ ส่งเข้าครัวแล้ว
                                </small>
                            `
                            : `
                                <small class="cart-order-status draft">
                                    รอยืนยันออเดอร์
                                </small>
                            `


                    return `
                        <div
                            class="cart-item"
                        >

                            <div>

                                <strong>
                                    ${esc(
                        item.name
                    )}
                                </strong>

                                ${itemStatusHtml}


                                ${modifierText

                            ? `
                                            <small
                                                style="
                                                    color:#5f6368;
                                                    margin-top:4px;
                                                "
                                            >
                                                ${modifierText}
                                            </small>
                                        `

                            : ''
                        }


                                ${noteText

                            ? `
                                            <small
                                                style="
                                                    color:#d97706;
                                                    margin-top:3px;
                                                "
                                            >
                                                ${noteText}
                                            </small>
                                        `

                            : ''
                        }


                                <small>
                                    ${money(
                            item.price
                        )}
                                    ×
                                    ${item.quantity}
                                </small>


                                <div
                                    class="qty"
                                >

                                    ${isConfirmed
                            ? `
                                                <span class="confirmed-qty">
                                                    จำนวน ${item.quantity}
                                                </span>
                                            `
                            : `
                                                <button
                                                    type="button"
                                                    data-act="dec"
                                                    data-id="${esc(
                                item.cartKey
                                ||
                                item.id
                            )}"
                                                >
                                                    −
                                                </button>

                                                <b>
                                                    ${item.quantity}
                                                </b>

                                                <button
                                                    type="button"
                                                    data-act="inc"
                                                    data-id="${esc(
                                item.cartKey
                                ||
                                item.id
                            )}"
                                                >
                                                    ＋
                                                </button>

                                                <button
                                                    type="button"
                                                    class="remove"
                                                    data-act="remove"
                                                    data-id="${esc(
                                item.cartKey
                                ||
                                item.id
                            )}"
                                                >
                                                    ลบ
                                                </button>
                                            `
                        }

                                </div>

                            </div>


                            <strong>
                                ${money(
                            Number(
                                item.price
                            )
                            *
                            item.quantity
                        )}
                            </strong>

                        </div>
                    `
                }
            )
            .join('')


    el.subtotalText.textContent =
        money(
            subtotal()
        )


    el.totalText.textContent =
        money(
            total()
        )


    if (
        el.confirmOrderBtn
    ) {

        el.confirmOrderBtn.disabled =
            !hasOpenShift()
            ||
            !state.currentOrder
            ||
            !hasDraftItems()
    }


    el.checkoutBtn.disabled =
        !canProcessPayment()
        ||
        !list.length
        ||
        !hasOpenShift()
        ||
        hasDraftItems()


    applyPaymentPermissionUi()


    if (
        !hasOpenShift()
    ) {

        msg(
            el.pageMessage,
            'ยังไม่ได้เปิดกะ กรุณาเปิดกะก่อนเริ่มขาย'
        )

    } else {

        msg(
            el.pageMessage,

            discount() >
                subtotal()

                ? 'ส่วนลดมากกว่ายอดสินค้า'

                : ''
        )
    }
}


/* ========================================
   PAYMENT DISCOUNT / PROMOTION
======================================== */

function resetPaymentDiscount() {

    if (
        el.discountInput
    ) {
        el.discountInput.value =
            '0'
    }


    state.discountAuthorizationId =
        null

    state.discountSource =
        null

    state.discountLabel =
        ''

    state.discountReason =
        ''

    state.discountApprovedBy =
        null


    if (
        el.couponCodeInput
    ) {
        el.couponCodeInput.value =
            ''
    }


    renderPaymentDiscountSummary()
}


function renderPaymentDiscountSummary() {

    const amount =
        discount()


    const hasDiscount =
        amount > 0


    el.paymentDiscountSummary
        ?.classList
        .toggle(
            'hidden',
            !hasDiscount
        )


    el.clearPaymentDiscountBtn
        ?.classList
        .toggle(
            'hidden',
            !hasDiscount
        )


    if (
        el.paymentDiscountLabel
    ) {

        el.paymentDiscountLabel.textContent =
            state.discountLabel
            ||
            'ส่วนลด'
    }


    if (
        el.paymentDiscountAmount
    ) {

        el.paymentDiscountAmount.textContent =
            `-${money(amount)}`
    }


    if (
        el.paymentTotalText
    ) {

        el.paymentTotalText.textContent =
            money(
                total()
            )
    }


    renderVatUi()

    renderQuickCash()

    updateChange()


    if (
        state.paymentMethod ===
        'qr'
    ) {

        renderPromptPayQr()
    }
}


async function loadActivePromotions() {

    if (
        !el.activePromotionSelect
    ) {
        return
    }


    el.activePromotionSelect.innerHTML =
        '<option value="">กำลังโหลดโปรโมชั่น...</option>'


    el.applyPromotionBtn.disabled =
        true


    try {

        const {
            data,
            error
        } =
            await supabase.rpc(
                'get_active_promotions',
                {
                    p_branch_id:
                        state.profile.branch_id,

                    p_subtotal:
                        subtotal()
                }
            )


        if (
            error
        ) {
            throw error
        }


        const list =
            Array.isArray(data)
                ? data
                : []


        state.activePromotions =
            list


        if (
            !list.length
        ) {

            el.activePromotionSelect.innerHTML =
                '<option value="">ไม่มีโปรโมชั่นที่ใช้ได้ตอนนี้</option>'

            return
        }


        el.activePromotionSelect.innerHTML =
            `
                <option value="">
                    เลือกโปรโมชั่น
                </option>
            `
            +
            list
                .map(
                    promotion => {

                        const amount =
                            Number(
                                promotion.discount_amount
                                ||
                                0
                            )


                        return `
                            <option
                                value="${esc(promotion.id)}"
                            >
                                ${esc(promotion.name)}
                                • ลด ${money(amount)}
                            </option>
                        `
                    }
                )
                .join('')


        el.applyPromotionBtn.disabled =
            false

    } catch (error) {

        console.error(
            'Load active promotions error:',
            error
        )


        el.activePromotionSelect.innerHTML =
            '<option value="">โหลดโปรโมชั่นไม่สำเร็จ</option>'


        msg(
            el.paymentMessage,
            error.message
            ||
            'โหลดโปรโมชั่นไม่สำเร็จ'
        )
    }
}



function hasActivePaymentDiscount() {

    return (
        discount() >
        0
    )
}


function requireNoExistingDiscount() {

    if (
        !hasActivePaymentDiscount()
    ) {
        return true
    }


    msg(
        el.paymentMessage,
        'บิลนี้มีส่วนลดอยู่แล้ว กรุณากด “ล้างส่วนลด” ก่อนเลือกส่วนลดแบบอื่น'
    )


    return false
}


async function applyCouponCode() {

    if (
        !requireNoExistingDiscount()
    ) {
        return
    }


    const code =
        String(
            el.couponCodeInput
                ?.value
            ||
            ''
        )
            .trim()
            .toUpperCase()


    if (
        !code
    ) {

        msg(
            el.paymentMessage,
            'กรุณากรอกรหัสคูปอง / วอชเชอร์'
        )

        return
    }


    el.applyCouponBtn.disabled =
        true


    try {

        const {
            data,
            error
        } =
            await supabase.rpc(
                'apply_coupon_code',
                {
                    p_code:
                        code,

                    p_subtotal:
                        subtotal(),

                    p_order_id:
                        state.currentOrder?.id
                        ||
                        null
                }
            )


        if (
            error
        ) {
            throw error
        }


        const result =
            Array.isArray(data)
                ? data[0]
                : data


        const amount =
            Number(
                result?.discount_amount
                ||
                0
            )


        if (
            amount <=
            0
        ) {

            throw new Error(
                'คูปองนี้ไม่สามารถใช้ได้'
            )
        }


        el.discountInput.value =
            String(
                amount
            )


        state.discountAuthorizationId =
            result.authorization_id
            ||
            null


        state.discountSource =
            'coupon'


        state.discountLabel =
            `${result.coupon_type ===
                'voucher'
                ? 'วอชเชอร์'
                : 'คูปอง'
            }: ${result.coupon_name
            ||
            code
            }`


        state.discountReason =
            `CODE ${code}`


        state.discountApprovedBy =
            result.approved_by
            ||
            null


        renderPaymentDiscountSummary()


        msg(
            el.paymentMessage,
            'ใช้คูปอง / วอชเชอร์แล้ว'
        )

    } catch (error) {

        console.error(
            'Apply coupon error:',
            error
        )


        let text =
            error.message
            ||
            'ใช้คูปองไม่สำเร็จ'


        if (
            text.includes(
                'COUPON_NOT_ACTIVE'
            )
        ) {

            text =
                'รหัสนี้ไม่ถูกต้อง หมดอายุ หรือยังไม่ถึงเวลาใช้งาน'
        }


        if (
            text.includes(
                'COUPON_MINIMUM_NOT_MET'
            )
        ) {

            text =
                'ยอดซื้อยังไม่ถึงขั้นต่ำของคูปอง'
        }


        msg(
            el.paymentMessage,
            text
        )

    } finally {

        el.applyCouponBtn.disabled =
            false
    }
}


async function applySelectedPromotion() {

    if (
        !requireNoExistingDiscount()
    ) {
        return
    }


    const promotionId =
        el.activePromotionSelect
            ?.value
        ||
        ''


    if (
        !promotionId
    ) {

        msg(
            el.paymentMessage,
            'กรุณาเลือกโปรโมชั่น'
        )

        return
    }


    el.applyPromotionBtn.disabled =
        true


    try {

        const {
            data,
            error
        } =
            await supabase.rpc(
                'apply_promotion',
                {
                    p_promotion_id:
                        promotionId,

                    p_subtotal:
                        subtotal(),

                    p_order_id:
                        state.currentOrder?.id
                        ||
                        null
                }
            )


        if (
            error
        ) {
            throw error
        }


        const result =
            Array.isArray(data)
                ? data[0]
                : data


        const amount =
            Number(
                result?.discount_amount
                ||
                0
            )


        if (
            amount <=
            0
        ) {

            throw new Error(
                'โปรโมชั่นนี้ไม่สามารถใช้ได้'
            )
        }


        el.discountInput.value =
            String(
                amount
            )


        state.discountAuthorizationId =
            result.authorization_id
            ||
            null


        state.discountSource =
            'promotion'


        state.discountLabel =
            `โปรโมชั่น: ${result.promotion_name
            ||
            'ส่วนลด'
            }`


        state.discountReason =
            result.promotion_name
            ||
            null


        state.discountApprovedBy =
            result.approved_by
            ||
            null


        renderPaymentDiscountSummary()


        msg(
            el.paymentMessage,
            'ใช้โปรโมชั่นแล้ว'
        )

    } catch (error) {

        console.error(
            'Apply promotion error:',
            error
        )


        msg(
            el.paymentMessage,
            error.message
            ||
            'ใช้โปรโมชั่นไม่สำเร็จ'
        )

    } finally {

        el.applyPromotionBtn.disabled =
            false
    }
}


function openManualDiscountModal() {

    if (
        !requireNoExistingDiscount()
    ) {
        return
    }


    if (
        !canProcessPayment()
    ) {

        showPaymentDeniedMessage(
            el.paymentMessage
        )

        return
    }


    el.manualDiscountAmount.value =
        ''

    el.manualDiscountReason.value =
        ''

    el.manualDiscountPin.value =
        ''


    msg(
        el.manualDiscountMessage,
        ''
    )


    el.manualDiscountModal
        ?.classList
        .remove(
            'hidden'
        )


    setTimeout(
        () =>
            el.manualDiscountAmount
                ?.focus(),
        100
    )
}


function closeManualDiscountModal() {

    el.manualDiscountModal
        ?.classList
        .add(
            'hidden'
        )


    if (
        el.manualDiscountPin
    ) {
        el.manualDiscountPin.value =
            ''
    }
}


async function approveManualDiscount() {

    const amount =
        Number(
            el.manualDiscountAmount
                ?.value
            ||
            0
        )


    const reason =
        String(
            el.manualDiscountReason
                ?.value
            ||
            ''
        ).trim()


    const pin =
        String(
            el.manualDiscountPin
                ?.value
            ||
            ''
        ).trim()


    if (
        amount <=
        0
    ) {

        msg(
            el.manualDiscountMessage,
            'กรุณาระบุจำนวนส่วนลด'
        )

        return
    }


    if (
        amount >
        subtotal()
    ) {

        msg(
            el.manualDiscountMessage,
            'ส่วนลดมากกว่ายอดสินค้าไม่ได้'
        )

        return
    }


    if (
        reason.length <
        3
    ) {

        msg(
            el.manualDiscountMessage,
            'กรุณาระบุเหตุผลในการให้ส่วนลด'
        )

        return
    }


    if (
        !/^\d{6}$/.test(
            pin
        )
    ) {

        msg(
            el.manualDiscountMessage,
            'PIN ผู้อนุมัติต้องเป็นตัวเลข 6 หลัก'
        )

        return
    }


    el.confirmManualDiscountBtn.disabled =
        true


    el.confirmManualDiscountBtn.textContent =
        'กำลังตรวจสอบ...'


    try {

        const {
            data,
            error
        } =
            await supabase.rpc(
                'approve_manual_discount',
                {
                    p_branch_id:
                        state.profile.branch_id,

                    p_subtotal:
                        subtotal(),

                    p_amount:
                        amount,

                    p_reason:
                        reason,

                    p_pin:
                        pin,

                    p_order_id:
                        state.currentOrder?.id
                        ||
                        null
                }
            )


        if (
            error
        ) {
            throw error
        }


        const result =
            Array.isArray(data)
                ? data[0]
                : data


        const approvedAmount =
            Number(
                result?.discount_amount
                ||
                0
            )


        if (
            approvedAmount <=
            0
        ) {

            throw new Error(
                'อนุมัติส่วนลดไม่สำเร็จ'
            )
        }


        el.discountInput.value =
            String(
                approvedAmount
            )


        state.discountAuthorizationId =
            result.authorization_id
            ||
            null


        state.discountSource =
            'manual'


        state.discountLabel =
            `ส่วนลดพิเศษ • อนุมัติโดย ${result.approved_by_name
            ||
            'ผู้ดูแล'
            }`


        state.discountReason =
            reason


        state.discountApprovedBy =
            result.approved_by
            ||
            null


        closeManualDiscountModal()


        renderPaymentDiscountSummary()


        msg(
            el.paymentMessage,
            'อนุมัติส่วนลดพิเศษแล้ว'
        )

    } catch (error) {

        console.error(
            'Manual discount approval error:',
            error
        )


        let text =
            error.message
            ||
            'อนุมัติส่วนลดไม่สำเร็จ'


        if (
            text.includes(
                'INVALID_APPROVER_PIN'
            )
        ) {

            text =
                'PIN ผู้อนุมัติไม่ถูกต้อง'
        }


        if (
            text.includes(
                'APPROVER_PIN_NOT_CONFIGURED'
            )
        ) {

            text =
                'ยังไม่ได้ตั้ง PIN ผู้อนุมัติ กรุณาให้ Admin ตั้งค่าก่อน'
        }


        msg(
            el.manualDiscountMessage,
            text
        )

    } finally {

        el.confirmManualDiscountBtn.disabled =
            false


        el.confirmManualDiscountBtn.textContent =
            'ยืนยันส่วนลด'
    }
}


async function finalizeDiscountAuthorization(
    invoiceNo
) {

    if (
        !state.discountAuthorizationId
        ||
        !invoiceNo
    ) {
        return
    }


    const {
        error
    } =
        await supabase.rpc(
            'finalize_discount_authorization',
            {
                p_authorization_id:
                    state.discountAuthorizationId,

                p_invoice_no:
                    invoiceNo
            }
        )


    if (
        error
    ) {

        console.error(
            'Finalize discount authorization error:',
            error
        )
    }
}


/* ========================================
   PAYMENT
======================================== */

async function openPayment() {

    /*
     * ก่อนเปิดหน้าชำระเงินต้อง sync สถานะจาก Kitchen
     * เพื่อไม่คิดเงินรายการที่ถูกยกเลิกหลัง POS เปิดโต๊ะไว้
     */
    try {

        const syncResult =
            await syncCancelledRestaurantItems()


        if (
            syncResult.removedCount >
            0
        ) {

            msg(
                el.pageMessage,
                `ตัดรายการที่ครัวยกเลิกออกจากบิลแล้ว ${syncResult.removedCount.toLocaleString('th-TH')} รายการ`
            )


            setTimeout(
                () => {

                    if (
                        el.pageMessage
                            ?.textContent
                            ?.includes(
                                'ตัดรายการที่ครัวยกเลิก'
                            )
                    ) {
                        msg(
                            el.pageMessage,
                            ''
                        )
                    }
                },
                2200
            )
        }

    } catch (error) {

        console.error(
            'Sync cancelled items before payment error:',
            error
        )

        msg(
            el.pageMessage,
            'ตรวจสอบรายการยกเลิกจากครัวไม่สำเร็จ กรุณาลองใหม่ก่อนชำระเงิน'
        )

        return
    }


    /*
     * ป้องกัน Staff เปิดหน้าชำระเงิน
     * แม้พยายามเรียกฟังก์ชันจาก Console
     */
    if (
        !canProcessPayment()
    ) {

        showPaymentDeniedMessage(
            el.pageMessage
        )

        return
    }


    if (
        hasDraftItems()
    ) {

        msg(
            el.pageMessage,
            'กรุณากด “ยืนยันออเดอร์” เพื่อส่งรายการใหม่เข้าครัวก่อนชำระเงิน'
        )

        return
    }


    if (
        !items().length
        ||
        discount() >
        subtotal()
    ) {

        return
    }


    /*
     * เช็กกะล่าสุดก่อนชำระ
     */
    const shiftReady =
        await requireOpenShift()


    if (
        !shiftReady
    ) {

        return
    }


    /*
     * เปิดหน้าชำระเงินใหม่
     * เริ่มโดยยังไม่มีส่วนลด
     */
    resetPaymentDiscount()


    await loadActivePromotions()


    /*
     * ถ้าเปิดจากมือถือ
     * ปิด Bottom Sheet ก่อน
     */
    closeMobileCart()


    state.paymentMethod =
        'cash'


    el.paymentModal
        .classList
        .remove(
            'hidden'
        )


    el.paymentTotalText.textContent =
        money(
            total()
        )


    el.receivedInput.value =
        ''


    el.saleNote.value =
        ''


    document
        .querySelectorAll(
            '.method'
        )
        .forEach(
            button => {

                button
                    .classList
                    .toggle(
                        'active',
                        button.dataset.method
                        ===
                        'cash'
                    )
            }
        )


    el.cashSection
        .classList
        .remove(
            'hidden'
        )


    el.qrSection
        .classList
        .add(
            'hidden'
        )


    renderQuickCash()


    updateChange()


    msg(
        el.paymentMessage,
        ''
    )
}


function closePayment() {

    el.paymentModal
        .classList
        .add(
            'hidden'
        )
}


/* ========================================
   QUICK CASH
======================================== */

function renderQuickCash() {

    const amount =
        total()


    const values =
        [
            amount,

            Math.ceil(
                amount / 20
            )
            *
            20,

            Math.ceil(
                amount / 100
            )
            *
            100,

            500,

            1000
        ]
            .filter(
                (
                    value,
                    index,
                    array
                ) =>
                    value >=
                    amount
                    &&
                    array.indexOf(
                        value
                    )
                    ===
                    index
            )
            .slice(
                0,
                4
            )


    el.quickCash.innerHTML =
        values
            .map(
                value =>
                    `
                    <button
                        type="button"
                        data-cash="${value}"
                    >
                        ${value.toLocaleString(
                        'th-TH'
                    )}
                    </button>
                    `
            )
            .join('')
}


/* ========================================
   CHANGE
======================================== */

function updateChange() {

    const received =
        Number(
            el.receivedInput
                .value
            ||
            0
        )


    el.changeText.textContent =
        money(
            Math.max(
                received -
                total(),
                0
            )
        )
}


/* ========================================
   RECEIPT QUEUE DISPLAY
======================================== */

function setupReceiptQueueDisplay(
    sale
) {

    if (
        !el.receiptPrint
    ) {
        return
    }


    /*
     * หา / สร้างกล่องเลขคิวเพียง 1 กล่อง
     * ป้องกันการซ้ำเวลาที่ renderReceipt()
     * ถูกเรียกทั้งตอนขายสำเร็จและตอนกดพิมพ์
     */
    let queueBox =
        el.receiptPrint
            .querySelector(
                '.receipt-queue-box'
            )


    const originalQueueElement =
        document.getElementById(
            'receiptOrderId'
        )


    if (
        !queueBox
    ) {

        /*
         * ใช้แถวเลขคิวเดิมใน HTML เป็นกล่องหลัก
         */
        const originalRow =
            originalQueueElement
                ?.closest(
                    'div'
                )


        if (
            !originalRow
        ) {
            return
        }


        queueBox =
            originalRow


        queueBox.className =
            'receipt-queue-box'


        queueBox.innerHTML =
            `
            <div class="receipt-queue-label">
                เลขคิว / QUEUE NO.
            </div>

            <div
                id="receiptOrderId"
                class="receipt-queue-number"
            >
                -
            </div>
            `


        /*
         * ย้ายขึ้นไปไว้ใต้ชื่อร้าน
         * ก่อนเส้นคั่นแรก
         */
        const firstHr =
            el.receiptPrint
                .querySelector(
                    'hr'
                )


        if (
            firstHr
        ) {

            el.receiptPrint
                .insertBefore(
                    queueBox,
                    firstHr
                )
        }
    }


    /*
     * อัปเดต reference ทุกครั้ง
     * เพราะ innerHTML อาจสร้าง element ใหม่
     */
    el.receiptOrderId =
        queueBox
            .querySelector(
                '#receiptOrderId'
            )


    /*
     * เลขคิวแสดงเฉพาะ "กลับบ้าน"
     */
    if (
        sale.order_type !==
        'takeaway'
    ) {

        queueBox.style.display =
            'none'


        return
    }


    const queueNo =
        Number(
            sale.queue_no
            ||
            0
        )


    if (
        queueNo <=
        0
    ) {

        queueBox.style.display =
            'none'


        return
    }


    queueBox.style.display =
        ''


    if (
        el.receiptOrderId
    ) {

        el.receiptOrderId.textContent =
            String(
                queueNo
            ).padStart(
                3,
                '0'
            )
    }


    /*
     * CSS กล่องเลขคิว
     * ขนาดเล็กลงประมาณ 20%
     */
    if (
        !document.getElementById(
            'receiptQueuePrintStyle'
        )
    ) {

        const style =
            document.createElement(
                'style'
            )


        style.id =
            'receiptQueuePrintStyle'


        style.textContent =
            `
            .receipt-queue-box {
                margin: 7px 0 8px;
                padding: 5px 7px 6px;
                border: 2px solid #d93025;
                border-radius: 8px;
                text-align: center;
                color: #d93025;
                background: #fff;
            }

            .receipt-queue-label {
                font-size: 13px;
                line-height: 1.15;
                font-weight: 800;
                letter-spacing: .2px;
            }

            .receipt-queue-number {
                margin-top: 1px;
                font-size: 38px;
                line-height: .95;
                font-weight: 900;
                letter-spacing: 3px;
            }

            @media print {

                .receipt-queue-box {
                    display: block !important;
                    margin: 7px 0 8px !important;
                    padding: 5px 7px 6px !important;
                    border: 2px solid #000 !important;
                    border-radius: 7px !important;
                    text-align: center !important;
                    color: #000 !important;
                    background: #fff !important;
                    break-inside: avoid !important;
                }

                .receipt-queue-label {
                    font-size: 13px !important;
                    line-height: 1.15 !important;
                    font-weight: 800 !important;
                }

                .receipt-queue-number {
                    margin-top: 1px !important;
                    font-size: 38px !important;
                    line-height: .95 !important;
                    font-weight: 900 !important;
                    letter-spacing: 3px !important;
                }
            }
            `


        document.head.appendChild(
            style
        )
    }
}


/* ========================================
   RECEIPT ITEM MERGE
   รวมเมนูที่เหมือนกันเฉพาะตอนออกใบเสร็จ
   ไม่กระทบรายการแยกรอบสั่งใน POS / Kitchen
======================================== */

function receiptModifierKey(
    modifiers = []
) {

    return [...modifiers]
        .map(
            modifier => ({
                group_id:
                    modifier.group_id
                    ||
                    '',

                group_name:
                    modifier.group_name
                    ||
                    '',

                option_id:
                    modifier.option_id
                    ||
                    '',

                option_name:
                    modifier.option_name
                    ||
                    '',

                price_adjustment:
                    Number(
                        modifier.price_adjustment
                        ||
                        0
                    )
            })
        )
        .sort(
            (a, b) => {

                const left =
                    `${a.group_id}|${a.option_id}|${a.group_name}|${a.option_name}|${a.price_adjustment}`

                const right =
                    `${b.group_id}|${b.option_id}|${b.group_name}|${b.option_name}|${b.price_adjustment}`

                return left.localeCompare(
                    right
                )
            }
        )
        .map(
            modifier =>
                [
                    modifier.group_id,
                    modifier.group_name,
                    modifier.option_id,
                    modifier.option_name,
                    modifier.price_adjustment
                ].join('|')
        )
        .join('||')
}


function mergeReceiptItems(
    sourceItems = []
) {

    const grouped =
        new Map()


    for (
        const item
        of
        sourceItems
    ) {

        const modifiers =
            Array.isArray(
                item.modifiers
            )
                ? item.modifiers
                : []


        const itemNote =
            String(
                item.item_note
                ||
                ''
            )
                .trim()


        /*
         * รวมเฉพาะรายการที่เหมือนกันจริง:
         * - product เดียวกัน
         * - ราคาต่อหน่วยเท่ากัน
         * - Modifier เหมือนกัน
         * - หมายเหตุเหมือนกัน
         *
         * ไม่ใช้ restaurant_item_id
         * เพราะใบเสร็จลูกค้าต้องการยอดรวม
         */
        const key =
            [
                item.id
                ||
                item.product_id
                ||
                item.name
                ||
                '',

                Number(
                    item.price
                    ||
                    0
                ),

                receiptModifierKey(
                    modifiers
                ),

                itemNote
            ].join('::')


        const quantity =
            Number(
                item.quantity
                ||
                0
            )


        if (
            grouped.has(
                key
            )
        ) {

            grouped.get(
                key
            ).quantity +=
                quantity

            continue
        }


        grouped.set(
            key,
            {
                id:
                    item.id,

                name:
                    item.name,

                price:
                    Number(
                        item.price
                    ),

                base_price:
                    Number(
                        item.base_price
                        ??
                        item.price
                    ),

                modifier_total:
                    Number(
                        item.modifier_total
                        ||
                        0
                    ),

                modifiers:
                    modifiers
                        .map(
                            modifier => ({
                                group_id:
                                    modifier.group_id,

                                group_name:
                                    modifier.group_name,

                                option_id:
                                    modifier.option_id,

                                option_name:
                                    modifier.option_name,

                                price_adjustment:
                                    Number(
                                        modifier.price_adjustment
                                        ||
                                        0
                                    )
                            })
                        ),

                item_note:
                    itemNote
                    ||
                    null,

                quantity:
                    quantity
            }
        )
    }


    return [
        ...grouped.values()
    ]
}


/* ========================================
   RECEIPT
======================================== */

function renderReceipt() {

    const sale =
        state.lastSale


    if (!sale) {
        return
    }


    if (
        el.receiptBranch
    ) {

        el.receiptBranch.textContent =
            state.branch?.name
            ||
            '-'
    }


    if (
        el.receiptInvoice
    ) {

        el.receiptInvoice.textContent =
            sale.invoice_no
            ||
            '-'
    }


    if (
        el.receiptDate
    ) {

        el.receiptDate.textContent =
            new Intl.DateTimeFormat(
                'th-TH',
                {
                    dateStyle:
                        'short',

                    timeStyle:
                        'medium'
                }
            ).format(
                sale.created_at
            )
    }


    if (
        el.receiptCashier
    ) {

        el.receiptCashier.textContent =
            state.profile
                ?.full_name
            ||
            state.session
                ?.user
                ?.email
                ?.split('@')[0]
            ||
            '-'
    }


    if (
        el.receiptOrderType
    ) {

        el.receiptOrderType.textContent =
            sale.order_type ===
                'dine_in'

                ? 'ทานที่ร้าน'

                : sale.order_type ===
                    'takeaway'

                    ? 'กลับบ้าน'

                    : '-'
    }


    if (
        el.receiptTable
    ) {

        el.receiptTable.textContent =
            sale.order_type ===
                'dine_in'

                ? (
                    sale.table_name
                    ||
                    '-'
                )

                : '-'
    }


    if (
        el.receiptGuestCount
    ) {

        el.receiptGuestCount.textContent =
            `${Number(
                sale.guest_count
                ||
                1
            ).toLocaleString(
                'th-TH'
            )} คน`
    }


    /*
     * แสดงเลขคิวเด่นเฉพาะออเดอร์กลับบ้าน
     */
    setupReceiptQueueDisplay(
        sale
    )


    if (
        el.receiptOrderNote
    ) {

        const note =
            sale.order_note
            ||
            ''

        el.receiptOrderNote.textContent =
            note
            ||
            '-'

        const noteRow =
            el.receiptOrderNote
                .closest(
                    '.receipt-order-note-row'
                )

        if (
            noteRow
        ) {

            noteRow.style.display =
                note
                    ? ''
                    : 'none'
        }
    }


    if (
        el.receiptItems
    ) {

        el.receiptItems.innerHTML =
            sale.items
                .map(
                    item =>
                        `
                        <div
                            class="receipt-item"
                        >

                            <div
                                class="receipt-item-name"
                            >
                                ${esc(
                            item.name
                        )}
                            </div>


                            ${(item.modifiers || []).length

                            ? `
                                        <div
                                            style="
                                                font-size:10px;
                                                margin:1px 0 2px 8px;
                                            "
                                        >
                                            ${(item.modifiers || [])
                                .map(
                                    modifier =>
                                        `${esc(
                                            modifier.group_name
                                            ||
                                            ''
                                        )}: ${esc(
                                            modifier.option_name
                                            ||
                                            ''
                                        )}${Number(
                                            modifier.price_adjustment
                                            ||
                                            0
                                        ) > 0
                                            ? ` +${money(
                                                modifier.price_adjustment
                                            )}`
                                            : ''
                                        }`
                                )
                                .join('<br>')}
                                        </div>
                                    `

                            : ''
                        }


                            ${item.item_note

                            ? `
                                        <div
                                            style="
                                                font-size:10px;
                                                margin:1px 0 2px 8px;
                                            "
                                        >
                                            หมายเหตุ:
                                            ${esc(
                                item.item_note
                            )}
                                        </div>
                                    `

                            : ''
                        }


                            <div
                                class="receipt-item-line"
                            >

                                <span>
                                    ${item.quantity}
                                    ×
                                    ${money(
                            item.price
                        )}
                                </span>


                                <strong>
                                    ${money(
                            Number(
                                item.price
                            )
                            *
                            item.quantity
                        )}
                                </strong>

                            </div>

                        </div>
                        `
                )
                .join('')
    }


    if (
        el.receiptSubtotal
    ) {

        el.receiptSubtotal.textContent =
            money(
                sale.subtotal
            )
    }


    if (
        el.receiptDiscount
    ) {

        el.receiptDiscount.textContent =
            sale.discount_label
                ? `${money(sale.discount)} (${sale.discount_label})`
                : money(
                    sale.discount
                )
    }


    const saleVat = sale.tax || vatSnapshot(sale.total)
    el.receiptVatBreakdown?.classList.toggle('hidden', !saleVat.vat_enabled)
    if (el.receiptBeforeVat) el.receiptBeforeVat.textContent = money(saleVat.amount_before_vat)
    if (el.receiptVatLabel) el.receiptVatLabel.textContent = `VAT ${saleVat.vat_rate}%`
    if (el.receiptVatAmount) el.receiptVatAmount.textContent = money(saleVat.vat_amount)

    if (
        el.receiptTotal
    ) {

        el.receiptTotal.textContent =
            money(
                sale.total
            )
    }


    if (
        el.receiptReceived
    ) {

        el.receiptReceived.textContent =
            money(
                sale.received_amount
            )
    }


    if (
        el.receiptChange
    ) {

        el.receiptChange.textContent =
            money(
                sale.change_amount
            )
    }


    if (
        el.receiptPayment
    ) {

        el.receiptPayment.textContent =
            sale.payment_method
                ===
                'cash'

                ? 'เงินสด'

                : 'QR'
    }
}


function printReceipt() {

    if (
        !state.lastSale
    ) {

        alert(
            'ยังไม่มีข้อมูลใบเสร็จ'
        )


        return
    }


    renderReceipt()


    window.print()
}


/* ========================================
   CONFIRM PAYMENT
======================================== */

async function confirmPayment() {

    /*
     * ป้องกัน Staff ยืนยันชำระเงิน
     * แม้เปิด modal หรือเรียกฟังก์ชันเอง
     */
    if (
        !canProcessPayment()
    ) {

        showPaymentDeniedMessage(
            el.paymentMessage
        )

        return
    }


    /*
     * ตรวจซ้ำอีกครั้งตอนกด "ยืนยันชำระ"
     *
     * เหตุผล:
     * ระหว่างที่ Payment Modal เปิดอยู่
     * Kitchen อาจยกเลิกรายการเพิ่มได้
     */
    try {

        const syncResult =
            await syncCancelledRestaurantItems()


        if (
            syncResult.removedCount >
            0
        ) {

            /*
             * ยอดเปลี่ยนหลังเปิดหน้าชำระ
             * ห้ามยิง sale ต่อทันที ให้ผู้ใช้เห็นยอดใหม่ก่อน
             */
            el.paymentTotalText.textContent =
                money(
                    total()
                )


            renderQuickCash()
            updateChange()
            renderVatUi()


            if (
                state.paymentMethod ===
                'qr'
            ) {
                renderPromptPayQr()
            }


            msg(
                el.paymentMessage,
                `มี ${syncResult.removedCount.toLocaleString('th-TH')} รายการถูกยกเลิกจากครัว ยอดชำระถูกปรับแล้ว กรุณาตรวจสอบยอดใหม่และกดยืนยันอีกครั้ง`
            )


            return
        }

    } catch (error) {

        console.error(
            'Sync cancelled items before confirm payment error:',
            error
        )


        msg(
            el.paymentMessage,
            'ตรวจสอบรายการยกเลิกจากครัวไม่สำเร็จ กรุณาลองใหม่ก่อนบันทึกการขาย'
        )


        return
    }


    if (
        !items().length
    ) {

        msg(
            el.paymentMessage,
            'ไม่มีรายการที่ต้องชำระเงิน'
        )

        return
    }


    /*
     * เช็กกะอีกครั้งก่อนสร้างบิล
     */
    const shiftReady =
        await requireOpenShift()


    if (
        !shiftReady
    ) {

        msg(
            el.paymentMessage,
            'กะขายไม่ได้เปิดอยู่ กรุณาเปิดกะก่อนบันทึกการขาย'
        )


        return
    }


    const received =
        state.paymentMethod
            ===
            'cash'

            ? Number(
                el.receivedInput.value
                ||
                0
            )

            : total()


    if (
        state.paymentMethod
        ===
        'cash'
        &&
        received <
        total()
    ) {

        msg(
            el.paymentMessage,
            'จำนวนเงินที่รับมายังไม่ครบ'
        )


        return
    }


    /*
     * เก็บ snapshot
     * สำหรับใบเสร็จ
     */
    const saleSnapshot = {

        /*
         * ใบเสร็จลูกค้า:
         * รวมเมนูที่เหมือนกันจากหลายรอบสั่ง
         *
         * ตัวอย่าง:
         * รอบ 1 ข้าวกะเพราหมูสับ x1
         * รอบ 2 ข้าวกะเพราหมูสับ x2
         *
         * ใบเสร็จ:
         * ข้าวกะเพราหมูสับ x3
         *
         * ถ้า Modifier / หมายเหตุ / ราคา ต่างกัน
         * จะยังแยกเป็นคนละบรรทัด
         */
        items:
            mergeReceiptItems(
                items()
            ),

        subtotal:
            subtotal(),

        discount:
            discount(),

        discount_source:
            state.discountSource,

        discount_label:
            state.discountLabel
            ||
            null,

        discount_reason:
            state.discountReason
            ||
            null,

        discount_authorization_id:
            state.discountAuthorizationId
            ||
            null,

        discount_approved_by:
            state.discountApprovedBy
            ||
            null,

        total:
            total(),

        tax:
            vatSnapshot(total()),

        received_amount:
            received,

        payment_method:
            state.paymentMethod,

        /*
         * เก็บข้อมูลออเดอร์ไว้ในใบเสร็จ
         * ก่อน completeCurrentOrder()
         */
        order_id:
            state.currentOrder?.id
            ||
            null,

        queue_no:
            Number(
                state.currentOrder?.queue_no
                ||
                0
            ),

        order_type:
            state.currentOrder?.order_type
            ||
            state.orderType
            ||
            null,

        table_id:
            state.currentOrder?.table_id
            ||
            null,

        table_name:
            state.currentOrder?.table_name
            ||
            null,

        guest_count:
            Number(
                state.currentOrder?.guest_count
                ||
                state.guestCount
                ||
                1
            ),

        order_source:
            state.currentOrder?.order_source
            ||
            'pos',

        order_note:
            el.saleNote
                ?.value
                ?.trim()
            ||
            null,

        created_at:
            new Date()
    }


    el.confirmPaymentBtn.disabled =
        true


    el.confirmPaymentBtn.textContent =
        'กำลังบันทึก...'


    try {

        /*
         * STOCK RULE V3.3 — ATOMIC CHECKOUT
         * BASE/BOM + sale are created by the existing create_pos_sale inside
         * the wrapper. Modifier/Extra + DINE-IN/TAKEAWAY are applied in the
         * SAME database transaction. Any stock error rolls the sale back.
         */
        const stockRuleItems =
            saleSnapshot.items.map(item => ({
                product_id: item.id,
                quantity: item.quantity,
                modifiers: (item.modifiers || []).map(modifier => ({
                    group_id: modifier.group_id,
                    option_id: modifier.option_id
                })),
                item_note: item.item_note || null
            }))

        const stockRuleOrderType =
            saleSnapshot.order_type || 'dine_in'

        const {
            data,
            error
        } =
            await supabase.rpc(
                'jokjung_create_pos_sale_v33',
                {
                    p_branch_id: state.profile.branch_id,
                    p_discount: saleSnapshot.discount,
                    p_payment_method: saleSnapshot.payment_method,
                    p_received_amount: saleSnapshot.received_amount,
                    p_note: el.saleNote.value.trim() || null,
                    p_items: stockRuleItems,
                    p_order_type: stockRuleOrderType
                }
            )

        if (error) {
            throw error
        }


        await finalizeDiscountAuthorization(
            data.invoice_no
        )

        await saveSaleTaxSnapshot(
            data.invoice_no,
            saleSnapshot.tax
        )


        state.lastSale = {

            ...saleSnapshot,


            invoice_no:
                data.invoice_no,


            subtotal:
                Number(
                    data.subtotal
                    ??
                    saleSnapshot.subtotal
                ),


            discount:
                Number(
                    data.discount
                    ??
                    saleSnapshot.discount
                ),


            total:
                Number(
                    data.total
                    ??
                    saleSnapshot.total
                ),


            received_amount:
                Number(
                    data.received_amount
                    ??
                    saleSnapshot.received_amount
                ),


            change_amount:
                Number(
                    data.change_amount
                    ??
                    Math.max(
                        received -
                        saleSnapshot.total,
                        0
                    )
                ),


            payment_method:
                data.payment_method
                ??
                saleSnapshot.payment_method
        }


        renderReceipt()


        closePayment()


        el.invoiceText.textContent =
            state.lastSale.invoice_no


        el.successTotal.textContent =
            money(
                state.lastSale.total
            )


        el.successChange.textContent =
            money(
                state.lastSale.change_amount
            )


        el.successModal
            .classList
            .remove(
                'hidden'
            )


        /*
         * ปิดออเดอร์และคืนสถานะโต๊ะ
         * หลังบันทึกการขายสำเร็จ
         */
        await completeCurrentOrder()

        try {
            await loadRestaurantTables()
        } catch (tableError) {
            console.error(
                'Reload tables after payment error:',
                tableError
            )
        }

        /*
* ล้างตะกร้าหลังชำระเงินสำเร็จ
*/
        state.cart.clear()

        resetPaymentDiscount()

        renderCart()


        /*
         * โหลดจำนวนที่ขายได้ใหม่
         * หลังตัดวัตถุดิบ
         */
        await loadAvailability()


        renderProducts()


    } catch (error) {

        console.error(
            'Create sale error:',
            error
        )


        let errorMessage =
            error.message
            ||
            'บันทึกการขายไม่สำเร็จ'


        /*
         * ไม่มีกะเปิด
         */
        if (
            errorMessage.includes(
                'SHIFT_NOT_OPEN'
            )
            ||
            errorMessage.includes(
                'NO_OPEN_SHIFT'
            )
        ) {

            errorMessage =
                'ยังไม่ได้เปิดกะ หรือกะถูกปิดแล้ว กรุณาเปิดกะก่อนขาย'


            state.currentShift =
                null


            updateShiftSaleState()
        }


        /*
         * ไม่มี BOM
         */
        if (
            errorMessage.includes(
                'PRODUCT_RECIPE_NOT_FOUND'
            )
        ) {

            errorMessage =
                'สินค้าบางรายการยังไม่ได้กำหนดสูตรวัตถุดิบ'
        }


        /*
         * วัตถุดิบไม่พอ
         */
        if (
            errorMessage.includes(
                'INSUFFICIENT_INGREDIENT_STOCK'
            )
        ) {

            const detail =
                errorMessage
                    .split(
                        'INSUFFICIENT_INGREDIENT_STOCK:'
                    )[1]
                    ?.trim()


            errorMessage =
                detail

                    ? `วัตถุดิบไม่เพียงพอ: ${detail}`

                    : 'วัตถุดิบไม่เพียงพอสำหรับการขาย'
        }


        /*
         * เงินสดไม่พอ
         */
        if (
            errorMessage.includes(
                'INSUFFICIENT_CASH'
            )
        ) {

            errorMessage =
                'จำนวนเงินที่รับไม่เพียงพอ'
        }


        /*
         * Product / Quantity ผิด
         */
        if (
            errorMessage.includes(
                'INVALID_PRODUCT_OR_QUANTITY'
            )
        ) {

            errorMessage =
                'พบสินค้าหรือจำนวนสินค้าไม่ถูกต้อง'
        }


        /*
         * Modifier ไม่ถูกต้อง
         */
        if (
            errorMessage.includes(
                'INVALID_MODIFIER_OPTION'
            )
            ||
            errorMessage.includes(
                'INVALID_MODIFIERS'
            )
        ) {

            errorMessage =
                'ตัวเลือกสินค้าไม่ถูกต้อง กรุณาเลือกใหม่'
        }


        /*
         * เลือก Modifier ไม่ครบ / เกินจำนวน
         */
        if (
            errorMessage.includes(
                'MODIFIER_SELECTION_REQUIRED_OR_INVALID'
            )
        ) {

            errorMessage =
                'กรุณาตรวจสอบตัวเลือกสินค้าที่จำเป็นก่อนชำระเงิน'
        }


        msg(
            el.paymentMessage,
            errorMessage
        )


    } finally {

        el.confirmPaymentBtn.disabled =
            false


        el.confirmPaymentBtn.textContent =
            'ยืนยันการชำระเงิน'
    }
}


/* ========================================
   NEW SALE
======================================== */

async function newSale() {

    state.cart.clear()


    state.lastSale =
        null


    state.currentOrder =
        null


    resetPaymentDiscount()


    el.successModal
        .classList
        .add(
            'hidden'
        )


    resetOrderDraft()


    renderOrderContext()


    msg(
        el.pageMessage,
        ''
    )


    renderCart()


    await openOrderStartModal()
}


/* ========================================
   LOGOUT
======================================== */

async function logout() {

    await supabase
        .auth
        .signOut()


    location.replace(
        './index.html'
    )
}

document
    .getElementById('backToDashboardBtn')
    ?.addEventListener(
        'click',
        () => {
            location.href = './dashboard.html'
        }
    )
/* ========================================
   INIT
======================================== */

async function init() {

    try {

        /*
         * ตรวจ Session
         */
        const session =
            await requireSession()


        if (
            !session
        ) {

            return
        }


        /*
         * โหลด Profile
         */
        await loadProfile(
            session.user.id
        )


        /*
         * ล็อกสิทธิ์ชำระเงินตาม role
         */
        applyPaymentPermissionUi()


        /*
         * โหลดสาขา
         */
        await loadBranch()

        await loadTaxSettings()


        /*
         * แสดงข้อมูลผู้ใช้
         */
        renderUser()

        ensureTableHoldStyle()


        /*
         * โหลดกะปัจจุบัน
         */
        try {

            await loadCurrentShift()

        } catch (shiftError) {

            console.error(
                'Initial shift load error:',
                shiftError
            )


            state.currentShift =
                null
        }


        /*
         * โหลดสินค้า
         */
        await loadCatalog()


        /*
         * แสดงตะกร้า
         */
        renderCart()


        /*
         * ตรวจสถานะกะ
         */
        updateShiftSaleState()


        /*
         * โหลดโต๊ะและเปิดหน้าต่างเริ่มออเดอร์
         */
        resetOrderDraft()

        await loadRestaurantTables()

        /*
         * รับสถานะยกเลิกจาก Kitchen แบบทันที
         * + polling สำรองกรณี Realtime หลุด
         */
        subscribePosOrderItemRealtime()
        startCancelledItemFallbackPolling()

        await openOrderStartModal()


    } catch (error) {

        console.error(
            'POS init error:',
            error
        )


        msg(
            el.pageMessage,
            error.message
            ||
            'โหลดข้อมูล POS ไม่สำเร็จ'
        )


        if (
            el.loading
        ) {

            el.loading
                .classList
                .add(
                    'hidden'
                )
        }
    }
}


/* ========================================
   EVENTS
======================================== */


/* ========================================
   BACK
======================================== */

el.backBtn
    ?.addEventListener(
        'click',
        async () => {

            if (
                isHeldDineInOrder()
            ) {

                await holdCurrentTableAndChooseAnother()

                return
            }

            location.href =
                './dashboard.html'
        }
    )
el.holdTableBtn
    ?.addEventListener(
        'click',
        async () => {

            await holdCurrentTableAndChooseAnother()
        }
    )


/* ========================================
   LOGOUT
======================================== */

el.logoutBtn
    ?.addEventListener(
        'click',
        logout
    )


/* ========================================
   SEARCH
======================================== */

el.searchInput
    ?.addEventListener(
        'input',
        renderProducts
    )


/* ========================================
   REFRESH
======================================== */

el.refreshBtn
    ?.addEventListener(
        'click',
        async () => {

            try {

                msg(
                    el.pageMessage,
                    ''
                )


                /*
                 * ตรวจสถานะกะใหม่
                 */
                await loadCurrentShift()


                /*
                 * โหลดสินค้าใหม่
                 */
                state.modifierCache.clear()

                await loadCatalog()


                /*
                 * ถ้าเป็นโต๊ะค้าง โหลดรายการล่าสุดจาก Supabase
                 */
                if (
                    isHeldDineInOrder()
                ) {

                    const table =
                        state.tables.find(
                            item =>
                                item.id ===
                                state.currentOrder.table_id
                        )
                        ||
                        null

                    await loadHeldRestaurantOrder(
                        state.currentOrder.id,
                        table
                    )

                } else {

                    renderCart()
                }


                /*
                 * อัปเดตสถานะปุ่มขาย
                 */
                updateShiftSaleState()


            } catch (error) {

                console.error(
                    'Refresh error:',
                    error
                )


                msg(
                    el.pageMessage,
                    error.message
                    ||
                    'รีเฟรชข้อมูลไม่สำเร็จ'
                )
            }
        }
    )


/* ========================================
   CATEGORY
======================================== */

el.categoryTabs
    ?.addEventListener(
        'click',
        event => {

            const button =
                event.target.closest(
                    '[data-cat]'
                )


            if (!button) {

                return
            }


            state.selectedCategory =
                button.dataset.cat


            renderCategories()


            renderProducts()
        }
    )


/* ========================================
   PRODUCT
======================================== */

el.productGrid
    ?.addEventListener(
        'click',
        event => {

            const button =
                event.target.closest(
                    '[data-add]'
                )


            if (!button) {

                return
            }


            if (
                button.disabled
            ) {

                return
            }


            add(
                button.dataset.add
            )
        }
    )


/* ========================================
   CART ITEMS
======================================== */

el.cartItems
    ?.addEventListener(
        'click',
        async event => {

            const button =
                event.target.closest(
                    '[data-act]'
                )

            if (!button) {
                return
            }

            const id =
                button.dataset.id

            const action =
                button.dataset.act

            try {

                if (action === 'inc') {
                    await qty(
                        id,
                        1
                    )
                    return
                }

                if (action === 'dec') {
                    await qty(
                        id,
                        -1
                    )
                    return
                }

                if (action === 'remove') {
                    await removeCartItem(id)
                    msg(
                        el.pageMessage,
                        ''
                    )
                }

            } catch (error) {

                console.error(
                    'Cart item action error:',
                    error
                )

                msg(
                    el.pageMessage,
                    error.message
                    || 'แก้ไขรายการไม่สำเร็จ'
                )
            }
        }
    )


/* ========================================
   DISCOUNT EVENTS
======================================== */



/* ========================================
   PAYMENT DISCOUNT EVENTS
======================================== */

el.activePromotionSelect
    ?.addEventListener(
        'change',
        () => {

            el.applyPromotionBtn.disabled =
                !el.activePromotionSelect.value
        }
    )


el.applyPromotionBtn
    ?.addEventListener(
        'click',
        applySelectedPromotion
    )


el.clearPaymentDiscountBtn
    ?.addEventListener(
        'click',
        async () => {

            resetPaymentDiscount()

            await loadActivePromotions()

            msg(
                el.paymentMessage,
                ''
            )
        }
    )


el.manualDiscountBtn
    ?.addEventListener(
        'click',
        openManualDiscountModal
    )


el.closeManualDiscountBtn
    ?.addEventListener(
        'click',
        closeManualDiscountModal
    )


el.cancelManualDiscountBtn
    ?.addEventListener(
        'click',
        closeManualDiscountModal
    )


el.confirmManualDiscountBtn
    ?.addEventListener(
        'click',
        approveManualDiscount
    )


el.manualDiscountModal
    ?.addEventListener(
        'click',
        event => {

            if (
                event.target ===
                el.manualDiscountModal
            ) {

                closeManualDiscountModal()
            }
        }
    )


/* ========================================
   CLEAR CART
======================================== */

el.clearCartBtn
    ?.addEventListener(
        'click',
        async () => {

            if (!state.cart.size) {
                return
            }

            const confirmed =
                confirm(
                    isHeldDineInOrder()
                        ? 'ลบรายการทั้งหมดออกจากบิลโต๊ะนี้หรือไม่?'
                        : 'ล้างตะกร้าหรือไม่?'
                )

            if (!confirmed) {
                return
            }

            try {

                await clearCurrentCart()

                msg(
                    el.pageMessage,
                    ''
                )

            } catch (error) {

                console.error(
                    'Clear cart error:',
                    error
                )

                msg(
                    el.pageMessage,
                    error.message
                    || 'ล้างรายการไม่สำเร็จ'
                )
            }
        }
    )


/* ========================================
   MOBILE CART BAR
======================================== */

el.mobileCartBar
    ?.addEventListener(
        'click',
        () => {

            openMobileCart()
        }
    )


/* ========================================
   CLOSE MOBILE CART
======================================== */

el.mobileCartClose
    ?.addEventListener(
        'click',
        () => {

            closeMobileCart()
        }
    )


/* ========================================
   CART BACKDROP
======================================== */

el.cartBackdrop
    ?.addEventListener(
        'click',
        () => {

            closeMobileCart()
        }
    )


/* ========================================
   WINDOW RESIZE
======================================== */

window.addEventListener(
    'resize',
    () => {

        if (
            window.innerWidth >
            760
        ) {

            closeMobileCart()
        }
    }
)


/* ========================================
   START ORDER EVENTS
======================================== */

document
    .querySelectorAll(
        '.order-type-btn'
    )
    .forEach(
        button => {

            button
                .addEventListener(
                    'click',
                    () => {

                        state.orderType =
                            button.dataset.orderType ===
                                'takeaway'

                                ? 'takeaway'

                                : 'dine_in'


                        if (
                            state.orderType ===
                            'takeaway'
                        ) {

                            state.selectedTableId =
                                null
                        }


                        msg(
                            el.orderStartMessage,
                            ''
                        )


                        renderOrderType()

                        renderTables()
                    }
                )
        }
    )


el.tableGrid
    ?.addEventListener(
        'click',
        event => {

            const button =
                event.target.closest(
                    '[data-table-id]'
                )


            if (
                !button
                ||
                button.disabled
            ) {
                return
            }


            state.selectedTableId =
                button.dataset.tableId


            msg(
                el.orderStartMessage,
                ''
            )


            renderTables()
        }
    )


el.guestMinusBtn
    ?.addEventListener(
        'click',
        () => {

            state.guestCount =
                Math.max(
                    state.guestCount - 1,
                    1
                )


            renderGuestCount()
        }
    )


el.guestPlusBtn
    ?.addEventListener(
        'click',
        () => {

            state.guestCount =
                Math.min(
                    state.guestCount + 1,
                    99
                )


            renderGuestCount()
        }
    )


el.startOrderBtn
    ?.addEventListener(
        'click',
        startRestaurantOrder
    )


el.closeOrderStartBtn
    ?.addEventListener(
        'click',
        closeOrderStartModal
    )


/* ========================================
   CONFIRM ORDER
======================================== */

el.confirmOrderBtn
    ?.addEventListener(
        'click',
        confirmCurrentOrder
    )


/* ========================================
   CHECKOUT
======================================== */

el.checkoutBtn
    ?.addEventListener(
        'click',
        openPayment
    )


/* ========================================
   PAYMENT METHODS
======================================== */

document
    .querySelectorAll(
        '.method'
    )
    .forEach(
        button => {

            button
                .addEventListener(
                    'click',
                    () => {

                        /*
                         * เปลี่ยนวิธีชำระ
                         */
                        state.paymentMethod =
                            button.dataset.method


                        /*
                         * เปลี่ยนปุ่ม active
                         */
                        document
                            .querySelectorAll(
                                '.method'
                            )
                            .forEach(
                                item => {

                                    item
                                        .classList
                                        .toggle(
                                            'active',
                                            item ===
                                            button
                                        )
                                }
                            )


                        /*
                         * แสดง/ซ่อนเงินสด
                         */
                        el.cashSection
                            .classList
                            .toggle(
                                'hidden',
                                state.paymentMethod
                                !==
                                'cash'
                            )


                        /*
                         * แสดง/ซ่อน QR
                         */
                        el.qrSection
                            .classList
                            .toggle(
                                'hidden',
                                state.paymentMethod
                                !==
                                'qr'
                            )


                        /*
                         * สร้าง QR
                         */
                        if (
                            state.paymentMethod ===
                            'qr'
                        ) {

                            renderPromptPayQr()
                        }


                        msg(
                            el.paymentMessage,
                            ''
                        )
                    }
                )
        }
    )


/* ========================================
   CASH INPUT
======================================== */

el.receivedInput
    ?.addEventListener(
        'input',
        updateChange
    )


/* ========================================
   QUICK CASH
======================================== */

el.quickCash
    ?.addEventListener(
        'click',
        event => {

            const button =
                event.target.closest(
                    '[data-cash]'
                )


            if (!button) {

                return
            }


            el.receivedInput.value =
                button.dataset.cash


            updateChange()
        }
    )


/* ========================================
   CLOSE PAYMENT
======================================== */

el.closePaymentBtn
    ?.addEventListener(
        'click',
        closePayment
    )


el.cancelPaymentBtn
    ?.addEventListener(
        'click',
        closePayment
    )


/* ========================================
   CONFIRM PAYMENT
======================================== */

el.confirmPaymentBtn
    ?.addEventListener(
        'click',
        confirmPayment
    )


/* ========================================
   PRINT
======================================== */

el.printReceiptBtn
    ?.addEventListener(
        'click',
        printReceipt
    )


/* ========================================
   NEW SALE
======================================== */

el.newSaleBtn
    ?.addEventListener(
        'click',
        newSale
    )


/* ========================================
   ESC KEY
======================================== */

document
    .addEventListener(
        'keydown',
        event => {

            if (
                event.key !==
                'Escape'
            ) {

                return
            }


            /*
             * ปิด Modifier Modal ก่อน
             */
            const modifierModal =
                document.getElementById(
                    'modifierModal'
                )


            if (
                modifierModal
                &&
                !modifierModal
                    .classList
                    .contains(
                        'hidden'
                    )
            ) {

                closeModifierModal()


                return
            }


            /*
             * ปิด Mobile Cart ก่อน
             */
            if (
                el.cartPanel
                    ?.classList
                    .contains(
                        'mobile-open'
                    )
            ) {

                closeMobileCart()


                return
            }


            /*
             * ปิด Start Order Modal เฉพาะเมื่อมีออเดอร์แล้ว
             */
            if (
                el.orderStartModal
                &&
                !el.orderStartModal
                    .classList
                    .contains(
                        'hidden'
                    )
            ) {

                closeOrderStartModal()


                return
            }


            /*
             * ปิด Payment Modal
             */
            if (
                el.paymentModal
                &&
                !el.paymentModal
                    .classList
                    .contains(
                        'hidden'
                    )
            ) {

                closePayment()


                return
            }
        }
    )




/* ========================================
   REMOVE LEGACY MODIFIER-MANAGER CONTROL
   การจัดการตัวเลือกเมนูอยู่ในระบบจัดการแล้ว
======================================== */
function removeLegacyModifierManagerControl() {
    document
        .querySelectorAll('button, a')
        .forEach(element => {
            const text = String(element.textContent || '')
                .replace(/\s+/g, ' ')
                .trim()

            if (
                text === 'ตัวเลือกเมนู' ||
                text === '⚙ ตัวเลือกเมนู' ||
                text === '⚙️ ตัวเลือกเมนู'
            ) {
                element.remove()
            }
        })
}

removeLegacyModifierManagerControl()

/* ========================================
   AUTH CHANGE
======================================== */

supabase.auth
    .onAuthStateChange(
        (
            event,
            session
        ) => {

            if (
                event ===
                'SIGNED_OUT'
                ||
                !session
            ) {

                location.replace(
                    './index.html'
                )
            }
        }
    )


/* ========================================
   START
======================================== */
/* =========================================================
   FIX: COUPON / VOUCHER BUTTON EVENT
   ให้วางโค้ดนี้ใน pos.js ก่อนบรรทัด init()
   ========================================================= */

if (
    el.applyCouponBtn
    &&
    el.applyCouponBtn.dataset.couponBound !== '1'
) {

    el.applyCouponBtn.dataset.couponBound =
        '1'


    el.applyCouponBtn.addEventListener(
        'click',
        async () => {

            await applyCouponCode()

        }
    )
}


if (
    el.couponCodeInput
    &&
    el.couponCodeInput.dataset.couponBound !== '1'
) {

    el.couponCodeInput.dataset.couponBound =
        '1'


    el.couponCodeInput.addEventListener(
        'keydown',
        async event => {

            if (
                event.key !==
                'Enter'
            ) {
                return
            }


            event.preventDefault()


            await applyCouponCode()

        }
    )
}
init()
