// 9단계 탐지 함수. 반 엔진이 검증한 사건만 전달해야 하며, 브라우저가 보낸 사용자 번호는 받지 않습니다.
// 사건에서 at(시각)·method(요청 종류)·identity.sub(가명 사용자) 세 값만 읽습니다. 그 밖의 값은 읽지도 저장하지도 출력하지도 않습니다.
const WINDOW_MS = 10 * 60 * 1000;
const BURST_LIMIT = 120;

export function detect(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');
  const readsBySub = new Map();
  for (const event of events) {
    const sub = event?.identity?.sub;
    const at = typeof event?.at === 'string' ? Date.parse(event.at) : NaN;
    // 읽기(GET)이고 시각·사용자가 분명한 사건만 센다. 모호한 사건을 정상값으로 채우지 않고 건너뛴다.
    if (event?.method !== 'GET' || typeof sub !== 'string' || !sub || Number.isNaN(at)) continue;
    if (!readsBySub.has(sub)) readsBySub.set(sub, []);
    readsBySub.get(sub).push(at);
  }
  for (const [subject, times] of readsBySub) {
    times.sort((a, b) => a - b);
    // 10분 구간은 [시작, 시작+10분). 시작 사건부터 구간 안에 든 사건이 120건을 넘으면 폭주다(정확히 120건은 아님).
    for (let start = 0, end = 0; start < times.length; start += 1) {
      while (end < times.length && times[end] - times[start] < WINDOW_MS) end += 1;
      if (end - start > BURST_LIMIT) return { action: 'propose_revocation', reasonCode: 'burst_read', subject };
    }
  }
  return { action: 'observe' };
}
