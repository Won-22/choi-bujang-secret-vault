import assert from 'node:assert/strict';
import test from 'node:test';
import { observe, observedApi, routeOf } from '../src/observe.mjs';

const makeResponse = () => {
  const out = { headers: {}, sent: [] };
  out.setHeader = (k, v) => { out.headers[k] = v; };
  out.status = (code) => ({ json: (body) => out.sent.push({ code, body }) });
  return out;
};
const REQ = { method: 'GET', url: '/api/notes/33333333-3333-4333-8333-333333333333?x=1', headers: { 'x-request-id': 'abcdefgh-0001' } };

test('경로 모양만 남긴다: UUID는 :id, 쿼리는 버림', () => {
  assert.equal(routeOf('/api/notes/33333333-3333-4333-8333-333333333333?token=secret'), '/api/notes/:id');
  assert.equal(routeOf('/data.json'), '/data.json');
});

test('응답을 보내기 전에 서버 관측을 기록하고 같은 응답을 보낸다', async () => {
  const res = makeResponse();
  const rows = [];
  await observe(REQ, res, async (r) => { r.setHeader('X-A', '1'); r.status(401).json({ error: 'LOGIN_REQUIRED' }); }, async (row) => { rows.push({ ...row, sentBefore: res.sent.length }); });
  assert.deepEqual(rows, [{ request_id: 'abcdefgh-0001', method: 'GET', route: '/api/notes/:id', status: 401, sentBefore: 0 }]);
  assert.deepEqual(res.sent, [{ code: 401, body: { error: 'LOGIN_REQUIRED' } }]);
  assert.equal(res.headers['X-A'], '1');
});

test('기록에 실패해도 응답은 그대로 나가고, 요청 ID가 없으면 null로 기록한다', async () => {
  const res = makeResponse();
  await observe({ ...REQ, headers: {} }, res, async (r) => r.status(404).json({ error: 'GONE' }), async () => { throw new Error('db down'); });
  assert.deepEqual(res.sent, [{ code: 404, body: { error: 'GONE' } }]);
  const rows = [];
  await observe({ ...REQ, headers: {} }, makeResponse(), async (r) => r.status(200).json({}), async (row) => rows.push(row));
  assert.equal(rows[0].request_id, null);
});

test('/api/observed는 요청 ID로만 가린 기록을 돌려준다', async () => {
  const api = observedApi({ find: async (id) => ({ data: id === 'abcdefgh-0001' ? [{ at: 't', method: 'GET', route: '/api/notes', status: 401, extra: 'x' }] : [] }) });
  const ask = async (q, method = 'GET') => { const res = makeResponse(); await api({ method, query: q }, res); return res.sent[0]; };
  assert.deepEqual((await ask({ request_id: 'abcdefgh-0001' })).body.observations, [{ at: 't', method: 'GET', route: '/api/notes', status: 401 }]);
  assert.equal((await ask({ request_id: 'zzzzzzzz-9' })).body.found, false);
  assert.equal((await ask({})).code, 400);
  assert.equal((await ask({ request_id: 'abcdefgh-0001' }, 'POST')).code, 405);
});
