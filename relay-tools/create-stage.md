# /make-stage

입력은 스테이지 설명 한 줄 또는 설명 + 필수 메타다.

목표:
- 새 릴레이 스테이지를 `community-stages/<stage-slug>/index.html`에 만든다.
- `community-stages/<stage-slug>/meta.json`을 함께 만든다.
- `community-stages/registry.js`를 메타 기준으로 갱신한다.
- 메인 페이지의 iframe 안에서 바로 실행되는 16:9 단일 스테이지를 만든다.

순서:
1. 먼저 `stage-slug`를 정한다.
2. 설명을 읽고 최소한 아래 필수 메타를 모두 확정한다.
   - `creator`
   - `creator-github` (있으면 함께 기록)
   - `genre`
   - `controls`
   - `clear-condition`
   - `fail-condition`
3. 가능하면 아래 스크립트로 기본 골격을 만든다.
   - `node relay-tools/scripts/create_stage.js --slug <stage-slug> --title "<title>" --creator "<creator>" --genre "<genre>" --clear-condition "<clear-condition>" --fail-condition "<fail-condition>" --controls "<controls>" --description "<description>"`
4. 생성된 HTML을 실제 게임으로 완성한다.
   - 기본 템플릿에 들어 있는 `skip-link`, 숨김 조작 설명, `canvas` 포커스 스타일, `prefers-reduced-motion` 대응은 유지한다.
   - 이 규칙은 접근성과 진입성을 위한 최소선이다. 색상, 레이아웃, HUD, 연출, 게임 구조는 자유롭게 바꿔도 된다.
5. 아래 계약을 지킨다.
   - `window.render_game_to_text()`
   - `window.advanceTime(ms)`
   - `window.relayStageMeta = { id, title, creator, genre, clearCondition }`
   - `window.relayStageResult = { status: "running" | "cleared" | "failed" }`
   - `parent.RelayHost.onStageCleared(...)`
   - `parent.RelayHost.onStageFailed(...)`
   - `window.relayStageDebug = { forceClear(), forceFail() }`
6. 시작 화면에 조작법, 클리어 조건, 실패 조건을 적는다.
7. 추가 목숨, continue, checkpoint respawn, save restore는 넣지 않는다.
8. 메타를 고친 경우 `node relay-tools/scripts/sync_registry.js`로 registry를 다시 맞춘다.
9. 작업이 끝나면 `/check-stage <stage-slug>` 흐름으로 넘어간다. slug 생략 추론에 기대지 않는다.

출력:
- 최종으로 선택한 `stage-slug`
- 변경한 파일만 짧게 제시한다.
- 필요하면 검증 전 TODO를 짧게 적는다.
