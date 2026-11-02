import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mergeRows, validateReport } from '../src/ops-page.mjs';

// 로그인이 필요한 시험(다른 사용자 메모 접근·본문 role·승인 전후 기기 확인)을 실제 배포 주소에 실행해 ops/report.json의 미실행 항목을 실측으로 바꾼다.
// 계정 정보는 사용자의 터미널 환경변수로만 받는다(OPS_A_EMAIL, OPS_A_PASSWORD, OPS_B_EMAIL, OPS_B_PASSWORD). 출력·기록·파일에 비밀번호와 토큰을 쓰지 않는다.
// 기기 쿠키(비밀)는 Git에서 제외되는 ops/.device-cookies.json에만 둔다. 시험이 만든 메모는 끝에 삭제한다.
const root = resolve(import.meta.dirname, '..');
const reportPath = resolve(root, 'ops', 'report.json');
const cookiePath = resolve(root, 'ops', '.device-cookies.json');
const config = JSON.parse(readFileSync(resolve(root, 'aleph.config.json'), 'utf8'));
const BASE = (process.env.OPS_BASE_URL ?? config.publicAppUrl).replace(/\/+$/u, '');
const env = (name) => process.env[name]?.trim();
const accounts = { a: { email: env('OPS_A_EMAIL'), password: env('OPS_A_PASSWORD') }, b: { email: env('OPS_B_EMAIL'), password: env('OPS_B_PASSWORD') } };
if (Object.values(accounts).some((x) => !x.email || !x.password)) {
  process.stderr.write('사용법: 터미널에서 OPS_A_EMAIL, OPS_A_PASSWORD, OPS_B_EMAIL, OPS_B_PASSWORD를 설정한 뒤 npm run ops:live 를 실행하세요. 값은 채팅에 보내지 마세요.\n');
  process.exit(1);
}

const now = () => new Date().toISOString();
const rows = [];
async function call({ method = 'GET', path, token, cookie, body }) {
  const requestId = randomUUID();
  const headers = { 'x-request-id': requestId, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) };
  try {
    const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual', signal: AbortSignal.timeout(20000) });
    const data = await res.json().catch(() => null);
    return { status: res.status, data, requestId, serverId: res.headers.get('x-vercel-id'), checkedAt: now(), setCookie: res.headers.getSetCookie?.() ?? [] };
  } catch (error) {
    return { status: 0, data: { error: `요청 실패 ${error.cause?.code ?? error.message}` }, requestId, serverId: null, checkedAt: now(), setCookie: [] };
  }
}
const describe = (r) => `HTTP ${r.status}${r.data?.error ? ` ${r.data.error}` : ''}`;
function measured(id, step, group, kind, name, request, expected, r, ok, note = '') {
  rows.push({ id, step, group, kind, name, request, expected, actual: describe(r), status: ok ? '통과' : '실패', source: 'live', requestId: r.requestId, serverId: r.serverId, checkedAt: r.checkedAt, note });
}
async function login(who) {
  const r = await call({ method: 'POST', path: '/api/session', body: accounts[who] });
  if (r.status !== 200 || !r.data?.access_token) throw new Error(`${who.toUpperCase()} 로그인 실패: ${describe(r)}`);
  return r.data.access_token;
}

const saved = existsSync(cookiePath) ? JSON.parse(readFileSync(cookiePath, 'utf8')) : {};
async function deviceStatus(who, token) {
  let r = await call({ path: '/api/device', token, cookie: saved[who] });
  if (r.status === 200 && r.data.status === 'none') {
    r = await call({ method: 'POST', path: '/api/device', token, cookie: saved[who] });
    const cookie = r.setCookie.map((c) => c.split(';')[0]).find((c) => c.startsWith('vault_device='));
    if (cookie) saved[who] = cookie;
  }
  return { status: r.data?.status ?? 'error', deviceId: r.data?.deviceId ?? null };
}

const identity = await call({ path: '/aleph.json' });
const commit = String(identity.data?.commit ?? '확인하지 못함').slice(0, 7);
const note = `배포 커밋 ${commit}, 계정은 이 도구가 환경변수로 받아 로그인(값은 기록하지 않음)`;
const tokenA = await login('a');
const tokenB = await login('b');
const dev = { a: await deviceStatus('a', tokenA), b: await deviceStatus('b', tokenB) };
writeFileSync(cookiePath, `${JSON.stringify(saved)}\n`);

// 승인 상태와 관계없이 실행할 수 있는 시험: 기기 쿠키가 없거나 틀린 요청은 로그인했어도 메모가 열리지 않는다.
const forged = `vault_device=${randomUUID()}.${'0'.repeat(64)}`;
let r = await call({ path: '/api/notes', token: tokenA });
measured('V01', 11, 'app', 'forbidden', '로그인했지만 기기 쿠키가 없는 요청', 'GET /api/notes (A 토큰, 쿠키 없음)', 'HTTP 403 DEVICE_NOT_APPROVED', r, r.status === 403 && r.data?.error === 'DEVICE_NOT_APPROVED', note);
r = await call({ path: '/api/notes', token: tokenA, cookie: forged });
measured('V02', 11, 'app', 'forbidden', '로그인했지만 틀린 기기 쿠키', 'GET /api/notes (A 토큰, 위조 쿠키)', 'HTTP 403 DEVICE_NOT_APPROVED', r, r.status === 403 && r.data?.error === 'DEVICE_NOT_APPROVED', note);

const pending = ['a', 'b'].filter((who) => dev[who].status !== 'approved');
if (pending.length) {
  process.stdout.write(`\n승인 대기 기기: ${pending.map((w) => `${w.toUpperCase()} ${dev[w].deviceId}`).join(', ')}\nSupabase SQL Editor에서 실행하세요:\n  update public.devices set status = 'approved', approved_at = now() where id in (${pending.map((w) => `'${dev[w].deviceId}'`).join(', ')}) and status = 'pending';\n그 뒤 npm run ops:live 를 다시 실행하세요.\n`);
} else {
  const A = { token: tokenA, cookie: saved.a };
  const B = { token: tokenB, cookie: saved.b };
  let id = null;
  try {
    r = await call({ path: '/api/notes', ...A });
    measured('V03', 11, 'app', 'normal', '승인된 기기의 메모 목록', 'GET /api/notes (A 토큰, 승인된 기기)', 'HTTP 200', r, r.status === 200 && Array.isArray(r.data), note);
    r = await call({ method: 'POST', path: '/api/notes', ...A, body: { title: '실습용 가상 시험 메모', body: '운영 시험용 가상 기록' } });
    id = r.data?.id ?? null;
    measured('V10', 3, 'api', 'normal', 'A가 자기 메모 추가', 'POST /api/notes (A)', 'HTTP 201', r, r.status === 201 && Boolean(id), note);
    const target = `/api/notes/${id}`;
    r = await call({ path: target, ...B });
    measured('V04', 4, 'api', 'forbidden', 'B가 A의 메모 한 건 읽기', 'GET /api/notes/:id (B가 A의 id)', 'HTTP 404', r, r.status === 404, note);
    r = await call({ method: 'PUT', path: target, ...B, body: { title: 'x', body: 'y' } });
    measured('V05', 4, 'api', 'forbidden', 'B가 A의 메모 수정', 'PUT /api/notes/:id (B가 A의 id)', 'HTTP 404', r, r.status === 404, note);
    r = await call({ method: 'DELETE', path: target, ...B });
    measured('V06', 4, 'api', 'forbidden', 'B가 A의 메모 삭제', 'DELETE /api/notes/:id (B가 A의 id)', 'HTTP 404', r, r.status === 404, note);
    r = await call({ path: '/api/notes', ...B });
    measured('V07', 4, 'api', 'forbidden', 'B의 목록에 A의 메모가 보임', 'GET /api/notes (B)', 'HTTP 200이고 A의 id 없음', r, r.status === 200 && Array.isArray(r.data) && !r.data.some((n) => n.id === id), note);
    const ownerA = JSON.parse(Buffer.from(tokenA.split('.')[1], 'base64url').toString()).sub;
    r = await call({ method: 'POST', path: '/api/notes', ...B, body: { title: 'x', body: 'y', owner_id: ownerA } });
    measured('V08', 4, 'api', 'forbidden', 'B가 A의 소유자 ID로 메모 추가', 'POST /api/notes (본문 owner_id=A)', 'HTTP 403 OWNER_MISMATCH', r, r.status === 403 && r.data?.error === 'OWNER_MISMATCH', note);
    r = await call({ method: 'POST', path: '/api/notes', ...A, body: { title: 'x', body: 'y', role: 'instructor' } });
    measured('V09', 8, 'rules', 'forbidden', '본문에 role을 넣은 메모 추가', 'POST /api/notes (본문 role)', 'HTTP 403 ROLE_NOT_TRUSTED', r, r.status === 403 && r.data?.error === 'ROLE_NOT_TRUSTED', note);
    r = await call({ path: target, ...A });
    measured('V11', 3, 'api', 'normal', 'A가 자기 메모 읽기', 'GET /api/notes/:id (A)', 'HTTP 200', r, r.status === 200 && r.data?.id === id, note);
    r = await call({ method: 'PUT', path: target, ...A, body: { title: '실습용 가상 시험 메모', body: '수정한 가상 기록' } });
    measured('V12', 3, 'api', 'normal', 'A가 자기 메모 수정', 'PUT /api/notes/:id (A)', 'HTTP 200', r, r.status === 200, note);
    r = await call({ method: 'DELETE', path: target, ...A });
    if (r.status === 200) id = null;
    measured('V13', 3, 'api', 'normal', 'A가 자기 메모 삭제', 'DELETE /api/notes/:id (A)', 'HTTP 200', r, r.status === 200, note);
    r = await call({ path: target, ...A });
    measured('V14', 4, 'api', 'normal', '삭제한 메모는 읽을 수 없음', 'GET /api/notes/:id (A, 삭제 뒤)', 'HTTP 404', r, r.status === 404, note);
  } finally {
    if (id) await call({ method: 'DELETE', path: `/api/notes/${id}`, ...A });
  }
}

// 서버 관측 대조: 서버가 같은 요청 ID를 같은 상태로 기록했는지 /api/observed로 확인해 행에 적는다(확인하지 못하면 적지 않는다).
async function serverSaw(requestId) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const r = await call({ path: `/api/observed?request_id=${requestId}` });
    const first = r.data?.observations?.[0];
    if (first) return first.status;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return null;
}
for (const row of rows) {
  if (row.source !== 'live' || !row.requestId) continue;
  const status = await serverSaw(row.requestId);
  const code = Number(/HTTP (\d{3})/u.exec(row.actual)?.[1]);
  if (status === null) continue;
  row.serverObserved = `HTTP ${status}`;
  if (status !== code) { row.status = '실패'; row.note = `${row.note} 서버 관측 ${status}과 받은 상태 ${code}가 다름`.trim(); }
}

const base = JSON.parse(readFileSync(reportPath, 'utf8'));
// 승인된 기기에서 전체 흐름을 실측했을 때만 옛 미실행 항목(N01·N02·N04)을 지운다. 승인 대기면 V01·V02만 더하고 옛 항목은 그대로 둔다.
const replace = pending.length ? [] : ['N01', 'N02', 'N04'];
for (const row of rows) if (row.source === 'live' && row.status === '통과' && !row.serverObserved) row.status = '연결 미확인';
const merged = mergeRows(base, replace, rows);
merged.generatedAt = now();
const problems = validateReport(merged);
if (problems.length) {
  process.stderr.write(`기록 첫 오류: ${problems[0]}\n`);
  process.exit(1);
}
writeFileSync(reportPath, `${JSON.stringify(merged, null, 2)}\n`);
process.stdout.write(`\nops/report.json 갱신: ${JSON.stringify(merged.summary)}\n`);
for (const x of rows) process.stdout.write(`${x.status.padEnd(4)} ${x.id} ${x.name} — ${x.actual}\n`);
