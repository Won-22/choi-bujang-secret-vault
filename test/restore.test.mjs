import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { contentHash, restoreApi } from '../src/restore.mjs';
import { collectPolicy, createSnapshot, diffPolicy, loadSnapshot, restorePolicy, simulateBreach } from '../scripts/policy-backup.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const ID = '33333333-3333-4333-8333-333333333333';

function fake({ backup, live } = {}) {
  const state = { backup, live, audits: [], other: { id: 'x', owner_id: A, title: 'o', content: 'c' } };
  const db = {
    getBackup: async () => ({ data: state.backup ?? null }),
    getNote: async () => ({ data: state.live ?? null }),
    upsert: async (row) => { state.live = row; return { data: row }; },
    audit: async (row) => { state.audits.push(row.outcome); return {}; },
  };
  const run = async (as, body, method = 'POST') => {
    const out = {};
    const response = { setHeader() {}, status(code) { out.status = code; return { json(b) { out.body = b; } }; } };
    await restoreApi({ db, authenticate: async () => (as ? { userId: as } : null) })({ method, body }, response);
    return { ...out, state };
  };
  return run;
}
const goodBackup = { note_id: ID, owner_id: B, title: '제목', content: '내용', content_sha256: contentHash('제목', '내용') };

test('B가 자기 사본 한 건만 복원하고 ID·소유자·해시가 사본과 같다', async () => {
  const r = await fake({ backup: goodBackup })(B, { id: ID });
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.idMatches, r.body.ownerMatches, r.body.hashMatches], [true, true, true]);
  assert.deepEqual(r.state.audits, ['restored']);
  assert.deepEqual(r.state.other, { id: 'x', owner_id: A, title: 'o', content: 'c' });
});

test('로그인 없음·남의 사본·사본 없음·해시 불일치·남의 소유 메모 덮어쓰기는 모두 막는다', async () => {
  assert.equal((await fake({ backup: goodBackup })(null, { id: ID })).status, 401);
  assert.equal((await fake({ backup: goodBackup })(A, { id: ID })).status, 404);
  assert.equal((await fake({})(B, { id: ID })).status, 404);
  assert.equal((await fake({ backup: goodBackup })(B, { id: 'bad' })).status, 400);
  assert.equal((await fake({ backup: goodBackup })(B, { id: ID }, 'GET')).status, 405);
  const tampered = await fake({ backup: { ...goodBackup, content: '바뀜' } })(B, { id: ID });
  assert.deepEqual([tampered.status, tampered.body.error, tampered.state.live], [409, 'BACKUP_HASH_MISMATCH', undefined]);
  const taken = await fake({ backup: goodBackup, live: { id: ID, owner_id: A, title: 't', content: 'c' } })(B, { id: ID });
  assert.equal(taken.body.error, 'ID_OWNED_BY_OTHER');
});

test('정책 사본: 해시 확인, 시험 침공, 차이만 보기, 복원은 대상만 되돌리고 다른 항목·감사 기록은 보존', () => {
  const root = mkdtempSync(join(tmpdir(), 'policy-'));
  for (const f of ['src/decider.mjs', 'src/resources.mjs', 'supabase/notes-rls.sql', 'supabase/notes-lockdown.sql', 'aleph.config.json']) {
    mkdirSync(join(root, f, '..'), { recursive: true });
    cpSync(new URL(`../${f}`, import.meta.url), join(root, f));
  }
  assert.throws(() => loadSnapshot(root), /사본이 없습니다/u);
  createSnapshot(root);
  const { items } = loadSnapshot(root);
  assert.deepEqual(diffPolicy(items, collectPolicy(root)), []);
  simulateBreach(root);
  const plan = restorePolicy(root).plan;
  assert.deepEqual(plan.map((p) => p.key), ['src/decider.mjs']);
  assert.equal(plan[0].removed.length, 1);
  assert.equal(restorePolicy(root, { apply: true }).remaining.length, 0);
  assert.deepEqual(restorePolicy(root).kept, ['other-service/rules']);
  writeFileSync(join(root, 'backup', 'policy-snapshot.sha256'), 'bad\n');
  assert.throws(() => loadSnapshot(root), /해시가 맞지 않아/u);
});
