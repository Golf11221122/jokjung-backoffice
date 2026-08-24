JOKJUNG CASH FLOW DASHBOARD V2.0

เพิ่ม:
- Finance > Cash Flow
- เงินเข้าจริงจาก Sales
- เงินออกจริงจาก Operating Expenses
- เงินออกจริงจาก Accounts Payable Payments
- Actual Net Cash Flow
- Planned Supplier Payments
- Net หลังแผนจ่าย
- รายวัน + รายละเอียดเงินออก

แก้ Payment Forecast:
- วางแผนจ่ายได้เฉพาะ AP Approval = Approved
- Pending จะขึ้น “รออนุมัติ AP”
- Backend Block ด้วย AP_NOT_APPROVED

หมายเหตุ:
Net หลังแผนจ่ายเป็นกระแสเงินสุทธิ ไม่ใช่ยอดเงินคงเหลือธนาคาร/เงินสดหน้าร้าน

ติดตั้ง:
1) รัน sql/PATCH_CASH_FLOW_DASHBOARD_V2.0.sql
2) ต้องขึ้น JOKJUNG CASH FLOW DASHBOARD V2.0 READY
3) อัป ZIP ทับ Back Office
4) เข้า Finance > Cash Flow
