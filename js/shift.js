import { supabase } from './supabase.js'


/* ========================================
   STATE
======================================== */

const state = {

    session:
        null,

    profile:
        null,

    branch:
        null,

    shift:
        null,

    liveSummary:
    {
        totalSales:
            0,

        cashSales:
            0,

        qrSales:
            0,

        discount:
            0,

        billCount:
            0,

        voidCount:
            0,

        voidAmount:
            0,

        expectedCash:
            0
    }
}


/* ========================================
   ELEMENTS
======================================== */

const $ = id =>
    document.getElementById(
        id
    )


const el = {

    backBtn:
        $('backBtn'),

    logoutBtn:
        $('logoutBtn'),

    branchText:
        $('branchText'),

    userName:
        $('userName'),

    userRole:
        $('userRole'),

    pageMessage:
        $('pageMessage'),

    loadingState:
        $('loadingState'),


    /* OPEN SHIFT */

    openShiftPanel:
        $('openShiftPanel'),

    openingCashInput:
        $('openingCashInput'),

    openingNoteInput:
        $('openingNoteInput'),

    openShiftBtn:
        $('openShiftBtn'),


    /* ACTIVE SHIFT */

    activeShiftPanel:
        $('activeShiftPanel'),

    shiftOpenedText:
        $('shiftOpenedText'),

    shiftOpenedBy:
        $('shiftOpenedBy'),

    shiftOpenedAt:
        $('shiftOpenedAt'),

    shiftOpeningCash:
        $('shiftOpeningCash'),

    shiftDuration:
        $('shiftDuration'),

    openingNoteWrap:
        $('openingNoteWrap'),

    openingNoteText:
        $('openingNoteText'),


    /* LIVE SUMMARY */

    liveTotalSales:
        $('liveTotalSales'),

    liveBillCount:
        $('liveBillCount'),

    liveCashSales:
        $('liveCashSales'),

    liveQrSales:
        $('liveQrSales'),

    liveDiscount:
        $('liveDiscount'),

    liveVoidCount:
        $('liveVoidCount'),

    liveVoidAmount:
        $('liveVoidAmount'),


    /* EXPECTED CASH */

    calcOpeningCash:
        $('calcOpeningCash'),

    calcCashSales:
        $('calcCashSales'),

    expectedCashText:
        $('expectedCashText'),


    /* CLOSE SHIFT */

    countedCashInput:
        $('countedCashInput'),

    cashDifferenceBox:
        $('cashDifferenceBox'),

    cashDifferenceText:
        $('cashDifferenceText'),

    closingNoteInput:
        $('closingNoteInput'),

    refreshShiftBtn:
        $('refreshShiftBtn'),

    closeShiftBtn:
        $('closeShiftBtn'),


    /* CLOSED */

    closedShiftPanel:
        $('closedShiftPanel'),

    closedTotalSales:
        $('closedTotalSales'),

    closedCashSales:
        $('closedCashSales'),

    closedQrSales:
        $('closedQrSales'),

    closedBillCount:
        $('closedBillCount'),

    closedExpectedCash:
        $('closedExpectedCash'),

    closedCountedCash:
        $('closedCountedCash'),

    closedDifferenceBox:
        $('closedDifferenceBox'),

    closedDifferenceText:
        $('closedDifferenceText'),

    newShiftBtn:
        $('newShiftBtn')
}


/* ========================================
   HELPERS
======================================== */

function money(value) {

    return new Intl.NumberFormat(
        'th-TH',
        {
            style:
                'currency',

            currency:
                'THB',

            minimumFractionDigits:
                2
        }
    ).format(
        Number(
            value || 0
        )
    )
}


function message(
    text = '',
    type = 'error'
) {

    if (
        !el.pageMessage
    ) {
        return
    }


    el.pageMessage.textContent =
        text


    el.pageMessage.style.color =
        type ===
            'success'

            ? '#188038'

            : '#d93025'
}


function formatRole(
    role
) {

    const map = {

        admin:
            'à¸à¸¹à¹à¸à¸¹à¹à¸¥à¸£à¸°à¸à¸',

        manager:
            'à¸à¸¹à¹à¸à¸±à¸à¸à¸²à¸£',

        staff:
            'à¸à¸à¸±à¸à¸à¸²à¸'
    }


    return (
        map[
        String(
            role || ''
        )
            .toLowerCase()
        ]
        ||
        role
        ||
        '-'
    )
}


function formatDateTime(
    value
) {

    if (!value) {

        return '-'
    }


    return new Intl.DateTimeFormat(
        'th-TH',
        {
            dateStyle:
                'medium',

            timeStyle:
                'medium'
        }
    ).format(
        new Date(
            value
        )
    )
}


function formatDuration(
    openedAt
) {

    if (!openedAt) {

        return '-'
    }


    const start =
        new Date(
            openedAt
        )


    const now =
        new Date()


    let seconds =
        Math.max(
            Math.floor(
                (
                    now -
                    start
                )
                /
                1000
            ),
            0
        )


    const hours =
        Math.floor(
            seconds /
            3600
        )


    seconds -=
        hours *
        3600


    const minutes =
        Math.floor(
            seconds /
            60
        )


    if (
        hours > 0
    ) {

        return (
            `${hours} à¸à¸¡. ${minutes} à¸à¸²à¸à¸µ`
        )
    }


    return (
        `${minutes} à¸à¸²à¸à¸µ`
    )
}


function parseNumber(
    value
) {

    const number =
        Number(
            value
        )


    return Number.isFinite(
        number
    )
        ? number
        : 0
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
    userId
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
                `
                id,
                full_name,
                role,
                branch_id,
                is_active
                `
            )
            .eq(
                'id',
                userId
            )
            .maybeSingle()


    if (error) {

        throw error
    }


    if (!data) {

        throw new Error(
            'à¹à¸¡à¹à¸à¸à¸à¹à¸­à¸¡à¸¹à¸¥à¸à¸¹à¹à¹à¸à¹à¸à¸²à¸'
        )
    }


    if (
        data.is_active ===
        false
    ) {

        throw new Error(
            'à¸à¸±à¸à¸à¸µà¸à¸µà¹à¸à¸¹à¸à¸à¸´à¸à¹à¸à¹à¸à¸²à¸'
        )
    }


    if (
        !data.branch_id
    ) {

        throw new Error(
            'à¸à¸±à¸à¸à¸µà¸¢à¸±à¸à¹à¸¡à¹à¹à¸à¹à¸à¸³à¸«à¸à¸à¸ªà¸²à¸à¸²'
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
            'à¹à¸¡à¹à¸à¸à¸à¹à¸­à¸¡à¸¹à¸¥à¸ªà¸²à¸à¸²'
        )
    }


    state.branch =
        data
}


/* ========================================
   USER DISPLAY
======================================== */

function renderUser() {

    const name =
        state.profile.full_name
        ||
        state.session
            .user
            .email
            ?.split('@')[0]
        ||
        'à¸à¸¹à¹à¹à¸à¹à¸à¸²à¸'


    el.userName.textContent =
        name


    el.userRole.textContent =
        formatRole(
            state.profile.role
        )


    el.branchText.textContent =
        `à¸ªà¸²à¸à¸²: ${state.branch.name}`
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
            'Get current shift error:',
            error
        )

        throw error
    }


    /*
     * à¸ªà¸³à¸à¸±à¸
     *
     * PostgreSQL function à¸à¸µà¹ RETURNS public.shifts
     * à¸à¸­à¸ return null à¸­à¸²à¸à¸ªà¹à¸à¸à¸¥à¸±à¸à¸¡à¸²à¹à¸à¹à¸ object
     * à¸à¸µà¹à¸à¸¸à¸ column à¹à¸à¹à¸ null
     *
     * à¹à¸£à¸²à¸à¸¶à¸à¸à¹à¸­à¸à¸à¸£à¸§à¸ id à¸à¸£à¸´à¸
     */
    if (
        !data
        ||
        !data.id
        ||
        !data.branch_id
        ||
        !data.opened_at
    ) {

        state.shift =
            null

        return null
    }


    state.shift =
        data


    return state.shift
}


/* ========================================
   LOAD LIVE SALES
======================================== */

async function loadLiveSummary() {

    const shift =
        state.shift


    /*
     * à¹à¸¡à¹à¸¡à¸µà¸à¸° à¸«à¸£à¸·à¸­à¸à¹à¸­à¸¡à¸¹à¸¥à¸à¸°à¹à¸¡à¹à¸ªà¸¡à¸à¸¹à¸£à¸à¹
     * à¸«à¹à¸²à¸¡ query sales à¸à¹à¸§à¸¢ UUID null
     */
    if (
        !shift
        ||
        !shift.id
        ||
        !shift.branch_id
        ||
        !shift.opened_at
    ) {

        return
    }


    const {
        data,
        error
    } =
        await supabase
            .from(
                'sales'
            )
            .select(
                `
                id,
                total,
                discount,
                payment_method,
                status,
                created_at
                `
            )
            .eq(
                'branch_id',
                shift.branch_id
            )
            .gte(
                'created_at',
                shift.opened_at
            )


    if (error) {

        console.error(
            'Load shift sales error:',
            error
        )


        throw error
    }


    const sales =
        data || []


    const completed =
        sales.filter(
            sale =>
                sale.status !==
                'cancelled'
        )


    const voided =
        sales.filter(
            sale =>
                sale.status ===
                'cancelled'
        )


    const totalSales =
        completed.reduce(
            (
                sum,
                sale
            ) =>
                sum +
                parseNumber(
                    sale.total
                ),
            0
        )


    const cashSales =
        completed
            .filter(
                sale =>
                    sale.payment_method ===
                    'cash'
            )
            .reduce(
                (
                    sum,
                    sale
                ) =>
                    sum +
                    parseNumber(
                        sale.total
                    ),
                0
            )


    const qrSales =
        completed
            .filter(
                sale =>
                    sale.payment_method ===
                    'qr'
            )
            .reduce(
                (
                    sum,
                    sale
                ) =>
                    sum +
                    parseNumber(
                        sale.total
                    ),
                0
            )


    const discount =
        completed.reduce(
            (
                sum,
                sale
            ) =>
                sum +
                parseNumber(
                    sale.discount
                ),
            0
        )


    const voidAmount =
        voided.reduce(
            (
                sum,
                sale
            ) =>
                sum +
                parseNumber(
                    sale.total
                ),
            0
        )


    const expectedCash =
        parseNumber(
            shift.opening_cash
        )
        +
        cashSales


    state.liveSummary = {

        totalSales,

        cashSales,

        qrSales,

        discount,

        billCount:
            completed.length,

        voidCount:
            voided.length,

        voidAmount,

        expectedCash
    }


    renderLiveSummary()
}


/* ========================================
   RENDER LIVE SUMMARY
======================================== */

function renderLiveSummary() {

    const summary =
        state.liveSummary


    el.liveTotalSales.textContent =
        money(
            summary.totalSales
        )


    el.liveBillCount.textContent =
        summary.billCount
            .toLocaleString(
                'th-TH'
            )


    el.liveCashSales.textContent =
        money(
            summary.cashSales
        )


    el.liveQrSales.textContent =
        money(
            summary.qrSales
        )


    el.liveDiscount.textContent =
        money(
            summary.discount
        )


    el.liveVoidCount.textContent =
        summary.voidCount
            .toLocaleString(
                'th-TH'
            )


    el.liveVoidAmount.textContent =
        money(
            summary.voidAmount
        )


    el.calcOpeningCash.textContent =
        money(
            state.shift
                ?.opening_cash
        )


    el.calcCashSales.textContent =
        money(
            summary.cashSales
        )


    el.expectedCashText.textContent =
        money(
            summary.expectedCash
        )


    updateDifference()
}


/* ========================================
   RENDER SHIFT
======================================== */

function renderShift() {

    el.loadingState
        .classList
        .add(
            'hidden'
        )


    el.closedShiftPanel
        .classList
        .add(
            'hidden'
        )


    if (
        !state.shift
    ) {

        el.openShiftPanel
            .classList
            .remove(
                'hidden'
            )


        el.activeShiftPanel
            .classList
            .add(
                'hidden'
            )


        return
    }


    el.openShiftPanel
        .classList
        .add(
            'hidden'
        )


    el.activeShiftPanel
        .classList
        .remove(
            'hidden'
        )


    el.shiftOpenedText.textContent =
        `à¹à¸à¸´à¸à¸à¸°à¹à¸¡à¸·à¹à¸­ ${formatDateTime(
            state.shift.opened_at
        )}`


    el.shiftOpenedBy.textContent =
        state.profile.full_name
        ||
        '-'


    el.shiftOpenedAt.textContent =
        formatDateTime(
            state.shift.opened_at
        )


    el.shiftOpeningCash.textContent =
        money(
            state.shift.opening_cash
        )


    el.shiftDuration.textContent =
        formatDuration(
            state.shift.opened_at
        )


    if (
        state.shift.opening_note
    ) {

        el.openingNoteText.textContent =
            state.shift.opening_note


        el.openingNoteWrap
            .classList
            .remove(
                'hidden'
            )

    } else {

        el.openingNoteText.textContent =
            '-'


        el.openingNoteWrap
            .classList
            .add(
                'hidden'
            )
    }
}


/* ========================================
   OPEN SHIFT
======================================== */

async function openShift() {

    const openingCash =
        parseNumber(
            el.openingCashInput.value
        )


    const openingNote =
        el.openingNoteInput.value
            .trim()


    if (
        openingCash < 0
    ) {

        message(
            'à¹à¸à¸´à¸à¸ªà¸à¸à¸±à¹à¸à¸à¹à¸à¸à¹à¸­à¸à¹à¸¡à¹à¸à¸´à¸à¸¥à¸'
        )


        return
    }


    const confirmed =
        confirm(
            `à¸¢à¸·à¸à¸¢à¸±à¸à¹à¸à¸´à¸à¸à¸°à¸à¹à¸§à¸¢à¹à¸à¸´à¸à¸ªà¸à¸à¸±à¹à¸à¸à¹à¸ ${money(
                openingCash
            )} à¸«à¸£à¸·à¸­à¹à¸¡à¹?`
        )


    if (!confirmed) {

        return
    }


    el.openShiftBtn.disabled =
        true


    el.openShiftBtn.textContent =
        'à¸à¸³à¸¥à¸±à¸à¹à¸à¸´à¸à¸à¸°...'


    message('')


    try {

        const {
            data,
            error
        } =
            await supabase.rpc(
                'open_shift_v2',
                {
                    p_opening_cash:
                        openingCash,

                    p_opening_note:
                        openingNote
                        ||
                        null,

                    p_terminal_code:
                        'POS01',

                    p_float_mode:
                        'fresh',

                    p_carry_from_shift_id:
                        null
                }
            )


        if (error) {

            throw error
        }


        state.shift =
            data


        el.openingCashInput.value =
            '0'


        el.openingNoteInput.value =
            ''


        renderShift()


        await loadLiveSummary()


        message(
            'à¹à¸à¸´à¸à¸à¸°à¸ªà¸³à¹à¸£à¹à¸',
            'success'
        )


    } catch (error) {

        console.error(
            'Open shift error:',
            error
        )


        let text =
            error.message
            ||
            'à¹à¸à¸´à¸à¸à¸°à¹à¸¡à¹à¸ªà¸³à¹à¸£à¹à¸'


        if (
            text.includes(
                'SHIFT_ALREADY_OPEN'
            )
        ) {

            text =
                'à¸à¸±à¸à¸à¸µà¸à¸µà¹à¸¡à¸µà¸à¸°à¸à¸µà¹à¹à¸à¸´à¸à¸­à¸¢à¸¹à¹à¹à¸¥à¹à¸§'
        }


        if (
            text.includes(
                'INVALID_OPENING_CASH'
            )
        ) {

            text =
                'à¸à¸³à¸à¸§à¸à¹à¸à¸´à¸à¸ªà¸à¸à¸±à¹à¸à¸à¹à¸à¹à¸¡à¹à¸à¸¹à¸à¸à¹à¸­à¸'
        }


        message(
            text
        )


    } finally {

        el.openShiftBtn.disabled =
            false


        el.openShiftBtn.textContent =
            'à¹à¸à¸´à¸à¸à¸°'
    }
}


/* ========================================
   UPDATE DIFFERENCE
======================================== */

function updateDifference() {

    const counted =
        parseNumber(
            el.countedCashInput.value
        )


    const expected =
        parseNumber(
            state.liveSummary
                .expectedCash
        )


    const difference =
        counted -
        expected


    el.cashDifferenceText.textContent =
        money(
            difference
        )


    el.cashDifferenceBox
        .classList
        .remove(
            'over',
            'short',
            'neutral'
        )


    if (
        difference > 0
    ) {

        el.cashDifferenceBox
            .classList
            .add(
                'over'
            )


        return
    }


    if (
        difference < 0
    ) {

        el.cashDifferenceBox
            .classList
            .add(
                'short'
            )


        return
    }


    el.cashDifferenceBox
        .classList
        .add(
            'neutral'
        )
}


/* ========================================
   REFRESH SHIFT
======================================== */

async function refreshShift() {

    if (
        !state.shift
    ) {

        return
    }


    el.refreshShiftBtn.disabled =
        true


    message('')


    try {

        await loadLiveSummary()


        el.shiftDuration.textContent =
            formatDuration(
                state.shift.opened_at
            )


        message(
            'à¸­à¸±à¸à¹à¸à¸à¸¢à¸­à¸à¹à¸¥à¹à¸§',
            'success'
        )


    } catch (error) {

        console.error(
            'Refresh shift error:',
            error
        )


        message(
            error.message
            ||
            'à¸£à¸µà¹à¸à¸£à¸à¸¢à¸­à¸à¹à¸¡à¹à¸ªà¸³à¹à¸£à¹à¸'
        )


    } finally {

        el.refreshShiftBtn.disabled =
            false
    }
}


/* ========================================
   CLOSE SHIFT
======================================== */

async function closeShift() {

    if (
        !state.shift
    ) {

        return
    }


    if (
        el.countedCashInput.value ===
        ''
    ) {

        message(
            'à¸à¸£à¸¸à¸à¸²à¸à¸£à¸­à¸à¹à¸à¸´à¸à¸ªà¸à¸à¸µà¹à¸à¸±à¸à¹à¸à¹à¸à¸£à¸´à¸'
        )


        el.countedCashInput
            .focus()


        return
    }


    const countedCash =
        parseNumber(
            el.countedCashInput.value
        )


    if (
        countedCash < 0
    ) {

        message(
            'à¹à¸à¸´à¸à¸ªà¸à¸à¸µà¹à¸à¸±à¸à¹à¸à¹à¸à¹à¸­à¸à¹à¸¡à¹à¸à¸´à¸à¸¥à¸'
        )


        return
    }


    const expected =
        state.liveSummary
            .expectedCash


    const difference =
        countedCash -
        expected


    const confirmed =
        confirm(
            [
                'à¸¢à¸·à¸à¸¢à¸±à¸à¸à¸´à¸à¸à¸°à¸«à¸£à¸·à¸­à¹à¸¡à¹?',
                '',
                `à¹à¸à¸´à¸à¸ªà¸à¸à¸µà¹à¸à¸§à¸£à¸¡à¸µ: ${money(
                    expected
                )}`,
                `à¹à¸à¸´à¸à¸ªà¸à¸à¸µà¹à¸à¸±à¸à¸à¸£à¸´à¸: ${money(
                    countedCash
                )}`,
                `à¸à¸¥à¸à¹à¸²à¸: ${money(
                    difference
                )}`
            ]
                .join(
                    '\n'
                )
        )


    if (!confirmed) {

        return
    }


    el.closeShiftBtn.disabled =
        true


    el.closeShiftBtn.textContent =
        'à¸à¸³à¸¥à¸±à¸à¸à¸´à¸à¸à¸°...'


    message('')


    try {

        /*
         * à¸£à¸µà¹à¸à¸£à¸à¸¢à¸­à¸à¸¥à¹à¸²à¸ªà¸¸à¸à¸à¹à¸­à¸à¸à¸´à¸
         */
        await loadLiveSummary()


        const {
            data,
            error
        } =
            await supabase.rpc(
                'close_shift_v2',
                {
                    p_counted_cash:
                        countedCash,

                    p_closing_note:
                        el.closingNoteInput
                            .value
                            .trim()
                        ||
                        null
                }
            )


        if (error) {

            throw error
        }


        state.shift =
            null


        renderClosedShift(
            data
        )


        message(
            'à¸à¸´à¸à¸à¸°à¸ªà¸³à¹à¸£à¹à¸',
            'success'
        )


    } catch (error) {

        console.error(
            'Close shift error:',
            error
        )


        let text =
            error.message
            ||
            'à¸à¸´à¸à¸à¸°à¹à¸¡à¹à¸ªà¸³à¹à¸£à¹à¸'


        if (
            text.includes(
                'OPEN_SHIFT_NOT_FOUND'
            )
        ) {

            text =
                'à¹à¸¡à¹à¸à¸à¸à¸°à¸à¸µà¹à¸à¸³à¸¥à¸±à¸à¹à¸à¸´à¸à¸­à¸¢à¸¹à¹'
        }


        if (
            text.includes(
                'COUNTED_CASH_REQUIRED'
            )
        ) {

            text =
                'à¸à¸£à¸¸à¸à¸²à¸à¸£à¸­à¸à¹à¸à¸´à¸à¸ªà¸à¸à¸µà¹à¸à¸±à¸à¹à¸à¹à¸à¸£à¸´à¸'
        }


        if (
            text.includes(
                'INVALID_COUNTED_CASH'
            )
        ) {

            text =
                'à¸à¸³à¸à¸§à¸à¹à¸à¸´à¸à¸ªà¸à¸à¸µà¹à¸à¸±à¸à¹à¸à¹à¹à¸¡à¹à¸à¸¹à¸à¸à¹à¸­à¸'
        }


        message(
            text
        )


    } finally {

        el.closeShiftBtn.disabled =
            false


        el.closeShiftBtn.textContent =
            'à¸à¸´à¸à¸à¸°'
    }
}


/* ========================================
   CLOSED SHIFT
======================================== */

function renderClosedShift(
    shift
) {

    el.openShiftPanel
        .classList
        .add(
            'hidden'
        )


    el.activeShiftPanel
        .classList
        .add(
            'hidden'
        )


    el.loadingState
        .classList
        .add(
            'hidden'
        )


    el.closedShiftPanel
        .classList
        .remove(
            'hidden'
        )


    el.closedTotalSales.textContent =
        money(
            shift.total_sales
        )


    el.closedCashSales.textContent =
        money(
            shift.cash_sales
        )


    el.closedQrSales.textContent =
        money(
            shift.qr_sales
        )


    el.closedBillCount.textContent =
        Number(
            shift.bill_count ||
            0
        )
            .toLocaleString(
                'th-TH'
            )


    el.closedExpectedCash.textContent =
        money(
            shift.expected_cash
        )


    el.closedCountedCash.textContent =
        money(
            shift.counted_cash
        )


    const difference =
        parseNumber(
            shift.cash_difference
        )


    el.closedDifferenceText.textContent =
        money(
            difference
        )


    el.closedDifferenceBox
        .classList
        .remove(
            'over',
            'short',
            'neutral'
        )


    if (
        difference > 0
    ) {

        el.closedDifferenceBox
            .classList
            .add(
                'over'
            )

    } else if (
        difference < 0
    ) {

        el.closedDifferenceBox
            .classList
            .add(
                'short'
            )

    } else {

        el.closedDifferenceBox
            .classList
            .add(
                'neutral'
            )
    }


    el.countedCashInput.value =
        ''


    el.closingNoteInput.value =
        ''
}


/* ========================================
   NEW SHIFT
======================================== */

function newShift() {

    el.closedShiftPanel
        .classList
        .add(
            'hidden'
        )


    el.openShiftPanel
        .classList
        .remove(
            'hidden'
        )


    el.openingCashInput.value =
        '0'


    el.openingNoteInput.value =
        ''


    message('')
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


/* ========================================
   INIT
======================================== */

async function init() {

    try {

        const session =
            await requireSession()


        if (!session) {

            return
        }


        await loadProfile(
            session.user.id
        )


        await loadBranch()


        renderUser()


        await loadCurrentShift()


        renderShift()


        if (
            state.shift
        ) {

            await loadLiveSummary()
        }


    } catch (error) {

        console.error(
            'Shift init error:',
            error
        )


        el.loadingState
            .classList
            .add(
                'hidden'
            )


        message(
            error.message
            ||
            'à¹à¸«à¸¥à¸à¸£à¸°à¸à¸à¸à¸°à¹à¸¡à¹à¸ªà¸³à¹à¸£à¹à¸'
        )
    }
}


/* ========================================
   EVENTS
======================================== */

el.backBtn
    ?.addEventListener(
        'click',
        () => {

            location.href =
                './dashboard.html'
        }
    )


el.logoutBtn
    ?.addEventListener(
        'click',
        logout
    )


el.openShiftBtn
    ?.addEventListener(
        'click',
        openShift
    )


el.refreshShiftBtn
    ?.addEventListener(
        'click',
        refreshShift
    )


el.countedCashInput
    ?.addEventListener(
        'input',
        updateDifference
    )


el.closeShiftBtn
    ?.addEventListener(
        'click',
        closeShift
    )


el.newShiftBtn
    ?.addEventListener(
        'click',
        newShift
    )


/* ========================================
   AUTH
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
   DURATION TIMER
======================================== */

setInterval(
    () => {

        if (
            state.shift
            &&
            el.shiftDuration
        ) {

            el.shiftDuration.textContent =
                formatDuration(
                    state.shift.opened_at
                )
        }

    },
    60000
)


/* ========================================
   START
======================================== */

init()
