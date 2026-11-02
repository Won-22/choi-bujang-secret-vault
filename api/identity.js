import { echoRequestId } from '../src/request-log.mjs';
import { observe } from '../src/observe.mjs';
import { recordRow } from '../src/observe-runtime.mjs';

// 1단계 점검용: 배포가 어느 저장소·커밋인지 돌려준다(공개 정보, /aleph.json과 같은 값). 서버 함수가 답하므로 서버 관측이 남는다.
export default function handler(request, response) {
  echoRequestId(request, response);
  return observe(request, response, async (res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }
    const owner = process.env.VERCEL_GIT_REPO_OWNER;
    const repo = process.env.VERCEL_GIT_REPO_SLUG;
    const commit = process.env.VERCEL_GIT_COMMIT_SHA;
    if (!owner || !repo || !commit) return res.status(503).json({ error: 'IDENTITY_UNAVAILABLE' });
    return res.status(200).json({ repoUrl: `https://github.com/${owner.toLowerCase()}/${repo.toLowerCase()}`, commit: commit.toLowerCase() });
  }, recordRow);
}
