// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (![1, 2, 3, 4, 5].includes(config.step)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
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
  const response = await fetch(new URL('/data.json', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  let visible = false;
  if (response.ok) {
    try {
      const data = await response.json();
      visible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)
        && data.notes.length > 0;
    } catch {
      // A non-JSON response is a failed check, not a successful deployment.
    }
  }
  return [{ attackId: 'anonymous_note_read', expected: '비로그인 화면에서 가상 메모를 확인',
    observed: visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})` }];
}

// 2단계: 옛 공개 파일은 사라졌는지, 새 서버 API는 아직 누구에게나 열려 있는지 비로그인으로 확인한다.
async function checkStep2(app, config) {
  const get = (path) => fetch(new URL(path, app), { redirect: 'error', signal: AbortSignal.timeout(10000) });
  const count = async (response) => {
    if (!response.ok) return 0;
    try {
      const data = await response.json();
      return Array.isArray(data?.notes) ? data.notes.length : 0;
    } catch {
      return 0;
    }
  };
  const old = await get('/data.json');
  const oldCount = await count(old);
  const api = await get('/api/notes');
  const apiCount = await count(api);
  return [
    { attackId: 'static_data_json_gone', expected: '/data.json에 메모가 없거나 404',
      observed: `비로그인 /data.json: HTTP ${old.status}, 메모 ${oldCount}건` },
    { attackId: 'public_api_still_open', expected: '3단계 전이라 /api/notes는 아직 열려 있음(남은 약점)',
      observed: `비로그인 /api/notes: HTTP ${api.status}, 메모 ${apiCount}건 (표시: ${config.sampleMarker})` },
  ];
}

// 3단계: 로그인 없이 목록을 부르면 401/403 JSON으로 거부되는지 확인한다. 로그인한 A 계정의 흐름은 직접 확인한다.
async function checkStep3(app, step, config) {
  const get = (path) => fetch(new URL(path, app), { redirect: 'error', signal: AbortSignal.timeout(10000) });
  const old = await get('/data.json');
  const list = await get('/api/notes');
  let jsonError = false;
  try {
    jsonError = typeof (await list.json())?.error === 'string';
  } catch {
    // JSON이 아니면 거부 문구를 확인하지 못한 것이다.
  }
  const refused = [401, 403].includes(list.status) && jsonError;
  return [
    { attackId: 'static_data_json_gone', expected: '/data.json에 메모가 없거나 404',
      observed: `비로그인 /data.json: HTTP ${old.status}` },
    { attackId: 'anonymous_list_refused', expected: '로그인 없는 목록 요청은 401/403과 JSON 오류',
      observed: `비로그인 GET /api/notes: HTTP ${list.status}, JSON 오류 문구 ${jsonError ? '있음' : '없음'}${refused ? '' : ' (거부 실패)'}` },
    { attackId: 'login_note_flow', expected: 'A 로그인 뒤 메모 추가·수정·삭제 가능',
      observed: '미실행: 이 스크립트는 로그인 정보를 쓰지 않아 화면에서 직접 확인함' },
    ...(step >= 5 ? [await checkOriginalApi(config)] : []),
    ...(step >= 4 ? [{ attackId: 'cross_owner_access', expected: 'B가 A의 메모를 읽기·수정·삭제하거나 소유자를 바꾸면 거부',
      observed: '미실행: 이 스크립트는 로그인 정보를 쓰지 않아 A/B 두 창에서 직접 확인함' }] : []),
  ];
}

// 5단계: 공개(anon) 키로 원본 자료 주소를 직접 불러도 메모가 없어야 한다. 키는 환경변수로만 받는다.
async function checkOriginalApi(config) {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!key) {
    return { attackId: 'original_api_direct', expected: '공개 키로 원본 자료를 직접 불러도 메모가 없음',
      observed: '미실행: SUPABASE_PUBLISHABLE_KEY 환경변수가 없어 보내지 않음' };
  }
  const response = await fetch(config.originalApiUrl, {
    headers: { apikey: key }, redirect: 'error', signal: AbortSignal.timeout(10000) });
  let rows = 0;
  try {
    const data = await response.json();
    rows = Array.isArray(data) ? data.length : 0;
  } catch {
    // JSON이 아니면 읽은 메모가 없다.
  }
  return { attackId: 'original_api_direct', expected: '공개 키로 원본 자료를 직접 불러도 메모가 없음',
    observed: `anon 키로 원본 직접 요청: HTTP ${response.status}, 메모 ${rows}건` };
}
