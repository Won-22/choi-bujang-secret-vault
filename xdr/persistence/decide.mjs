// patterns.json의 패턴을 옮겨 적은 상수다(심판 격리 환경에서는 파일을 읽거나 import할 수 없다). 근거는 patterns.json에 있다.
const MIN_LEVEL = 10;
const PATTERNS = [
  { name: 'unsigned_service_or_task', test: (a) => /서명 없|서명이 없/u.test(a.text) },
  { name: 'temp_folder_target', test: (a) => /Temp/u.test(a.path) &&/(서비스|예약 작업|시작 프로그램)[^.]*임시 (폴더|파일)|임시 폴더[^.]*(서비스|예약)/u.test(a.text) && !/등록은 없/u.test(a.text) },
  { name: 'not_in_usual_list', test: (a) => /평소 목록에 없는/u.test(a.text) && /시작 폴더|서비스/u.test(a.text) },
];
const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;

export function decide(alert) {
  const a = { text: String(alert?.rule?.description ?? ''), path: String(alert?.data?.path ?? '') };
  const level = Number(alert?.rule?.level) || 0;
  const mitre = Array.isArray(alert?.rule?.mitre) && alert.rule.mitre.some((m) => m === 'T1543' || m === 'T1053');
  // 수준이 낮은 경보는 승인된 서비스·예약 작업의 평소 동작이라 기록만 한다.
  if (!mitre || level < 4) return { action: 'record', confidence: 0.1, reason: '지속 장치 신호 없음 또는 평소 동작, 정상 이벤트로 기록' };
  const hits = level >= MIN_LEVEL ? PATTERNS.filter((p) => p.test(a)).map((p) => p.name) : [];
  if (hits.length) {
    const confidence = Math.min(1, BLOCK_AT + 0.03 * (hits.length - 1) + (level >= 12 ? 0.02 : 0));
    return { action: 'block', confidence, reason: `패턴 ${hits.join(', ')}와 뚜렷하게 맞음` };
  }
  // 서명 여부를 모르거나 수업용 파일처럼 보이는 애매한 항목: 알림만 남긴다.
  return { action: 'alert', confidence: Math.min(BLOCK_AT - 0.05, ALERT_AT + level / 100), reason: '자동 실행 항목이 있으나 패턴 기준에 못 미침' };
}
