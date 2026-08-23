import { supabase } from './supabase.js';
import {
    requireBackoffice,
    setupShell,
    money,
    esc
} from './auth.js';

import {
    attachReportActions
} from './report-tools.js';

const $ = id => document.getElementById(id);

const el = {
    dateFrom: $('dateFrom'),
    dateTo: $('dateTo'),
    loadBtn: $('loadBtn'),
    shareBtn: $('shareBtn'),
    printBtn: $('printBtn'),
    pageMessage: $('pageMessage'),

    sumSales: $('sumSales'),
    sumDays: $('sumDays'),
    sumPayment: $('sumPayment'),
    sumBillsShifts: $('sumBillsShifts'),
    sumDiff: $('sumDiff'),
    periodText: $('periodText'),

    historyLoading: $('historyLoading'),
    historyEmpty: $('historyEmpty'),
    historyTable: $('historyTable'),
    historyRows: $('historyRows'),

    detailPanel: $('detailPanel'),
    detailTitle: $('detailTitle'),
    detailStatus: $('detailStatus'),
    detailSales: $('detailSales'),
    detailPayment: $('detailPayment'),
    detailBillsShifts: $('detailBillsShifts'),
    detailDiff: $('detailDiff'),
    closeDetailBtn: $('closeDetailBtn'),
    shiftRows: $('shiftRows'),
    billRows: $('billRows')
};

function localDateValue(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function setDefaultDates() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    el.dateFrom.value = localDateValue(start);
    el.dateTo.value = localDateValue(now);
}

function formatDate(value) {
    if (!value) return '-';

    const parts = String(value).split('-');
    if (parts.length !== 3) return esc(value);

    const date = new Date(
        Number(parts[0]),
        Number(parts[1]) - 1,
        Number(parts[2])
    );

    return new Intl.DateTimeFormat('th-TH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    }).format(date);
}

function formatDateTime(value) {
    if (!value) return '-';

    const date = new Date(value);

    return new Intl.DateTimeFormat('th-TH', {
        day: 'numeric',
        month: 'short',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

function num(value) {
    return Number(value || 0);
}

function setMessage(text = '', type = 'error') {
    el.pageMessage.textContent = text;
    el.pageMessage.style.color =
        type === 'success'
            ? '#188038'
            : type === 'info'
                ? '#667085'
                : '#c5221f';
}

function statusInfo(status) {
    switch (String(status || '').toLowerCase()) {
        case 'closed':
            return {
                text: '\u0e1b\u0e34\u0e14\u0e27\u0e31\u0e19\u0e41\u0e25\u0e49\u0e27',
                css: 'status-closed'
            };

        case 'open':
            return {
                text: '\u0e21\u0e35\u0e01\u0e30\u0e40\u0e1b\u0e34\u0e14\u0e04\u0e49\u0e32\u0e07',
                css: 'status-open'
            };

        case 'not_closed':
            return {
                text: '\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48 End of Day',
                css: 'status-not-closed'
            };

        default:
            return {
                text: '\u0e44\u0e21\u0e48\u0e21\u0e35\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25',
                css: 'status-no-data'
            };
    }
}

function setDiffStyle(node, value) {
    const amount = num(value);
    node.className = amount === 0 ? 'diff-ok' : 'diff-bad';
}

function renderSummary(data) {
    const s = data?.summary || {};

    el.sumSales.textContent = money(s.net_sales);
    el.sumDays.textContent =
        `${num(s.day_count).toLocaleString('th-TH')} \u0e27\u0e31\u0e19`;

    el.sumPayment.textContent =
        `${money(s.cash_sales)} / ${money(s.qr_sales)}`;

    el.sumBillsShifts.textContent =
        `${num(s.bill_count).toLocaleString('th-TH')} / ` +
        `${num(s.shift_count).toLocaleString('th-TH')}`;

    el.sumDiff.textContent = money(s.cash_difference);
    setDiffStyle(el.sumDiff, s.cash_difference);

    el.periodText.textContent =
        `${formatDate(data?.date_from)} \u0e16\u0e36\u0e07 ${formatDate(data?.date_to)}`;
}

function renderHistory(days) {
    const list = Array.isArray(days) ? days : [];

    el.historyLoading.classList.add('hidden');

    if (!list.length) {
        el.historyRows.innerHTML = '';
        el.historyTable.classList.add('hidden');
        el.historyEmpty.classList.remove('hidden');
        return;
    }

    el.historyEmpty.classList.add('hidden');
    el.historyTable.classList.remove('hidden');

    el.historyRows.innerHTML = list.map(day => {
        const st = statusInfo(day.status);
        const diffClass =
            num(day.cash_difference) === 0
                ? 'diff-ok'
                : 'diff-bad';

        return `
            <tr>
                <td>
                    <strong>${formatDate(day.business_date)}</strong>
                </td>

                <td>
                    <span class="status-pill ${st.css}">
                        ${st.text}
                    </span>
                </td>

                <td class="num">
                    <strong>${money(day.net_sales)}</strong>
                </td>

                <td class="num">${money(day.cash_sales)}</td>
                <td class="num">${money(day.qr_sales)}</td>

                <td class="num">
                    ${num(day.bill_count).toLocaleString('th-TH')}
                </td>

                <td class="num">
                    ${num(day.shift_count).toLocaleString('th-TH')}
                </td>

                <td class="num">${money(day.discount)}</td>

                <td class="num ${diffClass}">
                    ${money(day.cash_difference)}
                </td>

                <td class="center">
                    <button
                        class="detail-btn"
                        type="button"
                        data-date="${esc(day.business_date)}"
                    >
                        \u0e14\u0e39\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function setHistoryLoading() {
    el.historyLoading.classList.remove('hidden');
    el.historyEmpty.classList.add('hidden');
    el.historyTable.classList.add('hidden');
}

async function loadHistory() {
    const from = el.dateFrom.value;
    const to = el.dateTo.value;

    if (!from || !to) {
        setMessage(
            '\u0e01\u0e23\u0e38\u0e13\u0e32\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e0a\u0e48\u0e27\u0e07\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48\u0e43\u0e2b\u0e49\u0e04\u0e23\u0e1a'
        );
        return;
    }

    if (from > to) {
        setMessage(
            '\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48\u0e40\u0e23\u0e34\u0e48\u0e21\u0e15\u0e49\u0e2d\u0e07\u0e44\u0e21\u0e48\u0e40\u0e01\u0e34\u0e19\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48\u0e2a\u0e34\u0e49\u0e19\u0e2a\u0e38\u0e14'
        );
        return;
    }

    setMessage('');
    setHistoryLoading();
    el.loadBtn.disabled = true;

    try {
        const { data, error } = await supabase.rpc(
            'backoffice_sales_history_v1',
            {
                p_date_from: from,
                p_date_to: to
            }
        );

        if (error) throw error;

        renderSummary(data || {});
        renderHistory(data?.days || []);
        el.detailPanel.classList.add('hidden');

        setMessage(
            '\u0e42\u0e2b\u0e25\u0e14\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08',
            'success'
        );
    } catch (error) {
        console.error('Sales history error:', error);

        el.historyLoading.classList.add('hidden');

        setMessage(
            error?.message ||
            '\u0e42\u0e2b\u0e25\u0e14\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19\u0e44\u0e21\u0e48\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08'
        );
    } finally {
        el.loadBtn.disabled = false;
    }
}

function renderDaySummary(detail) {
    const s = detail?.summary || {};
    const st = statusInfo(s.status);

    el.detailTitle.textContent =
        `\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14 ${formatDate(detail?.business_date)}`;

    el.detailStatus.innerHTML =
        `<span class="status-pill ${st.css}">${st.text}</span>`;

    el.detailSales.textContent = money(s.net_sales);

    el.detailPayment.textContent =
        `${money(s.cash_sales)} / ${money(s.qr_sales)}`;

    el.detailBillsShifts.textContent =
        `${num(s.bill_count).toLocaleString('th-TH')} / ` +
        `${num(s.shift_count).toLocaleString('th-TH')}`;

    el.detailDiff.textContent = money(s.cash_difference);
    setDiffStyle(el.detailDiff, s.cash_difference);
}

function renderShifts(shifts) {
    const list = Array.isArray(shifts) ? shifts : [];

    el.shiftRows.innerHTML =
        list.map((shift, index) => {
            const diffClass =
                num(shift.cash_difference) === 0
                    ? 'diff-ok'
                    : 'diff-bad';

            return `
                <tr>
                    <td>#${index + 1}</td>

                    <td>
                        <strong>${esc(shift.cashier_name || '-')}</strong>
                    </td>

                    <td>
                        ${esc(shift.terminal_code || '-')}
                        <br>
                        <small>${esc(shift.float_mode || '-')}</small>
                    </td>

                    <td>
                        ${formatDateTime(shift.opened_at)}
                        <br>
                        \u2192 ${formatDateTime(shift.closed_at)}
                    </td>

                    <td class="num">${money(shift.total_sales)}</td>
                    <td class="num">${money(shift.cash_sales)}</td>
                    <td class="num">${money(shift.qr_sales)}</td>

                    <td class="num">
                        ${shift.expected_cash == null
                            ? '-'
                            : money(shift.expected_cash)}
                    </td>

                    <td class="num">
                        ${shift.counted_cash == null
                            ? '-'
                            : money(shift.counted_cash)}
                    </td>

                    <td class="num ${diffClass}">
                        ${shift.cash_difference == null
                            ? '-'
                            : money(shift.cash_difference)}
                    </td>
                </tr>
            `;
        }).join('')
        ||
        `<tr>
            <td colspan="10">
                \u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e01\u0e30
            </td>
        </tr>`;
}

function renderBills(sales) {
    const list = Array.isArray(sales) ? sales : [];

    el.billRows.innerHTML =
        list.map(sale => {
            return `
                <tr>
                    <td>${formatDateTime(sale.created_at)}</td>

                    <td>
                        <strong>${esc(sale.invoice_no || '-')}</strong>
                    </td>

                    <td>${esc(sale.cashier_name || '-')}</td>
                    <td>${esc(String(sale.payment_method || '-').toUpperCase())}</td>
                    <td>${esc(sale.status || '-')}</td>
                    <td class="num">${money(sale.subtotal)}</td>
                    <td class="num">${money(sale.discount)}</td>
                    <td class="num"><strong>${money(sale.total)}</strong></td>
                </tr>
            `;
        }).join('')
        ||
        `<tr>
            <td colspan="8">
                \u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e1a\u0e34\u0e25
            </td>
        </tr>`;
}

async function loadDayDetail(businessDate) {
    if (!businessDate) return;

    setMessage(
        '\u0e01\u0e33\u0e25\u0e31\u0e07\u0e42\u0e2b\u0e25\u0e14\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14...',
        'info'
    );

    try {
        const { data, error } = await supabase.rpc(
            'backoffice_sales_day_detail_v1',
            {
                p_business_date: businessDate
            }
        );

        if (error) throw error;

        renderDaySummary(data || {});
        renderShifts(data?.shifts || []);
        renderBills(data?.sales || []);

        el.detailPanel.classList.remove('hidden');

        setMessage(
            '\u0e42\u0e2b\u0e25\u0e14\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08',
            'success'
        );

        el.detailPanel.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    } catch (error) {
        console.error('Sales day detail error:', error);

        setMessage(
            error?.message ||
            '\u0e42\u0e2b\u0e25\u0e14\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14\u0e44\u0e21\u0e48\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08'
        );
    }
}

function activateTab(button) {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });

    document.querySelectorAll('.pane').forEach(pane => {
        pane.classList.remove('active');
    });

    button.classList.add('active');

    const pane = $(button.dataset.tab);
    if (pane) pane.classList.add('active');
}

function bindEvents() {
    el.loadBtn.addEventListener('click', loadHistory);

    attachReportActions({
        shareButton: el.shareBtn,
        printButton: el.printBtn,

        title: '\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19\u0e22\u0e2d\u0e14\u0e02\u0e32\u0e22 JOKJUNG Back Office',

        getShareText: () => {
            const from =
                formatDate(el.dateFrom.value);

            const to =
                formatDate(el.dateTo.value);

            const sales =
                el.sumSales.textContent || '-';

            const payment =
                el.sumPayment.textContent || '-';

            const billsShifts =
                el.sumBillsShifts.textContent || '-';

            const diff =
                el.sumDiff.textContent || '-';

            return [
                '\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19\u0e22\u0e2d\u0e14\u0e02\u0e32\u0e22 JOKJUNG Back Office',
                `\u0e0a\u0e48\u0e27\u0e07\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48 ${from} \u0e16\u0e36\u0e07 ${to}`,
                `\u0e22\u0e2d\u0e14\u0e02\u0e32\u0e22\u0e23\u0e27\u0e21 ${sales}`,
                `Cash / QR ${payment}`,
                `\u0e1a\u0e34\u0e25 / \u0e01\u0e30 ${billsShifts}`,
                `\u0e40\u0e07\u0e34\u0e19\u0e02\u0e32\u0e14 / \u0e40\u0e01\u0e34\u0e19 ${diff}`
            ].join('\n');
        },

        onCopied: () => {
            setMessage(
                '\u0e04\u0e31\u0e14\u0e25\u0e2d\u0e01\u0e25\u0e34\u0e07\u0e01\u0e4c\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19\u0e41\u0e25\u0e49\u0e27',
                'success'
            );
        },

        onError: error => {
            setMessage(
                error?.message ||
                '\u0e41\u0e0a\u0e23\u0e4c\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19\u0e44\u0e21\u0e48\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08'
            );
        }
    });

    el.historyRows.addEventListener('click', event => {
        const button = event.target.closest('[data-date]');
        if (!button) return;

        loadDayDetail(button.dataset.date);
    });

    el.closeDetailBtn.addEventListener('click', () => {
        el.detailPanel.classList.add('hidden');
    });

    document.querySelectorAll('.tab').forEach(button => {
        button.addEventListener('click', () => activateTab(button));
    });
}

async function init() {
    setDefaultDates();
    bindEvents();

    try {
        const ctx = await requireBackoffice();

        if (!ctx) return;

        setupShell(ctx, 'sales-history');

        await loadHistory();
    } catch (error) {
        console.error('Init sales history error:', error);

        setMessage(
            error?.message ||
            '\u0e40\u0e1b\u0e34\u0e14\u0e2b\u0e19\u0e49\u0e32\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19\u0e44\u0e21\u0e48\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08'
        );
    }
}

init();
