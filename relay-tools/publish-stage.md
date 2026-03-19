# /publish-stage

입력은 선택적으로 `stage-slug` 하나다.
- 예: `/publish-stage meteor-dodge-run`
- 생략 시: Git 변경 파일에서 `community-stages/<stage-slug>/...`를 자동 추론한다.

목표:
- 스테이지 검증 → 브랜치 생성 → 커밋 → 푸시 → PR 생성을 한 번에 수행한다.

순서:
1. 로컬 서버가 안 떠 있으면 먼저 기동한다.
   - `python3 -m http.server 4173 &`
2. 아래 스크립트를 `--pr` 플래그로 실행한다.
   - `node relay-tools/scripts/publish_stage.js --stage <stage-slug> --pr --base-url http://127.0.0.1:4173`
3. `--pr` 플래그는 아래를 자동 수행한다.
   - `check_stage.js` 재실행 (검증 통과 필수)
   - 브랜치 생성: `stage/<stage-slug>` (이미 있으면 그대로 사용)
   - 관련 파일 스테이징: `community-stages/<slug>/`, `community-stages/registry.js`
   - 커밋: `feat: add relay stage <stage-slug>`
   - 푸시: `git push -u origin stage/<stage-slug>`
   - PR 생성: `gh pr create` (fork/direct 자동 감지)
   - PR URL 출력
4. Fork vs Direct 워크플로우는 자동 감지된다.
   - upstream remote가 있으면 fork: origin(fork)에 push → upstream(원본)에 PR
   - upstream remote가 없으면 direct: origin(원본)에 push → 같은 레포에 PR
5. 검증이 실패하면 PR 생성을 중단하고 실패 원인을 출력한다.
6. `--pr` 없이 실행하면 기존처럼 JSON 출력만 한다 (dry-run).

출력:
- 검증 결과
- 변경된 파일 목록
- fork 여부
- PR URL
