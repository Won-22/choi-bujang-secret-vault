-- 11단계: 기기 승인 요청 기록. 서버 함수(service_role)만 읽고 요청을 추가한다. anon·authenticated는 접근할 수 없다.
-- 승인(status를 approved로 바꾸는 일)은 이 파일의 아래 예시처럼 서버 쪽(SQL Editor)에서만 한다. 브라우저 화면에는 승인 권한이 없다.
create table if not exists public.devices (
  id uuid primary key,
  user_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'revoked')),
  secret_hash text not null,  -- 기기 비밀의 sha256. 비밀 자체는 저장하지 않는다.
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

alter table public.devices enable row level security;
revoke all on table public.devices from PUBLIC, anon, authenticated;
grant select, insert on public.devices to service_role;

-- 승인 예시(직접 검토해 실행): 계정 이메일의 대기 중인 요청을 확인한 뒤 id로 승인한다.
--   select d.id, d.status, d.created_at from public.devices d join auth.users u on u.id = d.user_id where u.email = '계정이메일' order by d.created_at;
--   update public.devices set status = 'approved', approved_at = now() where id = '위에서 확인한 id' and status = 'pending';
