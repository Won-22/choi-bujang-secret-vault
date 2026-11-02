// 자료실의 자원 구역. 요청마다 서버가 구분할 수 있는 자원 ID와, 그 구역에서 허용하는 서비스·경로 모양이다.
// 경로 모양은 판정 요청의 route와 같은 표기('GET /notes/:id')이며 'ID 하나를 고르는' 모양만 둔다.
export const RESOURCES = Object.freeze({
  memo: { id: 'memo.item', service: 'notes', routes: ['GET /notes/:id', 'PUT /notes/:id', 'DELETE /notes/:id'] },
  // 반 공지는 읽기만. 쓰기는 판정기가 아니라 서버의 관리 경로에서 처리한다.
  notice: { id: 'class.notice', service: 'announcements', routes: ['GET /announcements', 'GET /announcements/:id'] },
  // 강사 자료는 판정기에서 모두 거부한다(허용 경로 없음).
  instructor: { id: 'instructor.material', service: 'instructor', routes: [] },
});

// 서비스와 경로 모양이 정확히 같은 구역의 자원 ID를 돌려준다. 어느 구역에도 없으면 null.
export function resourceFor(service, route) {
  return Object.values(RESOURCES).find((r) => r.service === service && r.routes.includes(route))?.id ?? null;
}
