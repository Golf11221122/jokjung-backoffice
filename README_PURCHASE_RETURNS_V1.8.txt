JOKJUNG PURCHASE RETURNS / SUPPLIER CREDIT V1.8

Flow:
PO Received -> Purchase Return -> Stock OUT -> Supplier Credit -> ลด AP

เพิ่ม:
- Purchasing > Purchase Returns
- เลือก PO ที่รับของแล้ว
- ระบบคำนวณจำนวนที่คืนได้ = Received - Returned ก่อนหน้า
- ห้ามคืนเกิน Stock ปัจจุบัน
- ตัด Stock ด้วย movement adjust_out พร้อม note Purchase Return
- สร้างเลข PR-YYYYMMDD-####
- บันทึก Supplier Credit Note
- ถ้าเลือก Purchase Document/Invoice ระบบนำเครดิตไปลดเจ้าหนี้ทันที
- AP แสดง Supplier Credit แยกจาก Cash Payment
- ไม่แก้ยอด Invoice ต้นฉบับ และไม่ลบ Audit

ติดตั้ง:
1. Supabase SQL Editor รัน sql/PATCH_PURCHASE_RETURNS_V1.8.sql
2. ต้องขึ้น JOKJUNG PURCHASE RETURNS V1.8 READY
3. อัป ZIP ทับ Back Office
4. เข้า Purchasing > Purchase Returns
