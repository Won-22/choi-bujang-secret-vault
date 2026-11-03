import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const BLOCK_AT = 0.85;
const TTL_MS = 60 * 60 * 1000;

// decide 결과(result.json)와 경보를 받아 차단 후보만 거부 규칙으로, 애매한 시도는 알림 줄로 만든다.
// 정상(record)으로 판정된 경보와 같은 주소는 차단하지 않는다. 규칙은 판정기에 더하는 확인 단계용 목록이고 src/decider.mjs는 바꾸지 않는다.
export function respond({ decisions, alerts, now = Date.now() }) {
  const byId = new Map(alerts.map((a) => [a.id, a]));
  const normalIps = new Set(decisions.filter((d) => d.action === 'record').map((d) => byId.get(d.alertId)?.data?.srcip));
  const rules = new Map();
  for (const d of decisions) {
    const ip = byId.get(d.alertId)?.data?.srcip;
    if (d.action !== 'block' || d.confidence < BLOCK_AT || !ip || normalIps.has(ip)) continue;
    const rule = rules.get(ip) ?? { decision: 'deny', reasonCode: 'xdr_brute_force', srcip: ip, expiresAt: new Date(now + TTL_MS).toISOString(), alertIds: [] };
    rule.alertIds.push(d.alertId);
    rules.set(ip, rule);
  }
  const alertLines = decisions.filter((d) => d.action === 'alert')
    .map((d) => `${new Date(now).toISOString()} alert ${d.alertId} 확신도 ${d.confidence.toFixed(2)} ${d.reason}`);
  return { rules: [...rules.values()], alertLines };
}

if (process.argv[1] && join(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { decisions } = JSON.parse(await readFile(join(here, 'result.json'), 'utf8'));
  const { alerts } = JSON.parse(await readFile(join(root, 'xdr', 'fixtures', 'brute-force.json'), 'utf8'));
  const { rules, alertLines } = respond({ decisions, alerts });
  await writeFile(join(here, 'block-rules.json'), `${JSON.stringify(rules, null, 2)}\n`, 'utf8');
  // shortcut: 실행할 때마다 알림 로그를 새로 쓴다(쌓기 아님), 실제 운영에서 쌓으려면 appendFile로 바꾼다.
  await writeFile(join(root, 'xdr', 'alerts.log'), alertLines.length ? `${alertLines.join('\n')}\n` : '', 'utf8');
  console.log(`차단 규칙 ${rules.length}개, 알림 ${alertLines.length}줄`);
}
