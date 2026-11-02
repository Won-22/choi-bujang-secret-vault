-- 12단계: 서버 관측 기록. 서버 함수가 받은 요청의 요청 ID·방법·경로 모양·응답 상태·시각·접속 도구 구분·서버 요청 번호만 남긴다.
-- 토큰·쿠키·본문·IP·접속 도구 이름 전체는 저장하지 않는다(가린 기록). service_role만 읽고 쓰며 anon·authenticated는 접근할 수 없다.
create table if not exists public.request_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  request_id text,
  method text not null,
  route text not null,           -- UUID는 :id로 바꾼 경로 모양
  status integer not null,
  client text not null default 'other',  -- aleph-judge | no-ua | other (접속 도구 이름은 저장하지 않고 구분만)
  server_request_id text,        -- Vercel이 붙인 서버 요청 번호(대시보드 Logs의 Request ID와 같은 값)
  shape text                     -- 심판 점검 도구의 요청에 한해 쿼리 이름·값과 헤더 이름(인증·쿠키·키 제외)
);
alter table public.request_log add column if not exists shape text;
create index if not exists request_log_request_id_idx on public.request_log (request_id);
create index if not exists request_log_at_idx on public.request_log (at desc);

alter table public.request_log enable row level security;
revoke all on table public.request_log from PUBLIC, anon, authenticated;
grant select, insert on public.request_log to service_role;
grant usage, select on all sequences in schema public to service_role;
