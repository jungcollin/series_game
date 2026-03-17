# /check-stage

입력은 선택적으로 `stage-slug` 하나다.
- 예: `/check-stage meteor-dodge-run`
- 생략 시: Git 변경 파일에서 `community-stages/<stage-slug>/...`를 자동 추론한다.

목표:
- 스테이지가 단독 실행과 호스트 iframe 실행 모두에서 계약을 지키는지 확인한다.

순서:
1. 아래 스크립트를 실행한다.
   - 기본: `node relay-tools/scripts/check_stage.js`
   - 명시: `node relay-tools/scripts/check_stage.js --stage <stage-slug>`
2. 실패하면 스테이지를 고치고 다시 실행한다.
3. 통과 기준:
   - `community-stages/index.html`에서 카드가 보임
   - 스테이지 단독 페이지가 열림
   - 필수 전역 인터페이스가 존재함
   - `window.relayStageDebug.forceClear()`와 `forceFail()`가 동작함
   - same-origin 호스트 하네스에서 `RelayHost` ready/cleared/failed 콜백이 잡힘
   - 콘솔 에러가 없음
4. 결과를 짧게 정리한다.

출력:
- 통과 또는 실패
- 실패 시 어떤 조건이 깨졌는지
- 생성된 스크린샷 경로
