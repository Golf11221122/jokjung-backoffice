import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://fzjrnpoemivbthzghuz.supabase.co'

// นำ anon/public key ตัวเดียวกับที่ POS ใช้อยู่มาใส่ตรงนี้
const SUPABASE_ANON_KEY = 'https://fzijrnpoemivbthzghuz.supabase.co'

if (SUPABASE_ANON_KEY.includes('PASTE_')) {
    console.warn('https://fzijrnpoemivbthzghuz.supabase.co')
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
