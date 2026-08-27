import { supabase } from './supabase.js'


const state = {
    session: null,
    profile: null,
    branch: null,

    employees: [],
    filteredEmployees: [],

    selectedEmployee: null
}


const $ = id =>
    document.getElementById(id)


const el = {
    backBtn: $('backBtn'),
    logoutBtn: $('logoutBtn'),

    branchText: $('branchText'),
    userName: $('userName'),

    summaryAll: $('summaryAll'),
    summaryManagers: $('summaryManagers'),
    summaryStaff: $('summaryStaff'),
    summaryInactive: $('summaryInactive'),

    searchInput: $('searchInput'),
    roleFilter: $('roleFilter'),
    statusFilter: $('statusFilter'),

    clearFilterBtn: $('clearFilterBtn'),
    refreshBtn: $('refreshBtn'),

    resultCount: $('resultCount'),
    loadingState: $('loadingState'),
    emptyState: $('emptyState'),

    employeeTableWrap: $('employeeTableWrap'),
    employeeTableBody: $('employeeTableBody'),

    // ADD EMPLOYEE MODAL
    addEmployeeBtn: $('addEmployeeBtn'),
    addEmployeeModal: $('addEmployeeModal'),

    closeAddEmployeeBtn: $('closeAddEmployeeBtn'),
    cancelAddEmployeeBtn: $('cancelAddEmployeeBtn'),

    addFullName: $('addFullName'),
    addEmail: $('addEmail'),
    addPassword: $('addPassword'),
    addRole: $('addRole'),

    addManagerPinWrap: $('addManagerPinWrap'),
    addManagerPin: $('addManagerPin'),

    addEmployeeMessage: $('addEmployeeMessage'),
    saveNewEmployeeBtn: $('saveNewEmployeeBtn'),

    // EDIT MODAL
    editModal: $('editModal'),
    editUserId: $('editUserId'),
    closeEditBtn: $('closeEditBtn'),
    cancelEditBtn: $('cancelEditBtn'),

    editFullName: $('editFullName'),
    editRole: $('editRole'),
    editIsActive: $('editIsActive'),

    editMessage: $('editMessage'),
    saveEmployeeBtn: $('saveEmployeeBtn'),

    // PIN MODAL
    pinModal: $('pinModal'),
    pinEmployeeName: $('pinEmployeeName'),

    closePinBtn: $('closePinBtn'),
    cancelPinBtn: $('cancelPinBtn'),

    managerPinInput: $('managerPinInput'),
    managerPinConfirm: $('managerPinConfirm'),

    pinMessage: $('pinMessage'),
    savePinBtn: $('savePinBtn')
}


/* ========================================
   HELPERS
======================================== */

function esc(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;')
}


function message(
    target,
    text = '',
    type = 'error'
) {
    if (!target) {
        return
    }

    target.textContent =
        text

    target.style.color =
        type === 'success'
            ? '#188038'
            : '#d93025'
}


function roleLabel(role) {
    const map = {
        admin: 'Admin',
        manager: 'Manager',
        cashier: 'Cashier',
        staff: 'Staff',
        kitchen: 'Kitchen',
        stock: 'Stock'
    }

    return map[role] || role || '-'
}


function roleClass(role) {
    const map = {
        admin: 'badge-admin',
        manager: 'badge-manager',
        cashier: 'badge-cashier',
        staff: 'badge-staff',
        kitchen: 'badge-kitchen',
        stock: 'badge-stock'
    }

    return map[role] || 'badge-staff'
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

async function loadProfile(userId) {
    const {
        data,
        error
    } =
        await supabase
            .from('profiles')
            .select(`
                id,
                full_name,
                role,
                is_active,
                branch_id
            `)
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
            'ไม่พบข้อมูลผู้ใช้งาน'
        )
    }

    if (
        data.role !==
        'admin'
    ) {
        throw new Error(
            'เฉพาะ Admin เท่านั้นที่สามารถจัดการพนักงานได้'
        )
    }

    if (
        data.is_active ===
        false
    ) {
        throw new Error(
            'บัญชีนี้ถูกปิดใช้งาน'
        )
    }

    if (!data.branch_id) {
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
            .from('branches')
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
            'ไม่พบข้อมูลสาขา'
        )
    }

    state.branch =
        data
}


/* ========================================
   USER HEADER
======================================== */

function renderUser() {
    el.userName.textContent =
        state.profile.full_name
        ||
        state.session.user.email
            .split('@')[0]

    el.branchText.textContent =
        `สาขา: ${state.branch.name}`
}


/* ========================================
   LOAD EMPLOYEES
======================================== */

async function loadEmployees() {
    el.loadingState
        .classList
        .remove('hidden')

    el.emptyState
        .classList
        .add('hidden')

    el.employeeTableWrap
        .classList
        .add('hidden')

    try {
        const {
            data,
            error
        } =
            await supabase
                .from('profiles')
                .select(`
                    id,
                    full_name,
                    role,
                    is_active,
                    branch_id,
                    created_at
                `)
                .eq(
                    'branch_id',
                    state.profile.branch_id
                )
                .order(
                    'created_at',
                    {
                        ascending: true
                    }
                )

        if (error) {
            throw error
        }

        state.employees =
            data || []

        applyFilters()

    } catch (error) {
        console.error(
            'Load employees error:',
            error
        )

        el.emptyState.textContent =
            error.message ||
            'โหลดข้อมูลพนักงานไม่สำเร็จ'

        el.emptyState
            .classList
            .remove('hidden')

    } finally {
        el.loadingState
            .classList
            .add('hidden')
    }
}


/* ========================================
   FILTER
======================================== */

function applyFilters() {
    const keyword =
        el.searchInput.value
            .trim()
            .toLowerCase()

    const role =
        el.roleFilter.value

    const status =
        el.statusFilter.value

    state.filteredEmployees =
        state.employees.filter(
            employee => {

                const name =
                    String(
                        employee.full_name ||
                        ''
                    )
                        .toLowerCase()

                const keywordMatch =
                    !keyword
                    ||
                    name.includes(
                        keyword
                    )

                const roleMatch =
                    !role
                    ||
                    employee.role ===
                    role

                let statusMatch =
                    true

                if (
                    status ===
                    'active'
                ) {
                    statusMatch =
                        employee.is_active
                        !==
                        false
                }

                if (
                    status ===
                    'inactive'
                ) {
                    statusMatch =
                        employee.is_active
                        ===
                        false
                }

                return (
                    keywordMatch
                    &&
                    roleMatch
                    &&
                    statusMatch
                )
            }
        )

    renderEmployees()
    renderSummary()
}


/* ========================================
   SUMMARY
======================================== */

function renderSummary() {
    const list =
        state.employees

    const managers =
        list.filter(
            item =>
                item.role ===
                'manager'
        )

    const staff =
        list.filter(
            item =>
                item.role ===
                'staff'
        )

    const inactive =
        list.filter(
            item =>
                item.is_active ===
                false
        )

    el.summaryAll.textContent =
        list.length
            .toLocaleString(
                'th-TH'
            )

    el.summaryManagers.textContent =
        managers.length
            .toLocaleString(
                'th-TH'
            )

    el.summaryStaff.textContent =
        staff.length
            .toLocaleString(
                'th-TH'
            )

    el.summaryInactive.textContent =
        inactive.length
            .toLocaleString(
                'th-TH'
            )
}


/* ========================================
   RENDER EMPLOYEES
======================================== */

function renderEmployees() {
    const list =
        state.filteredEmployees

    el.resultCount.textContent =
        `${list.length.toLocaleString(
            'th-TH'
        )} รายการ`

    if (!list.length) {
        el.emptyState.textContent =
            'ไม่พบพนักงาน'

        el.emptyState
            .classList
            .remove('hidden')

        el.employeeTableWrap
            .classList
            .add('hidden')

        return
    }

    el.emptyState
        .classList
        .add('hidden')

    el.employeeTableWrap
        .classList
        .remove('hidden')

    el.employeeTableBody.innerHTML =
        list.map(
            employee => {

                const isSelf =
                    employee.id ===
                    state.profile.id

                const active =
                    employee.is_active
                    !==
                    false

                const pinText =
                    employee.role ===
                    'manager'
                        ? 'ตั้ง PIN ได้'
                        : '-'

                return `

                    <tr>

                        <td>

                            <span class="employee-name">
                                ${
                                    esc(
                                        employee.full_name ||
                                        'ยังไม่ได้ระบุชื่อ'
                                    )
                                }
                            </span>

                            <small class="employee-id">
                                ${
                                    esc(
                                        employee.id
                                    )
                                }
                            </small>

                        </td>


                        <td>

                            <span
                                class="
                                    badge
                                    ${roleClass(
                                        employee.role
                                    )}
                                "
                            >
                                ${
                                    roleLabel(
                                        employee.role
                                    )
                                }
                            </span>

                        </td>


                        <td>

                            <span
                                class="
                                    badge
                                    ${
                                        active
                                            ? 'badge-active'
                                            : 'badge-inactive'
                                    }
                                "
                            >
                                ${
                                    active
                                        ? 'เปิดใช้งาน'
                                        : 'ปิดใช้งาน'
                                }
                            </span>

                        </td>


                        <td>

                            <span
                                class="
                                    badge
                                    ${
                                        employee.role
                                        ===
                                        'manager'
                                            ? 'badge-pin'
                                            : 'badge-no-pin'
                                    }
                                "
                            >
                                ${pinText}
                            </span>

                        </td>


                        <td>

                            <div class="row-actions">

                                ${
                                    employee.role ===
                                    'manager'
                                    &&
                                    !isSelf
                                        ? `
                                            <button
                                                type="button"
                                                class="
                                                    action-btn
                                                    pin
                                                "
                                                data-pin-id="${
                                                    esc(
                                                        employee.id
                                                    )
                                                }"
                                            >
                                                ตั้ง PIN
                                            </button>
                                        `
                                        : ''
                                }


                                ${
                                    !isSelf
                                        ? `
                                            <button
                                                type="button"
                                                class="action-btn"
                                                data-edit-id="${
                                                    esc(
                                                        employee.id
                                                    )
                                                }"
                                            >
                                                แก้ไข
                                            </button>
                                        `
                                        : `
                                            <span
                                                style="
                                                    color:#999;
                                                    font-size:12px;
                                                "
                                            >
                                                บัญชีของคุณ
                                            </span>
                                        `
                                }

                            </div>

                        </td>

                    </tr>
                `
            }
        ).join('')
}


/* ========================================
   OPEN EDIT
======================================== */

function openEditModal(
    employeeId
) {
    const employee =
        state.employees.find(
            item =>
                item.id ===
                employeeId
        )

    if (!employee) {
        return
    }

    if (
        employee.id ===
        state.profile.id
    ) {
        alert(
            'ไม่สามารถแก้ไขบัญชี Admin ของตัวเองจากหน้านี้ได้'
        )

        return
    }

    state.selectedEmployee =
        employee

    el.editUserId.textContent =
        employee.id

    el.editFullName.value =
        employee.full_name ||
        ''

    el.editRole.value =
        [
            'manager',
            'cashier',
            'staff',
            'kitchen',
            'stock'
        ].includes(employee.role)
            ? employee.role
            : 'staff'

    el.editIsActive.checked =
        employee.is_active
        !==
        false

    message(
        el.editMessage,
        ''
    )

    el.editModal
        .classList
        .remove('hidden')

    setTimeout(
        () => {
            el.editFullName
                .focus()
        },
        100
    )
}


/* ========================================
   CLOSE EDIT
======================================== */

function closeEditModal() {
    el.editModal
        .classList
        .add('hidden')

    state.selectedEmployee =
        null

    message(
        el.editMessage,
        ''
    )
}


/* ========================================
   SAVE EMPLOYEE
======================================== */

async function saveEmployee() {
    const employee =
        state.selectedEmployee

    if (!employee) {
        return
    }

    const fullName =
        el.editFullName.value
            .trim()

    const role =
        el.editRole.value

    const isActive =
        el.editIsActive.checked

    if (!fullName) {
        message(
            el.editMessage,
            'กรุณากรอกชื่อพนักงาน'
        )

        el.editFullName
            .focus()

        return
    }

    if (
        ![
            'manager',
            'cashier',
            'staff',
            'kitchen',
            'stock'
        ].includes(
            role
        )
    ) {
        message(
            el.editMessage,
            'ตำแหน่งไม่ถูกต้อง'
        )

        return
    }

    el.saveEmployeeBtn.disabled =
        true

    el.saveEmployeeBtn.textContent =
        'กำลังบันทึก...'

    message(
        el.editMessage,
        ''
    )

    try {
        const {
            data,
            error
        } =
            await supabase.rpc(
                'admin_update_employee_v29',
                {
                    p_user_id:
                        employee.id,

                    p_full_name:
                        fullName,

                    p_role:
                        role,

                    p_is_active:
                        isActive
                }
            )

        if (error) {
            throw error
        }

        console.log(
            'Update employee:',
            data
        )

        closeEditModal()

        await loadEmployees()

        alert(
            'บันทึกข้อมูลพนักงานสำเร็จ'
        )

    } catch (error) {
        console.error(
            'Update employee error:',
            error
        )

        let text =
            error.message ||
            'บันทึกข้อมูลไม่สำเร็จ'

        if (
            text.includes(
                'ADMIN_REQUIRED'
            )
        ) {
            text =
                'เฉพาะ Admin เท่านั้นที่สามารถแก้ไขพนักงานได้'
        }

        if (
            text.includes(
                'INVALID_ROLE'
            )
        ) {
            text =
                'ตำแหน่งไม่ถูกต้อง'
        }

        if (
            text.includes(
                'CANNOT_EDIT_SELF'
            )
        ) {
            text =
                'ไม่สามารถแก้ไขบัญชีตัวเองจากหน้านี้ได้'
        }

        if (
            text.includes(
                'USER_NOT_FOUND'
            )
        ) {
            text =
                'ไม่พบพนักงาน'
        }

        if (
            text.includes(
                'BRANCH_NOT_ALLOWED'
            )
        ) {
            text =
                'ไม่สามารถแก้ไขพนักงานต่างสาขาได้'
        }

        message(
            el.editMessage,
            text
        )

    } finally {
        el.saveEmployeeBtn.disabled =
            false

        el.saveEmployeeBtn.textContent =
            'บันทึก'
    }
}


/* ========================================
   OPEN PIN MODAL
======================================== */

function openPinModal(
    employeeId
) {
    const employee =
        state.employees.find(
            item =>
                item.id ===
                employeeId
        )

    if (!employee) {
        return
    }

    if (
        employee.role !==
        'manager'
    ) {
        alert(
            'สามารถตั้ง PIN ได้เฉพาะ Manager'
        )

        return
    }

    state.selectedEmployee =
        employee

    el.pinEmployeeName.textContent =
        employee.full_name ||
        employee.id

    el.managerPinInput.value =
        ''

    el.managerPinConfirm.value =
        ''

    message(
        el.pinMessage,
        ''
    )

    el.pinModal
        .classList
        .remove('hidden')

    setTimeout(
        () => {
            el.managerPinInput
                .focus()
        },
        100
    )
}


/* ========================================
   CLOSE PIN
======================================== */

function closePinModal() {
    el.pinModal
        .classList
        .add('hidden')

    state.selectedEmployee =
        null

    el.managerPinInput.value =
        ''

    el.managerPinConfirm.value =
        ''

    message(
        el.pinMessage,
        ''
    )
}


/* ========================================
   SAVE MANAGER PIN
======================================== */

async function saveManagerPin() {
    const employee =
        state.selectedEmployee

    if (!employee) {
        return
    }

    const pin =
        el.managerPinInput.value
            .trim()

    const confirmPin =
        el.managerPinConfirm.value
            .trim()

    if (
        !/^\d{6}$/.test(
            pin
        )
    ) {
        message(
            el.pinMessage,
            'PIN ต้องเป็นตัวเลข 6 หลัก'
        )

        el.managerPinInput
            .focus()

        return
    }

    if (
        pin !==
        confirmPin
    ) {
        message(
            el.pinMessage,
            'PIN ทั้งสองช่องไม่ตรงกัน'
        )

        el.managerPinConfirm
            .focus()

        return
    }

    el.savePinBtn.disabled =
        true

    el.savePinBtn.textContent =
        'กำลังบันทึก...'

    message(
        el.pinMessage,
        ''
    )

    try {
        const {
            data,
            error
        } =
            await supabase.rpc(
                'admin_set_manager_pin',
                {
                    p_user_id:
                        employee.id,

                    p_manager_pin:
                        pin
                }
            )

        if (error) {
            throw error
        }

        console.log(
            'Set manager PIN:',
            data
        )

        closePinModal()

        alert(
            'ตั้ง PIN Manager สำเร็จ'
        )

    } catch (error) {
        console.error(
            'Set manager PIN error:',
            error
        )

        let text =
            error.message ||
            'ตั้ง PIN ไม่สำเร็จ'

        if (
            text.includes(
                'ADMIN_REQUIRED'
            )
        ) {
            text =
                'เฉพาะ Admin เท่านั้นที่ตั้ง PIN ได้'
        }

        if (
            text.includes(
                'INVALID_PIN_FORMAT'
            )
        ) {
            text =
                'PIN ต้องเป็นตัวเลข 6 หลัก'
        }

        if (
            text.includes(
                'CANNOT_EDIT_SELF'
            )
        ) {
            text =
                'ไม่สามารถตั้ง PIN ให้บัญชีตัวเองจากหน้านี้ได้'
        }

        if (
            text.includes(
                'USER_NOT_FOUND'
            )
        ) {
            text =
                'ไม่พบ Manager'
        }

        if (
            text.includes(
                'BRANCH_NOT_ALLOWED'
            )
        ) {
            text =
                'ไม่สามารถตั้ง PIN ให้ Manager ต่างสาขาได้'
        }

        if (
            text.includes(
                'MANAGER_REQUIRED'
            )
        ) {
            text =
                'ผู้ใช้นี้ไม่ได้เป็น Manager'
        }

        message(
            el.pinMessage,
            text
        )

    } finally {
        el.savePinBtn.disabled =
            false

        el.savePinBtn.textContent =
            'บันทึก PIN'
    }
}


/* ========================================
   ADD EMPLOYEE MODAL
======================================== */

function openAddEmployeeModal() {
    el.addFullName.value = ''
    el.addEmail.value = ''
    el.addPassword.value = ''
    el.addRole.value = 'staff'
    el.addManagerPin.value = ''

    el.addManagerPinWrap
        .classList
        .add('hidden')

    message(
        el.addEmployeeMessage,
        ''
    )

    el.addEmployeeModal
        .classList
        .remove('hidden')

    setTimeout(
        () => {
            el.addFullName
                .focus()
        },
        100
    )
}


function closeAddEmployeeModal() {
    el.addEmployeeModal
        .classList
        .add('hidden')

    el.addFullName.value = ''
    el.addEmail.value = ''
    el.addPassword.value = ''
    el.addRole.value = 'staff'
    el.addManagerPin.value = ''

    el.addManagerPinWrap
        .classList
        .add('hidden')

    message(
        el.addEmployeeMessage,
        ''
    )
}


function handleAddRoleChange() {
    if (
        el.addRole.value ===
        'manager'
    ) {
        el.addManagerPinWrap
            .classList
            .remove('hidden')
    } else {
        el.addManagerPinWrap
            .classList
            .add('hidden')

        el.addManagerPin.value = ''
    }
}


/* ========================================
   CLEAR FILTER
======================================== */

function clearFilters() {
    el.searchInput.value =
        ''

    el.roleFilter.value =
        ''

    el.statusFilter.value =
        ''

    applyFilters()
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

        // รีเซ็ตตัวกรองตอนเปิดหน้า
        el.searchInput.value = ''
        el.roleFilter.value = ''
        el.statusFilter.value = ''

        await loadEmployees()

    } catch (error) {
        console.error(
            'Employees init error:',
            error
        )

        el.loadingState
            .classList
            .add('hidden')

        el.emptyState
            .classList
            .remove('hidden')

        el.emptyState.textContent =
            error.message ||
            'โหลดข้อมูลไม่สำเร็จ'
    }
}


/* ========================================
   EVENTS
======================================== */

el.backBtn.onclick =
    () => {
        location.href =
            './dashboard.html'
    }


el.logoutBtn.onclick =
    logout


el.searchInput.oninput =
    applyFilters


el.roleFilter.onchange =
    applyFilters


el.statusFilter.onchange =
    applyFilters


el.clearFilterBtn.onclick =
    clearFilters


el.refreshBtn.onclick =
    loadEmployees


/* ADD EMPLOYEE MODAL */

el.addEmployeeBtn.onclick =
    openAddEmployeeModal


el.closeAddEmployeeBtn.onclick =
    closeAddEmployeeModal


el.cancelAddEmployeeBtn.onclick =
    closeAddEmployeeModal


el.addRole.onchange =
    handleAddRoleChange


el.employeeTableBody.onclick =
    event => {

        const editButton =
            event.target.closest(
                '[data-edit-id]'
            )

        if (editButton) {
            openEditModal(
                editButton.dataset.editId
            )

            return
        }

        const pinButton =
            event.target.closest(
                '[data-pin-id]'
            )

        if (pinButton) {
            openPinModal(
                pinButton.dataset.pinId
            )
        }
    }


/* EDIT MODAL */

el.closeEditBtn.onclick =
    closeEditModal


el.cancelEditBtn.onclick =
    closeEditModal


el.saveEmployeeBtn.onclick =
    saveEmployee


/* PIN MODAL */

el.closePinBtn.onclick =
    closePinModal


el.cancelPinBtn.onclick =
    closePinModal


el.savePinBtn.onclick =
    saveManagerPin


/* CLICK BACKDROP */

el.addEmployeeModal.onclick =
    event => {

        if (
            event.target ===
            el.addEmployeeModal
        ) {
            closeAddEmployeeModal()
        }
    }


el.editModal.onclick =
    event => {

        if (
            event.target ===
            el.editModal
        ) {
            closeEditModal()
        }
    }


el.pinModal.onclick =
    event => {

        if (
            event.target ===
            el.pinModal
        ) {
            closePinModal()
        }
    }


/* ESC */

document.addEventListener(
    'keydown',
    event => {

        if (
            event.key !==
            'Escape'
        ) {
            return
        }

        if (
            !el.addEmployeeModal
                .classList
                .contains('hidden')
        ) {
            closeAddEmployeeModal()

            return
        }

        if (
            !el.pinModal
                .classList
                .contains('hidden')
        ) {
            closePinModal()

            return
        }

        if (
            !el.editModal
                .classList
                .contains('hidden')
        ) {
            closeEditModal()
        }
    }
)


/* ========================================
   AUTH
======================================== */

supabase.auth.onAuthStateChange(
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

init()
