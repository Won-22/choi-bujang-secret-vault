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
  assert.deepEqual(validateReport(saved, { requireAllSteps: true }), []);
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

test('점검 원문(observed)과 보고서 행의 요청 ID·상태가 다르면 거부한다', () => {
  const row = { ...base, id: 'A01', attackId: 'static_data_json_gone', actual: 'HTTP 404', requestId: UUID };
  const ok = { ...report([row]), attackEvidence: [{ attackId: 'static_data_json_gone', expected: 'x', observed: `HTTP 404, request_id=${UUID}` }] };
  assert.deepEqual(validateReport(ok), []);
  assert.match(renderOps(ok), /자기 점검\(attack-check\) 원문/u);
  const otherId = { ...ok, attackEvidence: [{ ...ok.attackEvidence[0], observed: 'HTTP 404, request_id=44444444-4444-5444-8444-444444444444' }] };
  assert.ok(validateReport(otherId).length > 0);
  const otherStatus = { ...ok, attackEvidence: [{ ...ok.attackEvidence[0], observed: `HTTP 200, request_id=${UUID}` }] };
  assert.ok(validateReport(otherStatus).length > 0);
  const noId = { ...ok, attackEvidence: [{ ...ok.attackEvidence[0], observed: 'not_run: 응답을 받지 못함' }] };
  assert.ok(validateReport(noId).length > 0);
});

test('1~12단계 중 시험 기록이 없는 단계가 있으면 기록을 거부한다', () => {
  assert.deepEqual(validateReport(report([base])), []);
  assert.ok(validateReport(report([base]), { requireAllSteps: true }).some((p) => p.includes('1단계')));
  assert.match(renderOps(report([base])), /단계별 기록\(1~12단계\)/u);
});

test('서버 관측은 같은 요청의 실제 상태와 같을 때만 기록으로 인정한다', () => {
  const row = { ...base, id: 'A01', attackId: 'static_data_json_gone', source: 'live', actual: 'HTTP 404', requestId: UUID, serverObserved: 'HTTP 404' };
  const ok = { ...report([row]), attackEvidence: [{ attackId: 'static_data_json_gone', expected: 'x', observed: `HTTP 404, request_id=${UUID}, server_observed=404` }] };
  assert.deepEqual(validateReport(ok), []);
  assert.match(renderOps(ok), /서버 관측/u);
  assert.ok(validateReport({ ...ok, rows: [{ ...row, serverObserved: 'HTTP 200' }] }).length > 0);
  assert.ok(validateReport({ ...ok, rows: [{ ...row, serverObserved: 'bad' }] }).length > 0);
  assert.ok(validateReport({ ...ok, rows: [{ ...row, serverObserved: undefined }] }).length > 0);
});
