# /check-stage

입력은 `stage-slug` 하나를 명시하는 것을 기본으로 한다.
- 예: `/check-stage meteor-dodge-run`
- 자동 추론도 가능하지만, 다음 제작자 프롬프트에서는 항상 slug를 명시한다.

목표:
- 스테이지가 단독 실행과 호스트 iframe 실행 모두에서 계약을 지키는지 확인한다.
- 사용자가 브라우저에서 직접 게임을 확인할 수 있게 한다.
- 사용자 페이지용 썸네일을 설명 없는 실제 플레이 화면으로 자동 생성한다.
- 모바일에서 터치만으로 시작과 기본 플레이가 가능한 최소 입력 경로가 있는지 확인한다.
- 모바일 `menu / running / failed` 상태에서 레이아웃이 가로로 깨지지 않는지 확인한다.

순서:
1. 로컬 HTTP 서버를 기동한다.
   - `python3 -m http.server 4173 &`
   - 서버가 뜨면 사용자에게 아래 URL을 안내한다:
     - 런처 페이지: http://127.0.0.1:4173/community-stages/index.html
     - 스테이지 단독: http://127.0.0.1:4173/community-stages/<stage-slug>/index.html
     - 메인 게임: http://127.0.0.1:4173/
2. 자동 검증 스크립트를 실행한다.
   - `node relay-tools/scripts/check_stage.js --stage <stage-slug> --base-url http://127.0.0.1:4173`
   - 이 스크립트는 검증 중 `community-stages/<stage-slug>/thumbnail.png`를 실제 플레이 장면으로 다시 생성한다.
3. 통과 기준:
   - `community-stages/index.html`에서 카드가 보임
   - 스테이지 단독 페이지가 열림
   - `meta.json` 필수 필드가 존재함
   - `registry.js`가 메타와 동기화되어 있음
   - 필수 전역 인터페이스가 존재함
   - `meta.json`의 조작법/클리어 조건/실패 조건 문구가 스테이지 소스에 반영되어 있음
   - `window.relayStageDebug.forceClear()`와 `forceFail()`가 동작함
   - same-origin 호스트 하네스에서 `RelayHost` ready/cleared/failed 콜백이 잡힘
   - 콘솔 에러가 없음
   - 썸네일이 시작 설명 오버레이가 아닌 실제 플레이 장면으로 저장됨
   - 썸네일이 있는 사용자 페이지 카드에서는 대표 장르 이모지가 겹쳐 보이지 않음
   - 스테이지 소스에 `touchstart` 또는 `pointerdown` 기반의 모바일 입력이 있으며, 시작 화면/조작 설명에도 터치 조작 문구가 포함됨
   - 모바일 뷰포트에서도 터치 한 번으로 메뉴를 넘겨 실제 러닝 상태로 진입 가능함
   - 모바일 `menu / running / failed` 스크린샷이 생성됨
   - 모바일 390px 폭 기준으로 문서 가로 스크롤이나 DOM 오버플로 요소가 없음
   - 모바일에서 게임 캔버스가 너무 작지 않고, 주 플레이 영역이 화면의 충분한 비율을 차지함
4. 검증 후 서버를 바로 종료하지 않는다.
   - 사용자에게 브라우저에서 직접 확인하라고 안내한다.
   - 사용자가 확인 완료를 알려주면 서버를 종료한다.
5. 실패하면 스테이지를 고치고 2단계부터 다시 실행한다.

출력:
- 통과 또는 실패
- 브라우저 확인 URL
- 실패 시 어떤 조건이 깨졌는지
- 생성된 스크린샷 경로
- 생성된 썸네일 경로 (`community-stages/<stage-slug>/thumbnail.png`)
- 모바일 상태 스크린샷 경로 (`menu / running / failed`)
