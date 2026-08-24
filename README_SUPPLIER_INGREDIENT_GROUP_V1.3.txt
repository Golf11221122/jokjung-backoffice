JOKJUNG SUPPLIER INGREDIENT GROUP V1.3

เพิ่ม:
- หน้า Supplier มีปุ่ม 📦 วัตถุดิบ
- สามารถเลือกวัตถุดิบที่ Supplier แต่ละรายขาย
- วัตถุดิบ 1 รายการอยู่ได้หลาย Supplier
- หน้า Purchase Orders เมื่อเลือก Supplier จะแสดงเฉพาะวัตถุดิบในกลุ่ม Supplier นั้น
- ถ้า Supplier ยังไม่มีกลุ่มวัตถุดิบ ระบบจะแจ้งให้ไปกำหนดก่อน
- PO เดิมยังเปิดแก้ได้แม้ mapping เปลี่ยน

ติดตั้ง:
1) Supabase SQL Editor รัน sql/PATCH_SUPPLIER_INGREDIENT_GROUP_V1.3.sql
2) ต้องขึ้น JOKJUNG SUPPLIER INGREDIENT GROUP V1.3 READY
3) อัปโหลด ZIP นี้ทับโปรเจกต์ Back Office
4) เข้า Purchasing > Supplier > กด 📦 วัตถุดิบ และจัดกลุ่มก่อน
5) เข้า Purchase Orders > สร้าง PO > เลือก Supplier
