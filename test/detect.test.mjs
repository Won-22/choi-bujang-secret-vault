import assert from 'node:assert/strict';
import test from 'node:test';
import { detect } from '../src/detect.mjs';

const T0 = Date.UTC(2026, 9, 1);
const ev = (ms, sub = 'u1', method = 'GET') => ({ at: new Date(T0 + ms).toISOString(), method, identity: { sub } });
const burst = (n, step, sub) => Array.from({ length: n }, (_, i) => ev(i * step, sub));
const flag = (subject) => ({ action: 'propose_revocation', reasonCode: 'burst_read', subject });

test('10분 안 120건은 observe, 121건부터 회수 제안', () => {
  assert.deepEqual(detect(burst(120, 1000)), { action: 'observe' });
  assert.deepEqual(detect(burst(121, 1000)), flag('u1'));
});

test('10분 경계: 첫 사건과 마지막 사건이 정확히 10분 떨어지면 같은 구간이 아니다', () => {
  const spread = (last) => [...burst(120, 1000), ev(last)];
  assert.deepEqual(detect([ev(0), ...burst(119, 1000).slice(1), ev(600000)]), { action: 'observe' });
  assert.deepEqual(detect(spread(119999)), flag('u1'));
  assert.deepEqual(detect(burst(121, 5000)), { action: 'observe' });
});

test('사용자별로 세고, 읽기가 아닌 사건·잘못된 사건·순서가 뒤섞인 사건을 다룬다', () => {
  assert.deepEqual(detect([...burst(100, 1000, 'a'), ...burst(100, 1000, 'b')]), { action: 'observe' });
  assert.deepEqual(detect([...burst(121, 1000, 'b'), ...burst(50, 1000, 'a')].reverse()), flag('b'));
  assert.deepEqual(detect(burst(200, 1000).map((e) => ({ ...e, method: 'POST' }))), { action: 'observe' });
  const junk = [null, 1, {}, { at: 'x', method: 'GET', identity: { sub: 'u1' } }, { at: ev(0).at, method: 'GET', identity: {} }];
  assert.deepEqual(detect([...junk, ...burst(120, 1000)]), { action: 'observe' });
});

test('다른 키는 읽지도 돌려주지도 않는다', () => {
  const events = burst(121, 1000).map((e) => ({ ...e, device: 'd1', region: 'kr', token: 'secret', content: '메모' }));
  const result = detect(events);
  assert.deepEqual(Object.keys(result).sort(), ['action', 'reasonCode', 'subject']);
  assert.throws(() => detect('x'), TypeError);
});
