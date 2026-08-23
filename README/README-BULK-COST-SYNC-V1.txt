JOKJUNG Back Office - Bulk Cost Sync V1

ติดตั้ง:
1) รัน sql/backoffice-bulk-cost-sync-v1.sql
2) เพิ่ม finance/bulk-cost-sync.html
3) เพิ่ม js/bulk-cost-sync.js
4) แทน dashboard.html / finance/expenses.html / finance/pnl.html / finance/cost-quality.html / finance/cost-fix.html เพื่อเพิ่มเมนู

การทำงาน:
- Preview products.cost เทียบกับ SUM(product_recipes.quantity_used × ingredients.cost_per_unit)
- เลือกเฉพาะรายการที่ Sync ได้
- กด Sync เพื่ออัปเดต products.cost
- ไม่แตะ sale_items.unit_cost ย้อนหลัง

ควรทำหลัง Sync:
1) กลับ Cost Fix Center
2) Preview ใหม่
3) ปัญหา PRODUCT_COST_NOT_SYNCED ควรลดลง
4) ทดสอบขายบิลใหม่ 1 บิล
5) ตรวจ sale_items.unit_cost ของบิลใหม่ว่าไม่เป็น 0
