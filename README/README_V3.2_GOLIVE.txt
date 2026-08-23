JOKJUNG BACK OFFICE — STOCK V3.2 GO-LIVE

ทำไมใช้ Go-Live:
- ไม่ลบข้อมูลทดลอง
- ข้อมูลทดลองเดิมยังอยู่ใน Supabase
- ตั้งจุดเริ่มใช้งานจริงต่อสาขา
- ตั้ง Opening Stock จริง
- Stock Report / Production Summary เริ่มนับหลัง Go-Live
- Closing ห้ามเริ่มก่อน Go-Live

ติดตั้ง:
1. ต้องมี V3.1 Production ก่อน
2. Supabase SQL Editor: รัน sql/backoffice-stock-v3.2-golive.sql
3. ต้องขึ้น JOKJUNG STOCK V3.2 GO-LIVE READY
4. อัปโหลดไฟล์ในชุดนี้ตาม path เข้า GitHub
5. เข้า Back Office > Go-Live / Opening Stock

วิธีใช้ที่ปลอดภัย:
1. หยุดทดลองขาย/Production ก่อน
2. หน้า Go-Live ตั้งเวลาเป็นเวลาปัจจุบัน + 1 ถึง 2 นาที
3. กด “ตรวจสอบก่อน”
4. ต้องขึ้น Stock Movement 0 / Sales 0 / Production 0 หลังเวลาที่เลือก
5. นับ Stock จริง
6. กรอก Opening Qty และ Cost/Unit จริงให้ครบ
7. ช่องที่ไม่มีของให้ใส่ 0
8. กด “ยืนยัน Go-Live และตั้ง Opening Stock”
9. หลังสำเร็จ current_stock จะกลายเป็น Opening Stock จริง
10. ข้อมูลทดลองก่อน Go-Live ยังอยู่ ไม่ถูกลบ

ข้อควรระวัง:
- Go-Live เปิดได้ครั้งเดียวใน V3.2
- ต้องใช้ Admin เพื่อ Activate
- ถ้ามีธุรกรรมเกิดหลังเวลาที่เลือก ระบบจะ BLOCK
- อย่าเลือกเวลา Go-Live ย้อนกลับไปก่อนรายการทดลองล่าสุด
- Opening Stock จะเขียนทับจำนวน current_stock เดิม แต่เก็บ previous_test_qty ไว้ใน audit
- Movement opening ถูกเก็บแยกเป็น GO-LIVE OPENING STOCK
