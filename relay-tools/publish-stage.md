# /publish-stage

입력은 `stage-slug` 하나를 명시하는 것을 기본으로 한다.
- 예: `/publish-stage meteor-dodge-run`
- 자동 추론도 가능하지만, 다음 제작자 프롬프트에서는 항상 slug를 명시한다.

목표:
- 스테이지 검증 → 커밋 → 푸시 → PR 생성 또는 기존 PR 업데이트를 한 번에 수행한다.

순서:
1. 로컬 서버가 안 떠 있으면 먼저 기동한다.
   - `python3 -m http.server 4173 &`
2. 아래 스크립트를 `--pr` 플래그로 실행한다.
   - `node relay-tools/scripts/publish_stage.js --stage <stage-slug> --pr --base-url http://127.0.0.1:4173`
3. `--pr` 플래그는 아래를 자동 수행한다.
   - `sync_registry.js` 실행으로 registry를 메타 기준으로 갱신
   - `check_stage.js` 재실행 (검증 통과 필수)
   - 현재 브랜치가 `main`이면 `stage/<stage-slug>` 브랜치를 새로 만든다.
   - 현재 브랜치가 이미 feature branch면 그 브랜치를 그대로 사용한다.
   - 관련 파일 스테이징: `community-stages/<slug>/`, `community-stages/registry.js`
   - 커밋: `feat: add relay stage <stage-slug>`
   - 푸시: 현재 작업 브랜치를 `origin`에 `git push -u origin <current-branch>`로 올린다.
   - 현재 브랜치에 열린 PR이 있으면 그 PR을 그대로 업데이트한다.
   - 이전 PR이 이미 merged 또는 closed 상태면 새 PR을 만든다.
   - PR URL 출력
4. Fork vs Direct 워크플로우는 자동 감지된다.
   - upstream remote가 있으면 fork: origin(fork)에 push → upstream(원본)에 PR
   - upstream remote가 없으면 direct: origin(원본)에 push → 같은 레포에 PR
5. 검증이 실패하면 PR 생성을 중단하고 실패 원인을 출력한다.
6. `--pr` 없이 실행하면 기존처럼 JSON 출력만 한다 (dry-run).

출력:
- 검증 결과
- 변경된 파일 목록
- PR을 새로 만들었는지, 기존 PR을 업데이트했는지
- fork 여부
- PR URL
