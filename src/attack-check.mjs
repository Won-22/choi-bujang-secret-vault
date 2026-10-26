// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (config.step !== 1 && config.step !== 2) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
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
