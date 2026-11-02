import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with { type: 'json' };

const COLUMNS = 'at, method, route, status, client, server_request_id';
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
  return supabase.from('request_log').select(COLUMNS).eq('request_id', id).order('at', { ascending: false }).limit(5);
};

export const recentRows = async (who) => {
  const supabase = db();
  if (!supabase) return { error: { code: 'NO_KEY' } };
  let query = supabase.from('request_log').select(COLUMNS).order('at', { ascending: false }).limit(20);
  if (who) query = query.eq('client', who);
  return query;
};
