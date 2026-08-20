JOKJUNG BACK OFFICE — STOCK V2 FULL CYCLE

ไฟล์ที่ต้องแก้/เพิ่ม (ทุกไฟล์ในชุดนี้เป็น .txt ตามที่ขอ)

รันก่อน:
01_SQL_backoffice-stock-v2.sql.txt

แทนไฟล์เดิม:
03_stock_ingredients.html.txt  -> stock/ingredients.html
04_js_ingredients.js.txt      -> js/ingredients.js
05_stock_movements.html.txt    -> stock/movements.html
06_js_movements.js.txt         -> js/movements.js
07_stock_recipes.html.txt      -> stock/recipes.html
08_js_recipes.js.txt           -> js/recipes.js
17_dashboard.html.txt          -> dashboard.html

เพิ่มไฟล์ใหม่:
02_CSS_stock-v2.css.txt         -> css/stock-v2.css
09_purchasing_suppliers.html.txt -> purchasing/suppliers.html
10_js_suppliers.js.txt          -> js/suppliers.js
11_purchasing_purchase-orders.html.txt -> purchasing/purchase-orders.html
12_js_purchase-orders.js.txt    -> js/purchase-orders.js
13_stock_count.html.txt         -> stock/count.html
14_js_stock-count.js.txt        -> js/stock-count.js
15_stock_reports.html.txt       -> stock/reports.html
16_js_stock-reports.js.txt      -> js/stock-reports.js
18_js_dashboard-stock-v2.js.txt -> js/dashboard-stock-v2.js

ยังไม่ต้องแก้:
- js/supabase.js
- js/auth.js
- index.html
- POS / Kitchen
เพราะ POS เดิมมีการตัด ingredient_stock_movements จากการขายอยู่แล้ว

วงจรหลังติดตั้ง:
Supplier
  -> Purchase Order
  -> ยืนยันสั่ง
  -> รับของ (รับบางส่วนได้)
  -> Stock In + Movement
  -> ต้นทุนวัตถุดิบ Weighted Average
  -> Recipe/BOM
  -> POS ขาย
  -> Stock ลด
  -> Waste / Adjust
  -> Stock Count
  -> Variance Adjustment
  -> Stock Report / Dashboard

ทดสอบตามลำดับ:
1. Supplier: เพิ่ม Supplier 1 ราย
2. PO: สร้าง PO วัตถุดิบ 1-2 รายการ
3. ยืนยันสั่ง PO
4. รับของ
5. ตรวจ stock/ingredients ว่ายอดเพิ่ม
6. ตรวจ Stock Movement ต้องมี stock_in
7. Stock Count: สร้างรายการนับ -> กรอกจริง -> Complete
8. ตรวจ Movement ต้องมี adjust_in/adjust_out หากยอดต่าง
9. Stock Report และ Dashboard ต้องอัปเดต

หมายเหตุ:
- ชื่อวัตถุดิบซ้ำในสาขาเดียวกันถูกบล็อก
- PO Draft เท่านั้นที่แก้ไขได้
- การรับของรองรับ Partial Receive
- ต้นทุนตอนรับของใช้ Weighted Average Cost
- Stock Count จะสร้าง Movement เพื่อ Audit
- ข้อมูลย้อนหลัง Movement ไม่ถูกลบ
