const send = (response, status, body) => {
  response.setHeader('Cache-Control', 'no-store');
  return response.status(status).json(body);
};
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;
const view = (session) => ({ access_token: session.access_token, refresh_token: session.refresh_token,
  expires_at: session.expires_at, email: session.user?.email ?? null });

// 로그인·갱신·로그아웃을 서버가 대신 Supabase Auth(공식 SDK)에 요청한다. 브라우저에는 공개 키가 없다.
// auth: 공개 키로 만든 Supabase 클라이언트의 auth, revoke(accessToken): 서버 전용 키로 그 세션을 끊는다.
export function sessionApi({ auth, revoke }) {
  return async (request, response) => {
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    if (request.method === 'POST') {
      if (!text(body.email, 320) || !text(body.password, 1000)) return send(response, 400, { error: 'INVALID_LOGIN' });
      const { data, error } = await auth.signInWithPassword({ email: body.email, password: body.password });
      if (error || !data?.session) return send(response, 401, { error: 'LOGIN_FAILED', message: error?.message ?? '로그인하지 못했습니다' });
      return send(response, 200, view(data.session));
    }
    if (request.method === 'PUT') {
      if (!text(body.refresh_token, 1000)) return send(response, 400, { error: 'INVALID_REFRESH' });
      const { data, error } = await auth.refreshSession({ refresh_token: body.refresh_token });
      if (error || !data?.session) return send(response, 401, { error: 'REFRESH_FAILED' });
      return send(response, 200, view(data.session));
    }
    if (request.method === 'DELETE') {
      const token = /^Bearer (\S+)$/u.exec(request.headers.authorization ?? '')?.[1];
      if (token) await revoke(token).catch(() => {});
      return send(response, 200, { ok: true });
    }
    response.setHeader('Allow', 'POST, PUT, DELETE');
    return send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
  };
}
