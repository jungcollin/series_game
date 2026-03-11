# /게임만들기

입력은 스테이지 설명 한 줄이다.

목표:
- 새 릴레이 스테이지를 `community-stages/<stage-slug>/index.html`에 만든다.
- `community-stages/registry.js`에 등록한다.
- 메인 페이지의 iframe 안에서 바로 실행되는 16:9 단일 스테이지를 만든다.

순서:
1. 설명을 읽고 `stage-slug`, 제목, 장르, 클리어 조건을 정한다.
2. 가능하면 아래 스크립트로 기본 골격을 만든다.
   - `node relay-tools/scripts/create_stage.js --slug <stage-slug> --title "<title>" --genre "<genre>" --clear-condition "<clear-condition>" --description "<description>"`
3. 생성된 HTML을 실제 게임으로 완성한다.
4. 아래 계약을 지킨다.
   - `window.render_game_to_text()`
   - `window.advanceTime(ms)`
   - `window.relayStageMeta = { id, title, creator, genre, clearCondition }`
   - `window.relayStageResult = { status: "running" | "cleared" | "failed" }`
   - `parent.RelayHost.onStageCleared(...)`
   - `parent.RelayHost.onStageFailed(...)`
   - `window.relayStageDebug = { forceClear(), forceFail() }`
5. 시작 화면에 조작법, 클리어 조건, 실패 조건을 적는다.
6. 추가 목숨, continue, checkpoint respawn, save restore는 넣지 않는다.
7. 작업이 끝나면 `/만든게임확인 <stage-slug>` 흐름으로 넘어간다.

출력:
- 변경한 파일만 짧게 제시한다.
- 필요하면 검증 전 TODO를 짧게 적는다.
