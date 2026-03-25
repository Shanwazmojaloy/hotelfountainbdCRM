import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { Lead, Transaction } from '../types';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL ?? 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY ?? 'placeholder';

export const supabase = createClient(supabaseUrl, supabaseKey);
