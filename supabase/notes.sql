-- 학습용 가상 메모 테이블. 실제 학생 자료를 넣지 마세요.
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,  -- 3단계 로그인 전까지 비워 둠. auth.users 외래키는 걸지 않음
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.notes enable row level security;
-- 정책을 만들지 않고 권한도 회수: anon·authenticated는 읽기 불가, 서버 전용 키만 접근
revoke all on public.notes from anon, authenticated;
-- 자동 노출을 끈 프로젝트에서도 서버 함수(서버 전용 키)가 메모를 읽고 쓸 수 있게 함
grant select, insert, update, delete on public.notes to service_role;

insert into public.notes (title, content)
select v.title, v.content
from (values
  ('과제', '실습용 가상 과제 기록'),
  ('포트폴리오', '실습용 가상 포트폴리오 기록'),
  ('아침 리추얼', '실습용 가상 리추얼 기록'),
  ('훈련 행정 자료', '실습용 가상 행정 기록')
) as v(title, content)
where not exists (select 1 from public.notes);
