P&L V2 FULL
1. ต้องติดตั้ง Expense V1.1 และ P&L V1 อยู่แล้ว
2. รัน sql/backoffice-pnl-v2.1-full-fixed.sql
3. แทน finance/pnl.html และ js/pnl.js
4. ไม่ต้องแก้ Stock/Cost Control เดิม

P&L หลัก:
- Revenue จาก sales
- Theoretical COGS จาก sale_items.unit_cost × quantity
- Gross Profit / Gross Margin
- Operating Expenses แยกหมวด
- Operating Profit / Margin
- Food Cost รายเมนู

Actual Stock Cost:
- อ่าน inventory_closings เฉพาะ status=closed และ period อยู่ในช่วงวันที่เลือก
- แสดง Actual Control COGS, Actual Food Cost, Count Coverage และกำไรแบบ Actual
- ถ้ายังไม่มี Closing จะไม่เดาตัวเลข และ P&L หลักยังใช้ Theoretical COGS

หมายเหตุสำคัญ:
ระบบ Stock เดิมยังเป็นเจ้าของ Supplier → PO → Receive → Recipe/BOM → Sale → Waste/Adjust → Count → Closing
P&L เป็นรายงานอ่านข้อมูล ไม่สร้าง Stock/COGS ระบบใหม่ซ้ำ


V2.1 FIX
- แก้ PostgreSQL syntax error ใกล้คำว่า day ใน daily summary
- เปลี่ยน alias เป็น sale_date / expense_day / report_date และใส่ AS ชัดเจน
- ไม่มี TEST SELECT ท้าย SQL
- สามารถรันไฟล์ V2.1 ซ้ำได้
