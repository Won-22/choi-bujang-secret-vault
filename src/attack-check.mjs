import { randomUUID } from 'node:crypto';

// 보내는 GET마다 randomUUID()로 새 요청 ID를 만들어 x-request-id와 x-aleph-request-id로 보내고, 응답을 받으면 실제 HTTP 상태와 요청 ID를 observed에 적는다.
// 응답 헤더가 어떻게 걸러졌든(서버 흔적 헤더가 없어도) 응답을 받았다면 상태를 적는다. 서버가 요청 ID를 되돌려 주었다면 그 값을, 아니면 보낸 ID를 적는다.
// 요청을 보내지 않았거나 응답을 받지 못한 점검만 상태와 ID를 지어내지 않고 not_run(미실행)으로 적는다.
const ID_PATTERN = /^[A-Za-z0-9._:-]{8,100}$/u;
async function sendGet(url, headers = {}) {
  const requestId = randomUUID();
  try {
    const response = await fetch(url, { headers: { ...headers, 'x-request-id': requestId, 'x-aleph-request-id': requestId },
      redirect: 'error', signal: AbortSignal.timeout(10000) });
    const echoed = response.headers?.get?.('x-request-id');
    const id = typeof echoed === 'string' && ID_PATTERN.test(echoed) ? echoed : requestId;
    return { response, status: response.status, requestId: id, sent: true, tag: `HTTP ${response.status}, request_id=${id}` };
  } catch (error) {
    return { response: null, status: null, requestId: null, sent: false,
      tag: `not_run: 응답을 받지 못함(${error.cause?.code ?? error.message})` };
  }
}

// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (!(config.step >= 1 && config.step <= 12)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (typeof config.sampleMarker !== 'string' || !config.sampleMarker) throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
  if (config.step === 2) return checkStep2(app, config);
  if (config.step >= 3) return checkStep3(app, config.step, config);
  const sent = await sendGet(new URL('/data.json', app));
  const response = sent.response;
  let visible = false;
  if (response?.ok) {
    try {
      const data = await response.json();
      visible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)
        && data.notes.length > 0;
    } catch {
      // A non-JSON response is a failed check, not a successful deployment.
    }
  }
  return [{ attackId: 'anonymous_note_read', expected: '비로그인 화면에서 가상 메모를 확인',
    observed: `${visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : '비로그인 요청에서 확인 표시가 보이지 않음'} (${sent.tag})` }];
}

// 2단계: 옛 공개 파일은 사라졌는지, 새 서버 API는 아직 누구에게나 열려 있는지 비로그인으로 확인한다.
async function checkStep2(app, config) {
  const get = (path) => sendGet(new URL(path, app));
  const count = async (response) => {
    if (!response?.ok) return 0;
    try {
      const data = await response.json();
      return Array.isArray(data?.notes) ? data.notes.length : 0;
    } catch {
      return 0;
    }
  };
  const old = await get('/data.json');
  const oldCount = await count(old.response);
  const api = await get('/api/notes');
  const apiCount = await count(api.response);
  return [
    { attackId: 'static_data_json_gone', expected: '로그인 없는 GET /data.json에 메모가 없거나 404',
      observed: `비로그인 /data.json: 메모 ${oldCount}건 (${old.tag})` },
    { attackId: 'public_api_still_open', expected: '3단계 전이라 /api/notes는 아직 열려 있음(남은 약점)',
      observed: `비로그인 /api/notes: 메모 ${apiCount}건 (${api.tag}), 표시 ${config.sampleMarker}` },
  ];
}

// 로그인 없이 보낸 GET 한 건: 실제로 받은 HTTP 상태와 요청 ID만 observed에 적는다(응답을 받지 못했으면 not_run).
async function anonymousGet(app, path, attackId, expected) {
  const sent = await sendGet(new URL(path, app));
  return { attackId, expected, observed: sent.tag };
}

const notRun = (attackId, expected, why) => ({ attackId, expected, observed: `not_run(미실행): 요청을 보내지 않음, ${why}` });

// 3단계 이후: 1~11단계 점검마다 기대 결과와 실제 결과를 남긴다. 로그인 없이 보내는 GET만 실제로 보내고, 나머지는 요청을 보내지 않았으므로 not_run이다.
async function checkStep3(app, step, config) {
  const ITEM = '33333333-3333-4333-8333-333333333333';
  const attempts = [
    await anonymousGet(app, '/api/identity', 'deployment_identity_open', '1단계: 로그인 없는 GET /api/identity는 200과 저장소·커밋 식별을 돌려줌'),
    await anonymousGet(app, '/data.json', 'static_data_json_gone', '2단계: 로그인 없는 GET /data.json에 메모가 없거나 404'),
    await anonymousGet(app, '/api/notes', 'anonymous_list_refused', '3단계: 로그인 없는 GET /api/notes는 401/403과 JSON 오류'),
    await anonymousGet(app, '/api/session', 'anonymous_session_probe', '3단계: 로그인 없는 GET /api/session은 401/403/405로 거부(세션을 읽을 수 없음)'),
  ];
  if (step >= 4) attempts.push(await anonymousGet(app, `/api/notes/${ITEM}`, 'anonymous_item_refused', '4단계: 로그인 없는 GET /api/notes/:id는 401/403'));
  if (step >= 5) attempts.push(await checkOriginalApi(config));
  if (step >= 6) attempts.push(notRun('decider_device_registered', '6단계: 미등록 기기 요청은 deny device_not_registered', '판정기는 요청이 아닌 함수 시험이라 npm run decider:test로 실행함'));
  if (step >= 7) attempts.push(notRun('decider_step_up_required', '7단계: 새벽·처음 보는 네트워크·대량 읽기는 step_up', '판정기는 요청이 아닌 함수 시험이라 npm run decider:test로 실행함'));
  if (step >= 8) attempts.push(notRun('decider_resource_zone', '8단계: 메모 목록·반 공지 쓰기·강사 자료는 deny', '판정기는 요청이 아닌 함수 시험이라 npm test로 실행함'));
  if (step >= 9) attempts.push(notRun('detect_burst_read', '9단계: 10분 안 GET 121건부터 propose_revocation', '탐지는 요청이 아닌 함수 시험이라 npm run detect:test로 실행함'));
  if (step >= 10) attempts.push(notRun('restore_route_login_required', '10단계: 로그인 없는 POST /api/backup/restore는 401', 'POST 요청이라 이 점검은 GET만 보내므로 보내지 않음(npm run ops:report에서 실측)'));
  if (step >= 11) attempts.push(await anonymousGet(app, '/api/device', 'anonymous_device_refused', '11단계: 로그인 없는 GET /api/device는 401/403'));
  attempts.push(notRun('login_note_flow', '3단계: A 로그인 뒤 메모 추가·수정·삭제 가능', '이 스크립트는 로그인 정보를 쓰지 않아 화면과 ops:live에서 확인함'));
  if (step >= 4) attempts.push(notRun('cross_owner_access', '4단계: B가 A의 메모를 읽기·수정·삭제하거나 소유자를 바꾸면 거부', '이 스크립트는 로그인 정보를 쓰지 않아 ops:live에서 확인함'));
  return attempts;
}

// 5단계: 공개(anon) 키로 원본 자료 주소를 직접 불러도 메모가 없어야 한다. 키는 환경변수로만 받는다.
async function checkOriginalApi(config) {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!key) {
    return { attackId: 'original_api_direct', expected: '5단계: 공개 키로 원본 자료를 직접 불러도 메모가 없음',
      observed: 'not_run(미실행): 요청을 보내지 않음, SUPABASE_PUBLISHABLE_KEY 환경변수가 없음' };
  }
  const sent = await sendGet(config.originalApiUrl, { apikey: key });
  if (!sent.sent) return { attackId: 'original_api_direct', expected: '5단계: 공개 키로 원본 자료를 직접 불러도 메모가 없음', observed: sent.tag };
  let rows = 0;
  try {
    const data = await sent.response?.json();
    rows = Array.isArray(data) ? data.length : 0;
  } catch {
    // JSON이 아니면 읽은 메모가 없다.
  }
  return { attackId: 'original_api_direct', expected: '5단계: 공개 키로 원본 자료를 직접 불러도 메모가 없음',
    observed: `anon 키로 원본 직접 GET: 메모 ${rows}건 (${sent.tag})` };
}
