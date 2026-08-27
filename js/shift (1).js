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

    businessDate:
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

    currentBusinessDate:
        $('currentBusinessDate'),

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

    shiftBusinessDate:
        $('shiftBusinessDate'),

    shiftTerminal:
        $('shiftTerminal'),

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
            '\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A',

        manager:
            '\u0E1C\u0E39\u0E49\u0E08\u0E31\u0E14\u0E01\u0E32\u0E23',

        staff:
            '\u0E1E\u0E19\u0E31\u0E01\u0E07\u0E32\u0E19'
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
            `${hours} \u0E0A\u0E21. ${minutes} \u0E19\u0E32\u0E17\u0E35`
        )
    }


    return (
        `${minutes} \u0E19\u0E32\u0E17\u0E35`
    )
}



function formatBusinessDate(
    value
) {
    if (!value) {
        return '-'
    }

    const parts =
        String(value)
            .split('-')
            .map(Number)

    if (
        parts.length !== 3
        ||
        !parts[0]
        ||
        !parts[1]
        ||
        !parts[2]
    ) {
        return String(value)
    }

    const date =
        new Date(
            parts[0],
            parts[1] - 1,
            parts[2]
        )

    return new Intl.DateTimeFormat(
        'th-TH',
        {
            dateStyle:
                'long'
        }
    ).format(
        date
    )
}


async function loadBusinessDate() {

    const {
        data,
        error
    } =
        await supabase.rpc(
            'jokjung_get_business_date_v22',
            {
                p_branch_id:
                    state.profile.branch_id
            }
        )


    if (error) {

        console.error(
            'Load business date error:',
            error
        )

        /*
         * \u0E44\u0E21\u0E48\u0E43\u0E2B\u0E49\u0E2B\u0E19\u0E49\u0E32 Shift \u0E25\u0E48\u0E21\u0E40\u0E1E\u0E23\u0E32\u0E30\u0E41\u0E04\u0E48\u0E1B\u0E49\u0E32\u0E22 Business Date
         * \u0E16\u0E49\u0E32\u0E21\u0E35\u0E01\u0E30\u0E2D\u0E22\u0E39\u0E48 \u0E08\u0E30\u0E43\u0E0A\u0E49 business_date \u0E08\u0E32\u0E01\u0E01\u0E30\u0E41\u0E17\u0E19
         */
        state.businessDate =
            state.shift
                ?.business_date
            ||
            null

        return state.businessDate
    }


    state.businessDate =
        data
        ||
        null


    if (
        el.currentBusinessDate
    ) {

        el.currentBusinessDate.textContent =
            formatBusinessDate(
                state.businessDate
            )
    }


    return state.businessDate
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
            '\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19'
        )
    }


    if (
        data.is_active ===
        false
    ) {

        throw new Error(
            '\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E19\u0E35\u0E49\u0E16\u0E39\u0E01\u0E1B\u0E34\u0E14\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19'
        )
    }


    if (
        !data.branch_id
    ) {

        throw new Error(
            '\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E01\u0E33\u0E2B\u0E19\u0E14\u0E2A\u0E32\u0E02\u0E32'
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
            '\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E2A\u0E32\u0E02\u0E32'
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
        '\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19'


    el.userName.textContent =
        name


    el.userRole.textContent =
        formatRole(
            state.profile.role
        )


    el.branchText.textContent =
        `\u0E2A\u0E32\u0E02\u0E32: ${state.branch.name}`
}


/* ========================================
   CURRENT SHIFT
======================================== */

async function loadCurrentShift() {

    /*
     * \u0E02\u0E31\u0E49\u0E19\u0E41\u0E23\u0E01\u0E43\u0E0A\u0E49 RPC \u0E40\u0E14\u0E34\u0E21\u0E01\u0E48\u0E2D\u0E19
     */
    const {
        data,
        error
    } =
        await supabase.rpc(
            'get_current_shift'
        )


    if (
        !error
        &&
        data
        &&
        data.id
        &&
        data.branch_id
        &&
        data.opened_at
    ) {

        state.shift =
            data

        if (
            data.business_date
        ) {

            state.businessDate =
                data.business_date
        }

        return state.shift
    }


    if (error) {

        console.warn(
            'get_current_shift fallback:',
            error
        )
    }


    /*
     * V2:
     * \u0E16\u0E49\u0E32 RPC \u0E40\u0E14\u0E34\u0E21\u0E2B\u0E32\u0E44\u0E21\u0E48\u0E40\u0E08\u0E2D \u0E41\u0E15\u0E48 POS01 \u0E22\u0E31\u0E07\u0E21\u0E35\u0E01\u0E30\u0E40\u0E1B\u0E34\u0E14\u0E43\u0E19\u0E10\u0E32\u0E19\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25
     * \u0E43\u0E2B\u0E49\u0E42\u0E2B\u0E25\u0E14\u0E01\u0E30\u0E02\u0E2D\u0E07 Terminal \u0E42\u0E14\u0E22\u0E15\u0E23\u0E07
     *
     * \u0E1B\u0E49\u0E2D\u0E07\u0E01\u0E31\u0E19\u0E2D\u0E32\u0E01\u0E32\u0E23:
     * \u0E2B\u0E19\u0E49\u0E32\u0E40\u0E27\u0E47\u0E1A\u0E1A\u0E2D\u0E01 "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E40\u0E1B\u0E34\u0E14\u0E01\u0E30"
     * \u0E41\u0E15\u0E48\u0E01\u0E14\u0E40\u0E1B\u0E34\u0E14\u0E41\u0E25\u0E49\u0E27\u0E44\u0E14\u0E49 TERMINAL_ALREADY_HAS_OPEN_SHIFT
     */
    const {
        data:
            terminalShift,
        error:
            terminalError
    } =
        await supabase
            .from(
                'shifts'
            )
            .select(
                '*'
            )
            .eq(
                'branch_id',
                state.profile.branch_id
            )
            .eq(
                'terminal_code',
                'POS01'
            )
            .is(
                'closed_at',
                null
            )
            .order(
                'opened_at',
                {
                    ascending:
                        false
                }
            )
            .limit(
                1
            )
            .maybeSingle()


    if (terminalError) {

        console.error(
            'Load POS01 open shift error:',
            terminalError
        )

        /*
         * \u0E16\u0E49\u0E32 RLS \u0E44\u0E21\u0E48\u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15 query \u0E15\u0E23\u0E07
         * \u0E43\u0E2B\u0E49\u0E41\u0E2A\u0E14\u0E07 error \u0E08\u0E23\u0E34\u0E07\u0E41\u0E17\u0E19\u0E01\u0E32\u0E23\u0E2B\u0E25\u0E2D\u0E01\u0E27\u0E48\u0E32\u0E44\u0E21\u0E48\u0E21\u0E35\u0E01\u0E30
         */
        throw terminalError
    }


    if (
        terminalShift
        &&
        terminalShift.id
        &&
        terminalShift.branch_id
        &&
        terminalShift.opened_at
    ) {

        state.shift =
            terminalShift

        if (
            terminalShift.business_date
        ) {

            state.businessDate =
                terminalShift.business_date
        }

        return state.shift
    }


    state.shift =
        null

    return null
}

/* ========================================
   LOAD LIVE SALES
======================================== */

async function loadLiveSummary() {

    const shift =
        state.shift


    /*
     * \u0E44\u0E21\u0E48\u0E21\u0E35\u0E01\u0E30 \u0E2B\u0E23\u0E37\u0E2D\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E01\u0E30\u0E44\u0E21\u0E48\u0E2A\u0E21\u0E1A\u0E39\u0E23\u0E13\u0E4C
     * \u0E2B\u0E49\u0E32\u0E21 query sales \u0E14\u0E49\u0E27\u0E22 UUID null
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
            .eq(
                'shift_id',
                shift.id
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
        `\u0E40\u0E1B\u0E34\u0E14\u0E01\u0E30\u0E40\u0E21\u0E37\u0E48\u0E2D ${formatDateTime(
            state.shift.opened_at
        )}`


    el.shiftOpenedBy.textContent =
        state.shift.cashier_name
        ||
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


    if (
        el.shiftBusinessDate
    ) {

        el.shiftBusinessDate.textContent =
            formatBusinessDate(
                state.shift.business_date
                ||
                state.businessDate
            )
    }


    if (
        el.shiftTerminal
    ) {

        el.shiftTerminal.textContent =
            state.shift.terminal_code
            ||
            'POS01'
    }


    if (
        el.currentBusinessDate
    ) {

        el.currentBusinessDate.textContent =
            formatBusinessDate(
                state.shift.business_date
                ||
                state.businessDate
            )
    }


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
            '\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E14\u0E15\u0E31\u0E49\u0E07\u0E15\u0E49\u0E19\u0E15\u0E49\u0E2D\u0E07\u0E44\u0E21\u0E48\u0E15\u0E34\u0E14\u0E25\u0E1A'
        )


        return
    }


    const confirmed =
        confirm(
            `\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E40\u0E1B\u0E34\u0E14\u0E01\u0E30\u0E14\u0E49\u0E27\u0E22\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E14\u0E15\u0E31\u0E49\u0E07\u0E15\u0E49\u0E19 ${money(
                openingCash
            )} \u0E2B\u0E23\u0E37\u0E2D\u0E44\u0E21\u0E48?`
        )


    if (!confirmed) {

        return
    }


    el.openShiftBtn.disabled =
        true


    el.openShiftBtn.textContent =
        '\u0E01\u0E33\u0E25\u0E31\u0E07\u0E40\u0E1B\u0E34\u0E14\u0E01\u0E30...'


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
            '\u0E40\u0E1B\u0E34\u0E14\u0E01\u0E30\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08',
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
            '\u0E40\u0E1B\u0E34\u0E14\u0E01\u0E30\u0E44\u0E21\u0E48\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08'


        if (
            text.includes(
                'SHIFT_ALREADY_OPEN'
            )
        ) {

            text =
                '\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E19\u0E35\u0E49\u0E21\u0E35\u0E01\u0E30\u0E17\u0E35\u0E48\u0E40\u0E1B\u0E34\u0E14\u0E2D\u0E22\u0E39\u0E48\u0E41\u0E25\u0E49\u0E27'
        }


        if (
            text.includes(
                'TERMINAL_ALREADY_HAS_OPEN_SHIFT'
            )
        ) {

            text =
                'POS01 \u0E21\u0E35\u0E01\u0E30\u0E40\u0E1B\u0E34\u0E14\u0E2D\u0E22\u0E39\u0E48\u0E41\u0E25\u0E49\u0E27 \u0E01\u0E33\u0E25\u0E31\u0E07\u0E42\u0E2B\u0E25\u0E14\u0E01\u0E30\u0E1B\u0E31\u0E08\u0E08\u0E38\u0E1A\u0E31\u0E19...'

            message(
                text
            )

            await loadCurrentShift()

            renderShift()

            if (
                state.shift
            ) {

                await loadLiveSummary()

                message(
                    '\u0E42\u0E2B\u0E25\u0E14\u0E01\u0E30\u0E1B\u0E31\u0E08\u0E08\u0E38\u0E1A\u0E31\u0E19\u0E02\u0E2D\u0E07 POS01 \u0E41\u0E25\u0E49\u0E27',
                    'success'
                )

                return
            }
        }


        if (
            text.includes(
                'INVALID_OPENING_CASH'
            )
        ) {

            text =
                '\u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E14\u0E15\u0E31\u0E49\u0E07\u0E15\u0E49\u0E19\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07'
        }


        message(
            text
        )


    } finally {

        el.openShiftBtn.disabled =
            false


        el.openShiftBtn.textContent =
            '\u0E40\u0E1B\u0E34\u0E14\u0E01\u0E30'
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
            '\u0E2D\u0E31\u0E1B\u0E40\u0E14\u0E15\u0E22\u0E2D\u0E14\u0E41\u0E25\u0E49\u0E27',
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
            '\u0E23\u0E35\u0E40\u0E1F\u0E23\u0E0A\u0E22\u0E2D\u0E14\u0E44\u0E21\u0E48\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08'
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
            '\u0E01\u0E23\u0E38\u0E13\u0E32\u0E01\u0E23\u0E2D\u0E01\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E14\u0E17\u0E35\u0E48\u0E19\u0E31\u0E1A\u0E44\u0E14\u0E49\u0E08\u0E23\u0E34\u0E07'
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
            '\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E14\u0E17\u0E35\u0E48\u0E19\u0E31\u0E1A\u0E44\u0E14\u0E49\u0E15\u0E49\u0E2D\u0E07\u0E44\u0E21\u0E48\u0E15\u0E34\u0E14\u0E25\u0E1A'
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
                '\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E1B\u0E34\u0E14\u0E01\u0E30\u0E2B\u0E23\u0E37\u0E2D\u0E44\u0E21\u0E48?',
                '',
                `\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E14\u0E17\u0E35\u0E48\u0E04\u0E27\u0E23\u0E21\u0E35: ${money(
                    expected
                )}`,
                `\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E14\u0E17\u0E35\u0E48\u0E19\u0E31\u0E1A\u0E08\u0E23\u0E34\u0E07: ${money(
                    countedCash
                )}`,
                `\u0E1C\u0E25\u0E15\u0E48\u0E32\u0E07: ${money(
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
        '\u0E01\u0E33\u0E25\u0E31\u0E07\u0E1B\u0E34\u0E14\u0E01\u0E30...'


    message('')


    try {

        /*
         * \u0E23\u0E35\u0E40\u0E1F\u0E23\u0E0A\u0E22\u0E2D\u0E14\u0E25\u0E48\u0E32\u0E2A\u0E38\u0E14\u0E01\u0E48\u0E2D\u0E19\u0E1B\u0E34\u0E14
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
            '\u0E1B\u0E34\u0E14\u0E01\u0E30\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08',
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
            '\u0E1B\u0E34\u0E14\u0E01\u0E30\u0E44\u0E21\u0E48\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08'


        if (
            text.includes(
                'OPEN_SHIFT_NOT_FOUND'
            )
        ) {

            text =
                '\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E01\u0E30\u0E17\u0E35\u0E48\u0E01\u0E33\u0E25\u0E31\u0E07\u0E40\u0E1B\u0E34\u0E14\u0E2D\u0E22\u0E39\u0E48'
        }


        if (
            text.includes(
                'COUNTED_CASH_REQUIRED'
            )
        ) {

            text =
                '\u0E01\u0E23\u0E38\u0E13\u0E32\u0E01\u0E23\u0E2D\u0E01\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E14\u0E17\u0E35\u0E48\u0E19\u0E31\u0E1A\u0E44\u0E14\u0E49\u0E08\u0E23\u0E34\u0E07'
        }


        if (
            text.includes(
                'INVALID_COUNTED_CASH'
            )
        ) {

            text =
                '\u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E07\u0E34\u0E19\u0E2A\u0E14\u0E17\u0E35\u0E48\u0E19\u0E31\u0E1A\u0E44\u0E14\u0E49\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07'
        }


        message(
            text
        )


    } finally {

        el.closeShiftBtn.disabled =
            false


        el.closeShiftBtn.textContent =
            '\u0E1B\u0E34\u0E14\u0E01\u0E30'
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


        await loadBusinessDate()


        await loadCurrentShift()


        if (
            state.shift
            &&
            state.shift.business_date
        ) {

            state.businessDate =
                state.shift.business_date
        }


        if (
            el.currentBusinessDate
        ) {

            el.currentBusinessDate.textContent =
                formatBusinessDate(
                    state.businessDate
                )
        }


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
            '\u0E42\u0E2B\u0E25\u0E14\u0E23\u0E30\u0E1A\u0E1A\u0E01\u0E30\u0E44\u0E21\u0E48\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08'
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
