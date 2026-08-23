JOKJUNG Back Office - Bulk Cost Sync V1.2 FIXED

1) รัน sql/backoffice-bulk-cost-sync-v1.2.sql
2) แทน js/bulk-cost-sync.js ด้วยไฟล์ V1.2
3) HTML ใช้ไฟล์เดิมได้
4) Refresh หน้า แล้วกด Preview ใหม่

V1.2:
- SQL คำนวณ current_cost, recipe_cost และ difference ที่ 2 ตำแหน่งจากแหล่งเดียวกัน
- needs_sync = syncable AND difference_2dp <> 0
- JS ตรวจ server version ต้องเป็น 1.2
- JS มี defensive check ไม่เลือก difference = 0
- Apply ใช้ต้นทุน 2 ตำแหน่งแบบเดียวกับ Preview
- ไม่แก้ sale_items.unit_cost ย้อนหลัง

ก่อนกด Sync:
รายการที่ ฿21.54 -> ฿21.54 ต้องไม่ถูกเลือก และสถานะต้องเป็น "ตรงแล้ว"
