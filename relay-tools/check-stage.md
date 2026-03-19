# /check-stage

입력은 선택적으로 `stage-slug` 하나다.
- 예: `/check-stage meteor-dodge-run`
- 생략 시: Git 변경 파일에서 `community-stages/<stage-slug>/...`를 자동 추론한다.

목표:
- 스테이지가 단독 실행과 호스트 iframe 실행 모두에서 계약을 지키는지 확인한다.
- 사용자가 브라우저에서 직접 게임을 확인할 수 있게 한다.

순서:
1. 로컬 HTTP 서버를 기동한다.
   - `python3 -m http.server 4173 &`
   - 서버가 뜨면 사용자에게 아래 URL을 안내한다:
     - 런처 페이지: http://127.0.0.1:4173/community-stages/index.html
     - 스테이지 단독: http://127.0.0.1:4173/community-stages/<stage-slug>/index.html
     - 메인 게임: http://127.0.0.1:4173/
2. 자동 검증 스크립트를 실행한다.
   - `node relay-tools/scripts/check_stage.js --stage <stage-slug> --base-url http://127.0.0.1:4173`
3. 통과 기준:
   - `community-stages/index.html`에서 카드가 보임
   - 스테이지 단독 페이지가 열림
   - 필수 전역 인터페이스가 존재함
   - `window.relayStageDebug.forceClear()`와 `forceFail()`가 동작함
   - same-origin 호스트 하네스에서 `RelayHost` ready/cleared/failed 콜백이 잡힘
   - 콘솔 에러가 없음
4. 검증 후 서버를 바로 종료하지 않는다.
   - 사용자에게 브라우저에서 직접 확인하라고 안내한다.
   - 사용자가 확인 완료를 알려주면 서버를 종료한다.
5. 실패하면 스테이지를 고치고 2단계부터 다시 실행한다.

출력:
- 통과 또는 실패
- 브라우저 확인 URL
- 실패 시 어떤 조건이 깨졌는지
- 생성된 스크린샷 경로
