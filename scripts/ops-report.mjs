import { randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureRequests } from './fixture-7.mjs';
import { countBy, validateReport } from '../src/ops-page.mjs';

// 탈환 작전실의 기록을 만든다: 1~11단계의 정상·금지 요청을 실제로 실행하고, 결과를 ops/report.json에 있는 그대로 적는다.
// 로그인 정보가 필요한 시험, 엔진이나 심판이 하는 시험은 실행하지 않고 '미실행'으로 남긴다. 어떤 시험도 임의로 통과 처리하지 않는다.
const root = resolve(import.meta.dirname, '..');
const config = JSON.parse(readFileSync(resolve(root, 'aleph.config.json'), 'utf8'));
const BASE = (process.env.OPS_BASE_URL ?? config.publicAppUrl).replace(/\/+$/u, '');
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const rows = [];
const now = () => new Date().toISOString();
const add = (row) => rows.push({ serverId: null, note: '', ...row });

async function live({ id, step, group = 'api', kind, name, method = 'GET', path, headers = {}, body, expectStatus, expectError, inspect, note = '' }) {
  const requestId = randomUUID();
  const request = `${method} ${path}`;
  const checkedAt = now();
  try {
    const res = await fetch(BASE + path, { method, body, redirect: 'manual', signal: AbortSignal.timeout(15000),
      headers: { 'x-request-id': requestId, ...headers } });
    const text = await res.text();
    let error = null;
    try { error = JSON.parse(text)?.error ?? null; } catch { /* JSON이 아니면 오류 문구가 없다 */ }
    const extra = inspect ? inspect(res, text) : { ok: true, actual: '' };
    const ok = res.status === expectStatus && (!expectError || error === expectError) && extra.ok;
    add({ id, step, group, kind, name, request, expected: `HTTP ${expectStatus}${expectError ? ` ${expectError}` : ''}${inspect ? ` + ${extra.expected}` : ''}`,
      actual: `HTTP ${res.status}${error ? ` ${error}` : ''}${extra.actual ? `, ${extra.actual}` : ''}`,
      status: ok ? '통과' : '실패', source: 'live', requestId, serverId: res.headers.get('x-vercel-id'), checkedAt, note });
    return { res, text };
  } catch (error) {
    add({ id, step, group, kind, name, request, expected: `HTTP ${expectStatus}`, actual: `요청 실패: ${error.cause?.code ?? error.message}`,
      status: '실패', source: 'live', requestId, checkedAt, note });
    return null;
  }
}

const skip = (id, step, group, name, request, expected, why, kind = 'normal') =>
  add({ id, step, group, kind, name, request, expected, actual: '미실행', status: '미실행', source: 'not_run', requestId: null, checkedAt: null, note: why });
const manual = (id, step, group, name, request, expected, actual, note, kind = 'normal') =>
  add({ id, step, group, kind, name, request, expected, actual, status: '직접 확인', source: 'manual', requestId: null, checkedAt: null, note });

// ── 실제 배포 주소에 로그인 없이 보낸 요청 ──────────────────────────────────────────
const some = '33333333-3333-4333-8333-333333333333';
const json = { 'Content-Type': 'application/json' };
const home = await live({ id: 'L01', step: 3, kind: 'normal', name: '첫 화면이 열린다', path: '/', expectStatus: 200 });
const html = home?.text ?? '';
add({ id: 'L02', step: 11, group: 'app', kind: 'forbidden', name: '화면 코드에 브라우저 저장소·공개 키가 없다', request: 'GET / 의 HTML 검색',
  expected: 'localStorage·sessionStorage·sb_publishable 0건', actual: home ? `${(html.match(/localStorage|sessionStorage|sb_publishable|createClient/gu) ?? []).length}건` : '화면을 받지 못함',
  status: home && !/localStorage|sessionStorage|sb_publishable|createClient/u.test(html) ? '통과' : '실패', source: 'live', requestId: randomUUID(), serverId: home?.res.headers.get('x-vercel-id') ?? null, checkedAt: now(), note: 'L01에서 받은 화면을 검색한 결과' });
add({ id: 'L03', step: 11, group: 'app', kind: 'normal', name: '화면이 설치형 웹앱 설정을 연결한다', request: 'GET / 의 HTML 검색',
  expected: 'rel="manifest" 연결 있음', actual: /rel="manifest"/u.test(html) ? '연결 있음' : '연결 없음',
  status: /rel="manifest"/u.test(html) ? '통과' : '실패', source: 'live', requestId: randomUUID(), serverId: home?.res.headers.get('x-vercel-id') ?? null, checkedAt: now(), note: 'L01에서 받은 화면을 검색한 결과' });
add({ id: 'L04', step: 1, group: 'api', kind: 'normal', name: '첫 화면 응답에 보안 헤더가 있다', request: 'GET / 의 응답 헤더',
  expected: 'X-Content-Type-Options: nosniff', actual: home?.res.headers.get('x-content-type-options') ?? '헤더 없음',
  status: home?.res.headers.get('x-content-type-options') === 'nosniff' ? '통과' : '실패', source: 'live', requestId: randomUUID(), serverId: home?.res.headers.get('x-vercel-id') ?? null, checkedAt: now(), note: 'L01 응답의 헤더' });
await live({ id: 'L05', step: 2, kind: 'forbidden', name: '옛 공개 자료 파일은 사라졌다', path: '/data.json', expectStatus: 404 });
await live({ id: 'L06', step: 3, kind: 'forbidden', name: '로그인 없이 메모 목록 요청', path: '/api/notes', expectStatus: 401, expectError: 'LOGIN_REQUIRED' });
await live({ id: 'L07', step: 3, kind: 'forbidden', name: '로그인 없이 메모 추가 요청', method: 'POST', path: '/api/notes', headers: json, body: JSON.stringify({ title: 't', body: 'b' }), expectStatus: 401, expectError: 'LOGIN_REQUIRED' });
await live({ id: 'L08', step: 4, kind: 'forbidden', name: '로그인 없이 메모 한 건 읽기', path: `/api/notes/${some}`, expectStatus: 401, expectError: 'LOGIN_REQUIRED' });
await live({ id: 'L09', step: 4, kind: 'forbidden', name: '로그인 없이 메모 수정', method: 'PUT', path: `/api/notes/${some}`, headers: json, body: JSON.stringify({ title: 't', body: 'b' }), expectStatus: 401, expectError: 'LOGIN_REQUIRED' });
await live({ id: 'L10', step: 4, kind: 'forbidden', name: '로그인 없이 메모 삭제', method: 'DELETE', path: `/api/notes/${some}`, expectStatus: 401, expectError: 'LOGIN_REQUIRED' });
await live({ id: 'L11', step: 3, kind: 'forbidden', name: '틀린 비밀번호로 로그인', method: 'POST', path: '/api/session', headers: json, body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong-password-for-ops-check' }), expectStatus: 401, expectError: 'LOGIN_FAILED' });
await live({ id: 'L12', step: 3, kind: 'forbidden', name: '빈 로그인 요청', method: 'POST', path: '/api/session', headers: json, body: '{}', expectStatus: 400, expectError: 'INVALID_LOGIN' });
await live({ id: 'L13', step: 8, group: 'rules', kind: 'forbidden', name: '강사 자료 경로는 없다', path: '/api/instructor/materials/1', expectStatus: 404 });
await live({ id: 'L14', step: 10, group: 'restore', kind: 'forbidden', name: '로그인 없이 복원 요청', method: 'POST', path: '/api/backup/restore', headers: json, body: JSON.stringify({ id: some }), expectStatus: 401, expectError: 'LOGIN_REQUIRED' });
await live({ id: 'L15', step: 11, group: 'app', kind: 'forbidden', name: '로그인 없이 기기 상태 확인', path: '/api/device', expectStatus: 401, expectError: 'LOGIN_REQUIRED' });
await live({ id: 'L16', step: 11, group: 'app', kind: 'forbidden', name: '로그인 없이 기기 승인 요청', method: 'POST', path: '/api/device', expectStatus: 401, expectError: 'LOGIN_REQUIRED' });
await live({ id: 'L17', step: 11, group: 'app', kind: 'normal', name: '설치형 웹앱 설정을 받을 수 있다', path: '/manifest.webmanifest', expectStatus: 200,
  inspect: (_res, text) => { try { const m = JSON.parse(text); const ok = Boolean(m.name) && m.display === 'standalone'; return { ok, expected: '앱 이름·standalone', actual: `이름 ${m.name ?? '없음'}, ${m.display ?? '표시 방식 없음'}` }; } catch { return { ok: false, expected: '앱 이름·standalone', actual: 'JSON 아님' }; } } });
await live({ id: 'L18', step: 11, group: 'app', kind: 'normal', name: '서비스 워커 파일을 받을 수 있다', path: '/sw.js', expectStatus: 200,
  inspect: (_res, text) => ({ ok: !/localStorage|Authorization/u.test(text), expected: '토큰·저장소 코드 없음', actual: `토큰·저장소 문구 ${(text.match(/localStorage|Authorization/gu) ?? []).length}건` }) });
const identity = await live({ id: 'L19', step: 12, group: 'api', kind: 'normal', name: '배포 식별 파일이 열린다', path: '/aleph.json', expectStatus: 200,
  inspect: (_res, text) => { try { const a = JSON.parse(text); const ok = a.step >= 12 && /^[a-f0-9]{40}$/u.test(a.commit); return { ok, expected: '단계 12 이상·커밋 40자', actual: `단계 ${a.step}, 커밋 ${String(a.commit).slice(0, 7)}` }; } catch { return { ok: false, expected: '단계 12 이상·커밋 40자', actual: 'JSON 아님' }; } } });
if (KEY) {
  const directUrl = config.originalApiUrl;
  const requestId = randomUUID();
  const checkedAt = now();
  try {
    const res = await fetch(directUrl, { headers: { apikey: KEY, 'x-request-id': requestId }, redirect: 'manual', signal: AbortSignal.timeout(15000) });
    const data = await res.json().catch(() => null);
    const count = Array.isArray(data) ? data.length : 0;
    add({ id: 'L20', step: 5, group: 'api', kind: 'forbidden', name: '공개 키로 원본 자료를 직접 요청', request: 'GET originalApiUrl (apikey: 공개 키)', expected: 'HTTP 401·403 또는 메모 0건',
      actual: `HTTP ${res.status}, 메모 ${count}건`, status: [401, 403].includes(res.status) && count === 0 ? '통과' : '실패', source: 'live', requestId, checkedAt, note: '공개 키는 환경변수로만 받았고 기록에 쓰지 않음' });
  } catch (error) {
    add({ id: 'L20', step: 5, group: 'api', kind: 'forbidden', name: '공개 키로 원본 자료를 직접 요청', request: 'GET originalApiUrl (apikey: 공개 키)', expected: 'HTTP 401·403 또는 메모 0건', actual: `요청 실패: ${error.cause?.code ?? error.message}`, status: '실패', source: 'live', requestId, checkedAt, note: '' });
  }
} else {
  skip('L20', 5, 'api', '공개 키로 원본 자료를 직접 요청', 'GET originalApiUrl (apikey: 공개 키)', 'HTTP 401·403 또는 메모 0건', 'SUPABASE_PUBLISHABLE_KEY 환경변수가 없어 보내지 않았습니다.', 'forbidden');
}

// ── 판정기 규칙: 가상 요청으로 실제 decide()를 실행 ─────────────────────────────────
const { decide, RULE_IDS } = await import('../src/decider.mjs');
const { normal, suspicious } = fixtureRequests();
let n = 0;
async function rule(step, kind, name, request, expected) {
  n += 1;
  const response = await decide(request);
  const actual = `${response.decision} ${response.reasonCode}`;
  add({ id: `D${String(n).padStart(2, '0')}`, step, group: 'rules', kind, name, request: `${request.method} ${request.path} (${request.route})`, expected, actual,
    status: actual === expected ? '통과' : '실패', source: 'local', requestId: response.requestId, checkedAt: now(), note: '가상 요청, 심판 판정 아님' });
}
const fresh = (patch = {}) => ({ ...normal, requestId: randomUUID(), ...patch });
await rule(6, 'normal', '등록된 기기의 정상 요청', fresh(), 'allow approved');
await rule(6, 'forbidden', '미등록 기기', fresh({ deviceRegistered: false }), 'deny device_not_registered');
await rule(6, 'forbidden', '기기 등록 값이 없음', fresh({ deviceRegistered: undefined }), 'deny device_not_registered');
await rule(7, 'forbidden', '새벽·처음 보는 네트워크·대량 읽기', fresh({ signals: suspicious.signals, recentEvents: suspicious.recentEvents }), 'step_up step_up_required');
await rule(7, 'normal', '추가 확인을 마친 같은 접속', fresh({ signals: suspicious.signals, recentEvents: suspicious.recentEvents, stepUp: { verified: true, authAgeSeconds: 60 } }), 'allow approved');
await rule(7, 'forbidden', '위조된 출처의 접속 정보는 근거로 쓰지 않음', fresh({ signals: { ...suspicious.signals, source: 'x-forwarded-for' }, recentEvents: suspicious.recentEvents }), 'allow approved');
await rule(8, 'normal', '메모 한 건 읽기(ID가 UUID가 아니어도)', fresh({ path: '/notes/not-a-uuid' }), 'allow approved');
await rule(8, 'forbidden', '메모 전체 목록', fresh({ route: 'GET /notes', path: '/notes' }), 'deny resource_not_allowed');
await rule(8, 'forbidden', '메모 추가(ID 없는 경로)', fresh({ method: 'POST', route: 'POST /notes', path: '/notes' }), 'deny resource_not_allowed');
await rule(8, 'normal', '반 공지 읽기', fresh({ service: 'announcements', route: 'GET /announcements', path: '/announcements' }), 'allow approved');
await rule(8, 'forbidden', '반 공지 쓰기', fresh({ service: 'announcements', method: 'POST', route: 'POST /announcements', path: '/announcements' }), 'deny resource_not_allowed');
await rule(8, 'forbidden', '강사 자료 읽기', fresh({ service: 'instructor', route: 'GET /instructor/materials/:id', path: '/instructor/materials/1' }), 'deny resource_not_allowed');
await rule(8, 'forbidden', '쿼리로 기능을 고르는 요청', fresh({ queryLength: 9 }), 'deny resource_not_allowed');
await rule(8, 'forbidden', '/notes/export 같은 기능 경로', fresh({ path: '/notes/export' }), 'deny resource_not_allowed');

// ── 탐지: 가상 조회 사건으로 실제 detect()를 실행 ───────────────────────────────────
const { detect } = await import('../src/detect.mjs');
const START = Date.UTC(2026, 9, 1);
const reads = (count, { step = 2, owner = 'learner_fixture' } = {}) => Array.from({ length: count }, (_, i) => ({ at: new Date(START + i * step * 1000).toISOString(), method: 'GET', identity: { sub: owner } }));
const OBSERVE = 'observe';
const PROPOSE = 'propose_revocation burst_read learner_fixture';
let proposals = 0;
const cases = [
  ['정상 조회 30건', reads(30), OBSERVE, 'normal'],
  ['10분 안 정확히 120건', reads(120), OBSERVE, 'normal'],
  ['10분 안 121건', reads(121), PROPOSE, 'forbidden'],
  ['폭주 조회 200건', reads(200), PROPOSE, 'forbidden'],
  ['서로 다른 사용자 각 100건', [...reads(100), ...reads(100, { owner: 'other_fixture' })].sort((a, b) => a.at.localeCompare(b.at)), OBSERVE, 'normal'],
  ['10분 밖으로 흩어진 조회 200건', reads(200, { step: 7 }), OBSERVE, 'normal'],
];
for (const [index, [name, events, expected, kind]] of cases.entries()) {
  const result = detect(events);
  const actual = result.action === 'observe' ? 'observe' : `${result.action} ${result.reasonCode} ${result.subject}`;
  if (result.action === 'propose_revocation') proposals += 1;
  add({ id: `T${String(index + 1).padStart(2, '0')}`, step: 9, group: 'detect', kind, name, request: `가상 조회 사건 ${events.length}건`, expected, actual,
    status: actual === expected ? '통과' : '실패', source: 'local', requestId: randomUUID(), checkedAt: now(), note: '가상 사건, 심판 판정 아님' });
}
add({ id: 'R01', step: 9, group: 'revocation', kind: 'info', name: '탐지가 회수를 제안한 가상 묶음 수', request: `T01~T06 중 propose_revocation`, expected: '2건(121건·200건 묶음)',
  actual: `${proposals}건`, status: proposals === 2 ? '통과' : '실패', source: 'local', requestId: randomUUID(), checkedAt: now(), note: '제안만 세었고 실제 접속 회수는 아님' });
skip('R02', 9, 'revocation', '실제 접속 회수 집행', '엔진이 사건을 전달하고 회수를 집행', '제안 뒤 해당 사용자의 접속이 실제로 끊김', '회수는 제공 엔진(ALEPH SDP)의 몫이며 이 저장소의 앱은 detect를 호출하지 않아 실행할 수 없습니다.', 'forbidden');

// ── 정책 사본·복원: 실제 도구로 운영 정책 확인, 임시 복사본에서 침공·복원 시험 ─────────────────
const { collectPolicy, createSnapshot, diffPolicy, loadSnapshot, restorePolicy, simulateBreach } = await import('./policy-backup.mjs');
let snapshotHash = 'none';
try {
  const { items, hash } = loadSnapshot(root);
  snapshotHash = hash;
  const diffs = diffPolicy(items, collectPolicy(root));
  add({ id: 'P01', step: 10, group: 'restore', kind: 'normal', name: '운영 정책이 검증한 사본과 같다', request: 'npm run policy -- verify', expected: '차이 0건', actual: `차이 ${diffs.length}건`,
    status: diffs.length === 0 ? '통과' : '실패', source: 'local', requestId: randomUUID(), checkedAt: now(), note: `사본 해시 ${hash.slice(0, 12)}…` });
} catch (error) {
  add({ id: 'P01', step: 10, group: 'restore', kind: 'normal', name: '운영 정책이 검증한 사본과 같다', request: 'npm run policy -- verify', expected: '차이 0건', actual: error.message,
    status: '실패', source: 'local', requestId: randomUUID(), checkedAt: now(), note: '' });
}
{
  const temp = mkdtempSync(join(tmpdir(), 'ops-policy-'));
  for (const file of ['src/decider.mjs', 'src/resources.mjs', 'supabase/notes-rls.sql', 'supabase/notes-lockdown.sql', 'aleph.config.json']) {
    mkdirSync(join(temp, file, '..'), { recursive: true });
    cpSync(resolve(root, file), join(temp, file));
  }
  let actual;
  try {
    createSnapshot(temp);
    simulateBreach(temp);
    const planned = restorePolicy(temp).plan.map((p) => p.key).join(',');
    const done = restorePolicy(temp, { apply: true });
    actual = `바뀐 항목 ${planned}, 복원 뒤 남은 차이 ${done.remaining.length}건, 보존 ${done.kept.join(',')}`;
    add({ id: 'P02', step: 10, group: 'restore', kind: 'forbidden', name: '시험 정책의 규칙 한 줄 변조를 사본으로 되돌린다', request: '임시 복사본에서 snapshot→simulate→diff→restore --apply',
      expected: '바뀐 항목 src/decider.mjs, 남은 차이 0건, 다른 항목 보존', actual,
      status: planned === 'src/decider.mjs' && done.remaining.length === 0 && done.kept.includes('other-service/rules') ? '통과' : '실패', source: 'local', requestId: randomUUID(), checkedAt: now(), note: '운영 정책 파일은 건드리지 않음' });
  } catch (error) {
    add({ id: 'P02', step: 10, group: 'restore', kind: 'forbidden', name: '시험 정책의 규칙 한 줄 변조를 사본으로 되돌린다', request: '임시 복사본에서 snapshot→simulate→diff→restore --apply',
      expected: '바뀐 항목 src/decider.mjs, 남은 차이 0건, 다른 항목 보존', actual: error.message, status: '실패', source: 'local', requestId: randomUUID(), checkedAt: now(), note: '' });
  }
}
{
  const run = spawnSync(process.execPath, ['--test', 'test/'], { cwd: root, encoding: 'utf8', timeout: 120000 });
  const pass = Number(/ℹ pass (\d+)/u.exec(run.stdout)?.[1] ?? NaN);
  const fail = Number(/ℹ fail (\d+)/u.exec(run.stdout)?.[1] ?? NaN);
  add({ id: 'U01', step: 12, group: 'api', kind: 'normal', name: '저장소의 자동 시험 전체(소유자·역할·판정기·복원·기기 확인)', request: 'node --test test/', expected: '실패 0건',
    actual: Number.isNaN(pass) ? '결과를 읽지 못함' : `통과 ${pass}건, 실패 ${fail}건`, status: fail === 0 && pass > 0 ? '통과' : '실패', source: 'local', requestId: randomUUID(), checkedAt: now(), note: '가짜 DB를 쓰는 로컬 시험, 실제 배포 시험 아님' });
}

// ── 사용자가 화면에서 직접 확인해 알려 준 기록 / 실행하지 않은 시험 ─────────────────────────────
manual('M01', 3, 'api', 'A 계정 로그인 뒤 메모 추가·수정·삭제와 로그아웃', '화면 조작(사용자)', '추가·수정·삭제가 반영되고 로그아웃하면 로그인 화면', '모두 동작함(사용자 보고)', '이 도구는 로그인 정보를 쓰지 않음. 시각은 기록되지 않음');
manual('M02', 4, 'api', 'A와 B는 서로의 메모를 볼 수 없다', '두 창에서 각각 로그인(사용자)', '각자 자기 메모만 보임', '서로 메모가 보이지 않음(사용자 보고)', '이 도구는 로그인 정보를 쓰지 않음. 시각은 기록되지 않음', 'forbidden');
manual('M03', 10, 'restore', 'B의 메모 한 건 복원', 'POST /api/backup/restore (B 로그인, 사용자가 Console에서 실행)', 'restored·idMatches·ownerMatches·hashMatches 모두 true', '네 값 모두 true(사용자가 화면 캡처로 보고)', '메모 본문은 기록하지 않음. 시각은 기록되지 않음');
skip('N01', 4, 'api', 'B가 A의 메모 id로 직접 읽기·수정·삭제', 'B 로그인 토큰으로 GET·PUT·DELETE /api/notes/:id', '404', '로그인 정보가 필요해 이 도구가 실행하지 않았습니다(로컬 가짜 DB 시험 U01만 있음).', 'forbidden');
skip('N02', 8, 'rules', '본문에 role을 넣은 메모 요청', '로그인 토큰으로 POST /api/notes (본문 role)', '403 ROLE_NOT_TRUSTED', '로그인 정보가 필요해 이 도구가 실행하지 않았습니다(로컬 가짜 DB 시험 U01만 있음).', 'forbidden');
skip('N03', 7, 'rules', '실제 재로그인 시각을 검증한 뒤 재판정', '제공 엔진이 새 로그인 시각(stepUp)을 검증해 전달', '확인 전 자료 차단, 새 로그인 뒤 허용', '제공 엔진의 계약이 준비된 환경에서만 시험할 수 있어 실행하지 않았습니다.', 'forbidden');
skip('N04', 11, 'app', '승인 전 메모 API 거부와 승인 뒤 정상 화면', '로그인 + 서버에서 승인 SQL 실행 뒤 화면·API 확인', '승인 전 403 DEVICE_NOT_APPROVED, 승인 뒤 정상', '로그인 정보와 사람의 승인 작업이 필요해 이 도구가 실행하지 않았습니다(로컬 가짜 DB 시험 U01만 있음).', 'forbidden');
skip('N05', 11, 'app', '브라우저의 앱 설치와 오프라인 안내 화면', '브라우저 설치 아이콘·오프라인 전환', '설치 가능, 오프라인 안내 표시', '브라우저 화면에서 직접 확인해야 하며 이 도구가 실행하지 않았습니다.');
skip('N06', 12, 'api', '심판의 41종 공격 방어', '심판이 실행', '41종 모두 방어', '심판이 따로 실행하며 목록과 결과를 이 저장소에서 알 수 없습니다. 통과로 처리하지 않았습니다.', 'forbidden');

const report = {
  version: 1, generatedAt: now(), baseUrl: BASE,
  inspectedCommit: (() => { try { return JSON.parse(identity?.text ?? '{}').commit ?? '확인하지 못함'; } catch { return '확인하지 못함'; } })(),
  deployedStep: (() => { try { return JSON.parse(identity?.text ?? '{}').step ?? '확인하지 못함'; } catch { return '확인하지 못함'; } })(),
  policySnapshotHash: snapshotHash,
  summary: { ...countBy(rows), total: rows.length }, rows,
};
const problems = validateReport(report);
if (problems.length) {
  process.stderr.write(`작전실 기록 첫 오류: ${problems[0]}\n`);
  process.exitCode = 1;
} else {
  mkdirSync(resolve(root, 'ops'), { recursive: true });
  writeFileSync(resolve(root, 'ops', 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`ops/report.json 기록: ${JSON.stringify(report.summary)}\n`);
  for (const r of rows.filter((x) => x.status === '실패')) process.stdout.write(`실패 · ${r.id} ${r.name}: ${r.actual}\n`);
  process.stdout.write(`규칙 ${RULE_IDS.join(', ')}\n`);
}
