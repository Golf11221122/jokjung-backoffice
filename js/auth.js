import { supabase } from './supabase.js'

/*
=========================================================
JOKJUNG BACK OFFICE AUTH / SHELL RECOVERY V3.14

This file serves BOTH:
1) Login page
2) Back Office private pages

Exports required by the existing Back Office modules:
- requireBackoffice
- setupShell
- money
- number
- esc
=========================================================
*/

const PROJECT_ROOT =
    new URL(
        '../',
        import.meta.url
    )

const LOGIN_URL =
    new URL(
        'index.html',
        PROJECT_ROOT
    ).href

const DASHBOARD_URL =
    new URL(
        'dashboard.html',
        PROJECT_ROOT
    ).href


export function esc(
    value
) {

    return String(
        value ?? ''
    )
        .replaceAll(
            '&',
            '&amp;'
        )
        .replaceAll(
            '<',
            '&lt;'
        )
        .replaceAll(
            '>',
            '&gt;'
        )
        .replaceAll(
            '"',
            '&quot;'
        )
        .replaceAll(
            "'",
            '&#039;'
        )
}


export function money(
    value,
    fallback = 0
) {

    const amount =
        Number(
            value ?? fallback
        )

    const safeAmount =
        Number.isFinite(
            amount
        )
            ? amount
            : Number(
                fallback || 0
            )

    return new Intl.NumberFormat(
        'th-TH',
        {
            style: 'currency',
            currency: 'THB',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    )
        .format(
            safeAmount
        )
}


export function number(
    value,
    fallback = 0
) {

    const amount =
        Number(
            value ?? fallback
        )

    const safeAmount =
        Number.isFinite(
            amount
        )
            ? amount
            : Number(
                fallback || 0
            )

    return new Intl.NumberFormat(
        'th-TH',
        {
            maximumFractionDigits: 2
        }
    )
        .format(
            safeAmount
        )
}


function roleLabel(
    role
) {

    const labels = {
        admin: 'Admin',
        manager: 'Manager'
    }

    return (
        labels[
            String(
                role || ''
            )
                .trim()
                .toLowerCase()
        ]
        ||
        role
        ||
        '-'
    )
}


function redirectToLogin() {

    if (
        location.href
        !==
        LOGIN_URL
    ) {

        location.replace(
            LOGIN_URL
        )
    }
}


function redirectToDashboard() {

    if (
        location.href
        !==
        DASHBOARD_URL
    ) {

        location.replace(
            DASHBOARD_URL
        )
    }
}


export async function requireBackoffice() {

    try {

        const {
            data: sessionData,
            error: sessionError
        } =
            await supabase
                .auth
                .getSession()


        if (sessionError) {
            throw sessionError
        }


        const session =
            sessionData
                ?.session
            ||
            null


        if (
            !session
            ||
            !session.user
        ) {

            redirectToLogin()

            return null
        }


        const {
            data: profile,
            error: profileError
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
                    is_active,
                    branch_id
                    `
                )
                .eq(
                    'id',
                    session.user.id
                )
                .maybeSingle()


        if (profileError) {
            throw profileError
        }


        if (!profile) {

            throw new Error(
                'ไม่พบข้อมูลผู้ใช้งาน'
            )
        }


        const role =
            String(
                profile.role || ''
            )
                .trim()
                .toLowerCase()


        if (
            ![
                'admin',
                'manager'
            ].includes(
                role
            )
        ) {

            await supabase
                .auth
                .signOut()

            alert(
                'บัญชีนี้ไม่มีสิทธิ์เข้า Back Office'
            )

            redirectToLogin()

            return null
        }


        if (
            profile.is_active
            ===
            false
        ) {

            await supabase
                .auth
                .signOut()

            alert(
                'บัญชีนี้ถูกปิดใช้งาน'
            )

            redirectToLogin()

            return null
        }


        if (
            !profile.branch_id
        ) {

            throw new Error(
                'บัญชียังไม่ได้กำหนดสาขา'
            )
        }


        const {
            data: branch,
            error: branchError
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
                    profile.branch_id
                )
                .maybeSingle()


        if (branchError) {
            throw branchError
        }


        if (!branch) {

            throw new Error(
                'ไม่พบข้อมูลสาขา'
            )
        }


        return {
            session,
            user:
                session.user,
            profile: {
                ...profile,
                role
            },
            branch
        }


    } catch (error) {

        console.error(
            'Back Office auth error:',
            error
        )


        const message =
            error?.message
            ||
            'ตรวจสอบสิทธิ์ Back Office ไม่สำเร็จ'


        const messageElement =
            document.getElementById(
                'message'
            )


        if (messageElement) {

            messageElement.textContent =
                message
        } else {

            alert(
                message
            )
        }


        return null
    }
}


export function setupShell(
    ctx,
    activeNav = ''
) {

    if (!ctx) {
        return
    }


    const branchText =
        document.getElementById(
            'branchText'
        )

    const userName =
        document.getElementById(
            'userName'
        )

    const roleBadge =
        document.getElementById(
            'roleBadge'
        )

    const logoutBtn =
        document.getElementById(
            'logoutBtn'
        )

    const menuBtn =
        document.getElementById(
            'menuBtn'
        )

    const sidebar =
        document.getElementById(
            'sidebar'
        )


    if (branchText) {

        branchText.textContent =
            `สาขา: ${
                ctx.branch?.name
                ||
                '-'
            }`
    }


    if (userName) {

        userName.textContent =
            ctx.profile?.full_name
            ||
            ctx.user?.email
                ?.split('@')[0]
            ||
            '-'
    }


    if (roleBadge) {

        roleBadge.textContent =
            roleLabel(
                ctx.profile?.role
            )
    }


    document
        .querySelectorAll(
            '.nav-link'
        )
        .forEach(
            link => {

                const isActive =
                    link.dataset.nav
                    ===
                    activeNav


                link.classList.toggle(
                    'active',
                    isActive
                )


                if (
                    isActive
                ) {

                    link.setAttribute(
                        'aria-current',
                        'page'
                    )
                } else {

                    link.removeAttribute(
                        'aria-current'
                    )
                }
            }
        )


    if (logoutBtn) {

        logoutBtn.onclick =
            async () => {

                logoutBtn.disabled =
                    true


                try {

                    await supabase
                        .auth
                        .signOut()

                } catch (
                    error
                ) {

                    console.error(
                        'Logout error:',
                        error
                    )

                } finally {

                    location.replace(
                        LOGIN_URL
                    )
                }
            }
    }


    if (
        menuBtn
        &&
        sidebar
    ) {

        menuBtn.onclick =
            () => {

                sidebar.classList
                    .toggle(
                        'open'
                    )

                document.body
                    .classList
                    .toggle(
                        'sidebar-open',
                        sidebar.classList
                            .contains(
                                'open'
                            )
                    )
            }


        document.addEventListener(
            'click',
            event => {

                if (
                    window.innerWidth
                    >
                    900
                ) {
                    return
                }


                if (
                    !sidebar.classList
                        .contains(
                            'open'
                        )
                ) {
                    return
                }


                if (
                    sidebar.contains(
                        event.target
                    )
                    ||
                    menuBtn.contains(
                        event.target
                    )
                ) {
                    return
                }


                sidebar.classList
                    .remove(
                        'open'
                    )

                document.body
                    .classList
                    .remove(
                        'sidebar-open'
                    )
            }
        )


        document
            .querySelectorAll(
                '.nav-link'
            )
            .forEach(
                link => {

                    link.addEventListener(
                        'click',
                        () => {

                            sidebar.classList
                                .remove(
                                    'open'
                                )

                            document.body
                                .classList
                                .remove(
                                    'sidebar-open'
                                )
                        }
                    )
                }
            )
    }
}


/* ========================================
   LOGIN PAGE
======================================== */

function initLoginPage() {

    const emailInput =
        document.getElementById(
            'email'
        )

    const passwordInput =
        document.getElementById(
            'password'
        )

    const loginBtn =
        document.getElementById(
            'loginBtn'
        )

    const messageEl =
        document.getElementById(
            'message'
        )


    if (
        !emailInput
        ||
        !passwordInput
        ||
        !loginBtn
    ) {

        return
    }


    function setMessage(
        text = '',
        type = 'error'
    ) {

        if (!messageEl) {
            return
        }


        messageEl.textContent =
            text

        messageEl.dataset.type =
            type
    }


    async function login() {

        const email =
            String(
                emailInput.value || ''
            )
                .trim()
                .toLowerCase()

        const password =
            String(
                passwordInput.value || ''
            )


        if (
            !email
            ||
            !password
        ) {

            setMessage(
                'กรุณากรอกอีเมลและรหัสผ่าน'
            )

            return
        }


        loginBtn.disabled =
            true

        loginBtn.textContent =
            'กำลังเข้าสู่ระบบ...'

        setMessage(
            ''
        )


        try {

            const {
                data,
                error
            } =
                await supabase
                    .auth
                    .signInWithPassword(
                        {
                            email,
                            password
                        }
                    )


            if (error) {
                throw error
            }


            if (
                !data?.user
            ) {

                throw new Error(
                    'ไม่พบข้อมูลบัญชีผู้ใช้'
                )
            }


            /*
             * Validate Back Office permission before redirecting,
             * so a POS-only account does not land on a broken page.
             */
            const {
                data: profile,
                error: profileError
            } =
                await supabase
                    .from(
                        'profiles'
                    )
                    .select(
                        `
                        id,
                        role,
                        is_active,
                        branch_id
                        `
                    )
                    .eq(
                        'id',
                        data.user.id
                    )
                    .maybeSingle()


            if (profileError) {
                throw profileError
            }


            const role =
                String(
                    profile?.role || ''
                )
                    .trim()
                    .toLowerCase()


            if (
                !profile
                ||
                ![
                    'admin',
                    'manager'
                ].includes(
                    role
                )
            ) {

                await supabase
                    .auth
                    .signOut()

                throw new Error(
                    'บัญชีนี้ไม่มีสิทธิ์เข้า Back Office'
                )
            }


            if (
                profile.is_active
                ===
                false
            ) {

                await supabase
                    .auth
                    .signOut()

                throw new Error(
                    'บัญชีนี้ถูกปิดใช้งาน'
                )
            }


            if (
                !profile.branch_id
            ) {

                await supabase
                    .auth
                    .signOut()

                throw new Error(
                    'บัญชียังไม่ได้กำหนดสาขา'
                )
            }


            redirectToDashboard()


        } catch (error) {

            console.error(
                'Back Office login error:',
                error
            )


            let text =
                error?.message
                ||
                'เข้าสู่ระบบไม่สำเร็จ'


            if (
                String(text)
                    .toLowerCase()
                    .includes(
                        'invalid login credentials'
                    )
            ) {

                text =
                    'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
            }


            setMessage(
                text
            )


        } finally {

            loginBtn.disabled =
                false

            loginBtn.textContent =
                'เข้าสู่ระบบ'
        }
    }


    loginBtn.addEventListener(
        'click',
        login
    )


    passwordInput.addEventListener(
        'keydown',
        event => {

            if (
                event.key
                ===
                'Enter'
            ) {

                login()
            }
        }
    )


    /*
     * If an Admin/Manager already has a valid session,
     * let them go straight back to the Back Office.
     */
    supabase
        .auth
        .getSession()
        .then(
            async ({
                data
            }) => {

                if (
                    !data?.session
                ) {
                    return
                }


                const {
                    data: profile
                } =
                    await supabase
                        .from(
                            'profiles'
                        )
                        .select(
                            'role,is_active,branch_id'
                        )
                        .eq(
                            'id',
                            data.session.user.id
                        )
                        .maybeSingle()


                const role =
                    String(
                        profile?.role || ''
                    )
                        .trim()
                        .toLowerCase()


                if (
                    profile
                    &&
                    profile.is_active
                    !==
                    false
                    &&
                    profile.branch_id
                    &&
                    [
                        'admin',
                        'manager'
                    ].includes(
                        role
                    )
                ) {

                    redirectToDashboard()
                }
            }
        )
        .catch(
            error => {

                console.warn(
                    'Existing session check:',
                    error
                )
            }
        )
}


if (
    document.readyState
    ===
    'loading'
) {

    document.addEventListener(
        'DOMContentLoaded',
        initLoginPage,
        {
            once: true
        }
    )

} else {

    initLoginPage()
}
