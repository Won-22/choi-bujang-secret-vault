const ID = /^[A-Za-z0-9._:-]{8,100}$/u;

// 서버가 받은 요청 ID(x-request-id)를 응답 헤더로 그대로 돌려주고 서버 로그에 한 줄 남긴다.
// 토큰·본문·쿠키는 기록하지 않는다. 요청 ID가 없거나 형식이 다르면 아무것도 하지 않는다.
export function echoRequestId(request, response, log = console.log) {
  const raw = request.headers?.['x-request-id'];
  if (typeof raw !== 'string' || !ID.test(raw)) return null;
  response.setHeader('X-Request-Id', raw);
  // 진단용: 헤더 이름 목록과, 요청·추적 ID처럼 보이는 헤더의 값만 적는다(인증·쿠키·본문은 기록하지 않음).
  const names = Object.keys(request.headers).filter((n) => !/^(authorization|cookie|apikey)$/iu.test(n)).sort();
  const ids = Object.fromEntries(names.filter((n) => /(request|trace|correlation|run|aleph).*id$|^x-aleph/iu.test(n) && typeof request.headers[n] === 'string' && request.headers[n].length <= 100).map((n) => [n, request.headers[n]]));
  log(JSON.stringify({ event: 'request', requestId: raw, method: request.method, path: String(request.url ?? '').split('?')[0], headerNames: names, idHeaders: ids }));
  return raw;
}
