-- 10단계: 비공개 가상 메모 사본과 복원 감사 기록. 서버 함수(service_role)만 접근하고 anon·authenticated는 접근할 수 없다.
create table if not exists public.notes_backup (
  note_id uuid primary key,
  owner_id uuid not null,
  title text not null,
  content text not null,
  content_sha256 text not null,  -- sha256(title || E'\n' || content), 16진수
  backed_up_at timestamptz not null default now()
);
create table if not exists public.restore_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  note_id uuid,
  outcome text not null,
  content_sha256 text
);

alter table public.notes_backup enable row level security;
alter table public.restore_audit enable row level security;
revoke all on table public.notes_backup, public.restore_audit from PUBLIC, anon, authenticated;
grant select, insert on public.notes_backup to service_role;
grant select, insert on public.restore_audit to service_role;
grant usage, select on all sequences in schema public to service_role;
