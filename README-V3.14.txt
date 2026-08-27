JOKJUNG BACK OFFICE — LOGIN + DASHBOARD RECOVERY V3.14

ตรวจจากไฟล์จริง:
jokjung-backoffice-main.zip

สาเหตุที่พบ:
1. index.html เรียก ./css/login.css แต่ในโปรเจกต์ไม่มีไฟล์นี้
   -> หน้า Login จึงแสดงเป็น HTML ดิบตามรูป

2. JS ของ Back Office จำนวนมาก import จาก ./auth.js:
   - requireBackoffice
   - setupShell
   - money
   - number
   - esc

   แต่ auth.js ในโปรเจกต์ปัจจุบันเป็น Login-only และไม่ได้ export ฟังก์ชันเหล่านี้
   -> Dashboard และหน้า Back Office เกิด ES Module import error ตั้งแต่เริ่ม
   -> branchText ค้าง "กำลังโหลด..."
   -> ข้อมูลไม่โหลด
   -> setupShell ไม่ทำงาน
   -> Logout / Mobile menu / active nav ไม่ถูกผูก
   -> หลายหน้าของ Back Office ใช้งานไม่ได้พร้อมกัน

แก้ V3.14:
- เพิ่ม css/login.css ที่หายไป
- กู้ js/auth.js ให้รองรับทั้ง Login และ Back Office shell
- restore exports:
  requireBackoffice()
  setupShell()
  money()
  number()
  esc()
- ตรวจ session -> profiles -> branch
- Back Office อนุญาต Admin / Manager ตาม _bo_ctx() ใน SQL เดิม
- ตรวจ is_active และ branch_id
- setup Header: branch / user / role
- setup Logout
- setup Sidebar mobile toggle
- setup Active navigation
- หน้า Login ตรวจสิทธิ์ Back Office ก่อน redirect
- ใช้ Publishable Supabase client เดิม ไม่เพิ่ม service_role
- index cache-bust login.css/auth.js = v3.14.0

ไฟล์ใน ZIP (เฉพาะที่แก้/เพิ่ม):
1. index.html
2. css/login.css          [เพิ่มใหม่]
3. js/auth.js             [แทนเดิม]

ไม่ต้อง SQL
ไม่แก้ Supabase schema/RPC
ไม่แก้ Dashboard business calculation
ไม่แก้ Stock/Purchasing/Finance logic

VALIDATION:
- auth.js syntax: PASS
- required auth exports: PASS
- original project JS syntax: PASS 38/38

หลัง Deploy ทดสอบ:
1. เปิด Back Office Login บน iPhone -> CSS ต้องกลับมาปกติ
2. Login ด้วย Admin
3. Dashboard ต้องเปลี่ยน "กำลังโหลด..." เป็นชื่อสาขา
4. ค่า KPI ต้องโหลด หรือถ้า RPC มีปัญหาต้องแสดง error ที่ message
5. กด Refresh
6. กดเมนู Stock / Finance / Purchasing
7. กด Logout
8. Login ด้วย Manager (ถ้ามี) -> ต้องเข้า Back Office ได้
9. Cashier/Staff ไม่ควรเข้า Back Office

READY:
JOKJUNG BACKOFFICE LOGIN DASHBOARD RECOVERY V3.14 READY
