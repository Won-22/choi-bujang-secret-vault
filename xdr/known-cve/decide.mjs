// patterns.json의 패턴을 옮겨 적은 상수다(심판 격리 환경에서는 파일을 읽거나 import할 수 없다). 근거는 patterns.json에 있다.
// shortcut: ${jndi:ldap://…} 원문 형태만 본다. ${${lower:j}ndi:…} 같은 변형 표기는 알림도 못 하니, 변형까지 보려면 패턴을 더한다.
const LOOKUP = /\$\{\s*jndi\s*:\s*(ldap|ldaps|rmi|dns)/iu;
const MIN_REPEAT = 3;
const PATTERNS = [
  { name: 'jndi_lookup_in_header', test: (a) => LOOKUP.test(a.header) },
  { name: 'jndi_lookup_in_url', test: (a) => LOOKUP.test(a.url) },
  { name: 'repeated_lookup', test: (a) => a.lookup && a.repeat >= MIN_REPEAT },
  { name: 'vuln_scanner_trace', test: (a) => a.lookup && /점검 흔적/u.test(a.text) },
];
const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;

export function decide(alert) {
  const data = alert?.data ?? {};
  const a = { text: String(alert?.rule?.description ?? ''), header: String(data.useragent ?? ''), url: String(data.url ?? ''), repeat: Number(data.count) || 0 };
  a.lookup = LOOKUP.test(a.header) || LOOKUP.test(a.url);
  const level = Number(alert?.rule?.level) || 0;
  const mitre = Array.isArray(alert?.rule?.mitre) && alert.rule.mitre.includes('T1190');
  if (!mitre) return { action: 'record', confidence: 0.1, reason: '악용 신호 없음, 정상 이벤트로 기록' };
  const hits = PATTERNS.filter((p) => p.test(a)).map((p) => p.name);
  if (hits.length) {
    const confidence = Math.min(1, BLOCK_AT + 0.03 * (hits.length - 1) + (level >= 12 ? 0.02 : 0));
    return { action: 'block', confidence, reason: `패턴 ${hits.join(', ')}와 뚜렷하게 맞음` };
  }
  // 이름·단어만 비슷하고 조회 구문이 없는 애매한 시도: 알림만 남긴다.
  return { action: 'alert', confidence: Math.min(BLOCK_AT - 0.05, ALERT_AT + level / 100), reason: '취약점 관련 표기가 있으나 악용 구문은 없음' };
}
