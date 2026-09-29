# ADR-0004: GitHub main 푸시로 Vercel 자동 배포 (Root Directory = report)

**Date**: 2026-09-29
**Status**: accepted
**Deciders**: 운영자, Claude

## Context

Vercel 프로젝트 `samkoo-report` 는 GitHub 에 연결돼 있지 않아 `report/` 에서 CLI 로 수동 배포했다. 그 결과 main 에 올라간 변경(할 일 처리 단계 등)이 14일 동안 배포되지 않은 채 쌓여 있었다. 저장소 하나에 `report`·`hgp-report`·`web` 등 여러 앱이 있다.

## Decision

Vercel 프로젝트를 GitHub `myunggom/samkoo-report` 에 연결하고 Root Directory 를 `report` 로 바꿨다. **main 에 푸시하면 자동으로 운영 배포된다.**

## Alternatives Considered

### Alternative 1: CLI 수동 배포 유지
- **Pros**: 배포 시점을 사람이 고름
- **Cons**: 배포를 잊어 main 과 운영이 어긋난다(실제로 14일 어긋남)
- **Why not**: 운영자 요청

### Alternative 2: `report/` 변경일 때만 빌드 (Ignored Build Step)
- **Pros**: `hgp-report` 만 고쳐도 다시 배포되는 낭비가 없음
- **Why not**: 지금은 빌드가 짧아(약 40초) 필요 없다. 문제가 되면 추가

## Consequences

### Positive
- main = 운영. 배포를 잊을 일이 없다

### Negative
- main 에 올린 실험 코드가 바로 운영에 나간다 → 실험은 브랜치에서
- 다른 앱만 고친 푸시에도 한 번 다시 배포된다

### Risks
- Vercel 은 커밋 작성자 이메일이 계정과 다르면 배포를 막는다 → 커밋은 `iam.myoung.jin@gmail.com`
- 저장소 루트에서 `vercel link` 를 해서 루트에 `.vercel`·`.env.local`(비밀값)이 생겼다. `.gitignore` 에 들어가 있다 — 지우거나 커밋하지 말 것
