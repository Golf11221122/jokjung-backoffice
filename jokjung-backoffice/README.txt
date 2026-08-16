JOKJUNG Back Office V1

ไฟล์หลัก
- index.html : Login
- dashboard.html : Dashboard Stock
- stock/ingredients.html : Ingredient / Stock Master + Receive / Issue / Waste / Adjust
- stock/movements.html : ประวัติ Stock Movement
- stock/recipes.html : Recipe / BOM จาก products + ingredients
- sql/backoffice-v1.sql : RPC สำหรับ Back Office
- js/supabase.js : เชื่อม Supabase เดียวกับ POS

ติดตั้ง
1) Supabase SQL Editor -> Run sql/backoffice-v1.sql
2) เปิด js/supabase.js
3) ใส่ SUPABASE_ANON_KEY ตัวเดียวกับ POS เดิม
4) Upload ไฟล์ทั้งหมดไป repository jokjung-backoffice โดยรักษาโฟลเดอร์
5) GitHub -> Settings -> Pages -> Deploy from branch -> main / root
6) เปิด GitHub Pages URL แล้ว Login ด้วยบัญชี Admin หรือ Manager เดิม

สิทธิ์
- Admin: เข้า Back Office ได้
- Manager: เข้า Back Office ได้
- Staff: ถูกปฏิเสธ

หลักการ Stock
- ingredients.current_stock = ยอดคงเหลือปัจจุบัน
- ทุกการปรับยอดผ่าน backoffice_adjust_stock จะสร้าง ingredient_stock_movements เสมอ
- ห้ามแก้ current_stock ตรงจากหน้าวัตถุดิบ
- Recipe ใช้ product_recipes เดิม จึงเชื่อมสินค้า POS โดยตรง

หมายเหตุ V1
- ยังไม่รวม Stock Count / Supplier / Purchasing / Cost Control เต็มรูปแบบ
- จะทำต่อหลังทดสอบ Stock Master + Recipe ให้เสถียรก่อน
