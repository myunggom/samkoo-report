# Architecture Decision Records

설계 결정과 그 이유. 바꾸려면 새 ADR 을 쓰고 옛 ADR 상태를 `superseded by ADR-NNNN` 으로 바꾼다. 양식은 [template.md](template.md).
저장소가 공개이므로 고객사 실데이터(업무 내용·계량값·직원 이름)는 적지 않는다.

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [0001](0001-daily-log-store-readings-compute-usage.md) | 일일 업무일지: 날짜별 기록 1건, 지침만 저장하고 사용량·누계는 계산 | accepted | 2026-09-29 |
| [0002](0002-daily-log-pdf-download-no-auto-email.md) | 업무일지는 PDF를 받아 직접 발송 (자동 메일 없음) | accepted | 2026-09-29 |
| [0003](0003-daily-log-no-password-lock.md) | 업무일지 탭 잠금 없음 (할 일 탭만 잠금) | accepted | 2026-09-29 |
| [0004](0004-auto-deploy-from-github-main.md) | GitHub main 푸시로 Vercel 자동 배포 | accepted | 2026-09-29 |
