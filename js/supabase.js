import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://fzijrnpoemivbthzghuz.supabase.co'

const SUPABASE_ANON_KEY = 'sb_publishable_macbRV6oHAwutZuOPgIBjQ_oRoO2eKo'

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