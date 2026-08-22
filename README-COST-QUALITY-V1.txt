JOKJUNG Back Office - Cost Data Quality V1

ติดตั้ง:
1) รัน sql/backoffice-cost-quality-v1.sql
2) เพิ่ม finance/cost-quality.html
3) เพิ่ม js/cost-quality.js
4) แทน dashboard.html / finance/expenses.html / finance/pnl.html เพื่อเพิ่มเมนู

ตรวจ:
- Cost Completeness จากเมนูที่มีการขาย
- เมนูที่ COGS = 0
- มูลค่ายอดขายที่ได้รับผลกระทบจาก COGS = 0
- Stock Count Coverage จาก inventory_closings
- Readiness Score ของ P&L

หมายเหตุ:
V1 ไม่สร้าง Cost หรือ Stock ชุดใหม่ เป็นรายงานตรวจข้อมูลเดิมเท่านั้น
