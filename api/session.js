import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with { type: 'json' };
import { sessionApi } from '../src/session-api.mjs';

const options = { auth: { persistSession: false, autoRefreshToken: false } };

export default async function handler(request, response) {
  const url = config.identityProvider.issuer.replace(/\/auth\/v1$/u, '');
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!publishable || !secret) {
    console.error('session setup failed: missing Supabase keys');
    response.setHeader('Cache-Control', 'no-store');
    return response.status(500).json({ error: 'SERVER_NOT_CONFIGURED' });
  }
  // 요청마다 새 클라이언트를 만들어, 한 사용자의 세션이 다음 요청에 섞이지 않게 한다.
  return sessionApi({
    auth: createClient(url, publishable, options).auth,
    revoke: (token) => createClient(url, secret, options).auth.admin.signOut(token, 'local'),
  })(request, response);
}
