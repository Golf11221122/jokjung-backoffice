JOKJUNG ACCOUNTS PAYABLE V1.7

Flow:
Purchase Document -> 3-Way Match -> Approve for Payment -> Payment -> Paid

เพิ่ม:
- Finance > Accounts Payable
- เจ้าหนี้คงค้างรวม
- เกินกำหนด
- Due ภายใน 7 / 30 วัน
- Aging ตาม Due Date
- Approval: Pending / Approved / Hold / Rejected
- เอกสารที่มี PO ต้องผ่าน 3-Way Match ก่อน Approve
- จ่ายบางส่วนได้หลายครั้ง
- Payment History แบบ Ledger
- Payment Method + Reference No.
- Admin ย้อนรายการจ่ายได้โดยต้องใส่เหตุผล (ไม่ลบ Audit)
- Purchase Documents เปลี่ยน Paid Amount / Payment Status ให้มาจาก AP

ติดตั้ง:
1. Supabase SQL Editor รัน sql/PATCH_ACCOUNTS_PAYABLE_V1.7.sql
2. ต้องขึ้น JOKJUNG ACCOUNTS PAYABLE V1.7 READY
3. อัป ZIP ทับ Back Office
4. เข้า Finance > Accounts Payable
5. เปิดเอกสารที่ 3-Way Match ผ่าน -> อนุมัติจ่าย -> บันทึกการจ่าย
