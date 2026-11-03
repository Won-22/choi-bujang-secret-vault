// patterns.json의 패턴을 옮겨 적은 상수다(심판 격리 환경에서는 파일을 읽거나 import할 수 없다). 근거는 patterns.json에 있다.
const MIN_REPEAT = 5;
const PATTERNS = [
  { name: 'sql_injection_repeat', test: (t) => /SQL (구문|표기|표식)|데이터베이스 조회를 이어/u.test(t) },
  { name: 'script_injection_repeat', test: (t) => /스크립트 (삽입|표식)/u.test(t) },
  { name: 'path_traversal_repeat', test: (t) => /거슬러 올라가|경로 이탈/u.test(t) },
  { name: 'command_separator_repeat', test: (t) => /명령 구분자/u.test(t) },
];
const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;

export function decide(alert) {
  const text = String(alert?.rule?.description ?? '');
  const level = Number(alert?.rule?.level) || 0;
  const repeat = Number(alert?.data?.count) || 0;
  const mitre = Array.isArray(alert?.rule?.mitre) && alert.rule.mitre.includes('T1190');
  if (!mitre) return { action: 'record', confidence: 0.1, reason: '주입 신호 없음, 정상 이벤트로 기록' };
  const hits = repeat >= MIN_REPEAT ? PATTERNS.filter((p) => p.test(text)).map((p) => p.name) : [];
  if (hits.length) {
    const confidence = Math.min(1, BLOCK_AT + 0.03 * (hits.length - 1) + (level >= 12 ? 0.02 : 0));
    return { action: 'block', confidence, reason: `패턴 ${hits.join(', ')}와 뚜렷하게 맞음` };
  }
  // 한두 번뿐이거나 표식이 분명하지 않은 애매한 시도: 알림만 남긴다.
  return { action: 'alert', confidence: Math.min(BLOCK_AT - 0.05, ALERT_AT + level / 100), reason: '주입처럼 보이나 반복·표식이 패턴 기준에 못 미침' };
}
