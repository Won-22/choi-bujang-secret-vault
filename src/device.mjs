import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const COOKIE = 'vault_device';
const MAX_PENDING = 5;
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

function send(response, status, body) {
  response.setHeader('Cache-Control', 'no-store');
  return response.status(status).json(body);
}

function readCookie(header) {
  const raw = /(?:^|;\s*)vault_device=([0-9a-f-]{36})\.([0-9a-f]{64})(?:;|$)/iu.exec(header ?? '');
  return raw ? { id: raw[1].toLowerCase(), secret: raw[2].toLowerCase() } : null;
}

const cookieHeader = (id, secret) => `${COOKIE}=${id}.${secret}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=31536000`;

// 쿠키가 이 사용자의 기기 행과 비밀까지 맞을 때만 그 행을 돌려준다. 아니면 null(없는 기기와 구별하지 않음).
async function knownDevice(db, request, user) {
  const cookie = readCookie(request.headers.cookie);
  if (!cookie) return null;
  const { data, error } = await db.getDevice(cookie.id);
  if (error) throw error;
  if (!data || data.user_id !== user.userId) return null;
  const a = Buffer.from(sha256(cookie.secret), 'hex');
  const b = Buffer.from(String(data.secret_hash), 'hex');
  return a.length === b.length && timingSafeEqual(a, b) ? data : null;
}

// 메모 API가 자료를 읽기 전에 부르는 확인. 승인된 기기가 아니거나 확인하지 못하면 false(닫힌 쪽으로 실패).
export function createDeviceCheck(db) {
  return async (request, user) => {
    try {
      return (await knownDevice(db, request, user))?.status === 'approved';
    } catch (error) {
      console.error('device check failed:', error?.code, error?.message);
      return false;
    }
  };
}

// 기기 비밀은 서버가 만들어 HttpOnly 쿠키로만 내려 주고, DB에는 해시만 둔다. 브라우저 저장소(localStorage 등)에는 두지 않는다.
// 승인(approved)은 서버 쪽에서만 바뀐다. 이 API에는 승인으로 바꾸는 경로가 없고, 버튼은 요청(pending)만 만든다.
export function deviceApi({ authenticate, db }) {
  return async (request, response) => {
    if (!['GET', 'POST'].includes(request.method)) {
      response.setHeader('Allow', 'GET, POST');
      return send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
    }
    const user = await authenticate(request);
    if (!user) return send(response, 401, { error: 'LOGIN_REQUIRED' });
    try {
      const device = await knownDevice(db, request, user);
      const status = device && ['pending', 'approved'].includes(device.status) ? device.status : 'none';
      if (request.method === 'GET' || status !== 'none') {
        // 예전 쿠키(경로 /api/device)를 메모 API에도 보내도록 /api 경로로 다시 내려 준다. 값은 그대로다.
        const cookie = readCookie(request.headers.cookie);
        if (status !== 'none' && cookie) response.setHeader('Set-Cookie', cookieHeader(cookie.id, cookie.secret));
        return send(response, 200, { status, deviceId: status === 'none' ? null : device.id });
      }
      const { count, error } = await db.countPending(user.userId);
      if (error) throw error;
      if (count >= MAX_PENDING) return send(response, 429, { error: 'TOO_MANY_PENDING' });
      const id = randomUUID();
      const secret = randomBytes(32).toString('hex');
      const { error: insertError } = await db.insertDevice({ id, user_id: user.userId, status: 'pending', secret_hash: sha256(secret) });
      if (insertError) throw insertError;
      response.setHeader('Set-Cookie', cookieHeader(id, secret));
      return send(response, 200, { status: 'pending', deviceId: id });
    } catch (error) {
      console.error('device api failed:', error?.code, error?.message);
      return send(response, 502, { error: 'DEVICE_UNAVAILABLE' });
    }
  };
}
