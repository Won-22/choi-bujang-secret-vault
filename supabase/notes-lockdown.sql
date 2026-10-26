-- 5단계: 브라우저(공개 키·로그인 토큰)가 notes 테이블을 Data API로 직접 부르는 길을 닫는다.
-- 서버 함수는 서버 전용 키(service_role)로 접근하므로 service_role 권한은 건드리지 않는다. 다른 테이블은 그대로 둔다.

-- [적용 전] 실제 권한 확인 (4단계 SQL 뒤라면 authenticated 네 칸이 true)
select r as role,
  has_table_privilege(r, 'public.notes', 'select') as can_select,
  has_table_privilege(r, 'public.notes', 'insert') as can_insert,
  has_table_privilege(r, 'public.notes', 'update') as can_update,
  has_table_privilege(r, 'public.notes', 'delete') as can_delete
from (values ('anon'), ('authenticated'), ('service_role')) as t(r);

revoke all on table public.notes from PUBLIC, anon, authenticated;

-- [적용 후] anon·authenticated는 모두 false, service_role은 모두 true여야 한다.
select r as role,
  has_table_privilege(r, 'public.notes', 'select') as can_select,
  has_table_privilege(r, 'public.notes', 'insert') as can_insert,
  has_table_privilege(r, 'public.notes', 'update') as can_update,
  has_table_privilege(r, 'public.notes', 'delete') as can_delete
from (values ('anon'), ('authenticated'), ('service_role')) as t(r);
select grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'notes' order by grantee, privilege_type;
