import assert from 'node:assert/strict';
import test from 'node:test';
import { decide, RULE_IDS } from '../src/decider.mjs';

const base = { requestId: '11111111-1111-4111-8111-111111111111' };

test('등록 기기(true)만 허용하고, 미등록·없음·true가 아닌 값은 device_not_registered로 거부', async () => {
  const ok = await decide({ ...base, ...memo, deviceRegistered: true });
  assert.deepEqual([ok.decision, ok.reasonCode], ['allow', 'approved']);
  for (const value of [false, undefined, null, 'true', 1]) {
    const response = await decide({ ...base, deviceRegistered: value });
    assert.deepEqual([response.decision, response.reasonCode], ['deny', 'device_not_registered']);
    assert.equal(response.requestId, base.requestId);
    assert.ok(response.ruleIds.every((id) => RULE_IDS.includes(id)));
  }
});

const risky = { source: 'judge_fixture', region: 'foreign', network: 'unusual', hour: 3 };
const burst = [{ kind: 'risk_signal', ageSeconds: 60, count: 20 }];
const memo = { service: 'notes', method: 'GET', path: '/notes/demo', route: 'GET /notes/:id', queryLength: 0 };
const live = { ...base, ...memo, deviceRegistered: true, stepUp: { verified: false, authAgeSeconds: null } };
const result = async (patch) => { const r = await decide({ ...live, ...patch }); return [r.decision, r.reasonCode]; };

test('새벽·처음 보는 네트워크·대량 읽기가 함께 있을 때만 step_up, 다시 확인하면 allow', async () => {
  assert.deepEqual(await result({ signals: risky, recentEvents: burst }), ['step_up', 'step_up_required']);
  assert.deepEqual(await result({ signals: risky, recentEvents: burst, stepUp: { verified: true, authAgeSeconds: 60 } }), ['allow', 'approved']);
  assert.deepEqual(await result({ signals: risky, recentEvents: burst, stepUp: { verified: true, authAgeSeconds: 901 } }), ['step_up', 'step_up_required']);
  assert.deepEqual(await result({ signals: { ...risky, region: 'local', network: 'usual', hour: 14 }, recentEvents: [] }), ['allow', 'approved']);
});

test('지역 하나, 또는 두 조건만으로는 막지 않는다', async () => {
  assert.equal((await result({ signals: { ...risky, network: 'usual', hour: 14 }, recentEvents: [] }))[0], 'allow');
  assert.equal((await result({ signals: risky, recentEvents: [] }))[0], 'allow');
  assert.equal((await result({ signals: { ...risky, hour: 14 }, recentEvents: burst }))[0], 'allow');
});

test('출처가 불명확하거나 값이 없으면 근거로 쓰지 않고 정상값으로 채우지도 않는다', async () => {
  for (const signals of [{ ...risky, source: 'x-forwarded-for' }, { ...risky, source: 'none' }, { source: 'judge_fixture', region: 'foreign' }, { ...risky, hour: '3' }, undefined]) {
    assert.equal((await result({ signals, recentEvents: burst }))[0], 'allow');
  }
  assert.equal((await result({ signals: risky, recentEvents: undefined }))[0], 'allow');
  assert.equal((await result({ deviceRegistered: false, signals: risky, recentEvents: burst }))[1], 'device_not_registered');
});

const zone = async (patch) => { const r = await decide({ ...live, ...patch }); return [r.decision, r.reasonCode]; };
const deny = ['deny', 'resource_not_allowed'];

test('메모는 ID 하나를 고르는 경로만, ID가 UUID가 아니어도 허용', async () => {
  assert.equal((await zone({ path: '/notes/not-a-uuid' }))[0], 'allow');
  assert.equal((await zone({ method: 'PUT', route: 'PUT /notes/:id' }))[0], 'allow');
  assert.equal((await zone({ method: 'DELETE', route: 'DELETE /api/notes/:id', path: '/api/notes/x1' }))[0], 'allow');
  assert.deepEqual(await zone({ route: 'GET /notes', path: '/notes' }), deny);
  assert.deepEqual(await zone({ method: 'POST', route: 'POST /notes', path: '/notes' }), deny);
  assert.deepEqual(await zone({ method: 'POST', route: 'POST /notes/:id' }), deny);
});

test('반 공지는 읽기만, 강사 자료와 알 수 없는 경로·쿼리·기능 경로는 거부', async () => {
  const notice = { service: 'announcements', route: 'GET /announcements', path: '/announcements' };
  assert.equal((await zone(notice))[0], 'allow');
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.deepEqual(await zone({ ...notice, method, route: `${method} /announcements` }), deny);
  }
  assert.deepEqual(await zone({ service: 'instructor', route: 'GET /instructor/materials/:id', path: '/instructor/materials/1' }), deny);
  assert.deepEqual(await zone({ service: 'notes', route: 'GET /instructor/materials/:id', path: '/instructor/materials/1' }), deny);
  assert.deepEqual(await zone({ queryLength: 7 }), deny);
  assert.deepEqual(await zone({ path: '/notes/export' }), deny);
  assert.deepEqual(await zone({ path: '/notes/a/export' }), deny);
  assert.deepEqual(await zone({ service: 'announcements' }), deny);
  assert.deepEqual(await zone({ route: undefined }), deny);
});
