JOKJUNG BACK OFFICE — STOCK V3 / COST CONTROL

ติดตั้งต่อจาก STOCK V2 ที่ทดสอบใช้งานสำเร็จแล้ว

1) Supabase → SQL Editor
   Run: sql/backoffice-stock-v3-cost-control.sql
   ถ้าสำเร็จต้องขึ้น:
   JOKJUNG STOCK V3 COST CONTROL READY

2) Upload โฟลเดอร์/ไฟล์ชุดนี้ทับ Repository เดิมตาม path ได้เลย

ไฟล์ที่แก้:
- dashboard.html
- css/stock-v2.css
- stock/ingredients.html
- js/ingredients.js
- stock/count.html
- js/stock-count.js
- stock/reports.html
- js/stock-reports.js
- stock/movements.html (อัปเดต sidebar)
- stock/recipes.html (อัปเดต sidebar)
- purchasing/suppliers.html (อัปเดต sidebar)
- purchasing/purchase-orders.html (อัปเดต sidebar)

ไฟล์ใหม่:
- stock/categories.html
- js/categories-stock.js
- stock/closing.html
- js/closing.js
- stock/cost-control.html
- js/cost-control.js
- sql/backoffice-stock-v3-cost-control.sql

ไม่ต้องแก้:
- js/supabase.js
- js/auth.js
- POS
- Kitchen

=== รอบตรวจนับ ===
Daily Count   = วัตถุดิบที่ตั้ง daily
Weekly Count  = daily + weekly
Monthly Count = ทุกวัตถุดิบ
Full Count    = ทุกวัตถุดิบ

=== สูตร Closing ===
Expected Qty =
Opening Qty
+ Stock In
+ Void/Return
+ Manual Adjust In
- Sale Usage
- Waste
- Manual Adjust Out

Variance Qty = Actual Count - Expected Qty
ค่าติดลบ = ของขาด
ค่าบวก = ของเกิน

=== Cost Control ===
Theoretical Cost = มูลค่า Stock Movement ประเภท sale

Actual Control Cost =
Theoretical Cost
+ Waste
+ Manual Adjust Out
+ Unexplained Shortage
- Manual Adjust In
- Overage

Theoretical Cost % = Theoretical Cost / Net Sales × 100
Actual Cost %      = Actual Control Cost / Net Sales × 100
Cost Gap %         = (Actual - Theoretical) / Net Sales × 100

=== Audit / Snapshot ===
- รอบที่ Closed จะใช้ Snapshot ที่เก็บไว้ ไม่เปลี่ยนตาม cost ปัจจุบัน
- เปิด Closed รอบเดิมได้เฉพาะ Admin และต้องใส่เหตุผล
- Stock Count adjustment ที่ note เริ่มด้วย "Stock Count " จะไม่ถูกนับซ้ำใน Expected
- Coverage = จำนวนวัตถุดิบที่ถูกนับจริง / วัตถุดิบทั้งหมด
- รายการที่ไม่ได้ถูกนับ Actual Qty จะแสดง "ยังไม่นับ"
- Actual/Estimated Closing รวม ใช้ Expected สำหรับรายการที่ไม่ได้ถูกนับ เพื่อไม่ให้มูลค่ารวมตก

=== ลำดับทดสอบ ===
1. หมวดวัตถุดิบ → ตรวจหมวดมาตรฐาน
2. วัตถุดิบ → กำหนดหมวด + รอบนับ
3. Stock Count → Daily/Weekly/Monthly ทดลอง 1 รอบ
4. Stock Report → เลือกช่วงเวลา + หมวด
5. ปิดรอบ Stock → เลือก Stock Count ที่ Completed
6. ตรวจ Raw Qty: ยกมา/รับเข้า/ขายใช้/เสีย/ปรับ/ควรเหลือ/นับจริง/ต่าง
7. ปิด Draft → Closed
8. Cost Control → ตรวจ Theo %, Actual %, Gap %, Waste, Shortage
