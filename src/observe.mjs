const ID = /^[A-Za-z0-9._:-]{8,100}$/u;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;

// 경로 모양만 남긴다: UUID는 :id로, 쿼리는 버린다(어느 사용자의 어느 메모인지 알 수 없게 가린다).
export const routeOf = (url) => String(url ?? '').split('?')[0].replace(UUID, ':id').slice(0, 120);

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
// record({ request_id, method, route, status })는 서버 관측 한 줄을 저장하는 함수다.
export async function observe(request, response, run, record) {
  const { fake, state } = buffered(response);
  try {
    await run(fake);
  } finally {
    if (state.done) {
      const raw = request.headers?.['x-request-id'];
      const row = { request_id: typeof raw === 'string' && ID.test(raw) ? raw : null, method: String(request.method ?? 'GET'), route: routeOf(request.url), status: state.code };
      try { await record(row); } catch { /* 관측을 못 남겨도 응답은 막지 않는다 */ }
      response.status(state.code).json(state.body);
    }
  }
}

// GET /api/observed?request_id=ID — 서버가 그 요청 ID를 받아 기록했는지 확인한다. 가린 기록(방법·경로 모양·상태·시각)만 돌려준다.
export function observedApi({ find }) {
  return async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const id = String(request.query?.request_id ?? '');
    if (request.method !== 'GET') return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    if (!ID.test(id)) return response.status(400).json({ error: 'INVALID_REQUEST_ID' });
    const { data, error } = await find(id);
    if (error) return response.status(502).json({ error: 'OBSERVATION_UNAVAILABLE' });
    return response.status(200).json({ requestId: id, found: data.length > 0,
      observations: data.map((r) => ({ at: r.at, method: r.method, route: r.route, status: r.status })) });
  };
}
