JOKJUNG Back Office - P&L V1

ติดตั้งต่อจาก Expense V1.1:
1) รัน sql/backoffice-pnl-v1.sql ใน Supabase SQL Editor
   - ไม่มี TEST SELECT ท้ายไฟล์ จึงไม่เกิด BACKOFFICE_PERMISSION_DENIED จาก SQL Editor
2) เพิ่ม finance/pnl.html
3) เพิ่ม js/pnl.js
4) แทน dashboard.html
5) แทน finance/expenses.html เพื่อเพิ่มเมนู P&L

สูตร V1:
Revenue = sales.total ของสาขา เฉพาะ sale ที่ status ไม่ใช่ cancelled
COGS = sale_items.unit_cost × quantity ของ sale เดียวกัน
Gross Profit = Revenue - COGS
Operating Expenses = operating_expenses เฉพาะ status=active
Operating Profit = Gross Profit - Operating Expenses

หมายเหตุ:
P&L V1 ใช้ COGS แบบเดียวกับ Dashboard POS ปัจจุบัน (sale_items.unit_cost × quantity)
ยังไม่ใช่ Periodic Inventory COGS จาก Opening + Purchases - Closing Stock
