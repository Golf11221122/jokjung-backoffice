import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://fzjrnpoemivbthzghuz.supabase.co'

// นำ anon/public key ตัวเดียวกับที่ POS ใช้อยู่มาใส่ตรงนี้
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6aWpybnBvZW1pdmJ0aHpnaHV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNTgxODMsImV4cCI6MjA5OTkzNDE4M30.m__-bDtgwEBjLD2hP3ereeNBtQ_CUztQFLPel6u5HMo'

if (SUPABASE_ANON_KEY.includes('PASTE_')) {
    console.warn('')
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
