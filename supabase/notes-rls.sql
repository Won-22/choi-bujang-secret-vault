-- 4단계: 로그인한 사용자는 자기 메모 행만 다룬다. 다른 테이블은 건드리지 않는다.
-- 서버 함수(service_role)는 RLS를 우회하므로 권한을 그대로 둔다(API가 owner_id를 직접 비교한다).

-- [적용 전] 실제 권한 확인
select grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'notes' order by grantee, privilege_type;
select r as role,
  has_table_privilege(r, 'public.notes', 'select') as can_select,
  has_table_privilege(r, 'public.notes', 'insert') as can_insert,
  has_table_privilege(r, 'public.notes', 'update') as can_update,
  has_table_privilege(r, 'public.notes', 'delete') as can_delete
from (values ('anon'), ('authenticated'), ('service_role')) as t(r);

alter table public.notes enable row level security;
revoke all on table public.notes from PUBLIC, anon, authenticated;
grant select, insert, update, delete on table public.notes to authenticated;

drop policy if exists notes_select_own on public.notes;
drop policy if exists notes_insert_own on public.notes;
drop policy if exists notes_update_own on public.notes;
drop policy if exists notes_delete_own on public.notes;

create policy notes_select_own on public.notes for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy notes_insert_own on public.notes for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy notes_update_own on public.notes for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy notes_delete_own on public.notes for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- [적용 후] 같은 확인을 다시: anon은 모두 false, authenticated는 4개 모두 true여야 한다.
select grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'notes' order by grantee, privilege_type;
select r as role,
  has_table_privilege(r, 'public.notes', 'select') as can_select,
  has_table_privilege(r, 'public.notes', 'insert') as can_insert,
  has_table_privilege(r, 'public.notes', 'update') as can_update,
  has_table_privilege(r, 'public.notes', 'delete') as can_delete
from (values ('anon'), ('authenticated'), ('service_role')) as t(r);
