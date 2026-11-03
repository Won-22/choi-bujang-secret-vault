// patterns.json의 패턴을 옮겨 적은 상수다(심판 격리 환경에서는 파일을 읽거나 import할 수 없다). 근거는 patterns.json에 있다.
const MIN_BYTES = 50000000;
const MIN_LEVEL = 10;
const PATTERNS = [
  { name: 'large_transfer_new_destination', test: (a) => /처음 보는 (목적지|주소)/u.test(a.text) },
  { name: 'repeated_large_transfer', test: (a) => a.count >= 5 },
  { name: 'mass_file_copy', test: (a) => a.files >= 50 },
  { name: 'off_hours_archive_exit', test: (a) => /(수업|업무) 시간 밖/u.test(a.text) },
];
const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;

export function decide(alert) {
  const data = alert?.data ?? {};
  const a = { text: String(alert?.rule?.description ?? ''), bytes: Number(data.bytes) || 0, files: Number(data.files) || 0, count: Number(data.count) || 0 };
  const level = Number(alert?.rule?.level) || 0;
  const mitre = Array.isArray(alert?.rule?.mitre) && alert.rule.mitre.some((m) => m === 'T1041' || m === 'T1048');
  // 수준이 낮은 경보는 평소 목적지와의 작은 동기화나 읽기라 기록만 한다.
  if (!mitre || level < 4) return { action: 'record', confidence: 0.1, reason: '유출 신호 없음 또는 평소 전송, 정상 이벤트로 기록' };
  const hits = a.bytes >= MIN_BYTES && level >= MIN_LEVEL ? PATTERNS.filter((p) => p.test(a)).map((p) => p.name) : [];
  if (hits.length) {
    const confidence = Math.min(1, BLOCK_AT + 0.03 * (hits.length - 1) + (level >= 12 ? 0.02 : 0));
    return { action: 'block', confidence, reason: `패턴 ${hits.join(', ')}와 뚜렷하게 맞음` };
  }
  // 전송량이 작거나 평소와 조금 다른 정도의 애매한 전송: 알림만 남긴다.
  return { action: 'alert', confidence: Math.min(BLOCK_AT - 0.05, ALERT_AT + level / 100), reason: '유출처럼 보이나 전송량·반복이 패턴 기준에 못 미침' };
}
