# BYTE BACK 방어전 시작 틀 R5

이 저장소는 1단계에서 학생 본인이 GitHub 저장소와 Vercel 배포를 만드는 출발점입니다. 포함된 메모 네 건은 가상 자료입니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

## 학생이 하는 일: 세 걸음

1. GitHub 계정을 만듭니다.
2. 방어전 1단계 카드의 **Deploy** 버튼을 누릅니다. Vercel에 GitHub로 로그인하고, 새 저장소가 **본인 계정의 Public 저장소**인지 확인한 뒤 Deploy를 누릅니다.
3. 배포가 끝나면 화면에 나온 `https://…vercel.app` 주소를 방어전 1단계 카드에 붙여넣고 제출합니다. 저장소 주소나 설정 파일은 적지 않습니다.

배포가 끝나면 `/`에서 점령된 가상 자료실을 볼 수 있습니다. `/data.json`에는 같은 가상 메모가 공개됩니다. 이 공개 상태를 확인하는 것이 1단계의 출발점입니다. 1단계 접수와 심판 판정은 포털에서 확인합니다.

## 시작 틀의 자동 처리

`vercel.json`은 정적 결과물 `public`을 배포합니다. 빌드 명령 `npm run build`는 Vercel이 제공하는 GitHub 저장소 소유자·이름, 커밋 SHA, 배포 URL을 검증하고 `public/aleph.json`을 생성합니다. 이 값이 없으면 빌드가 실패하므로, 성공한 것처럼 빈 주소를 내보내지 않습니다. `aleph.json`의 내용만으로 저장소 소유권이나 방어 성공을 인정하지 않습니다. 심판이 공개 저장소의 실제 커밋과 배포된 자료를 따로 대조해야 합니다.

`aleph.config.json`의 `repoUrl`과 `publicAppUrl`은 이전 제출 묶음 방식의 자리표시자입니다. 1단계에서는 학생이 편집하지 않습니다. 2단계 이후 코딩 도구가 필요한 설정과 보호 기능을 단계별로 작성합니다. `npm run bundle`과 `bundle-notes.json`도 1단계의 세 걸음에는 포함되지 않습니다.

로컬에서 가상 화면만 확인할 때는 `npm run build -- --local`을 사용합니다. 로컬 실행은 Vercel 배포나 심판 접수를 증명하지 않습니다. 저장소의 `src/attack-check.mjs`는 실제 배포가 된 뒤 `/data.json`을 비로그인으로 요청해 공개 가상 메모의 확인 표시를 읽습니다.

## 다음 단계의 코딩 도구에 전달할 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 2단계부터는 자료 보호를 구현할 때 `public/data.json`을 복사하는 1단계 빌드 흐름도 함께 바꿔야 합니다. 3단계 이후의 로그인, 허용 경로, 5단계의 원본 API 주소, 6단계 이후 정책 규칙은 해당 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.

## 2단계: 자료를 코드 밖으로

가상 메모 네 건은 저장소 파일이 아니라 Supabase `notes` 테이블(`supabase/notes.sql`)에 있습니다. 화면은 `api/notes.js`(서버 함수)를 통해 읽습니다. 함수는 환경변수 `SUPABASE_URL`과 서버 전용 `SUPABASE_SECRET_KEY`를 Vercel에서 읽으며, 키는 브라우저 파일·응답·로그에 나오지 않습니다. `/data.json`은 더 이상 만들지 않습니다.

**남은 약점:** `/api/notes`는 로그인 없이 누구나 부를 수 있는 공개 주소입니다(3단계에서 막습니다). 이전 공개 커밋과 배포 이력에는 메모가 남아 있으며 이번 단계로 지워지지 않았습니다.

### 가상 메모 노출 확인 절차 (2단계)

1. 저장소 최신 파일: `git grep -n "실습용 가상"` — 결과가 `supabase/notes.sql`(테이블에 넣을 가상 메모 원본)에만 나와야 합니다. 마지막 확인(커밋 전): 그 파일 외에는 없음.
2. 배포 정적 파일: 배포 주소의 `/data.json`이 404이거나 메모 0건이어야 합니다. 화면 `/`는 `/api/notes`를 부릅니다.
3. 공개 API: 로그인 없이 `/api/notes`를 열면 가상 메모 네 건이 보입니다. 3단계 전까지 남는 약점입니다.

**해소되지 않은 것:** 옛 공개 커밋(`4a162d0`)과 옛 배포에는 메모가 남아 있습니다. `supabase/notes.sql`도 공개 저장소에 가상 메모 문장을 담고 있습니다. 이 두 가지는 이번 단계로 지워지지 않았습니다.

배포 확인(2단계): `/data.json` 404, `/api/notes`는 로그인 없이 가상 메모 네 건 응답, 화면 정상.

## 3단계: 진짜 로그인

화면은 Supabase Auth 이메일·비밀번호 로그인과 로그아웃을 쓰고(공식 SDK, 브라우저에는 공개용 publishable 키만 있음), 서버 API는 요청의 `Authorization: Bearer` 토큰을 `src/verify-login.mjs`로 검증합니다. 브라우저가 보낸 userId·role은 믿지 않고, 검증된 토큰의 사용자 ID만 `owner_id`로 저장합니다. 발급자 정보는 `aleph.config.json`의 `identityProvider`에 있습니다(비밀 키 제외).

| 경로 | 동작 |
|---|---|
| `GET /api/notes` | 로그인한 사용자의 메모 배열 `[{id,title,body}]` |
| `POST /api/notes` | `{id?,title,body}` → `{id}` (id는 UUID, 없으면 서버가 만듦) |
| `GET·PUT·DELETE /api/notes/:id` | 한 건 `{id,title,body}`, 지운 뒤 GET은 404 |

로그인 없는 요청은 `401 {"error":"LOGIN_REQUIRED"}`입니다. 계정은 Supabase 대시보드 Authentication에서 만든 A 계정을 씁니다.

**3단계 당시 약점:** 소유자 검사가 없어 로그인한 B가 A의 메모 id로 접근할 수 있었습니다(아래 4단계에서 API와 DB로 막음). 2단계 이전의 공개 커밋·배포 이력과 `supabase/notes.sql`의 가상 메모 문장은 그대로입니다.

## 4단계: 로그인해도 내 자료만

메모 읽기·수정·삭제 API는 검증된 토큰의 사용자 ID와 DB의 `owner_id`를 비교합니다. URL·본문의 `owner_id`는 믿지 않으며, 본문에 내 ID가 아닌 `owner_id`가 있으면 403으로 거부합니다. 남의 메모 `id`로 요청하면 존재 여부를 숨기려 404를 돌려줍니다. 추가할 때는 항상 검증된 ID를 `owner_id`로 저장합니다.

DB 쪽 최소 권한은 `supabase/notes-rls.sql`입니다(`anon` 권한 없음, `authenticated`는 자기 행만 SELECT·INSERT·UPDATE·DELETE). 서버 함수는 서버 전용 키(`service_role`)로 접근해 RLS를 우회하므로, 접근 제어의 실제 방어선은 API의 소유자 비교입니다. 적용 전후 권한은 파일 안의 `information_schema.role_table_grants`·`has_table_privilege` 쿼리로 대조합니다.

**남은 것:** 이 SQL을 Supabase에 적용했는지는 코드로 확인되지 않습니다. A/B 교차 접근은 화면·API로 직접 확인했는지 아래에 적습니다.

## 5단계: 자료 요청을 서버 한곳으로

브라우저의 메모 읽기·추가·수정·삭제는 모두 Vercel 서버 함수(`/api/notes`)를 거칩니다. 화면 코드에는 Supabase 자료를 직접 부르는 곳이 없습니다(로그인 Auth 호출만 있었습니다). `supabase/notes-lockdown.sql`은 `PUBLIC`·`anon`·`authenticated`의 `notes` 직접 권한을 거두고, 서버 함수가 쓰는 `service_role`은 유지합니다. 원본 자료 주소는 `aleph.config.json`의 `originalApiUrl`입니다. SQL 적용 전후 권한은 파일 안의 `has_table_privilege` 쿼리로 대조합니다. **이 SQL은 학생이 직접 검토해 실행하며, 적용 여부는 코드로 확인되지 않습니다.**
