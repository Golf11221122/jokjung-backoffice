JOKJUNG RAW USABLE YIELD V1.2 - COST CONTROL

สิ่งที่แก้
1. เพิ่ม js/cost-control.js ที่หายจาก ZIP เดิม
2. Cost Control ใช้ RPC V3.1 และ fallback V3
3. Stock Movement ประเภท sale ใช้ Effective Cost สำหรับ Raw
4. Sale Rule deduction snapshot ใช้ Effective Cost เดียวกัน
5. Prep และประเภทอื่นไม่โดน Raw Yield ซ้ำ
6. ธุรกรรมเก่าไม่ถูกแก้ย้อนหลัง

ติดตั้ง
1. Supabase SQL Editor: รัน sql/PATCH_RAW_YIELD_COST_CONTROL_V1.2.sql
2. ต้องขึ้น JOKJUNG RAW YIELD COST CONTROL V1.2 READY
3. อัปโหลด ZIP Back Office ชุดนี้ทับโปรเจกต์ Back Office
4. เปิด Stock & Cost > Cost Control แล้ว Refresh
