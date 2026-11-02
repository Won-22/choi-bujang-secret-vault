-- 12단계: 서버 관측 기록. 서버 함수가 받은 요청의 요청 ID·방법·경로 모양·응답 상태·시각만 남긴다.
-- 토큰·쿠키·본문·IP·접속 도구 이름은 저장하지 않는다(가린 기록). service_role만 읽고 쓰며 anon·authenticated는 접근할 수 없다.
create table if not exists public.request_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  request_id text,
  method text not null,
  route text not null,   -- UUID는 :id로 바꾼 경로 모양
  status integer not null
);
create index if not exists request_log_request_id_idx on public.request_log (request_id);

alter table public.request_log enable row level security;
revoke all on table public.request_log from PUBLIC, anon, authenticated;
grant select, insert on public.request_log to service_role;
grant usage, select on all sequences in schema public to service_role;
