# /publish-stage

입력은 `stage-slug` 하나다.

목표:
- 스테이지를 리뷰 가능한 상태로 정리하고, 필요하면 커밋/푸시까지 준비한다.

순서:
1. 먼저 검증을 다시 돌린다.
   - `node relay-tools/scripts/publish_stage.js --stage <stage-slug>`
2. 이 스크립트는 기본적으로 아래를 수행한다.
   - `check_stage.js` 재실행
   - 관련 변경 파일 확인
   - PR 제목/본문 초안 출력
   - GitHub PR 자동 검토는 `.github/workflows/relay-pr-review.yml` 에서 별도로 수행된다.
3. 사용자가 실제 커밋을 원하면 아래 옵션을 붙인다.
   - 커밋: `--commit`
   - 푸시: `--push`
4. 커밋 메시지는 `feat: add relay stage <stage-slug>` 형식을 사용한다.

출력:
- 검증 결과
- 현재 변경 파일
- PR 제목
- PR 본문 초안
- 커밋/푸시를 실제로 했는지 여부
