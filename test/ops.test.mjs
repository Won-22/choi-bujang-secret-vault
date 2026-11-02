import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { countBy, mergeRows, renderOps, validateReport } from '../src/ops-page.mjs';

const UUID = '33333333-3333-4333-8333-333333333333';
const base = { id: 'X1', step: 6, group: 'rules', kind: 'normal', name: '시험', request: 'GET /', expected: 'allow', actual: 'allow', status: '통과', source: 'local', requestId: UUID, serverId: null, checkedAt: '2026-11-02T00:00:00.000Z', note: '' };
const report = (rows) => ({ version: 1, generatedAt: 'g', baseUrl: 'b', inspectedCommit: 'c', deployedStep: 12, policySnapshotHash: 'h', summary: { ...countBy(rows), total: rows.length }, rows });
const skipped = { ...base, id: 'X2', status: '미실행', source: 'not_run', actual: '미실행', requestId: null, checkedAt: null, note: '로그인 정보가 필요해 실행하지 않음' };

test('실측 기록은 통과, 실행하지 않은 시험은 미실행으로 따로 세어진다', () => {
  const r = report([base, skipped, { ...base, id: 'X3', status: '실패', actual: 'deny' }]);
  assert.deepEqual(validateReport(r), []);
  const html = renderOps(r);
  assert.match(html, /실측 통과<b>1<\/b>/u);
  assert.match(html, /실측 실패<b>1<\/b>/u);
  assert.match(html, /미실행<b>1<\/b>/u);
});

test('실행하지 않은 시험을 통과로 처리하거나 요약이 행과 다르면 거부한다', () => {
  assert.ok(validateReport(report([{ ...skipped, status: '통과' }])).length > 0);
  assert.ok(validateReport(report([{ ...base, requestId: null }])).length > 0);
  assert.ok(validateReport(report([{ ...skipped, note: '' }])).length > 0);
  assert.ok(validateReport(report([{ ...base, source: 'manual' }])).length > 0);
  const wrong = report([base]);
  wrong.summary['통과'] = 5;
  assert.ok(validateReport(wrong).length > 0);
  assert.throws(() => renderOps(wrong), /맞지 않습니다/u);
});

test('메모 본문 같은 항목과 HTML은 그대로 싣지 않는다', () => {
  assert.ok(validateReport(report([{ ...base, content: '메모 본문' }])).length > 0);
  const html = renderOps(report([{ ...base, name: '<script>alert(1)</script>' }]));
  assert.ok(!html.includes('<script>'));
});

test('저장소의 ops/report.json은 스스로 모순되지 않고 화면 수치와 같다', { skip: !existsSync(new URL('../ops/report.json', import.meta.url)) }, () => {
  const saved = JSON.parse(readFileSync(new URL('../ops/report.json', import.meta.url), 'utf8'));
  assert.deepEqual(validateReport(saved), []);
  const counts = countBy(saved.rows);
  const html = renderOps(saved);
  assert.match(html, new RegExp(`전체 시험<b>${saved.rows.length}</b>`, 'u'));
  assert.match(html, new RegExp(`실측 통과<b>${counts['통과']}</b>`, 'u'));
  assert.match(html, new RegExp(`미실행<b>${counts['미실행']}</b>`, 'u'));
  assert.ok(!JSON.stringify(saved).match(/"(title|content|body)"/u));
});

test('로그인 시험 결과를 합치면 옛 미실행 행이 빠지고 수치가 행에서 다시 세어진다', () => {
  const old = report([base, { ...skipped, id: 'N01' }, { ...skipped, id: 'V01' }]);
  const merged = mergeRows(old, ['N01'], [{ ...base, id: 'V01' }, { ...base, id: 'V02', status: '실패', actual: 'x' }]);
  assert.deepEqual(merged.rows.map((r) => r.id), ['X1', 'V01', 'V02']);
  assert.deepEqual(validateReport(merged), []);
  assert.equal(merged.summary['미실행'], 0);
  assert.equal(merged.summary['실패'], 1);
});
