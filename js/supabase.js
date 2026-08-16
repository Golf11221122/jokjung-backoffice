import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://fzjrnpoemivbthzghuz.supabase.co'

// นำ anon/public key ตัวเดียวกับที่ POS ใช้อยู่มาใส่ตรงนี้
const SUPABASE_ANON_KEY = 'sb_publishable_macbRV6oHAwutZuOPgIBjQ_oRoO2eKo'

if (SUPABASE_ANON_KEY.includes('PASTE_')) {
    console.warn('sb_publishable_macbRV6oHAwutZuOPgIBjQ_oRoO2eKo')
}

export const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    }
)
