# 지표 정의 (SG-009)

비필수 분석이다. `olr-analytics-opt-out=1`이면 클라이언트가 보내지 않는다. 내부 테스트 이벤트는 분모에서 뺀다.

| 지표 | 분자 | 분모 | 제외 |
|---|---|---|---|
| start_rate | `run_start` | `run_start` | 없음. 노출이 아니라 실제 시작 수 |
| clear_rate | `stage_clear` | `stage_ready` | `stage_invalid`·기술 오류 |
| fail_rate | `stage_fail` | `stage_ready` | 로드 실패·무효 |
| invalid_rate | `stage_invalid` | `run_start` | 난이도 실패와 섞지 않음 |
| retry_rate | `run_retry` | `run_start` | 같은 코스 재시작 |

새 이벤트 이름을 추가하려면 이 표와 `app/infrastructure/analytics.js`를 같이 바꾼다. 개인정보 검토 없이 식별자를 넣지 않는다.
