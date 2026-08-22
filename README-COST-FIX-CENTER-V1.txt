JOKJUNG Back Office - Cost Fix Center V1

ติดตั้งต่อจาก Cost Data Quality V1:
1) รัน sql/backoffice-cost-fix-center-v1.sql
2) เพิ่ม finance/cost-fix.html
3) เพิ่ม js/cost-fix.js
4) แทน js/recipes.js
   - เพิ่มความสามารถเปิด stock/recipes.html?product_id=... แล้วเลือกเมนูให้อัตโนมัติ
5) แทน dashboard.html / finance/expenses.html / finance/pnl.html / finance/cost-quality.html เพื่อเพิ่มเมนู

ระบบวิเคราะห์:
- PRODUCT_LINK_MISSING = Sale Item ไม่ผูก Product ปัจจุบัน
- NO_RECIPE = ไม่มี Recipe/BOM
- INGREDIENT_MISSING = Recipe อ้างวัตถุดิบหาย/ปิดใช้งาน
- INGREDIENT_COST_ZERO = วัตถุดิบใน Recipe มีต้นทุน 0
- PRODUCT_COST_NOT_SYNCED = Recipe มีต้นทุน แต่ products.cost ยัง 0
- SALE_COST_NOT_CAPTURED = ต้นทุนปัจจุบันมีแล้ว แต่ Sale เดิม snapshot unit_cost=0

สำคัญ:
Cost Fix Center ไม่แก้ตัวเลขย้อนหลังอัตโนมัติ
เพราะ sale_items.unit_cost เป็น snapshot ของต้นทุน ณ เวลาขาย
การแก้ Recipe/Ingredient จะทำให้ยอดขายใหม่ถูกต้องก่อน
ส่วนการ Backfill ยอดขายเก่า ควรทำเป็นงาน Audit แยก เพื่อไม่เขียนทับประวัติการเงินจริงโดยไม่ตรวจสอบ
