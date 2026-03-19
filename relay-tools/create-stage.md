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
   - 키보드 전용으로 끝내면 안 된다. 모바일에서 터치만으로 시작할 수 있어야 하고, 진행 중 필요한 입력도 화면 버튼이나 제스처로 제공해야 한다.
   - 모바일 390px 폭 기준으로 메뉴, 실행 HUD, 실패/클리어 화면이 가로로 넘치거나 버튼이 잘리면 안 된다.
   - 모바일 오버레이나 안내 카드가 길어질 수 있으면 세로 스택 또는 내부 스크롤로 처리한다.
5. 아래 계약을 지킨다.
   - `window.render_game_to_text()`
   - `window.advanceTime(ms)`
   - `window.relayStageMeta = { id, title, creator, genre, clearCondition }`
   - `window.relayStageResult = { status: "running" | "cleared" | "failed" }`
   - `parent.RelayHost.onStageCleared(...)`
   - `parent.RelayHost.onStageFailed(...)`
   - `window.relayStageDebug = { forceClear(), forceFail() }`
6. 시작 화면에 조작법, 클리어 조건, 실패 조건을 적는다.
   - 조작법에는 모바일 기준 문구도 같이 적는다. 예: `화면 좌우 버튼`, `화면 터치로 점프`, `터치로 카드 선택`.
7. 추가 목숨, continue, checkpoint respawn, save restore는 넣지 않는다.
8. 메타를 고친 경우 `node relay-tools/scripts/sync_registry.js`로 registry를 다시 맞춘다.
9. 작업이 끝나면 `/check-stage <stage-slug>` 흐름으로 넘어간다. slug 생략 추론에 기대지 않는다.
   - `/check-stage`는 사용자 페이지 카드에 쓰일 `community-stages/<stage-slug>/thumbnail.png`를 설명 없는 실제 플레이 화면으로 자동 생성한다.
   - 사용자 페이지 카드는 이 썸네일을 대표 비주얼로 그대로 사용한다. 실제 썸네일이 있으면 카드 위에 대표 장르 이모지를 덧씌우지 않는 것이 기본 규칙이다.
   - `/check-stage`는 모바일 `menu / running / failed` 스크린샷도 함께 만들고, 가로 오버플로가 있으면 실패로 처리한다.

출력:
- 최종으로 선택한 `stage-slug`
- 변경한 파일만 짧게 제시한다.
- 필요하면 검증 전 TODO를 짧게 적는다.
