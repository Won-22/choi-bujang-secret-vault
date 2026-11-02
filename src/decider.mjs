// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기입니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요. 계약은 docs/DECIDER_REQUEST.md입니다.
export const RULE_IDS = Object.freeze(['device_registered']);

// 6단계: 엔진이 확인해 넘긴 deviceRegistered가 정확히 true일 때만 허용한다. 없거나 다른 값이면 거부한다.
export async function decide(request) {
  const registered = request.deviceRegistered === true;
  return {
    schema: 'aleph.decision.v1',
    requestId: request.requestId,
    decision: registered ? 'allow' : 'deny',
    reasonCode: registered ? 'approved' : 'device_not_registered',
    ruleIds: [RULE_IDS[0]],
  };
}
