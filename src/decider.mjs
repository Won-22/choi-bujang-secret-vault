// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기입니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요. 계약은 docs/DECIDER_REQUEST.md입니다.
import { resourceFor } from './resources.mjs';

export const RULE_IDS = Object.freeze(['device_registered', 'resource_zone', 'step_up_required']);

// 엔진이 검증해 넘긴 접속 정보의 출처. 실제 경로의 'none'과 그 밖의 값은 근거로 쓰지 않는다.
const TRUSTED_SOURCES = ['judge_fixture'];
// shortcut: 평소 시각 이력이 계약에 없어 새벽 0~5시를 평소와 다른 시각으로 고정함, 엔진이 사용자별 평소 시각을 주면 그 값으로 교체
const UNUSUAL_HOURS = (hour) => hour >= 0 && hour < 6;
const BURST_COUNT = 10;
const BURST_WINDOW_SECONDS = 600;

// 출처가 믿을 만하고 네 항목이 모두 형식에 맞을 때만 돌려준다. 없거나 모호하면 null이며 정상값으로 채우지 않는다.
function trustedSignals(request) {
  const s = request.signals;
  if (!s || !TRUSTED_SOURCES.includes(s.source) || typeof s.region !== 'string'
      || typeof s.network !== 'string' || !Number.isInteger(s.hour) || s.hour < 0 || s.hour > 23
      || !Array.isArray(request.recentEvents)) return null;
  return s;
}

// 지역은 판단 근거에 쓰지 않는다. 시각·네트워크·갑작스러운 대량 읽기가 함께 있을 때만 의심한다.
function compoundRisk(request) {
  const s = trustedSignals(request);
  if (!s) return false;
  const burst = request.recentEvents
    .filter((e) => e?.kind === 'risk_signal' && Number.isInteger(e.count) && e.ageSeconds <= BURST_WINDOW_SECONDS)
    .reduce((sum, e) => sum + e.count, 0);
  return UNUSUAL_HOURS(s.hour) && s.network === 'unusual' && burst >= BURST_COUNT;
}

// 엔진이 새 로그인 시각을 검증해 넘긴 값(verified true, 0~900초)만 추가 확인으로 인정한다.
const recentlyVerified = (stepUp) => stepUp?.verified === true
  && Number.isInteger(stepUp.authAgeSeconds) && stepUp.authAgeSeconds >= 0 && stepUp.authAgeSeconds <= 900;

// 8단계: 자원 구역. 서비스와 정확한 경로 모양이 구역 표(src/resources.mjs)에 있어야 하고, 실제 path가 그 모양과 같아야 한다.
// 쿼리는 어떤 기능도 고르지 못하므로 있으면 거부한다. :id 자리에 export 같은 기능 이름이 오면 거부한다. ID 형식(UUID 여부)은 좁히지 않는다.
const FUNCTION_NAMES = ['export', 'import', 'search', 'list', 'all', 'bulk', 'count', 'admin'];
const stripApi = (route) => route.replace(/^([A-Z]+) \/api\//u, '$1 /');
function inZone(request) {
  if (typeof request.route !== 'string' || typeof request.path !== 'string' || request.queryLength !== 0) return false;
  const route = stripApi(request.route);
  if (!resourceFor(request.service, route)) return false;
  const parts = request.path.replace(/^\/api(?=\/)/u, '').split('/').slice(1);
  const shape = route.split(' ')[1].split('/').slice(1);
  return parts.length === shape.length && shape.every((seg, i) => (seg === ':id'
    ? parts[i] !== '' && !FUNCTION_NAMES.includes(parts[i].toLowerCase()) : seg === parts[i]));
}

const answer = (request, decision, reasonCode, ruleId) => ({
  schema: 'aleph.decision.v1', requestId: request.requestId, decision, reasonCode, ruleIds: [ruleId],
});

export async function decide(request) {
  if (request.deviceRegistered !== true) return answer(request, 'deny', 'device_not_registered', 'device_registered');
  if (!inZone(request)) return answer(request, 'deny', 'resource_not_allowed', 'resource_zone');
  if (compoundRisk(request) && !recentlyVerified(request.stepUp)) {
    return answer(request, 'step_up', 'step_up_required', 'step_up_required');
  }
  return answer(request, 'allow', 'approved', 'device_registered');
}
