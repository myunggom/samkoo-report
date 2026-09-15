# 개인 업무 관리 탭 (`/tasks`) 설계

작성일: 2026-09-15
대상 저장소: `myunggom/samkoo-report` (Next.js 앱 루트는 `report/`)
브랜치: `feat/tasks-tab`

## 1. 목적과 범위

회의 내용·업무 메모를 자유 텍스트로 붙여넣으면 AI가 개별 할 일로 쪼개고 카테고리와 마감일을 제안한다.
사용자가 확인·수정한 것만 저장된다. 여럿이 함께 봐야 하는 항목은 기존 `문제 관리`로 넘겨 연동한다.

이 탭은 **운영자 1인 전용**이며 다른 직원에게는 메뉴에 보이지도, 접근되지도 않는다.

### 범위에 넣는 것
- 자유 텍스트 → AI 정리 → 제안 확인 → 저장
- 마감일 기준 그룹 목록, 완료 토글, 수동 추가/수정/삭제
- 문제 관리로 공유 + 문제 상태를 할 일 카드에 표시

### 범위에서 빼는 것 (의도적)
- **텔레그램/이메일 알림** — 1단계는 화면 배지로만 알린다. 매일 사이트를 여는 사용 패턴이면 충분하고,
  부족하면 그때 Vercel Cron을 붙인다.
- **기존 텔레그램 봇과의 데이터 통합** — §2.2 참고. 봇은 현재 거의 사용되지 않는다.
- **계정 기반 인증(Supabase Auth 등)** — 사용자가 1명이라 비밀번호 게이트로 충분하다.
- **반복 일정** — 이미 캘린더(`lib/events.ts`)가 담당한다.

## 2. 사전 조사 결과

### 2.1 재사용하는 기존 자산

새로 도입하는 의존성·외부 서비스는 없다. 아래는 전부 이미 저장소에 있다.

| 필요 | 기존 자산 |
| --- | --- |
| 비공개 잠금 | `report/proxy.ts` + `report/lib/weeklyAuth.ts` + `WEEKLY_REPORT_PASSWORD` |
| 로그인 화면 | `report/app/weekly-report/login/page.tsx` (`next` 파라미터로 복귀, 오픈 리다이렉트 방어 포함) |
| AI 호출 | `report/app/api/weekly/generate/route.ts` 패턴 (`ANTHROPIC_API_KEY`, `claude-sonnet-5`, 직접 `fetch`) |
| 저장소 | `report/lib/store.ts` (Vercel Blob ↔ 로컬 파일 자동 전환) |
| 문제 관리 | `report/lib/issues.ts` 타입 + `store.addIssue()` |

### 2.2 이미 존재하는 별도 업무 관리 도구 (중요)

저장소 루트의 `tools/task_manager.py`는 **텔레그램 봇 + Google Sheets** 기반 업무 관리 도구다.
`tools/daily_log_bot.py:460`에서 `get_task_handlers`, `register_jobs`를 불러 함께 구동된다.

- 시트 `업무목록` — 컬럼 `ID · 제목 · 마감일 · 우선순위 · 메모 · 상태 · 등록일 · 처리일`
- 상태값 `진행중 / 완료 / 지연`, 완료 시 `완료업무기록` 시트에 누적
- `build_daily_digest()` 매일 알림, `build_weekly_report()` 주간 집계
- 조사 시점(2026-09-15 16:22) 기준 봇 프로세스는 **실행 중**

**결정: 통합하지 않고 웹은 Blob에 따로 저장한다.**
원래라면 목록이 둘로 쪼개지는 것이 가장 큰 위험이지만, 운영자가 이 봇을 거의 사용하지 않는다고 확인했다.
사용되지 않는 데이터와 통합하려고 Google 서비스계정 키 배포·`googleapis` 의존성·시트 스키마 변경(봇 코드 동반 수정)까지
떠안는 것은 얻는 것에 비해 비싸다.

**남는 정리 과제 (이번 범위 밖, 별도 판단 필요):**
봇이 계속 돌면 **사용하지 않는 옛 시트 기준으로 매일 알림이 발송된다.** 웹 탭이 자리 잡은 뒤
봇을 끄거나 업무 기능만 분리할지 결정해야 한다. 이 설계는 봇을 건드리지 않는다.

### 2.3 데이터 저장 위치 — 선택 근거

**채택: 별도 prefix `db/tasks/`**

대안이었던 "기존 `Issue`에 `private: true` 플래그를 달아 한 곳에 저장"은 파일 하나를 아끼는 대신,
문제 관리 목록·칸반·전체 검색·대시보드 집계 **모두에 필터를 빠짐없이** 넣어야 한다.
한 군데만 빠뜨리면 개인 메모가 공개 탭에 노출된다. 노출 사고의 대가가 절약분보다 크므로 물리적으로 분리한다.

### 2.4 탭 노출 방식 — 선택 근거

`/tasks` 탭은 **로그인한 상태에서만** 상단 메뉴에 나타난다.

- 서버 컴포넌트인 `report/app/layout.tsx`에서 `cookies()`를 읽는 방법은 **루트 레이아웃 전체를 동적 렌더링으로
  전환시켜** 지금 정적으로 미리 렌더되는 공개 페이지(`/` 등)까지 느려진다. 채택하지 않는다.
- **채택: UI 힌트 쿠키.** 로그인 시 기존 `wr_auth`(httpOnly)와 함께 `wr_ui=1`(httpOnly 아님)을 발급하고,
  클라이언트 컴포넌트인 `TopNav`가 `document.cookie`로 읽어 탭을 표시한다. 로그아웃 시 둘 다 지운다.

  보안상 문제없다. 실제 접근 통제는 `proxy.ts`와 각 API 라우트의 `isTokenValid()`가 하고,
  `wr_ui`는 위조해봐야 **로그인 화면으로 가는 탭이 하나 보일 뿐**이다. 데이터는 전혀 열리지 않는다.

### 2.5 잠금 경로

`report/proxy.ts`의 `config.matcher`에 `/tasks/:path*`와 `/api/tasks/:path*`를 추가한다.
`PUBLIC_PATHS`는 그대로 둔다. 미인증 시 API는 401, 페이지는 `/weekly-report/login?next=/tasks`로 이동한다.

로그인 화면 문구가 "🔒 주간 업무보고 / 사장님 전용"으로 고정돼 있어 `/tasks`에서 오면 맥락이 어긋난다.
`next` 값이 `/tasks`로 시작하면 제목을 "🔒 개인 업무 관리"로 바꾼다 (해당 파일에서 제목 문구만 분기).

## 3. 데이터 모델 — `report/lib/tasks.ts` (신규)

```ts
export type TaskStatus = "todo" | "doing" | "done";
export type TaskCategory = "facility" | "contract" | "report" | "meeting" | "etc";

export type Task = {
  id: string;
  title: string;          // 할 일 한 줄 요약
  note?: string;          // 상세
  category: TaskCategory;
  status: TaskStatus;
  due?: string;           // "2026-09-19" — KST 기준 날짜. 없을 수 있음
  source?: string;        // 이 할 일이 나온 원문 조각 — 나중에 맥락 확인용
  issueId?: string;       // 문제 관리로 공유했으면 연결
  createdAt: string;      // ISO 8601 "2026-09-15T07:22:00.000Z"
  updatedAt: string;      // ISO 8601
  doneAt?: string;        // ISO 8601
};
```

카테고리 라벨 (고정 목록):

| 값 | 라벨 |
| --- | --- |
| `facility` | 시설·안전 |
| `contract` | 계약·행정 |
| `report` | 보고·문서 |
| `meeting` | 회의·사람 |
| `etc` | 기타 |

AI는 이 다섯 중 하나만 고른다. 자유 생성을 허용하면 "시설점검"/"시설 점검"/"점검"이 난립해 그룹이 깨진다.
목록을 늘릴 때는 이 파일의 상수 한 줄만 고치면 된다.

같은 파일에 **순수 함수**를 둔다 (§7 검증 대상).

- `dueGroup(due: string | undefined, now: Date): "overdue" | "today" | "week" | "later" | "none"`
  — KST 기준으로 판정한다. `week`는 오늘 다음날부터 **이번 주 일요일**까지.
  오늘이 일요일이면 `week`에 해당하는 날이 없고 내일부터는 `later`가 된다 (의도된 동작).
- `parseTasksJson(raw: string): Partial<Task>[]` — AI 응답에서 JSON 배열을 추출·검증한다.
  코드펜스로 감싸 오는 경우를 벗겨내고, 알 수 없는 카테고리는 `etc`로,
  형식이 틀린 날짜는 `undefined`로 떨어뜨린다. 배열이 아니면 던진다.

## 4. 저장소 — `report/lib/store.ts` (수정)

기존 이슈 블록과 동일한 형태로 추가한다. 새 개념 없음.

```ts
const TASK_PREFIX = "db/tasks/";                       // Blob
const TASK_FILE = path.join(DATA_DIR, "tasks.json");   // 로컬

listTasks(): Promise<Task[]>                 // due 오름차순, due 없는 항목은 뒤로
addTask(t: Task): Promise<Task>
updateTask(id, patch): Promise<Task|null>    // updatedAt 자동 갱신
deleteTask(id): Promise<void>
```

## 5. API

모든 라우트는 `proxy.ts`로 이미 잠겨 있지만, `app/api/weekly/generate/route.ts`와 같이
**라우트 안에서도 `isTokenValid()`로 재확인**한다 (matcher 설정 실수에 대한 이중 방어).

| 라우트 | 메서드 | 동작 |
| --- | --- | --- |
| `app/api/tasks/route.ts` | `GET` | 할 일 목록 + 연결된 문제 상태를 합쳐 반환 (§6) |
| | `POST` | 할 일 생성. 본문은 **항상 배열**(`{ tasks: [...] }`) — 1건이든 여러 건이든 같은 경로. 저장된 목록을 반환 |
| `app/api/tasks/[id]/route.ts` | `PUT` | 수정 (완료 토글 포함. `status:"done"`이면 `doneAt` 기록) |
| | `DELETE` | 삭제 |
| `app/api/tasks/parse/route.ts` | `POST` | AI 정리 — **저장하지 않고 제안만 반환** |
| `app/api/tasks/[id]/share/route.ts` | `POST` | 문제 관리로 공유 (§6) |

### 5.1 AI 정리 (`/api/tasks/parse`)

입력: `{ text: string }`

프롬프트에 **오늘 날짜(KST)와 요일**을 주입해 "다음 주 금요일까지" 같은 표현을 실제 날짜로 환산시킨다.
모델은 기존과 같은 `claude-sonnet-5`, `maxDuration = 60`.

출력(각 항목):

```json
{ "title": "소방 수신기 점검 업체 견적 받기",
  "note": "3층 수신기 오작동 반복",
  "category": "facility",
  "due": "2026-09-19",
  "source": "3층 수신기가 계속 오작동해서 업체 견적을 금요일까지 받기로 함",
  "shared": true,
  "reason": "다른 담당자도 알아야 하는 건물 문제" }
```

- `due`는 근거가 없으면 생략한다. **날짜를 지어내지 않는다.**
- `source`는 이 할 일의 근거가 된 **원문 문장을 그대로** 따온다 (요약하지 않는다). `Task.source`로 저장된다.
- `shared`는 "다른 사람도 알아야 하는 건물 문제"로 읽힐 때만 `true` — 제안일 뿐 자동 등록하지 않는다.
- `shared`·`reason`은 **저장되지 않는다.** 제안 화면에서 공유 체크박스의 기본값과 그 이유를 보여주는 데만 쓰인다.
- 원문에 없는 사실을 만들지 않는다. 쪼개고 분류만 한다.

에러 처리 (기존 `weekly/generate`의 문구·방식을 따른다):

| 상황 | 응답 |
| --- | --- |
| `ANTHROPIC_API_KEY` 없음/이상한 문자 | 500 + Vercel 환경변수 확인 안내 |
| 빈 텍스트 | 400 + "정리할 내용을 먼저 적어 주세요" |
| Claude 401 / 429 / 5xx | 상태별 한글 안내 |
| JSON 파싱 실패 | 502 + "정리에 실패했어요. 다시 시도하거나 직접 추가해 주세요" |

파싱에 실패해도 **사용자가 입력한 원문은 화면에서 지우지 않는다.** 다시 누르면 재시도된다.

## 6. 문제 관리 연동

같은 앱 안이라 HTTP를 거치지 않고 `store.addIssue()`를 직접 호출한다.

1. 할 일 카드의 `[공유]` → `POST /api/tasks/{id}/share`
2. 라우트가 `addIssue({ id, title, note, status: "open", createdAt, updatedAt })` 실행
3. 생성된 `issueId`를 해당 할 일에 저장 (`updateTask`)
4. 이미 `issueId`가 있으면 중복 생성하지 않고 기존 것을 반환한다

목록 조회(`GET /api/tasks`)는 `listIssues()`를 한 번 읽어 `issueId`로 맞춰,
각 할 일에 `issueStatus`(접수/처리중/완료)를 **읽기 전용으로 덧붙여** 반환한다.

상태의 원본은 문제 관리 한 곳뿐이다. 할 일 쪽에 상태를 복사해 두지 않으므로 어긋날 일이 없다.
할 일 자체의 완료 체크는 문제 상태와 별개다 (내 손을 떠난 것과 내가 끝낸 것은 다르다).

연결된 문제가 삭제된 경우 `issueStatus`는 `undefined`가 되고, 카드에는 "연결된 문제 없음"으로 표시한다.

## 7. 검증

프레임워크 없이 `node`로 바로 돌리는 assert 자체점검 하나를 남긴다 — `report/lib/tasks.check.ts`.

깨지면 화면이 통째로 틀어지는데 **조용히** 틀리는 두 함수만 대상으로 한다.

- `dueGroup()` — 어제(overdue) / 오늘(today) / 내일(week) / 이번 주 일요일(week) /
  다음 주 월요일(later) / `undefined`(none) 경계. **KST 기준**이 맞는지 확인한다
  (UTC로 계산하면 한국 시간 오전 9시 이전에 하루가 밀린다).
- `parseTasksJson()` — 정상 배열 / 코드펜스로 감싼 응답 / 앞뒤 설명이 붙은 응답 /
  모르는 카테고리(→`etc`) / 잘못된 날짜(→`undefined`) / 배열 아님(→throw).

## 8. 화면 — `report/app/tasks/page.tsx`

```
┌ 회의·업무 내용 붙여넣기 ───────────────────┐
│ (여러 줄 입력창)                [AI로 정리] │
└──────────────────────────────────────────┘
   ↓ AI 제안 — 체크해서 고르고 그 자리에서 수정
   ☑ 소방 수신기 점검 업체 견적  [시설·안전▾] [2026-09-19] ☐문제로 공유
   ☑ 3분기 실적보고 초안        [보고·문서▾] [2026-09-30] ☐공유
   ☐ (제안 3)                                    [선택 항목 저장]

   [+ 직접 추가]

   📌 지남 2   오늘 1   이번 주 4   다음 3   기한 없음 2
   ● 소방 수신기 견적   시설·안전   9/19  [처리중 ▸문제관리]
   ○ 3분기 실적보고     보고·문서   9/30
   ...
   ▸ 완료 12건 (접힘)
```

- 기존 `report/app/issues/page.tsx`의 클라이언트 컴포넌트 구조와 Tailwind 어휘를 그대로 따른다
  (`rounded-2xl border`, `bg-slate-900` 기본 버튼, `STATUS_STYLE` 형태의 뱃지 상수).
- 마감일 그룹 순서: **지남 → 오늘 → 이번 주 → 다음 → 기한 없음.** "지남"은 빨간 배지로 맨 위에 둔다.
- 완료 항목은 기본 접기.
- 저장·완료 토글은 낙관적 업데이트 후 재조회 — `issues/page.tsx`와 같은 방식.

## 9. 만들고 고칠 파일

### 신규 (7)
- `report/lib/tasks.ts`
- `report/lib/tasks.check.ts`
- `report/app/tasks/page.tsx`
- `report/app/api/tasks/route.ts`
- `report/app/api/tasks/[id]/route.ts`
- `report/app/api/tasks/parse/route.ts`
- `report/app/api/tasks/[id]/share/route.ts`

### 수정 (5)
- `report/lib/store.ts` — tasks 저장 블록 추가
- `report/proxy.ts` — matcher에 2줄 추가
- `report/components/TopNav.tsx` — `wr_ui` 쿠키가 있을 때만 "할 일" 탭 표시
- `report/app/api/weekly/auth/route.ts` — 로그인 시 `wr_ui` 발급, 로그아웃 시 제거
- `report/app/weekly-report/login/page.tsx` — `next`가 `/tasks`면 제목 문구 분기

## 10. 운영 메모

- **새 환경변수 없음.** `WEEKLY_REPORT_PASSWORD`와 `ANTHROPIC_API_KEY` 모두 이미 Vercel에 설정돼 있다.
- **새 npm 의존성 없음.**
- 비용은 AI 정리 1회당 Claude API 몇 원 수준. 목록 조회·저장에는 API 호출이 없다.
- §2.2의 텔레그램 봇 정리 건은 이 작업 이후 별도로 판단한다.
