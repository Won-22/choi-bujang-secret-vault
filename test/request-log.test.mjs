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
  const line = JSON.parse(lines[0]);
  assert.deepEqual([line.event, line.requestId, line.method, line.path], ['request', out, 'GET', '/api/notes']);
  assert.deepEqual(line.headerNames, ['x-request-id']);
  assert.deepEqual(line.idHeaders, { 'x-request-id': out });
});

test('진단 기록에는 인증·쿠키 값이 들어가지 않는다', () => {
  const lines = [];
  echoRequestId({ method: 'GET', url: '/x', headers: { host: 'a.example', 'user-agent': 'judge/1', 'x-request-id': 'abcdefgh-1', authorization: 'Bearer secret', cookie: 'vault_device=s', apikey: 'k', 'x-aleph-run-id': 'run-1' } },
    { setHeader() {} }, (l) => lines.push(l));
  assert.ok(!lines[0].includes('secret') && !lines[0].includes('vault_device') && !lines[0].includes('"k"'));
  assert.ok(lines[0].includes('x-aleph-run-id'));
  const keys = Object.keys(JSON.parse(lines[0]));
  assert.deepEqual(keys.slice(0, 7), ['event', 'method', 'path', 'requestId', 'idHeaders', 'host', 'ua']);
});

test('요청 ID가 없거나 형식이 다르면 헤더를 돌려주지 않지만 요청은 기록한다', () => {
  for (const bad of [undefined, 'x', 'a b c d e f g h', 'x'.repeat(101)]) {
    const { out, headers, lines } = run(bad);
    assert.equal(out, null);
    assert.deepEqual(headers, {});
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).requestId, null);
  }
});
