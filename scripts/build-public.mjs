import { readFile, writeFile } from 'node:fs/promises';
import { renderOps } from '../src/ops-page.mjs';
import { resolve } from 'node:path';
import { deploymentIdentity } from './deployment-identity.mjs';

const root = resolve(import.meta.dirname, '..');
const config = JSON.parse(await readFile(resolve(root, 'aleph.config.json'), 'utf8'));
if (config.step < 2) {
  throw new Error('2단계부터는 자료를 서버 API(api/notes.js)에서 읽습니다. aleph.config.json의 step을 확인하세요.');
}
// 탈환 작전실(/ops)은 ops/report.json의 기록으로 만든다. 기록이 없거나 맞지 않으면 배포를 막지 않고 그 사실을 화면에 적는다.
try {
  const report = JSON.parse(await readFile(resolve(root, 'ops', 'report.json'), 'utf8'));
  await writeFile(resolve(root, 'public', 'ops.html'), renderOps(report), 'utf8');
  console.log('탈환 작전실을 public/ops.html에 만들었습니다.');
} catch (error) {
  await writeFile(resolve(root, 'public', 'ops.html'), `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>탈환 작전실</title></head><body><h1>탈환 작전실</h1><p>시험 기록(ops/report.json)을 읽지 못했습니다. 기록이 없으면 통과한 시험도 없습니다.</p></body></html>
`, 'utf8');
  console.warn(`탈환 작전실 기록 없음: ${error.message}`);
}
if (!process.argv.includes('--local')) {
  const identity = deploymentIdentity(process.env, config);
  await writeFile(resolve(root, 'public', 'aleph.json'),
    `${JSON.stringify(identity, null, 2)}\n`, 'utf8');
  console.log('배포 저장소·커밋·주소를 public/aleph.json에 기록했습니다.');
}
