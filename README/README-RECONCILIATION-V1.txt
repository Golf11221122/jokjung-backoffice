JOKJUNG Back Office - Payment & Sales Reconciliation V1

ฐานข้อมูลจริงที่ใช้:
- sales.subtotal / discount / total
- sales.payment_method = cash / qr
- sales.received_amount / change_amount
- sales.status
- shifts.opened_at / opening_cash
- counted_cash / expected_cash / cash_difference จากระบบปิดกะเดิม (ถ้ามี)

สูตร:
Cash Net Received = Received - Change
Cash System Difference = Cash Net Received - Cash Sales
Sales Payment Difference = Net Sales - (Cash + QR)
Expected Cash per Shift = Opening Cash + Cash Sales
Cash Difference = Counted Cash - Expected Cash

ติดตั้ง:
1. รัน sql/backoffice-reconciliation-v1.sql
2. เพิ่ม finance/reconciliation.html
3. เพิ่ม js/reconciliation.js
4. แทนไฟล์เมนูใน ZIP หากต้องการให้เมนูแสดงทุกหน้า

หมายเหตุ:
create_pos_sale ปัจจุบันไม่ได้ INSERT shift_id ลง sales
V1 จึงผูก Sale เข้ากับกะด้วยช่วงเวลา opened_at -> closed_at
ซึ่งเป็นวิธีเดียวกับ shift.js เดิมที่รวมยอดขายตั้งแต่ opened_at

ไม่แก้ POS และไม่สร้าง Payment table ใหม่
