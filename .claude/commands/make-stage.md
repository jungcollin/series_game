# /make-stage

입력은 스테이지 설명 한 줄이다. 예: `/make-stage 45초 동안 운석을 피해서 목표 지점까지 도달하는 스테이지`

이 커맨드의 상세 명세는 `relay-tools/create-stage.md`에 있다.
반드시 해당 파일을 읽고 그 순서를 따른다.

빠른 참조:
1. 먼저 `stage-slug`를 정한다.
2. 설명을 읽고 아래 필수 메타를 먼저 확정한다: `creator`, `creator-github`, `genre`, `controls`, `clear-condition`, `fail-condition`.
3. 위 값이 하나라도 비어 있으면 `create_stage.js`를 실행하지 말고 먼저 사용자에게 물어본다.
4. `node relay-tools/scripts/create_stage.js --slug <stage-slug> --title "<title>" --creator "<creator>" --creator-github "<github>" --genre "<genre>" --clear-condition "<clear-condition>" --fail-condition "<fail-condition>" --controls "<controls>" --description "<description>"` 로 골격 생성.
5. 생성된 HTML을 실제 게임으로 완성한다.
6. 릴레이 계약(render_game_to_text, advanceTime, relayStageMeta, relayStageResult, relayStageDebug, RelayHost 콜백)을 지킨다.
7. 시작 화면에 조작법, 클리어 조건, 실패 조건을 적는다.
8. 추가 목숨, continue, checkpoint respawn, save restore는 넣지 않는다.
9. 작업이 끝나면 `/check-stage <stage-slug>` 로 검증한다.

출력:
- 최종으로 선택한 `stage-slug`
- 변경한 파일만 짧게 제시한다.
