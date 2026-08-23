JOKJUNG Production / Prep Yield Fix

รวมการแก้ล่าสุดแล้ว:
- Standard Yield มากกว่า 100% ได้ (เช่น ข้าว 200%)
- Yield Basis เลือกได้หลาย Input
- Actual Yield คำนวณจากผลรวมของ Yield Basis ที่เลือก
- ใช้กับ Production / Prep และ Production Batch

ถ้า Supabase ตัวปัจจุบันได้รัน SQL แก้ Yield ล่าสุดแล้ว ไม่จำเป็นต้องรันซ้ำ
ถ้าติดตั้งฐานข้อมูลใหม่ ให้รัน sql/PATCH_PRODUCTION_YIELD_OVER_100_MULTI_BASIS.sql
