import { echoRequestId } from '../src/request-log.mjs';

// 2단계에서 없앤 공개 자료 /data.json. vercel.json의 rewrite로 이 함수가 대신 답하며, 자료 없이 404만 돌려준다.
export default function handler(request, response) {
  echoRequestId(request, response);
  response.setHeader('Cache-Control', 'no-store');
  response.status(404).json({ error: 'GONE' });
}
