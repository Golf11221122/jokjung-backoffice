JOKJUNG BACK OFFICE — STOCK V3.1 PRODUCTION / RAW INGREDIENT

เงื่อนไข:
- ใช้ต่อจาก Stock V3 Cost Control ที่รันสำเร็จแล้ว
- ไม่ต้องแก้ POS / Kitchen / js/supabase.js / js/auth.js
- ชุดนี้แก้ error เดิม Cannot access 'freqText' before initialization แล้ว

============================================================
1) รัน SQL ก่อน
============================================================
Supabase > SQL Editor
รันไฟล์:
sql/backoffice-stock-v3.1-production.sql

ผลสุดท้ายต้องขึ้น:
JOKJUNG STOCK V3.1 PRODUCTION READY

============================================================
2) อัปโหลดไฟล์ตาม path เข้า GitHub
============================================================

ไฟล์หลักที่แก้/เพิ่ม:
stock/ingredients.html
js/ingredients.js

stock/production.html            [ใหม่]
js/production.js                 [ใหม่]

stock/recipes.html
js/recipes.js

stock/movements.html
js/movements.js

stock/reports.html
js/stock-reports.js

stock/closing.html
js/closing.js

stock/cost-control.html
js/cost-control.js

stock/count.html
js/stock-count.js

dashboard.html
css/stock-v2.css

ไฟล์ V2/V3 อื่นที่อยู่ใน ZIP ให้คงไว้ตามโครงเดิม

============================================================
3) ประเภทวัตถุดิบ
============================================================
raw         = ของดิบ/ของซื้อเข้าที่ใช้เป็นวัตถุดิบ
prep        = ของที่ร้านผลิต/เตรียม เช่น หมูแดง น้ำซุป ซอส
beverage    = เครื่องดื่ม
packaging   = บรรจุภัณฑ์
consumable  = ของใช้สิ้นเปลือง

วัตถุดิบเดิมจะเริ่มเป็น raw และแก้ประเภทได้ที่หน้า วัตถุดิบ / Stock

สำหรับ Prep สามารถกำหนด Standard Yield % เช่น:
หมูดิบ 10,000 g -> หมูแดงมาตรฐาน 7,500 g
Standard Yield = 75%

============================================================
4) Production / Prep Workflow
============================================================
A. สร้าง Prep ingredient ก่อน
ตัวอย่าง:
ชื่อ: หมูแดง
ประเภท: Prep
หน่วย: g
Standard Yield: 75%

B. ไป Production / Prep
สร้างสูตร Prep:
Output: หมูแดง
Inputs:
- หมูดิบ 10,000 g [Yield Basis]
- เครื่องปรุง 500 g
Standard Output: 7,500 g
Standard Yield: 75%

C. บันทึก Batch จริง
Input จริง:
- หมูดิบ 10,000 g
- เครื่องปรุง 500 g
Output จริง:
- หมูแดง 7,200 g

ระบบทำทันที:
- ตัด Stock Input ด้วย production_out
- เพิ่ม Stock Prep ด้วย production_in
- คำนวณ Total Input Cost
- คำนวณต้นทุน Prep ต่อหน่วย
- Weighted Average Cost กับ Prep Stock เดิม
- คำนวณ Actual Yield
- คำนวณ Yield Variance
- คำนวณ Yield Loss Value

============================================================
5) Recipe / BOM ของเมนู
============================================================
เมนู POS สามารถใช้ Raw หรือ Prep ได้

แนะนำ:
ถ้าวัตถุดิบผ่านการแปรรูปก่อนขาย ให้ Recipe เมนูใช้ Prep
ตัวอย่าง:
หมูดิบ -> Production -> หมูแดง -> Recipe ข้าวหมูแดง

ทำให้ต้นทุนเมนูเปลี่ยนตามต้นทุน Production จริง

============================================================
6) Stock Closing สูตรใหม่
============================================================
Expected Stock =
Opening
+ Purchase / Stock In
+ Production In
+ Void / Return
+ Adjust In
- Production Out
- Sale Usage
- Waste
- Adjust Out

Variance =
Actual Count - Expected Stock

Production In/Out เป็น internal conversion
จึงไม่ถือเป็นการซื้อหรือยอดขาย แต่ใช้เพื่อ reconcile Raw กับ Prep

============================================================
7) Cost Control
============================================================
แสดงเพิ่ม:
- Production Yield Loss
- Waste
- Stock Shortage
- Theoretical Cost
- Actual Control Cost
- Cost Gap %

หมายเหตุ:
Yield Loss ถูกแสดงเป็น KPI วิเคราะห์การผลิต
แต่ไม่ถูกบวกซ้ำเข้า Actual Control Cost เพราะต้นทุน Input ถูกกระจายเข้า Prep Unit Cost แล้ว
จึงป้องกันการนับ Cost ซ้ำ

============================================================
8) Stock Report V3.1
============================================================
รองรับ filter:
- วันที่
- หมวด
- Ingredient Type
- Search

ตัวเลข:
- Current Stock / Value
- Stock In Qty / Value
- Production In Qty / Value
- Production Out Qty / Value
- Sale Usage Qty / Value
- Waste Qty / Value
- Adjust In / Out
- Production Batch
- Average Yield
- Yield Loss

============================================================
9) ลำดับทดสอบ
============================================================
1. รัน SQL V3.1
2. รีเฟรชหน้า Ingredients
3. แก้วัตถุดิบตัวหนึ่งเป็น Raw
4. สร้างวัตถุดิบใหม่ประเภท Prep
5. กำหนด Standard Yield
6. สร้าง Prep Recipe
7. บันทึก Production Batch เล็กๆ
8. เช็ก Raw Stock ต้องลด
9. เช็ก Prep Stock ต้องเพิ่ม
10. เช็ก Stock Movement:
    production_out
    production_in
11. เช็ก Prep cost_per_unit
12. เช็ก Recipe/BOM ของเมนู
13. เช็ก Stock Report
14. ทำ Stock Count
15. สร้าง Draft Closing และกดคำนวณใหม่
16. ตรวจ Production In / Out และ Yield Loss
17. ปิดรอบ
18. เช็ก Cost Control

============================================================
10) การควบคุมข้อมูล
============================================================
- Production Batch Post เป็น transaction เดียว
- ถ้า Input Stock ไม่พอ จะไม่ Post
- Output ต้องเป็น Prep
- Output ห้ามเป็น Input ของ Batch เดียวกัน
- Input ในสูตร/Batch ห้ามซ้ำ
- Yield Basis เลือกได้ 1 รายการ
- Production History เก็บ Batch + Input Cost snapshot
- Closing ที่ปิดแล้วเก็บ Snapshot ตามระบบ V3
