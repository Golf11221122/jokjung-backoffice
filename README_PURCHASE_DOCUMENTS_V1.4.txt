JOKJUNG PURCHASE DOCUMENTS / RECEIPT ARCHIVE V1.4

ระบบใหม่:
- เมนู Purchasing > Purchase Documents
- เก็บ Receipt / Tax Invoice / Invoice / Credit Note / Debit Note / Other
- เลขเอกสารภายในอัตโนมัติ PD-YYYYMMDD-####
- เชื่อม Supplier และ Purchase Order
- วันที่เอกสาร / Due Date
- Currency Code + Exchange Rate
- Subtotal / Discount / VAT Mode / VAT Rate / VAT Amount
- Withholding Tax / Total / Paid Amount / Balance Due
- Payment Method / Payment Status / Paid At
- แนบ PDF / JPG / PNG / WEBP สูงสุด 10MB ต่อไฟล์
- ไฟล์เก็บใน Supabase Private Storage
- เปิดไฟล์ผ่าน Signed URL ชั่วคราว
- RLS จำกัดตาม Branch และสิทธิ์ Admin/Manager

ติดตั้ง:
1) Supabase > SQL Editor
   รัน sql/PATCH_PURCHASE_DOCUMENTS_V1.4.sql
2) ผลสุดท้ายต้องขึ้น:
   JOKJUNG PURCHASE DOCUMENTS V1.4 READY
3) อัปโหลด ZIP ชุดนี้ทับ GitHub Back Office
4) เข้า Purchasing > Purchase Documents
5) สร้างเอกสารทดสอบ 1 ใบ และแนบรูป/PDF 1 ไฟล์

หมายเหตุ:
- ระบบนี้เก็บทั้งข้อมูล Structured Data และไฟล์ต้นฉบับ
- ไม่บังคับว่าต้องมี PO เพื่อรองรับการซื้อเงินสด/ร้านย่อย
- ถ้าเลือก PO และ Supplier ไม่ตรงกัน Backend จะ Block
