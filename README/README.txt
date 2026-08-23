JOKJUNG Back Office - Expense Management V1

ติดตั้ง:
1) รัน sql/backoffice-expense-v1.sql ใน Supabase SQL Editor ด้วยบัญชี Admin/Manager ที่ login อยู่
2) เพิ่ม finance/expenses.html
3) เพิ่ม js/expenses.js
4) แทน dashboard.html เพื่อเพิ่มเมนู Finance > ค่าใช้จ่าย

ยังไม่ใช่ P&L เต็ม:
Expense V1 คือฐานข้อมูลค่าใช้จ่ายที่จะใช้ใน P&L V1 ขั้นถัดไป
ระบบ Stock / Cost Control เดิมไม่ได้ถูกแก้ไข


V1.1 FIX
- เอาคำสั่ง select public.backoffice_expense_seed_categories(); ออกจาก SQL
- สาเหตุ: Supabase SQL Editor ไม่มี auth.uid() ของผู้ใช้ Back Office
- หน้า js/expenses.js จะ seed หมวดค่าใช้จ่ายเองหลัง Login ผ่าน requireBackoffice()
- สามารถรัน SQL V1.1 ซ้ำได้
