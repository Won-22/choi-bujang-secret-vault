import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 10단계: 안전 정책의 사본·확인용 해시·시험 침공·차이 보기·복원. 실제 운영 정책 파일(src/, supabase/, aleph.config.json)은 읽기만 하고 절대 쓰지 않는다.
// 모든 쓰기는 backup/ 아래에서만 일어난다.
const POLICY_FILES = ['src/decider.mjs', 'src/resources.mjs', 'supabase/notes-rls.sql', 'supabase/notes-lockdown.sql'];
const ROUTES_KEY = 'aleph.config.json#allowedRoutes';
const lf = (text) => text.replace(/\r\n/gu, '\n');

// 안전 정책 = 접근 규칙(판정기 규칙·구역 표), allowedRoutes, DB 접근 정책(SQL). 값은 모두 줄바꿈이 LF인 문자열이다.
export function collectPolicy(root) {
  const items = {};
  for (const file of POLICY_FILES) items[file] = lf(readFileSync(resolve(root, file), 'utf8'));
  const config = JSON.parse(readFileSync(resolve(root, 'aleph.config.json'), 'utf8'));
  items[ROUTES_KEY] = [...config.allowedRoutes].sort().join('\n');
  return items;
}

const sorted = (items) => Object.fromEntries(Object.entries(items).sort(([a], [b]) => a.localeCompare(b)));
export const hashOf = (items) => createHash('sha256').update(JSON.stringify(sorted(items))).digest('hex');

const paths = (root) => ({
  dir: resolve(root, 'backup'),
  snapshot: resolve(root, 'backup', 'policy-snapshot.json'),
  hash: resolve(root, 'backup', 'policy-snapshot.sha256'),
  test: resolve(root, 'backup', 'test-policy.json'),
  audit: resolve(root, 'backup', 'audit.log'),
});

// 감사 기록은 덧붙이기만 한다. 복원이나 다른 명령이 지우거나 고치지 않는다.
export function audit(root, event, detail = {}) {
  const p = paths(root);
  mkdirSync(p.dir, { recursive: true });
  appendFileSync(p.audit, `${JSON.stringify({ at: new Date().toISOString(), event, ...detail })}\n`);
}

export function createSnapshot(root) {
  const p = paths(root);
  const items = collectPolicy(root);
  mkdirSync(p.dir, { recursive: true });
  writeFileSync(p.snapshot, `${JSON.stringify({ version: 1, items: sorted(items) }, null, 2)}\n`);
  writeFileSync(p.hash, `${hashOf(items)}\n`);
  audit(root, 'snapshot', { hash: hashOf(items), items: Object.keys(items).length });
  return hashOf(items);
}

// 사본이 없거나 해시가 맞지 않으면 중단한다.
export function loadSnapshot(root) {
  const p = paths(root);
  if (!existsSync(p.snapshot) || !existsSync(p.hash)) throw new Error('검증된 사본이 없습니다. 먼저 snapshot을 만드세요.');
  const items = JSON.parse(readFileSync(p.snapshot, 'utf8')).items;
  const expected = readFileSync(p.hash, 'utf8').trim();
  if (!items || hashOf(items) !== expected) throw new Error('사본의 해시가 맞지 않아 중단합니다.');
  return { items, hash: expected };
}

const loadTest = (root) => {
  const p = paths(root);
  if (!existsSync(p.test)) throw new Error('시험 정책이 없습니다. 먼저 simulate를 실행하세요.');
  return JSON.parse(readFileSync(p.test, 'utf8'));
};

// 시험용 사본 하나에서만 규칙 한 줄을 바꿔 침공을 흉내 낸다. 시험 정책에는 다른 서비스 규칙도 하나 넣어 복원이 보존하는지 보인다.
export function simulateBreach(root) {
  const { items } = loadSnapshot(root);
  const target = 'src/decider.mjs';
  const line = "request.deviceRegistered !== true";
  if (!items[target].includes(line)) throw new Error('바꿀 규칙 줄을 사본에서 찾지 못했습니다.');
  const test = { ...items, [target]: items[target].replace(line, "request.deviceRegistered === 'never'"),
    'other-service/rules': 'GET /other 허용 (다른 서비스 규칙)' };
  writeFileSync(paths(root).test, `${JSON.stringify(sorted(test), null, 2)}\n`);
  audit(root, 'simulate', { changed: target });
  return { changed: target, from: line, to: "request.deviceRegistered === 'never'" };
}

// 검증한 사본과 시험 정책의 차이만 돌려준다. 사본에 있는 항목만 비교하고, 같은 줄은 보여 주지 않는다.
export function diffPolicy(snapshotItems, testItems) {
  const result = [];
  for (const key of Object.keys(snapshotItems)) {
    const a = snapshotItems[key].split('\n');
    const b = (testItems[key] ?? '').split('\n');
    const removed = a.filter((l) => !b.includes(l));
    const added = b.filter((l) => !a.includes(l));
    if (removed.length || added.length || testItems[key] === undefined) result.push({ key, removed, added });
  }
  return result;
}

// 복원 계획: 되돌릴 항목만 모은다. apply가 false면 아무것도 쓰지 않는다.
export function restorePolicy(root, { apply = false } = {}) {
  const { items, hash } = loadSnapshot(root);
  const test = loadTest(root);
  const plan = diffPolicy(items, test);
  audit(root, apply ? 'restore-apply' : 'restore-plan', { snapshot: hash, items: plan.map((p) => p.key) });
  if (apply) {
    for (const { key } of plan) test[key] = items[key];
    writeFileSync(paths(root).test, `${JSON.stringify(sorted(test), null, 2)}\n`);
  }
  return { plan, remaining: apply ? diffPolicy(items, test) : null, kept: Object.keys(test).filter((k) => !(k in items)) };
}

const show = (diffs) => diffs.map(({ key, removed, added }) => [`항목: ${key}`,
  ...removed.map((l) => `  - ${l}`), ...added.map((l) => `  + ${l}`)].join('\n')).join('\n') || '차이 없음';

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(import.meta.dirname, '..');
  const [command, flag] = process.argv.slice(2);
  try {
    if (command === 'snapshot') {
      process.stdout.write(`사본과 확인용 해시를 만들었습니다: ${createSnapshot(root)}\n`);
    } else if (command === 'verify') {
      const { items, hash } = loadSnapshot(root);
      const now = diffPolicy(items, collectPolicy(root));
      process.stdout.write(`사본 해시 확인: ${hash}\n현재 운영 정책과 사본의 차이:\n${show(now)}\n`);
    } else if (command === 'simulate') {
      const r = simulateBreach(root);
      process.stdout.write(`시험 정책 한 줄을 바꿨습니다(${r.changed}):\n  ${r.from}\n  -> ${r.to}\n실제 운영 정책은 건드리지 않았습니다.\n`);
    } else if (command === 'diff') {
      const { items, hash } = loadSnapshot(root);
      process.stdout.write(`복원할 버전(사본 해시): ${hash}\n검증한 사본과 시험 정책의 차이:\n${show(diffPolicy(items, loadTest(root)))}\n`);
    } else if (command === 'restore') {
      const { plan, remaining, kept } = restorePolicy(root, { apply: flag === '--apply' });
      process.stdout.write(`복원할 버전과 바뀔 항목:\n${show(plan)}\n보존되는 다른 항목: ${kept.join(', ') || '없음'}\n`);
      process.stdout.write(flag === '--apply' ? `복원 뒤 남은 차이: ${remaining.length}건\n`
        : '아직 아무것도 바꾸지 않았습니다. 확인 뒤 `npm run policy -- restore --apply`로 실행하세요.\n');
    } else {
      throw new Error('사용법: npm run policy -- snapshot | verify | simulate | diff | restore [--apply]');
    }
  } catch (error) {
    process.stderr.write(`정책 복원 도구 첫 오류: ${error.message}\n`);
    process.exitCode = 1;
  }
}
