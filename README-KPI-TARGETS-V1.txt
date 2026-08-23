JOKJUNG KPI & TARGET MANAGEMENT V1 COMPLETE

ติดตั้ง:
1) Supabase SQL Editor -> Run sql/backoffice-kpi-targets-v1.sql
2) Upload ไฟล์ใน ZIP ทับ Repository ตาม path
3) เปิด Back Office -> KPI & Targets

หลักการ:
- Admin เท่านั้นที่เพิ่ม/แก้/ลบ Target
- Back Office user ที่ผ่าน _bo_ctx อ่าน Target ได้
- รองรับ Daily / Weekly / Monthly / Quarterly / Yearly
- Direction: higher_better / lower_better / target_range
- KPI Presets 21 รายการ แต่ไม่มีการบังคับตัวเลขเป้าหมาย
- รองรับ THB / % / Count / Ratio
- ไม่แก้ POS, Kitchen, supabase.js, auth.js

ขั้นต่อไปที่ออกแบบไว้: KPI Actual Engine + Daily Closing + Executive Dashboard
