import { echoRequestId } from '../src/request-log.mjs';
import { observe } from '../src/observe.mjs';
import { recordRow } from '../src/observe-runtime.mjs';

// 2단계에서 없앤 공개 자료 /data.json. vercel.json의 rewrite로 이 함수가 대신 답하며, 자료 없이 404만 돌려준다.
export default function handler(request, response) {
  echoRequestId(request, response);
  return observe(request, response, async (res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(404).json({ error: 'GONE' });
  }, recordRow);
}
