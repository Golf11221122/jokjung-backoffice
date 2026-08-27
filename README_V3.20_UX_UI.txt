JOKJUNG BACK OFFICE — V3.20 PROFESSIONAL UX/UI
================================================

ปรับปรุงหลัก
1) เปลี่ยน shell ให้เป็นโทน Professional: Navy / White / Gold accent
2) Sidebar / Topbar / Cards / Tables / Forms ใช้มาตรฐานเดียวกัน
3) ปุ่มทุกปุ่มมี tactile pressed state เมื่อแตะ/คลิก
4) ปุ่ม action มีเครื่องหมาย ✓ และข้อความ “กดแล้ว” ชั่วคราว เพื่อรู้ทันทีว่าระบบรับการแตะ
5) เมื่อ logic เดิม disable ปุ่มระหว่างทำงาน จะมี spinner ผ่าน aria-busy โดยไม่เปลี่ยน business logic
6) ปุ่ม disabled แสดงสถานะชัดเจนและมี tooltip
7) เพิ่ม focus-visible สำหรับ keyboard / accessibility
8) เพิ่ม mobile sidebar scrim แตะพื้นที่มืดเพื่อปิดเมนูได้
9) ปรับ touch target บนมือถือให้ใหญ่ขึ้น
10) ซ่อมไฟล์ css/employees.css ที่หายจาก ZIP เดิม

ไฟล์ใหม่
- css/ui-pro-v3.20.css
- js/ui-feedback-v3.20.js
- css/employees.css (restore compatibility)

หลักการความปลอดภัย
- ไม่แก้ RPC / SQL / Supabase business logic
- ไม่แก้ schema หรือข้อมูล
- ไม่แก้ EOD / Business Date repair ที่ทำไปแล้ว
- เป็น UX/UI enhancement layer โหลดท้าย CSS/JS ของแต่ละหน้า

หมายเหตุ
คำว่า “กดแล้ว” หมายถึง UI รับ click/tap แล้ว ไม่ได้หมายถึง backend สำเร็จ
ผลสำเร็จ/ผิดพลาดจริงยังใช้ message / alert / modal เดิมของแต่ละฟังก์ชัน
================================================
