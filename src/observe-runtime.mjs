import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with { type: 'json' };

const COLUMNS = 'at, method, route, status, client, server_request_id, shape';
const BASE_COLUMNS = 'at, method, route, status, client, server_request_id';
let client;
const db = () => {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return null;
  client ??= createClient(config.identityProvider.issuer.replace(/\/auth\/v1$/u, ''), key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
};

export const recordRow = async (row) => {
  const supabase = db();
  if (!supabase) return;
  const { error } = await supabase.from('request_log').insert(row);
  if (error) {
    // shape 열이 아직 없으면 그 값만 빼고 다시 기록한다.
    const { shape, ...rest } = row;
    await supabase.from('request_log').insert(rest);
  }
};

export const findRows = async (id) => {
  const supabase = db();
  if (!supabase) return { error: { code: 'NO_KEY' } };
  const first = await supabase.from('request_log').select(COLUMNS).eq('request_id', id).order('at', { ascending: false }).limit(5);
  return first.error ? supabase.from('request_log').select(BASE_COLUMNS).eq('request_id', id).order('at', { ascending: false }).limit(5) : first;
};

export const recentRows = async (who) => {
  const supabase = db();
  if (!supabase) return { error: { code: 'NO_KEY' } };
  const build = (columns) => {
    let query = supabase.from('request_log').select(columns).order('at', { ascending: false }).limit(20);
    if (who) query = query.eq('client', who);
    return query;
  };
  const first = await build(COLUMNS);
  return first.error ? build(BASE_COLUMNS) : first;
};
