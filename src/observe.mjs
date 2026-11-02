const ID = /^[A-Za-z0-9._:-]{8,100}$/u;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;

// 경로 모양만 남긴다: UUID는 :id로, 쿼리는 버린다(어느 사용자의 어느 메모인지 알 수 없게 가린다).
export const routeOf = (url) => String(url ?? '').split('?')[0].replace(UUID, ':id').slice(0, 120);

// 접속 도구는 이름을 저장하지 않고 구분만 남긴다: 심판 점검 도구, 접속 도구 이름이 없는 요청, 그 밖.
export const clientOf = (ua) => (typeof ua !== 'string' || !ua ? 'no-ua' : /^ALEPH-Defense-Judge\//iu.test(ua) ? 'aleph-judge' : 'other');

// Vercel의 x-vercel-id(예: sin1::iad1::abcde-1793-ff00)에서 마지막 조각이 대시보드 Logs의 Request ID다.
export const serverIdOf = (value) => (typeof value === 'string' && /^[A-Za-z0-9:_-]{8,120}$/u.test(value) ? value.split('::').pop() : null);

// 응답을 곧바로 보내지 않고 상태·본문을 모아 두는 가짜 응답. 서버 관측을 기록한 뒤 실제 응답으로 보낸다.
function buffered(real) {
  const state = { code: 200, body: undefined, done: false };
  const fake = {
    setHeader: (k, v) => real.setHeader(k, v),
    status(code) { state.code = code; return fake; },
    json(body) { state.body = body; state.done = true; return fake; },
  };
  return { fake, state };
}

// 서버가 받은 요청을 기록한다. 기록하지 못해도(표가 없음·DB 오류) 응답은 그대로 나간다.
// record(row)는 서버 관측 한 줄을 저장하는 함수다.
export async function observe(request, response, run, record) {
  const { fake, state } = buffered(response);
  try {
    await run(fake);
  } finally {
    if (state.done) {
      const raw = request.headers?.['x-request-id'];
      const row = {
        request_id: typeof raw === 'string' && ID.test(raw) ? raw : null,
        method: String(request.method ?? 'GET'),
        route: routeOf(request.url),
        status: state.code,
        client: clientOf(request.headers?.['user-agent']),
        server_request_id: serverIdOf(request.headers?.['x-vercel-id']),
      };
      try { await record(row); } catch { /* 관측을 못 남겨도 응답은 막지 않는다 */ }
      response.status(state.code).json(state.body);
    }
  }
}

// GET /api/observed?request_id=ID — 서버가 그 요청 ID를 받아 기록했는지 확인한다.
// GET /api/observed?recent=1[&client=aleph-judge] — 최근 요청을 가린 형태로 돌려준다.
// 돌려주는 값은 방법·경로 모양·상태·시각·접속 도구 구분·서버 요청 번호뿐이다.
export function observedApi({ find, recent }) {
  const mask = (r) => ({ at: r.at, method: r.method, route: r.route, status: r.status, client: r.client ?? 'other', serverRequestId: r.server_request_id ?? null });
  return async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'GET') return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    if (request.query?.recent) {
      const { data, error } = await recent(request.query.client === 'aleph-judge' ? 'aleph-judge' : null);
      if (error) return response.status(502).json({ error: 'OBSERVATION_UNAVAILABLE' });
      return response.status(200).json({ recent: data.map(mask) });
    }
    const id = String(request.query?.request_id ?? '');
    if (!ID.test(id)) return response.status(400).json({ error: 'INVALID_REQUEST_ID' });
    const { data, error } = await find(id);
    if (error) return response.status(502).json({ error: 'OBSERVATION_UNAVAILABLE' });
    return response.status(200).json({ requestId: id, found: data.length > 0, observations: data.map(mask) });
  };
}
