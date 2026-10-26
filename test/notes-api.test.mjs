import assert from 'node:assert/strict';
import test from 'node:test';
import { notesApi } from '../src/notes.mjs';

const A = '11111111-1111-4111-8111-111111111111';
function fake() {
  const rows = new Map();
  const db = {
    list: async (owner) => ({ data: [...rows.values()].filter(r => r.owner_id === owner) }),
    get: async (id) => ({ data: rows.get(id) ?? null }),
    insert: async (row) => rows.has(row.id) ? { error: { code: '23505' } } : (rows.set(row.id, row), { data: row }),
    update: async (id, f) => rows.has(id) ? { data: Object.assign(rows.get(id), f) } : { data: null },
    remove: async (id) => { const row = rows.get(id); rows.delete(id); return { data: row ?? null }; },
  };
  const api = notesApi({ db, authenticate: async (r) => (r.headers.authorization ? { userId: A } : null) });
  const call = async (name, method, { query, body, auth = true } = {}) => {
    const out = {};
    const response = { setHeader() {}, status(code) { out.status = code; return { json(b) { out.body = b; } }; } };
    await api[name]({ method, query, body, headers: auth ? { authorization: 'Bearer x' } : {} }, response);
    return out;
  };
  return { call };
}

test('로그인 없이는 목록·추가가 401 JSON으로 거부된다', async () => {
  const { call } = fake();
  assert.deepEqual(await call('collection', 'GET', { auth: false }), { status: 401, body: { error: 'LOGIN_REQUIRED' } });
  assert.equal((await call('collection', 'POST', { auth: false, body: { title: 't', body: 'b' } })).status, 401);
});

test('A가 추가·조회·수정·삭제하고, 지운 뒤에는 404', async () => {
  const { call } = fake();
  const made = await call('collection', 'POST', { body: { title: '제목', body: '내용' } });
  assert.equal(made.status, 201);
  const { id } = made.body;
  assert.deepEqual((await call('collection', 'GET')).body, [{ id, title: '제목', body: '내용' }]);
  assert.deepEqual((await call('item', 'PUT', { query: { id }, body: { title: '새', body: '글' } })).body, { id, title: '새', body: '글' });
  assert.equal((await call('item', 'DELETE', { query: { id } })).status, 200);
  assert.equal((await call('item', 'GET', { query: { id } })).status, 404);
});

test('잘못된 입력은 400이고 서버가 정한 owner만 저장된다', async () => {
  const { call } = fake();
  assert.equal((await call('collection', 'POST', { body: { title: '', body: 'b' } })).status, 400);
  assert.equal((await call('collection', 'POST', { body: { id: 'x', title: 't', body: 'b' } })).status, 400);
  assert.equal((await call('collection', 'POST', { body: { title: 't', body: 'b', owner_id: 'evil' } })).status, 201);
  assert.equal((await call('collection', 'GET')).body.length, 1);
});
