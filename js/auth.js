import { supabase } from './supabase.js'

export async function requireBackoffice() {
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error) throw error

    if (!session) {
        location.replace('./index.html')
        return null
    }

    const { data, error: ctxError } = await supabase.rpc('backoffice_context')
    if (ctxError) throw ctxError

    const ctx = Array.isArray(data) ? data[0] : data
    if (!ctx) throw new Error('ไม่พบข้อมูลผู้ใช้งาน')

    const role = String(ctx.role || '').toLowerCase()
    if (!['admin', 'manager'].includes(role)) {
        await supabase.auth.signOut()
        throw new Error('บัญชีนี้ไม่มีสิทธิ์เข้า Back Office')
    }

    return { session, ...ctx, role }
}

export function setupShell(ctx, active = '') {
    document.querySelectorAll('[data-nav]').forEach(a => {
        a.classList.toggle('active', a.dataset.nav === active)
    })

    const branch = document.getElementById('branchText')
    const user = document.getElementById('userName')
    const role = document.getElementById('roleBadge')

    if (branch) branch.textContent = `สาขา: ${ctx.branch_name || '-'}`
    if (user) user.textContent = ctx.full_name || ctx.email || 'ผู้ใช้งาน'
    if (role) role.textContent = ctx.role === 'admin' ? 'Admin' : 'Manager'

    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
        await supabase.auth.signOut()
        location.replace('./index.html')
    })

    const sidebar = document.getElementById('sidebar')
    document.getElementById('menuBtn')?.addEventListener('click', () => {
        sidebar?.classList.toggle('open')
    })

    document.addEventListener('click', e => {
        if (window.innerWidth > 760) return
        if (!sidebar?.classList.contains('open')) return
        if (sidebar.contains(e.target) || e.target.closest('#menuBtn')) return
        sidebar.classList.remove('open')
    })
}

export const money = v => new Intl.NumberFormat(
    'th-TH',
    { style: 'currency', currency: 'THB', minimumFractionDigits: 2 }
).format(Number(v || 0))

export const number = (v, digits = 3) => Number(v || 0).toLocaleString(
    'th-TH',
    { maximumFractionDigits: digits }
)

export const esc = v => String(v ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;')
