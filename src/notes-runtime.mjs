import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from './verify-login.mjs';
import { notesApi } from './notes.mjs';
import { restoreApi } from './restore.mjs';
import { deviceApi } from './device.mjs';

const COLUMNS = 'id, title, content';
let runtime;

function build() {
  const key = process.env.SUPABASE_SECRET_KEY;
  const verify = createLoginVerifier({ config, supabaseSecretKey: key });
  const client = createClient(config.identityProvider.issuer.replace(/\/auth\/v1$/u, ''), key,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const notes = () => client.from('notes');
  const authenticate = (request) => verify(request.headers.authorization);
  const NOTE = 'id, owner_id, title, content';
  const restore = restoreApi({ authenticate, db: {
    getBackup: (id) => client.from('notes_backup').select('note_id, owner_id, title, content, content_sha256').eq('note_id', id).maybeSingle(),
    getNote: (id) => notes().select(NOTE).eq('id', id).maybeSingle(),
    upsert: (row) => notes().upsert(row, { onConflict: 'id' }).select(NOTE).single(),
    audit: (row) => client.from('restore_audit').insert(row),
  } });
  const device = deviceApi({ authenticate, db: {
    getDevice: (id) => client.from('devices').select('id, user_id, status, secret_hash').eq('id', id).maybeSingle(),
    countPending: (user) => client.from('devices').select('id', { count: 'exact', head: true }).eq('user_id', user).eq('status', 'pending'),
    insertDevice: (row) => client.from('devices').insert(row),
  } });
  return { ...notesApi({
    authenticate,
    db: {
      list: (owner) => notes().select(COLUMNS).eq('owner_id', owner).order('created_at'),
      get: (id, owner) => notes().select(COLUMNS).eq('id', id).eq('owner_id', owner).maybeSingle(),
      insert: (row) => notes().insert(row).select(COLUMNS).single(),
      update: (id, owner, fields) => notes().update(fields).eq('id', id).eq('owner_id', owner).select(COLUMNS).maybeSingle(),
      remove: (id, owner) => notes().delete().eq('id', id).eq('owner_id', owner).select('id').maybeSingle(),
    },
  }), restore, device };
}

export function handler(name) {
  return async (request, response) => {
    try {
      runtime ??= build();
    } catch (error) {
      console.error('notes setup failed:', error.message);
      response.setHeader('Cache-Control', 'no-store');
      return response.status(500).json({ error: 'SERVER_NOT_CONFIGURED' });
    }
    return runtime[name](request, response);
  };
}
