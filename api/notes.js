import { createClient } from '@supabase/supabase-js';

// 2단계: 아직 로그인 없이 누구나 부를 수 있는 공개 서버 API입니다. 3단계 전까지 가상 메모만 둡니다.
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return response.status(500).json({ error: 'SERVER_NOT_CONFIGURED' });
  const { data, error } = await createClient(url, key, { auth: { persistSession: false } })
    .from('notes').select('title, content').order('created_at');
  if (error) return response.status(502).json({ error: 'NOTES_UNAVAILABLE' });
  return response.status(200).json({ notes: data });
}
