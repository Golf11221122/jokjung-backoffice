JOKJUNG Back Office - Bulk Cost Sync V1.3 FIXED

แก้ Error:
column "updated_at" of relation "products" does not exist

สาเหตุ:
ตาราง public.products ของโปรเจกต์ไม่มีคอลัมน์ updated_at
V1.3 จึงอัปเดตเฉพาะ products.cost เท่านั้น

ติดตั้ง:
1) รัน sql/backoffice-bulk-cost-sync-v1.3.sql ใน Supabase SQL Editor
2) แทน js/bulk-cost-sync.js ด้วยไฟล์ V1.3
3) HTML ไม่ต้องแทน
4) Refresh หน้า Bulk Cost Sync
5) กด Preview ใหม่
6) ตรวจว่าต้อง Sync 26 รายการตามเดิม
7) กด "เลือกทั้งหมดที่ Sync ได้"
8) กด "Sync ต้นทุนที่เลือก"

V1.3 ยังคง:
- เปรียบเทียบต้นทุนที่ 2 ตำแหน่ง
- Sync เฉพาะ products.cost
- ไม่แก้ sale_items.unit_cost ย้อนหลัง
- ไม่สร้าง Recipe/BOM ใหม่
