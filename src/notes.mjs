import { randomUUID } from 'node:crypto';

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

// authenticate(request) → { userId } | null,  db → 메모 저장소(Supabase 서버 클라이언트를 감싼 것)
export function notesApi({ authenticate, db }) {
  async function guard(request, response, methods) {
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
    return user;
  }
  const fail = (response, error) => {
    if (error.code === '23505') return send(response, 409, { error: 'ID_ALREADY_USED' });
    console.error('notes db failed:', error.code, error.message);
    return send(response, 502, { error: 'NOTES_UNAVAILABLE' });
  };

  return {
    async collection(request, response) {
      const user = await guard(request, response, ['GET', 'POST']);
      if (!user) return;
      if (request.method === 'GET') {
        const { data, error } = await db.list(user.userId);
        return error ? fail(response, error) : send(response, 200, data.map(show));
      }
      const fields = readFields(request.body);
      const id = request.body?.id === undefined ? randomUUID() : request.body.id;
      if (!fields || typeof id !== 'string' || !UUID.test(id)) {
        return send(response, 400, { error: 'INVALID_NOTE' });
      }
      const { data, error } = await db.insert({ id: id.toLowerCase(), owner_id: user.userId, ...fields });
      return error ? fail(response, error) : send(response, 201, { id: data.id });
    },

    // shortcut: 소유자 검사를 하지 않아 로그인한 누구나 id만 알면 읽고 고치고 지울 수 있음, 4단계에서 owner_id로 막기
    async item(request, response) {
      const user = await guard(request, response, ['GET', 'PUT', 'DELETE']);
      if (!user) return;
      const id = String(request.query?.id ?? '').toLowerCase();
      if (!UUID.test(id)) return send(response, 404, { error: 'NOT_FOUND' });
      let result;
      if (request.method === 'GET') {
        result = await db.get(id);
      } else if (request.method === 'PUT') {
        const fields = readFields(request.body);
        if (!fields) return send(response, 400, { error: 'INVALID_NOTE' });
        result = await db.update(id, fields);
      } else {
        result = await db.remove(id);
      }
      if (result.error) return fail(response, result.error);
      if (!result.data) return send(response, 404, { error: 'NOT_FOUND' });
      return send(response, 200, request.method === 'DELETE' ? { id: result.data.id } : show(result.data));
    },
  };
}
