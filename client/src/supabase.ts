import { createClient } from '@supabase/supabase-js';

// In cloud mode, these are set. In local mode, they're empty and Supabase is not used.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isCloudMode = !!supabaseUrl;

export const supabase = isCloudMode
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
