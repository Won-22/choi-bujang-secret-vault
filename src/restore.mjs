import { createHash } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
export const contentHash = (title, content) => createHash('sha256').update(`${title}\n${content}`, 'utf8').digest('hex');

function send(response, status, body) {
  response.setHeader('Cache-Control', 'no-store');
  return response.status(status).json(body);
}

// POST /api/backup/restore  { id }  — 비공개 사본(notes_backup)의 메모 한 건만 되살린다.
// 로그인한 사용자가 사본의 소유자일 때만 하고, 사본 해시가 맞지 않으면 중단한다. 다른 메모와 감사 기록은 건드리지 않는다.
export function restoreApi({ authenticate, db }) {
  return async (request, response) => {
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
    }
    const user = await authenticate(request);
    if (!user) return send(response, 401, { error: 'LOGIN_REQUIRED' });
    const id = typeof request.body?.id === 'string' ? request.body.id.toLowerCase() : '';
    if (!UUID.test(id)) return send(response, 400, { error: 'INVALID_ID' });

    const audit = (outcome, extra = {}) => db.audit({ user_id: user.userId, note_id: id, outcome, ...extra })
      .then(({ error }) => { if (error) console.error('restore audit failed:', error.code); }, () => {});
    const stop = async (status, error, outcome = error) => { await audit(outcome); return send(response, status, { error }); };

    const { data: backup, error: backupError } = await db.getBackup(id);
    if (backupError) return stop(502, 'RESTORE_UNAVAILABLE');
    // 남의 사본은 없는 것처럼 답한다.
    if (!backup || backup.owner_id !== user.userId) return stop(404, 'NO_BACKUP', 'no_backup');
    if (contentHash(backup.title, backup.content) !== backup.content_sha256) return stop(409, 'BACKUP_HASH_MISMATCH');

    const { data: live, error: liveError } = await db.getNote(id);
    if (liveError) return stop(502, 'RESTORE_UNAVAILABLE');
    if (live && live.owner_id !== user.userId) return stop(409, 'ID_OWNED_BY_OTHER');

    const { data: row, error: writeError } = await db.upsert({ id, owner_id: backup.owner_id, title: backup.title, content: backup.content });
    if (writeError) return stop(502, 'RESTORE_UNAVAILABLE');
    const check = { idMatches: row.id === backup.note_id, ownerMatches: row.owner_id === backup.owner_id,
      hashMatches: contentHash(row.title, row.content) === backup.content_sha256 };
    const ok = check.idMatches && check.ownerMatches && check.hashMatches;
    await audit(ok ? 'restored' : 'verify_failed', { content_sha256: backup.content_sha256 });
    return send(response, ok ? 200 : 500, { id, restored: ok, ...check, contentSha256: backup.content_sha256 });
  };
}
