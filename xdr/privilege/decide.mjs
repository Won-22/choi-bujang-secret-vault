// patterns.json의 패턴을 옮겨 적은 상수다(심판 격리 환경에서는 파일을 읽거나 import할 수 없다). 근거는 patterns.json에 있다.
const MIN_LEVEL = 10;
const PATTERNS = [
  { name: 'admin_group_added', test: (t) => /관리자 그룹[^.]*(추가|들어)/u.test(t) },
  { name: 'unusual_admin_command', test: (t) => /관리자 명령을 실행/u.test(t) && /방금 관리자가|수업 시간 밖|처음 보는|다른 계정의 권한|곧바로|같이 있/u.test(t) },
  { name: 'elevated_session_new_origin', test: (t) => /관리자 권한으로 바뀌/u.test(t) && /처음 봅니다|처음 보는/u.test(t) },
  { name: 'off_hours_privilege', test: (t) => /수업 시간 밖|업무처럼 보이지 않는 시각/u.test(t) },
  { name: 'borrowed_privilege', test: (t) => /다른 계정의 권한/u.test(t) },
];
const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;

export function decide(alert) {
  const text = String(alert?.rule?.description ?? '');
  const level = Number(alert?.rule?.level) || 0;
  const mitre = Array.isArray(alert?.rule?.mitre) && alert.rule.mitre.some((m) => m === 'T1068' || m === 'T1078');
  if (!mitre) return { action: 'record', confidence: 0.1, reason: '권한 상승 신호 없음, 정상 이벤트로 기록' };
  const hits = level >= MIN_LEVEL ? PATTERNS.filter((p) => p.test(text)).map((p) => p.name) : [];
  if (hits.length) {
    const confidence = Math.min(1, BLOCK_AT + 0.03 * (hits.length - 1) + (level >= 12 ? 0.02 : 0));
    return { action: 'block', confidence, reason: `패턴 ${hits.join(', ')}와 뚜렷하게 맞음` };
  }
  // 평소 있을 법한 권한 변경이나 시도만 있고 이어진 악용이 없는 애매한 경보: 알림만 남긴다.
  return { action: 'alert', confidence: Math.min(BLOCK_AT - 0.05, ALERT_AT + level / 100), reason: '권한 관련 신호가 있으나 패턴 기준에 못 미침' };
}
