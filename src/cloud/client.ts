// Supabase client for the cloud features (sign-in, stored diagrams, sharing).
// Without VITE_SUPABASE_* the editor keeps working as before, just without the cloud.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabase = url && key ? createClient(url, key) : null;
export const cloudEnabled = supabase !== null;
