import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { decide } from '../xdr/brute-force/decide.mjs';
import { respond } from '../xdr/brute-force/respond.mjs';

const { alerts } = JSON.parse(readFileSync(new URL('../xdr/fixtures/brute-force.json', import.meta.url), 'utf8'));
const decisions = alerts.map((a) => ({ alertId: a.id, ...decide(a) }));
const actionOf = (id) => decisions.find((d) => d.alertId === id).action;

test('명확한 공격은 block, 애매한 시도는 alert, 정상 이벤트는 record', () => {
  for (let i = 1; i <= 10; i += 1) assert.equal(actionOf(`bf-${String(i).padStart(2, '0')}`), 'block');
  for (let i = 11; i <= 19; i += 1) assert.equal(actionOf(`bf-${i}`), 'alert');
  for (let i = 20; i <= 28; i += 1) assert.equal(actionOf(`bf-${i}`), 'record');
});

test('block은 확신도 0.85 이상, alert는 0.5 이상 0.85 미만', () => {
  for (const d of decisions) {
    if (d.action === 'block') assert.ok(d.confidence >= 0.85);
    if (d.action === 'alert') assert.ok(d.confidence >= 0.5 && d.confidence < 0.85);
  }
});

test('차단 규칙은 block 주소만, 정상 이벤트 주소는 막지 않는다', () => {
  const { rules, alertLines } = respond({ decisions, alerts, now: 0 });
  const normalIps = new Set(alerts.filter((a) => actionOf(a.id) === 'record').map((a) => a.data.srcip));
  assert.ok(rules.length > 0 && rules.every((r) => !normalIps.has(r.srcip) && r.expiresAt && r.alertIds.length));
  assert.equal(alertLines.length, 9);
});

test('decide.mjs에는 import 문이 없다', () => {
  assert.doesNotMatch(readFileSync(new URL('../xdr/brute-force/decide.mjs', import.meta.url), 'utf8'), /^\s*import\s/mu);
});
