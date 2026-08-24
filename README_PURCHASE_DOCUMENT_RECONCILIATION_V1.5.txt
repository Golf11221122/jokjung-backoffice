JOKJUNG PURCHASE DOCUMENT RECONCILIATION V1.5

เพิ่ม:
- PO Reconciliation ใน Purchase Documents
- เทียบ Document Base (ยอดไม่รวม VAT) กับ PO Total
- VAT ไม่ถูกนับเป็นส่วนต่างของ PO
- Tolerance ±1 บาท
- สถานะ: ตรง / เอกสารสูงกว่า / เอกสารต่ำกว่า / ไม่มี PO
- เพิ่ม Shipping / Freight ในเอกสารซื้อ
- เลือก PO ในเอกสารใหม่ ระบบเติม Subtotal / Discount / Shipping จาก PO ให้
- KPI จำนวนเอกสารที่ตรง PO และมีส่วนต่าง
- เอกสารเดิม V1.4 ยังอยู่ครบ

ตัวอย่าง:
PO 1,000
Tax Invoice 1,070, VAT 70
Document Base = 1,000
=> MATCHED

ติดตั้ง:
1. รัน sql/PATCH_PURCHASE_DOCUMENT_RECONCILIATION_V1.5.sql
2. ต้องขึ้น JOKJUNG PURCHASE DOCUMENT RECONCILIATION V1.5 READY
3. อัป ZIP นี้ทับ Back Office
4. เปิด Purchase Documents แล้วเปิดเอกสารที่อ้างอิง PO
