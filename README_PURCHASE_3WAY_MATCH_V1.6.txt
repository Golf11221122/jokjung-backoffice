JOKJUNG PURCHASE 3-WAY MATCH V1.6

ตรวจ 3 ฝั่ง:
1. Purchase Order
2. Goods Received (received_qty ใน PO)
3. Invoice / Receipt Items

สถานะ:
- 3-Way Match ผ่าน
- ยังไม่มี Invoice Items
- รายการสินค้าไม่ตรง
- ยังรับของไม่ครบ
- จำนวนไม่ตรง
- ราคาไม่ตรง
- ยอดรวมไม่ตรง
- ไม่มี PO

การใช้งาน:
1. เปิด Purchase Documents
2. เพิ่ม/เปิดเอกสารที่อ้างอิง PO
3. กด “ดึงรายการจาก PO”
4. แก้ Qty / ราคา ให้ตรงกับใบเสร็จหรือ Invoice จริง
5. บันทึก
6. ระบบตรวจ PO ↔ รับของ ↔ Invoice อัตโนมัติ

ติดตั้ง:
1. Supabase SQL Editor รัน sql/PATCH_PURCHASE_3WAY_MATCH_V1.6.sql
2. ต้องขึ้น JOKJUNG PURCHASE 3-WAY MATCH V1.6 READY
3. อัป ZIP ทับ Back Office
