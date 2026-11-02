const ID = /^[A-Za-z0-9._:-]{8,100}$/u;

// 서버가 받은 요청을 서버 로그에 한 줄 남기고, 형식이 맞는 x-request-id는 응답 헤더로 그대로 돌려준다.
// 헤더가 없는 요청도 기록한다(requestId는 null). 인증·쿠키·키·본문은 기록하지 않는다.
export function echoRequestId(request, response, log = console.log) {
  const headers = request.headers ?? {};
  const raw = typeof headers['x-request-id'] === 'string' && ID.test(headers['x-request-id']) ? headers['x-request-id'] : null;
  if (raw) response.setHeader('X-Request-Id', raw);
  // 진단용: 헤더 이름 목록과, 요청·추적 ID처럼 보이는 헤더의 값만 적는다.
  const names = Object.keys(headers).filter((n) => !/^(authorization|cookie|apikey)$/iu.test(n)).sort();
  const ids = Object.fromEntries(names.filter((n) => /(request|trace|correlation|run|aleph).*id$|^x-aleph/iu.test(n) && typeof headers[n] === 'string' && headers[n].length <= 100).map((n) => [n, headers[n]]));
  // 로그 표에서 펼치지 않아도 보이도록 중요한 값을 앞에 둔다(요청 ID 헤더, 호스트, 접속 도구 이름, 그다음 헤더 이름 목록).
  const text = (v) => (typeof v === 'string' ? v.slice(0, 80) : null);
  log(JSON.stringify({ event: 'request', method: request.method, path: String(request.url ?? '').split('?')[0], requestId: raw, idHeaders: ids, host: text(headers.host), ua: text(headers['user-agent']), headerNames: names }));
  return raw;
}
