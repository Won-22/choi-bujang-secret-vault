import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 확인용 읽기 모듈: 경보에서 시각·출발 주소·계정·규칙 수준·설명만 한 줄씩 뽑는다. decide.mjs가 부르지 않는다.
export async function readAlerts(file = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'privilege.json')) {
  const { alerts } = JSON.parse(await readFile(file, 'utf8'));
  return alerts.map((a) => `${a.timestamp} | ${a.data?.srcip ?? '-'} | ${a.data?.srcuser ?? '-'} | 수준 ${a.rule?.level ?? '-'} | ${a.rule?.description ?? ''}`);
}

if (process.argv[1] && join(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lines = await readAlerts();
  console.log(lines.join('\n'));
  console.log(`경보 ${lines.length}건, 뽑은 줄 ${lines.length}줄`);
}
