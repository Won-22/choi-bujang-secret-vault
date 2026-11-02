import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with { type: 'json' };

let client;
const db = () => {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return null;
  client ??= createClient(config.identityProvider.issuer.replace(/\/auth\/v1$/u, ''), key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
};

export const recordRow = async (row) => {
  const supabase = db();
  if (supabase) await supabase.from('request_log').insert(row);
};
export const findRows = async (id) => {
  const supabase = db();
  if (!supabase) return { error: { code: 'NO_KEY' } };
  return supabase.from('request_log').select('at, method, route, status').eq('request_id', id).order('at', { ascending: false }).limit(5);
};
