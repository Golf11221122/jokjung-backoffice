JOKJUNG BACK OFFICE — V3.3 SALE STOCK RULES

เพิ่มหน้า:
stock/sale-rules.html

หน้าดังกล่าวใช้ตั้งกติกา:
- DINE-IN ต่อเมนู
- TAKEAWAY ต่อเมนู
- วัตถุดิบที่ตัดเพิ่มของ Modifier Option เช่น เส้น / พิเศษ

SQL ที่ต้องรัน:
sql/backoffice-stock-v3.3-sale-rules.sql

สำคัญ:
รัน SQL ก่อนเปิด POS เวอร์ชัน V3.3 เพราะ POS เปลี่ยน Checkout ไปใช้ jokjung_create_pos_sale_v33

Production / Prep ในชุดนี้ถูกแก้ให้:
- Standard Yield > 100% ได้
- Yield Basis เลือกหลาย Input ได้
- Actual Yield คำนวณจากผลรวม Basis

Product / Recipe ใน POS ถูกแก้ให้ต้นทุนเมนู Sync จาก BOM อัตโนมัติ
