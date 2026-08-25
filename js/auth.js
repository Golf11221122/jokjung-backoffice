import { supabase } from './supabase.js'

const emailInput = document.getElementById('email')
const passwordInput = document.getElementById('password')
const loginBtn = document.getElementById('loginBtn')
const messageEl = document.getElementById('message')

function setMessage(text = '') {
    if (messageEl) messageEl.textContent = text
}

async function login() {
    const email = String(emailInput?.value || '').trim()
    const password = String(passwordInput?.value || '')

    if (!email || !password) {
        setMessage('กรุณากรอกอีเมลและรหัสผ่าน')
        return
    }

    loginBtn.disabled = true
    setMessage('')

    try {
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password
        })

        if (error) throw error

        location.href = './dashboard.html'

    } catch (error) {
        setMessage(
            error?.message ||
            'เข้าสู่ระบบไม่สำเร็จ'
        )
    } finally {
        loginBtn.disabled = false
    }
}

loginBtn?.addEventListener('click', login)

passwordInput?.addEventListener('keydown', event => {
    if (event.key === 'Enter') login()
})
