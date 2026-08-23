JOKJUNG BACK OFFICE — MOBILE / SHARE / PRINT V1.2

สิ่งที่เพิ่ม
- responsive.css ถูกโหลดในทุกหน้า Back Office รวมหน้า Login
- print.css ถูกโหลดในทุกหน้าหลัง Login
- ปรับ Header, Sidebar, KPI cards, Forms, Modals, Toolbars และตารางให้เหมาะกับมือถือ
- เพิ่ม Share + Print ให้หน้ารายงานและหน้าข้อมูลหลักที่เหมาะสม
- Sales History ใช้ปุ่ม Share/Print เฉพาะของหน้าเดิม ไม่สร้างปุ่มซ้ำ
- Print ใช้ A4 layout และซ่อน Sidebar/ปุ่มที่ไม่ต้องพิมพ์
- Share ใช้ Web Share API บน iPhone/Android และ fallback เป็น Copy Link

หน้าที่เพิ่ม Share + Print
Finance:
- Daily Closing
- End of Day
- Expenses
- KPI & Targets
- P&L
- Reconciliation
- Sales History (มีอยู่แล้ว)

Stock & Cost:
- Ingredients
- Movements
- Production / Prep
- Recipe / BOM
- Stock Count
- Stock Closing
- Stock Report
- Cost Control
- Sale Rules

Purchasing:
- Purchase Orders

สำคัญ
- ไม่ได้แก้ SQL/Supabase functions
- ไม่ได้แก้ business logic ของ POS/Back Office
- ไม่ได้ลบข้อมูลหรือเปลี่ยนชื่อไฟล์เดิม
- แตก ZIP แล้วนำโฟลเดอร์ jokjung-backoffice-main ไปทับ repository Back Office ปัจจุบันได้
