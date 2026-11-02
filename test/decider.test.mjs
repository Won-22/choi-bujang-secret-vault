import assert from 'node:assert/strict';
import test from 'node:test';
import { decide, RULE_IDS } from '../src/decider.mjs';

const base = { requestId: '11111111-1111-4111-8111-111111111111' };

test('등록 기기(true)만 허용하고, 미등록·없음·true가 아닌 값은 device_not_registered로 거부', async () => {
  const ok = await decide({ ...base, deviceRegistered: true });
  assert.deepEqual([ok.decision, ok.reasonCode], ['allow', 'approved']);
  for (const value of [false, undefined, null, 'true', 1]) {
    const response = await decide({ ...base, deviceRegistered: value });
    assert.deepEqual([response.decision, response.reasonCode], ['deny', 'device_not_registered']);
    assert.equal(response.requestId, base.requestId);
    assert.ok(response.ruleIds.every((id) => RULE_IDS.includes(id)));
  }
});
