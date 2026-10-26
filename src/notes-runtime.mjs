import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from './verify-login.mjs';
import { notesApi } from './notes.mjs';

const COLUMNS = 'id, title, content';
let runtime;

function build() {
  const key = process.env.SUPABASE_SECRET_KEY;
  const verify = createLoginVerifier({ config, supabaseSecretKey: key });
  const client = createClient(config.identityProvider.issuer.replace(/\/auth\/v1$/u, ''), key,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const notes = () => client.from('notes');
  return notesApi({
    authenticate: (request) => verify(request.headers.authorization),
    db: {
      list: (owner) => notes().select(COLUMNS).eq('owner_id', owner).order('created_at'),
      get: (id) => notes().select(COLUMNS).eq('id', id).maybeSingle(),
      insert: (row) => notes().insert(row).select(COLUMNS).single(),
      update: (id, fields) => notes().update(fields).eq('id', id).select(COLUMNS).maybeSingle(),
      remove: (id) => notes().delete().eq('id', id).select('id').maybeSingle(),
    },
  });
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
