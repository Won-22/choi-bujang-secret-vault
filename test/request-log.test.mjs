import assert from 'node:assert/strict';
import test from 'node:test';
import { echoRequestId } from '../src/request-log.mjs';

const run = (id) => {
  const headers = {}; const lines = [];
  const out = echoRequestId({ method: 'GET', url: '/api/notes?x=1', headers: id === undefined ? {} : { 'x-request-id': id } },
    { setHeader: (k, v) => { headers[k] = v; } }, (line) => lines.push(line));
  return { out, headers, lines };
};

test('받은 요청 ID를 응답 헤더로 돌려주고 토큰 없이 한 줄만 기록한다', () => {
  const { out, headers, lines } = run('3e90cc04-0aec-421e-97b4-de4752eb7d1b');
  assert.equal(out, '3e90cc04-0aec-421e-97b4-de4752eb7d1b');
  assert.equal(headers['X-Request-Id'], out);
  assert.deepEqual(JSON.parse(lines[0]), { event: 'request', requestId: out, method: 'GET', path: '/api/notes' });
});

test('요청 ID가 없거나 형식이 다르면 아무것도 하지 않는다', () => {
  for (const bad of [undefined, 'x', 'a b c d e f g h', 'x'.repeat(101)]) {
    const { out, headers, lines } = run(bad);
    assert.equal(out, null);
    assert.deepEqual([headers, lines], [{}, []]);
  }
});
