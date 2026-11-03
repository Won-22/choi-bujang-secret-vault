// patterns.json의 패턴을 옮겨 적은 상수다(심판 격리 환경에서는 파일을 읽거나 import할 수 없다). 근거는 patterns.json에 있다.
const PATTERNS = [
  { name: 'burst_failures', test: (a) => a.count >= 30 },
  { name: 'password_spray', test: (a) => a.accounts >= 10 || /같은 비밀번호/u.test(a.text) && a.accounts >= 5 },
  { name: 'password_variation', test: (a) => /한 글자씩/u.test(a.text) && a.level >= 10 },
  { name: 'no_success_after_failures', test: (a) => a.count >= 50 && /성공은 없/u.test(a.text) },
];
const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;

function read(alert) {
  const text = String(alert?.rule?.description ?? '');
  const data = alert?.data ?? {};
  const listed = typeof data.accounts === 'string' ? data.accounts.split(',').filter(Boolean).length : 0;
  const named = Number(/계정 (\d+)개/u.exec(text)?.[1] ?? 0);
  return {
    text,
    level: Number(alert?.rule?.level) || 0,
    count: Number(data.count) || 0,
    accounts: Math.max(listed, named),
    mitre: Array.isArray(alert?.rule?.mitre) && alert.rule.mitre.includes('T1110'),
    failure: /실패|비밀번호/u.test(text),
  };
}

export function decide(alert) {
  const a = read(alert);
  if (!a.mitre || !a.failure) return { action: 'record', confidence: 0.1, reason: '로그인 실패 연속 신호 없음, 정상 이벤트로 기록' };
  const hits = PATTERNS.filter((p) => p.test(a)).map((p) => p.name);
  if (hits.length) {
    const confidence = Math.min(1, BLOCK_AT + 0.03 * (hits.length - 1) + (a.level >= 12 ? 0.02 : 0));
    return { action: 'block', confidence, reason: `패턴 ${hits.join(', ')}와 뚜렷하게 맞음` };
  }
  // 패턴에는 못 미치지만 실패 신호가 있는 애매한 시도: 알림만 남긴다.
  const confidence = Math.min(BLOCK_AT - 0.05, ALERT_AT + a.count / 100 + a.level / 100);
  return { action: 'alert', confidence, reason: '실패 신호가 있으나 패턴 기준에 못 미침' };
}
