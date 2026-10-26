import assert from 'node:assert/strict';
import test from 'node:test';
import { sessionApi } from '../src/session-api.mjs';

const session = { access_token: 'a.b.c', refresh_token: 'r', expires_at: 9999999999, user: { email: 'a@example.test' } };
const run = async (request, auth = {}, revoked = []) => {
  const out = {};
  const response = { setHeader() {}, status(code) { out.status = code; return { json(b) { out.body = b; } }; } };
  await sessionApi({ auth, revoke: async (t) => { revoked.push(t); } })({ headers: {}, ...request }, response);
  return out;
};

test('로그인 성공은 토큰과 만료 시각만, 실패는 이유와 함께 401', async () => {
  const ok = await run({ method: 'POST', body: { email: 'a@example.test', password: 'pw' } },
    { signInWithPassword: async () => ({ data: { session } }) });
  assert.deepEqual(ok, { status: 200, body: { access_token: 'a.b.c', refresh_token: 'r', expires_at: 9999999999, email: 'a@example.test' } });
  const bad = await run({ method: 'POST', body: { email: 'a@example.test', password: 'x' } },
    { signInWithPassword: async () => ({ error: { message: 'Invalid login credentials' } }) });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.message, 'Invalid login credentials');
  assert.equal((await run({ method: 'POST', body: {} })).status, 400);
});

test('갱신과 로그아웃, 지원하지 않는 메서드', async () => {
  const auth = { refreshSession: async ({ refresh_token }) => (refresh_token === 'r' ? { data: { session } } : { error: {} }) };
  assert.equal((await run({ method: 'PUT', body: { refresh_token: 'r' } }, auth)).status, 200);
  assert.equal((await run({ method: 'PUT', body: { refresh_token: 'no' } }, auth)).status, 401);
  const revoked = [];
  assert.equal((await run({ method: 'DELETE', headers: { authorization: 'Bearer tok' } }, {}, revoked)).status, 200);
  assert.deepEqual(revoked, ['tok']);
  assert.equal((await run({ method: 'GET' })).status, 405);
});
