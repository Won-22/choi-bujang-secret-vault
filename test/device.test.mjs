import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { deviceApi } from '../src/device.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function fake() {
  const rows = new Map();
  const db = {
    getDevice: async (id) => ({ data: rows.get(id) ?? null }),
    countPending: async (user) => ({ count: [...rows.values()].filter((r) => r.user_id === user && r.status === 'pending').length }),
    insertDevice: async (row) => { rows.set(row.id, row); return {}; },
  };
  const call = async (method, { as = A, cookie } = {}) => {
    const out = { headers: {} };
    const response = { setHeader(k, v) { out.headers[k.toLowerCase()] = v; }, status(code) { out.status = code; return { json(b) { out.body = b; } }; } };
    await deviceApi({ db, authenticate: async () => (as ? { userId: as } : null) })({ method, headers: { cookie } }, response);
    return out;
  };
  return { call, rows };
}
const cookieOf = (res) => /^vault_device=([^;]+)/u.exec(res.headers['set-cookie'])[1];

test('요청은 pending만 만들고 비밀은 HttpOnly 쿠키로만, DB에는 해시만', async () => {
  const { call, rows } = fake();
  assert.deepEqual((await call('GET')).body, { status: 'none', deviceId: null });
  const made = await call('POST');
  assert.equal(made.body.status, 'pending');
  assert.match(made.headers['set-cookie'], /HttpOnly; Secure; SameSite=Strict/u);
  const [id, secret] = cookieOf(made).split('.');
  const row = rows.get(id);
  assert.equal(row.secret_hash, createHash('sha256').update(secret).digest('hex'));
  assert.ok(!JSON.stringify([...rows.values()]).includes(secret));
  assert.equal((await call('GET', { cookie: `vault_device=${cookieOf(made)}` })).body.status, 'pending');
  assert.equal((await call('POST', { cookie: `vault_device=${cookieOf(made)}` })).body.status, 'pending');
  assert.equal(rows.size, 1);
});

test('승인은 서버 쪽 값이 approved일 때만 열린다. 남의 기기·틀린 비밀·로그인 없음은 none/401', async () => {
  const { call, rows } = fake();
  const made = await call('POST');
  const cookie = `vault_device=${cookieOf(made)}`;
  const [id, secret] = cookieOf(made).split('.');
  assert.equal((await call('GET', { cookie })).body.status, 'pending');
  rows.get(id).status = 'approved';
  assert.equal((await call('GET', { cookie })).body.status, 'approved');
  assert.equal((await call('GET', { cookie, as: B })).body.status, 'none');
  assert.equal((await call('GET', { cookie: `vault_device=${id}.${'0'.repeat(64)}` })).body.status, 'none');
  assert.equal((await call('GET', { cookie: `vault_device=${id}.${secret.slice(0, 63)}` })).body.status, 'none');
  assert.equal((await call('GET', { as: null, cookie })).status, 401);
  rows.get(id).status = 'revoked';
  assert.equal((await call('GET', { cookie })).body.status, 'none');
});

test('대기 요청이 너무 많으면 429', async () => {
  const { call } = fake();
  for (let i = 0; i < 5; i += 1) assert.equal((await call('POST')).status, 200);
  assert.equal((await call('POST')).status, 429);
});
