// 탈환 작전실: ops/report.json(npm run ops:report가 실제로 보낸 요청·실행한 시험의 기록)을 읽어 정적 화면을 만든다.
// 화면은 기록에 있는 값만 보여 준다. 성공 문구를 만들어 내지 않고, 실행하지 않은 시험은 '미실행'으로 따로 센다. 메모 제목·본문은 기록에 넣지 않는다.
export const STATUSES = ['통과', '실패', '직접 확인', '미실행'];
const SOURCES = ['local', 'live', 'manual', 'not_run'];
const KINDS = ['normal', 'forbidden', 'info'];
const GROUPS = ['rules', 'detect', 'revocation', 'restore', 'api', 'app'];
const FORBIDDEN_KEYS = ['title', 'content', 'body', 'token', 'password', 'secret'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u;
const ROW_KEYS = ['id', 'step', 'group', 'kind', 'name', 'request', 'expected', 'actual', 'status', 'source', 'requestId', 'serverId', 'checkedAt', 'note'];

export const countBy = (rows) => Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length]));

// 같은 번호의 옛 행과 지정한 행을 빼고 새 행을 더한 기록을 돌려준다. 요약 수치는 행에서 다시 센다.
export function mergeRows(report, removeIds, newRows) {
  const drop = new Set([...removeIds, ...newRows.map((r) => r.id)]);
  const rows = [...report.rows.filter((r) => !drop.has(r.id)), ...newRows];
  return { ...report, rows, summary: { ...countBy(rows), total: rows.length } };
}

// 기록이 스스로 모순되지 않는지 본다. 실측(통과·실패)은 요청 ID와 확인 시각이 있어야 하고, 미실행은 이유가 있어야 한다.
export function validateReport(report) {
  const problems = [];
  if (!report || report.version !== 1 || !Array.isArray(report.rows)) return ['보고서 형식이 맞지 않습니다.'];
  const ids = new Set();
  for (const row of report.rows) {
    const where = `행 ${row?.id ?? '?'}`;
    if (!row || typeof row !== 'object') { problems.push('행이 객체가 아닙니다.'); continue; }
    if (Object.keys(row).some((k) => !ROW_KEYS.includes(k) || FORBIDDEN_KEYS.includes(k))) problems.push(`${where}: 허용되지 않은 항목이 있습니다.`);
    if (ids.has(row.id)) problems.push(`${where}: id가 중복입니다.`);
    ids.add(row.id);
    if (!Number.isInteger(row.step) || row.step < 1 || row.step > 12) problems.push(`${where}: 단계가 맞지 않습니다.`);
    if (!KINDS.includes(row.kind) || !GROUPS.includes(row.group) || !STATUSES.includes(row.status) || !SOURCES.includes(row.source)) problems.push(`${where}: 분류 값이 맞지 않습니다.`);
    for (const key of ['name', 'request', 'expected', 'actual']) if (typeof row[key] !== 'string' || !row[key]) problems.push(`${where}: ${key}가 비어 있습니다.`);
    const measured = row.status === '통과' || row.status === '실패';
    if (measured && (!['local', 'live'].includes(row.source) || !UUID.test(row.requestId ?? '') || !ISO.test(row.checkedAt ?? ''))) problems.push(`${where}: 실측 결과에는 실제 실행 출처·요청 ID·확인 시각이 필요합니다.`);
    if (row.status === '직접 확인' && row.source !== 'manual') problems.push(`${where}: 직접 확인은 manual 출처여야 합니다.`);
    if (row.status === '미실행' && (row.source !== 'not_run' || row.actual !== '미실행' || typeof row.note !== 'string' || row.note.length < 5)) problems.push(`${where}: 미실행은 이유가 필요하고 실제 결과를 적을 수 없습니다.`);
    if (row.source === 'not_run' && row.status !== '미실행') problems.push(`${where}: 실행하지 않은 시험을 통과 처리할 수 없습니다.`);
  }
  const counts = countBy(report.rows);
  for (const status of STATUSES) if (report.summary?.[status] !== counts[status]) problems.push(`요약의 ${status} 수치가 행과 맞지 않습니다.`);
  if (report.summary?.total !== report.rows.length) problems.push('요약의 전체 수치가 행과 맞지 않습니다.');
  return problems;
}

const esc = (value) => String(value ?? '').replace(/[&<>"']/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const badge = (status) => `<span class="b ${{ 통과: 'ok', 실패: 'bad', '직접 확인': 'man', 미실행: 'skip' }[status]}">${esc(status)}</span>`;
const PANELS = [
  ['rules', '판정기 규칙', '기기 등록·자원 구역·추가 확인 규칙에 가상 요청을 넣어 실제로 돌린 결과입니다.'],
  ['detect', '탐지 사건', '가상 조회 사건을 탐지 함수에 넣어 실제로 돌린 결과입니다.'],
  ['revocation', '회수 상태', '탐지 함수는 회수를 제안만 합니다. 실제 접속 회수는 제공 엔진의 몫이라 이 저장소에서 실행하지 않았습니다.'],
  ['restore', '복구 버전', '안전 정책 사본의 해시와 복원 시험, 메모 한 건 복원 기록입니다.'],
  ['api', '자료실 API·화면', '배포 주소에 로그인 없이 보낸 요청과 화면 확인 결과입니다.'],
  ['app', '접속 앱', '설치형 웹앱과 기기 승인 흐름입니다.'],
];

const tableRows = (rows) => rows.map((r) => `<tr>
<td>${esc(r.id)}</td><td>${r.step}</td><td>${r.kind === 'forbidden' ? '금지' : r.kind === 'normal' ? '정상' : '안내'}</td>
<td>${esc(r.name)}<br><small>${esc(r.request)}</small></td><td>${esc(r.expected)}</td><td>${esc(r.actual)}</td>
<td>${badge(r.status)}</td><td><small>${esc(r.requestId ?? '—')}${r.serverId ? `<br>서버 ${esc(r.serverId)}` : ''}</small></td>
<td><small>${esc(r.checkedAt ?? '시각 기록 없음')}</small></td><td><small>${esc(r.note ?? '')}</small></td></tr>`).join('\n');

export function renderOps(report) {
  const problems = validateReport(report);
  if (problems.length) throw new Error(`탈환 작전실 기록이 맞지 않습니다: ${problems[0]}`);
  const counts = countBy(report.rows);
  const panels = PANELS.map(([group, title, text]) => {
    const rows = report.rows.filter((r) => r.group === group);
    const c = countBy(rows);
    return `<section class="panel" id="${group}"><h2>${esc(title)}</h2><p>${esc(text)}</p>
<p class="n">통과 ${c['통과']} · 실패 ${c['실패']} · 직접 확인 ${c['직접 확인']} · 미실행 ${c['미실행']} (전체 ${rows.length})</p>
<ul>${rows.map((r) => `<li>${badge(r.status)} 단계 ${r.step} ${esc(r.name)} — ${esc(r.actual)}</li>`).join('')}</ul></section>`;
  }).join('\n');
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>탈환 작전실 | BYTE BACK</title>
<link rel="manifest" href="/manifest.webmanifest">
<style>
:root{color-scheme:dark;font-family:system-ui,sans-serif}
body{margin:0;background:#101a28;color:#ecf4ff}main{max-width:1100px;margin:0 auto;padding:36px 18px 60px}
h1{font-size:clamp(28px,6vw,42px);margin:8px 0}h2{margin:0 0 6px;font-size:20px}p,li{line-height:1.6;color:#bfd0e5}a{color:#8ad8df}
.eyebrow{color:#8ad8df;font-weight:700;letter-spacing:.08em;font-size:14px}
.notice{border:1px solid #d07384;background:#612a3544;border-radius:12px;padding:14px 16px;color:#ffe3e8;margin:18px 0}
.sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:18px 0}
.sum div{border:1px solid #51667c;background:#1a2a3d;border-radius:12px;padding:12px 14px}.sum b{display:block;font-size:26px;color:#ecf4ff}
.panel{border:1px solid #51667c;background:#142234;border-radius:14px;padding:16px;margin:14px 0}.panel ul{padding-left:18px;margin:8px 0 0}
.n{color:#8ad8df;font-weight:700}.b{display:inline-block;border-radius:8px;padding:1px 8px;font-size:13px;font-weight:700;color:#0c1520}
.ok{background:#8ad8df}.bad{background:#ff8a9a}.man{background:#f2d98a}.skip{background:#9aa9bb}
.wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:980px;font-size:14px}th,td{border:1px solid #2f4258;padding:8px;vertical-align:top;text-align:left;color:#dbe8f7}th{background:#1a2a3d}small{color:#9fb3cb}
</style>
</head>
<body>
<main>
<div class="eyebrow">BYTE BACK · 12단계 탈환 작전실</div>
<h1>탈환 작전실</h1>
<p>이 화면의 수치는 <code>ops/report.json</code>의 기록을 그대로 센 값입니다. 통과는 <code>npm run ops:report</code>가 실제로 보낸 요청이나 실행한 시험의 결과이고, 직접 확인은 사용자가 화면에서 확인해 알려 준 기록이며, 미실행은 실행하지 않은 시험입니다. 가상 메모 본문은 기록에도 화면에도 없습니다.</p>
<div class="notice">이 화면의 문구를 심판 통과나 방어 성공의 근거로 쓰지 않습니다. 심판의 41종 공격 방어 판정은 심판이 따로 실행하며 이 기록에서는 미실행으로 둡니다.</div>
<div class="sum">
<div>전체 시험<b>${report.rows.length}</b></div>
<div>실측 통과<b>${counts['통과']}</b></div>
<div>실측 실패<b>${counts['실패']}</b></div>
<div>직접 확인<b>${counts['직접 확인']}</b></div>
<div>미실행<b>${counts['미실행']}</b></div>
</div>
<p>기록 시각 ${esc(report.generatedAt)} · 확인한 주소 ${esc(report.baseUrl)} · 검사한 배포 커밋 <code>${esc(report.inspectedCommit)}</code>(<code>/aleph.json</code> 기준) · 단계 ${esc(report.deployedStep)} · 정책 사본 해시 <code>${esc(report.policySnapshotHash)}</code></p>
${panels}
<h2>전체 시험표</h2>
<div class="wrap"><table>
<thead><tr><th>번호</th><th>단계</th><th>구분</th><th>시험</th><th>기대 결과</th><th>실제 결과</th><th>상태</th><th>요청 ID</th><th>확인 시각</th><th>비고</th></tr></thead>
<tbody>
${tableRows(report.rows)}
</tbody></table></div>
<p><a href="/">자료실로 돌아가기</a></p>
</main>
</body>
</html>
`;
}
