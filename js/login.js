import { supabase } from './supabase.js'

const form = document.getElementById('loginForm')
const message = document.getElementById('message')
const button = document.getElementById('loginBtn')

const existing = await supabase.auth.getSession()
if (existing.data.session) {
    location.replace('./dashboard.html')
}

form.addEventListener('submit', async e => {
    e.preventDefault()
    message.textContent = ''
    button.disabled = true
    button.textContent = 'กำลังเข้าสู่ระบบ...'

    try {
        const { error } = await supabase.auth.signInWithPassword({
            email: document.getElementById('email').value.trim(),
            password: document.getElementById('password').value
        })
        if (error) throw error

        const { data, error: ctxError } = await supabase.rpc('backoffice_context')
        if (ctxError) throw ctxError
        const ctx = Array.isArray(data) ? data[0] : data

        if (!ctx || !['admin','manager'].includes(String(ctx.role || '').toLowerCase())) {
            await supabase.auth.signOut()
            throw new Error('บัญชีนี้ไม่มีสิทธิ์เข้า Back Office')
        }

        location.replace('./dashboard.html')
    } catch (error) {
        message.textContent = error.message || 'เข้าสู่ระบบไม่สำเร็จ'
    } finally {
        button.disabled = false
        button.textContent = 'เข้าสู่ระบบ'
    }
})
