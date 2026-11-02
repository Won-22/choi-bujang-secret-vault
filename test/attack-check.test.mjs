import assert from 'node:assert/strict';
import test from 'node:test';
import { runAttackChecks } from '../src/attack-check.mjs';

const CONFIG = { step: 12, publicAppUrl: 'https://student-defense.vercel.app/', sampleMarker: 'SAMPLE_NOTE_1', judgeIssuer: 'https://x.up.railway.app/defense/judge' };
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

// 우리 서버를 흉내 낸다: /data.json 404, 그 밖의 보호 경로 401, /api/observed는 지금까지 받은 요청 ID를 기억해 알려 준다.
function fakeServer({ remember = true, headers = { 'x-vercel-id': 'icn1::test-0001' } } = {}) {
  const log = [];
  const seen = [];
  const stub = async (url, init) => {
    const u = new URL(String(url));
    const id = init.headers['x-request-id'];
    if (u.pathname === '/api/observed') {
      const wanted = u.searchParams.get('request_id');
      const found = log.filter((x) => x.id === wanted).map((x) => ({ at: 't', method: 'GET', route: x.path, status: x.status }));
      return new Response(JSON.stringify({ found: found.length > 0, observations: found }), { status: 200, headers });
    }
    seen.push({ path: u.pathname, id, alt: init.headers['x-aleph-request-id'] });
    const status = u.pathname === '/data.json' ? 404 : 401;
    if (remember) log.push({ id, path: u.pathname, status });
    return new Response('{"error":"X"}', { status, headers });
  };
  return { stub, seen };
}

async function withFetch(stub, run) {
  const real = globalThis.fetch;
  process.env.ATTACK_CHECK_WAIT_MS = '0';
  globalThis.fetch = stub;
  try { return await run(); } finally { globalThis.fetch = real; }
}
const by = (out) => Object.fromEntries(out.map((o) => [o.attackId, o.observed]));

test('요청마다 randomUUID()로 만든 ID를 보내고 실제 상태와 서버가 확인한 상태를 적는다', async () => {
  const { stub, seen } = fakeServer();
  const out = await withFetch(stub, () => runAttackChecks(CONFIG));
  assert.ok(seen.every((x) => UUID4.test(x.id) && x.alt === x.id));
  assert.equal(new Set(seen.map((x) => x.id)).size, seen.length);
  const idOf = (path) => seen.find((x) => x.path === path).id;
  const o = by(out);
  assert.equal(o.static_data_json_gone, `HTTP 404, request_id=${idOf('/data.json')}, server_observed=404`);
  assert.equal(o.anonymous_list_refused, `HTTP 401, request_id=${idOf('/api/notes')}, server_observed=401`);
  assert.match(o.anonymous_item_refused, /^HTTP 401, request_id=[0-9a-f-]{36}, server_observed=401$/u);
  assert.match(o.anonymous_device_refused, /^HTTP 401, request_id=[0-9a-f-]{36}, server_observed=401$/u);
  assert.match(o.anonymous_session_probe, /^HTTP 401, request_id=[0-9a-f-]{36}, server_observed=401$/u);
  assert.ok(out.length >= 12 && out.length <= 20);
  assert.equal(new Set(out.map((x) => x.attackId)).size, out.length);
});

test('서버가 그 요청을 기록했다고 확인하지 못하면 server_observed를 적지 않는다', async () => {
  const { stub } = fakeServer({ remember: false });
  const out = await withFetch(stub, () => runAttackChecks(CONFIG));
  assert.match(by(out).static_data_json_gone, /^HTTP 404, request_id=[0-9a-f-]{36}$/u);
});

test('응답 헤더가 모두 걸러진 응답이라도 응답을 받았다면 실제 상태와 요청 ID를 적는다', async () => {
  // 심판 환경처럼 서버 흔적 헤더(x-vercel-id, x-request-id)가 없는 응답. /api/observed 확인은 되지 않아 server_observed는 없다.
  const log = [];
  const stub = async (url, init) => {
    const u = new URL(String(url));
    if (u.pathname !== '/api/observed') log.push({ path: u.pathname, id: init.headers['x-request-id'] });
    return new Response(u.pathname === '/api/observed' ? '{"found":false,"observations":[]}' : '{"error":"X"}', { status: u.pathname === '/data.json' ? 404 : u.pathname === '/api/observed' ? 200 : 401 });
  };
  const o = by(await withFetch(stub, () => runAttackChecks(CONFIG)));
  const idOf = (path) => log.find((x) => x.path === path).id;
  assert.equal(o.static_data_json_gone, `HTTP 404, request_id=${idOf('/data.json')}`);
  assert.equal(o.anonymous_list_refused, `HTTP 401, request_id=${idOf('/api/notes')}`);
  assert.equal(o.anonymous_session_probe, `HTTP 401, request_id=${idOf('/api/session')}`);
  assert.equal(o.deployment_identity_open, `HTTP 401, request_id=${idOf('/api/identity')}`);
});

test('응답이 없거나 보내지 않은 점검만 상태·ID 없이 not_run', async () => {
  const out = await withFetch(async () => { throw new TypeError('fetch failed'); }, () => runAttackChecks(CONFIG));
  for (const o of out) assert.ok(o.observed.startsWith('not_run') && !/request_id=|HTTP \d/u.test(o.observed), o.attackId);
  const real = await withFetch(fakeServer().stub, () => runAttackChecks(CONFIG));
  assert.ok(by(real).decider_device_registered.startsWith('not_run'));
  assert.ok(by(real).login_note_flow.startsWith('not_run'));
});

test('중간 장치가 요청 ID를 바꿔 넣어 응답이 다른 ID를 돌려주면 그 값을 기록한다', async () => {
  const stub = async (url) => new Response('{"error":"X"}', { status: String(url).includes('/data.json') ? 404 : 401, headers: { 'x-request-id': 'proxy-assigned-0001' } });
  const o = by(await withFetch(stub, () => runAttackChecks(CONFIG)));
  assert.equal(o.static_data_json_gone, 'HTTP 404, request_id=proxy-assigned-0001');
  assert.equal(o.anonymous_list_refused, 'HTTP 401, request_id=proxy-assigned-0001');
});
