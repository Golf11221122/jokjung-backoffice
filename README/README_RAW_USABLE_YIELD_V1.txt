JOKJUNG BACK OFFICE — RAW USABLE YIELD V1

แนวคิด
- cost_per_unit = ต้นทุนซื้อ/หน่วย (ใช้กับ PO, Stock Value, Production input)
- usable_yield_pct = % ที่ใช้ได้จริงของ Raw ที่ใช้ตรงใน Recipe/BOM
- effective_cost_per_unit = cost_per_unit / (usable_yield_pct/100) เฉพาะ Raw
- Prep ยังคงใช้ Production Yield เดิม ไม่ใช้ Raw Usable Yield

ตัวอย่าง
แตงกวา ซื้อ 1,000 g ราคา 40 บาท => cost_per_unit 0.0400 บาท/g
ใช้ได้จริง 900 g => usable_yield_pct = 90
Recipe cost ใช้ 0.0400 / 0.90 = 0.0444 บาท/g

สำคัญ
- Usable Yield ปรับ "ต้นทุน Recipe" ไม่ได้สร้าง Prep และไม่ได้ลด Stock อัตโนมัติ
- Stock Quantity ยังเป็นจำนวนจริงที่รับ/นับในคลัง
- Trim/Waste จริงให้ลง Waste หรือสะท้อนใน Stock Count เพื่อรักษา audit trail
- Production Raw -> Prep ใช้ต้นทุนซื้อของ Raw และ Production Yield ตามเดิม เพื่อไม่คิด loss ซ้ำสอง

ติดตั้ง
1) Supabase SQL Editor: รัน sql/PATCH_RAW_USABLE_YIELD_V1.sql
2) Upload โปรเจกต์ Back Office ชุดนี้ขึ้น GitHub
3) Refresh หน้า Stock > วัตถุดิบ
4) Raw ที่ไม่มี loss ตั้ง 100%; วัตถุดิบที่มี trimming ตั้งตาม % ใช้จริง
5) Recipe/BOM จะใช้ Effective Cost และ Sync products.cost อัตโนมัติ
