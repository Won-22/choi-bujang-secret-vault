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

**화면 코드에 공개 키 없음(가점):** 로그인·토큰 갱신·로그아웃도 서버 함수 `api/session.js`가 Supabase 공식 SDK로 대신 처리합니다. 브라우저는 `/api/...`만 부르고 `sb_publishable_` 키를 갖지 않습니다. 서버에는 Vercel 환경변수 `SUPABASE_PUBLISHABLE_KEY`(공개용)와 `SUPABASE_SECRET_KEY`(서버 전용)가 필요합니다. 로그인이 깨지면 이 커밋만 되돌립니다.

## 6단계: 등록한 기기만 자료실에

**요청 항목 설명** (`docs/DECIDER_REQUEST.md`): 사용자는 `subjectId`(발급자·대상·반·프로젝트를 묶은 가명 ID)로만 들어오고, 브라우저가 보낸 userId·역할은 요청에 없습니다. 기기 등록 여부는 엔진이 확인해 넘기는 최상위 `deviceRegistered`(true/false)입니다. 동작과 경로는 `method`, `path`, `route`입니다. 인증서·CA·서명 키는 만들지 않았고 Git에도 없습니다.

**규칙:** `src/decider.mjs`의 `device_registered`는 `deviceRegistered === true`일 때만 `allow`(`approved`)하고, `false`·없음·그 밖의 값은 `deny`와 `device_not_registered`로 거부합니다. `RULE_IDS`에는 이 규칙 하나만 있고 다른 규칙은 없습니다. 기존 자료실 주소와 화면은 바꾸지 않았습니다.

**확인 순서:**
1. `npm ci`
2. `npm run decider:test` — "통과 · 등록 기기의 정상 요청"과 "통과 · 미등록 기기의 가상 요청"(`deny`·`device_not_registered`)이 모두 보여야 합니다.
3. `node --test test/` — 등록·미등록·값 없음·`'true'`·`1` 요청을 다룹니다.

로컬 시험은 가상 요청 연습이며 심판 판정이나 실제 접속 증거가 아닙니다. 미등록 기기 공격은 심판이 확인하며, 따로 설치할 접속 프로그램은 없습니다.

## 7단계: 평소와 다른 접속은 다시 확인

**입력 검사(출처):** `src/decider.mjs`는 `signals.source`가 엔진이 검증한 가상 출처(`judge_fixture`)이고 지역·네트워크·시각(0~23 정수)·최근 사건 배열이 모두 형식에 맞을 때만 접속 정보를 근거로 씁니다. 실제 경로의 `source: "none"`, 브라우저 헤더 같은 알 수 없는 출처, 값이 없거나 형식이 틀린 경우는 근거가 아니며 정상값으로 채우지도 않습니다(그대로 무시).

**규칙 `step_up_required`:** 새벽 0~5시 접속 **그리고** 네트워크가 `unusual` **그리고** 최근 10분 안 `risk_signal` 사건 합계가 10 이상일 때만 `step_up`(`step_up_required`)을 돌려줍니다. 지역은 근거로 쓰지 않아 지역 하나만으로 차단하지 않습니다. 엔진이 새 로그인 시각을 검증해 `stepUp.verified: true`, `authAgeSeconds` 0~900초로 넘기면 `allow`합니다. 기기 규칙(`device_registered`)은 그대로 먼저 적용됩니다.

**재로그인 계약 확인:** 요청에 엔진이 채우는 `stepUp{verified, authAgeSeconds}`가 있어 계약은 존재합니다. 다만 확인 전 자료를 실제로 막고 새 로그인 뒤 다시 판정하는 일은 제공 엔진이 하며, 이 저장소의 앱은 판정기를 호출하지 않습니다. 그 실제 차단은 **미실행**입니다. 토큰 원문은 기록하지 않습니다.

**시험:** `npm run decider:test`(정상 allow, 미등록 deny, 복합 이상 step_up, 다시 확인 allow), `npm run fixture:7`, `node --test test/`. 로컬 시험은 심판 통과 증거가 아닙니다.

## 8단계: 자료마다 갈 수 있는 구역을 나눕니다

**자원 ID** (`src/resources.mjs`): 메모 `memo.item`, 반 공지 `class.notice`, 강사 자료 `instructor.material`. 메모 API 응답에는 `X-Resource-Id`(`memo.item`, 목록·추가는 `memo.item.collection`)가 붙어 요청마다 구역을 구별할 수 있습니다.

**판정기 규칙 `resource_zone`** (`src/decider.mjs`): 서비스와 정확한 경로 모양이 구역 표에 있고 실제 `path`가 그 모양과 같을 때만 통과합니다. 아니면 `deny`(`resource_not_allowed`)입니다.
- 메모: `GET·PUT·DELETE /notes/:id`처럼 ID 하나를 고르는 경로만 허용합니다. ID 없는 목록·추가 경로는 거부하고, ID 형식(UUID 여부)은 좁히지 않습니다.
- 반 공지: `GET /announcements`, `GET /announcements/:id`만 허용합니다. 쓰기(POST·PUT·PATCH·DELETE)는 모두 거부하며 수정은 서버의 관리 경로에서 처리합니다.
- 강사 자료: 허용 경로가 없어 모두 거부합니다. 알 수 없는 경로, 쿼리가 있는 요청(`queryLength` 0이 아님), `:id` 자리에 `export` 같은 기능 이름이 온 경우도 거부합니다. 메모 주인 비교는 판정기에 넣지 않았습니다.
- 앞 단계 규칙(`device_registered`, `step_up_required`)은 그대로이며 순서는 기기 → 구역 → 추가 확인입니다. 새 이유 코드 `resource_not_allowed`는 운영 등록부에 없으면 엔진이 허용으로 쓰지 않습니다(거부로 처리).

**API 재확인** (`src/notes.mjs`): 검증된 사용자 ID와 DB의 `owner_id`를 계속 대조하고, 본문의 `role`·`isInstructor`는 믿지 않고 `403 ROLE_NOT_TRUSTED`로 거부합니다. 이 저장소에는 반 공지·강사 자료 API가 없어 메뉴를 우회한 직접 요청에서도 다른 구역 자료가 나올 길이 없습니다. 저장된 강사 권한 대조는 그런 API가 생길 때 필요하며 지금은 해당 없음입니다.

**allowedRoutes:** 판정기가 허용하고 실제로 있는 `GET·PUT·DELETE /api/notes/:id` 세 개입니다(목록·추가 경로는 판정기가 거부해 뺐습니다).

## 9단계: 도플갱어를 찾고 권한을 거둡니다

**입력 처리** (`src/detect.mjs`): 사건마다 `at`(시각), `method`(요청 종류), `identity.sub`(가명 사용자) 세 값만 읽습니다. 네트워크·기기·지역·메모 내용·토큰·실명은 읽지도 저장하지도 출력하지도 않습니다. `GET`이 아니거나 시각·사용자가 분명하지 않은 사건은 정상값으로 채우지 않고 건너뜁니다.

**규칙 `burst_read`:** 같은 `identity.sub`의 `GET` 사건이 10분 구간(시작 사건 포함, 10분 미만 간격) 안에 120건을 **넘으면**(121건 이상) `{ action: 'propose_revocation', reasonCode: 'burst_read', subject }`만 돌려주고, 그 밖에는 `{ action: 'observe' }`입니다. 정확히 120건, 10분 밖으로 흩어진 조회, 여러 사용자가 섞인 사건은 합치지 않습니다. 시각 계산은 `at`만 씁니다. 회수 API를 직접 만들거나 기기 권한을 바꾸지 않았고, 판정기(`src/decider.mjs`) 응답 형식도 그대로입니다.

**시험:** `npm run detect:test`가 폭주 묶음(121·200건)은 `propose_revocation`, 정상 묶음(30·120건, 사용자별 100건, 흩어진 200건)은 `observe`로 6건 모두 통과했습니다. `node --test test/`도 통과했습니다. 이 시험은 가상 사건 연습이며 실제 접속 회수나 심판 통과 증거가 아닙니다. 운영 엔진의 사건 전달·접속 회수 연결은 확인하지 않았습니다.
