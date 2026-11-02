import { randomUUID } from 'node:crypto';
import { RESOURCES } from './resources.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const show = (row) => ({ id: row.id, title: row.title, body: row.content });

function send(response, status, body) {
  response.setHeader('Cache-Control', 'no-store');
  return response.status(status).json(body);
}

// 서버가 받은 값만 검사한다. 브라우저가 보낸 userId·owner_id는 읽지 않는다.
function readFields(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { title, body } = raw;
  if (typeof title !== 'string' || !title.trim() || title.length > 200) return null;
  if (typeof body !== 'string' || body.length > 5000) return null;
  return { title: title.trim(), content: body };
}

// 본문에 owner_id가 있어도 믿지 않는다. 내 ID가 아니면(소유자 변경·남의 이름으로 추가 시도) 거부한다.
const claimsOtherOwner = (raw, userId) => ['owner_id', 'ownerId', 'userId']
  .some((key) => raw && typeof raw === 'object' && key in raw && raw[key] !== userId);

// 화면 메뉴나 본문의 role은 권한 근거가 아니다. 보내면 거부한다.
const claimsRole = (raw) => raw && typeof raw === 'object'
  && ['role', 'roles', 'isInstructor', 'instructor'].some((key) => key in raw);

// authenticate(request) → { userId } | null,  deviceApproved(request, user) → boolean,  db → 메모 저장소(Supabase 서버 클라이언트를 감싼 것)
export function notesApi({ authenticate, db, deviceApproved }) {
  async function guard(request, response, methods, resource) {
    response.setHeader('X-Resource-Id', resource);
    if (!methods.includes(request.method)) {
      response.setHeader('Allow', methods.join(', '));
      send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
      return null;
    }
    const user = await authenticate(request);
    if (!user) {
      send(response, 401, { error: 'LOGIN_REQUIRED' });
      return null;
    }
    // 메모를 읽거나 고치기 전에 서버가 이 기기의 승인 상태를 확인한다. 승인 전·확인 실패는 자료 없이 거부한다.
    if (deviceApproved && !(await deviceApproved(request, user))) {
      send(response, 403, { error: 'DEVICE_NOT_APPROVED' });
      return null;
    }
    return user;
  }
  const fail = (response, error) => {
    if (error.code === '23505') return send(response, 409, { error: 'ID_ALREADY_USED' });
    console.error('notes db failed:', error.code, error.message);
    return send(response, 502, { error: 'NOTES_UNAVAILABLE' });
  };

  return {
    async collection(request, response) {
      const user = await guard(request, response, ['GET', 'POST'], RESOURCES.memo.id + '.collection');
      if (!user) return;
      if (request.method === 'GET') {
        const { data, error } = await db.list(user.userId);
        return error ? fail(response, error) : send(response, 200, data.map(show));
      }
      if (claimsOtherOwner(request.body, user.userId)) return send(response, 403, { error: 'OWNER_MISMATCH' });
      if (claimsRole(request.body)) return send(response, 403, { error: 'ROLE_NOT_TRUSTED' });
      const fields = readFields(request.body);
      const id = request.body?.id === undefined ? randomUUID() : request.body.id;
      if (!fields || typeof id !== 'string' || !UUID.test(id)) {
        return send(response, 400, { error: 'INVALID_NOTE' });
      }
      const { data, error } = await db.insert({ id: id.toLowerCase(), owner_id: user.userId, ...fields });
      return error ? fail(response, error) : send(response, 201, { id: data.id });
    },

    // 남의 메모는 없는 것처럼 404로 답한다(존재 여부도 알려 주지 않음).
    async item(request, response) {
      const user = await guard(request, response, ['GET', 'PUT', 'DELETE'], RESOURCES.memo.id);
      if (!user) return;
      const id = String(request.query?.id ?? '').toLowerCase();
      if (!UUID.test(id)) return send(response, 404, { error: 'NOT_FOUND' });
      let result;
      if (request.method === 'GET') {
        result = await db.get(id, user.userId);
      } else if (request.method === 'PUT') {
        if (claimsOtherOwner(request.body, user.userId)) return send(response, 403, { error: 'OWNER_MISMATCH' });
        if (claimsRole(request.body)) return send(response, 403, { error: 'ROLE_NOT_TRUSTED' });
        const fields = readFields(request.body);
        if (!fields) return send(response, 400, { error: 'INVALID_NOTE' });
        result = await db.update(id, user.userId, fields);
      } else {
        result = await db.remove(id, user.userId);
      }
      if (result.error) return fail(response, result.error);
      if (!result.data) return send(response, 404, { error: 'NOT_FOUND' });
      return send(response, 200, request.method === 'DELETE' ? { id: result.data.id } : show(result.data));
    },
  };
}
