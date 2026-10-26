import assert from 'node:assert/strict';
import test from 'node:test';
import { notesApi } from '../src/notes.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
function fake() {
  const rows = new Map();
  const db = {
    list: async (owner) => ({ data: [...rows.values()].filter(r => r.owner_id === owner) }),
    get: async (id, owner) => ({ data: rows.get(id)?.owner_id === owner ? rows.get(id) : null }),
    insert: async (row) => rows.has(row.id) ? { error: { code: '23505' } } : (rows.set(row.id, row), { data: row }),
    update: async (id, owner, f) => rows.get(id)?.owner_id === owner ? { data: Object.assign(rows.get(id), f) } : { data: null },
    remove: async (id, owner) => {
      const row = rows.get(id)?.owner_id === owner ? rows.get(id) : null;
      if (row) rows.delete(id);
      return { data: row };
    },
  };
  const api = notesApi({ db, authenticate: async (r) => (r.headers.authorization ? { userId: r.headers.authorization.slice(7) === 'B' ? B : A } : null) });
  const call = async (name, method, { query, body, auth = true, as = 'x' } = {}) => {
    const out = {};
    const response = { setHeader() {}, status(code) { out.status = code; return { json(b) { out.body = b; } }; } };
    await api[name]({ method, query, body, headers: auth ? { authorization: `Bearer ${as}` } : {} }, response);
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
  assert.equal((await call('collection', 'POST', { body: { title: 't', body: 'b', owner_id: 'evil' } })).status, 403);
  assert.equal((await call('collection', 'POST', { body: { title: 't', body: 'b', owner_id: A } })).status, 201);
  assert.equal((await call('collection', 'GET')).body.length, 1);
});

test('B는 A의 메모를 읽거나 고치거나 지울 수 없고 소유자를 바꿀 수 없다', async () => {
  const { call } = fake();
  const { id } = (await call('collection', 'POST', { body: { title: 'A것', body: '비밀' } })).body;
  assert.equal((await call('item', 'GET', { as: 'B', query: { id } })).status, 404);
  assert.equal((await call('item', 'PUT', { as: 'B', query: { id }, body: { title: 'x', body: 'y' } })).status, 404);
  assert.equal((await call('item', 'DELETE', { as: 'B', query: { id } })).status, 404);
  assert.deepEqual((await call('collection', 'GET', { as: 'B' })).body, []);
  assert.equal((await call('collection', 'POST', { as: 'B', body: { title: 't', body: 'b', owner_id: A } })).status, 403);
  assert.equal((await call('item', 'PUT', { query: { id }, body: { title: 't', body: 'b', owner_id: B } })).status, 403);
  assert.equal((await call('item', 'GET', { query: { id } })).body.body, '비밀');
});
