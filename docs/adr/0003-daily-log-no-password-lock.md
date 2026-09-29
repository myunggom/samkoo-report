# ADR-0003: 업무일지 탭은 잠그지 않는다 (할 일 탭만 잠금 유지)

**Date**: 2026-09-29
**Status**: accepted
**Deciders**: 운영자

## Context

업무일지는 과장급 여러 명이 입력한다. 처음에는 할 일 탭(운영자 개인용)과 분리된 과장급 공용 비밀번호(`DAILY_LOG_PASSWORD`, 별도 쿠키)로 잠그도록 만들었다(`72eaae2`). 이 앱의 다른 업무 탭(일일 기록·문제 관리·보고서)은 원래 잠금이 없다.

## Decision

운영자 결정으로 업무일지 탭과 `/api/daily-log` 의 잠금을 걷어냈다(`921d9c4`). 공용 비밀번호·로그인 화면·인증 API 를 삭제하고 `proxy.ts`·`lib/weeklyAuth.ts` 는 이전 상태로 되돌렸다. **할 일 탭(`/tasks`)과 주간 업무보고의 잠금은 그대로다.**

## Alternatives Considered

### Alternative 1: 과장급 공용 비밀번호 (구현 후 철회)
- **Pros**: 주소를 알아도 외부인은 못 봄
- **Cons**: 비밀번호 공유·관리 부담
- **Why not**: 운영자 판단 — 다른 탭과 같은 수준으로 충분

### Alternative 2: 할 일 탭 비밀번호 공유
- **Why not**: 공용으로 쓰면 개인용 할 일 탭까지 열린다

## Consequences

### Positive
- 로그인 없이 폰·PC에서 바로 입력

### Negative
- **주소를 아는 누구나 고객사 업무일지를 보고 고칠 수 있다** (읽기·쓰기 모두)

### Risks
- 잘못 고친 내용을 되돌릴 이력이 없다 → 문제가 생기면 Alternative 1 코드(`72eaae2`)를 되살리거나 수정 이력을 추가할 것
