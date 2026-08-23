JOKJUNG KPI TARGETS V1.2 ACTUAL ENGINE

เพิ่ม Actual Engine: Sales, Daily Sales, Sales Growth, Average Bill, Bills/Day, Items/Bill, Theoretical Food Cost, Actual Food Cost (เมื่อมี closed inventory closing), Gross Margin, Labor %, Rent %, OPEX %, Prime Cost, Operating Margin, Waste %, Void %, Discount %, Cash Variance %, Closing Rate.

Actual ดึงจากข้อมูลจริง ไม่ต้องกรอกเอง.
Sales แสดง Target เต็มช่วง + Expected-to-date + Achievement + Remaining + Required/Day.
KPI ที่ระบบยังไม่มีข้อมูลฐาน เช่น Labor Hours / Break-even inputs จะขึ้น NO DATA แทนการเดา.

ติดตั้ง:
1) รัน sql/backoffice-kpi-targets-v1.sql ใหม่ (CREATE OR REPLACE ปลอดภัยกับ target เดิม)
2) แทน finance/kpi-targets.html
3) แทน js/kpi-targets.js
4) Refresh หน้า แล้วกด คำนวณผลจริง
