# /check-stage

입력은 `stage-slug` 하나를 명시하는 것을 기본으로 한다.
- 예: `/check-stage meteor-dodge-run`
- 자동 추론도 가능하지만, 다음 제작자 프롬프트에서는 항상 slug를 명시한다.

이 커맨드의 상세 명세는 `relay-tools/check-stage.md`에 있다.

## 순서

### 1. 로컬 HTTP 서버 기동

스테이지를 브라우저에서 확인할 수 있도록 로컬 서버를 먼저 띄운다.

```bash
python3 -m http.server 4173 &
SERVER_PID=$!
```

서버가 뜨면 아래 URL을 사용자에게 안내한다:
- 런처 페이지: http://127.0.0.1:4173/community-stages/index.html
- 스테이지 단독: http://127.0.0.1:4173/community-stages/<stage-slug>/index.html
- 메인 게임: http://127.0.0.1:4173/

사용자가 브라우저에서 직접 열어 볼 수 있음을 알려준다.

### 2. 자동 검증 스크립트 실행

```bash
node relay-tools/scripts/check_stage.js --stage <stage-slug> --base-url http://127.0.0.1:4173
```

검증에는 아래가 포함된다:
- `meta.json` 필수 필드 존재
- `registry.js`와 메타 동기화 여부
- 시작 화면의 조작법/클리어 조건/실패 조건 문구 반영
- 템플릿 기본 접근성 셸(`skip-link`, 설명 연결, `canvas` 포커스 가능 상태)이 훼손되지 않았는지 육안으로 함께 확인
- relay 인터페이스 및 host 콜백 계약

### 3. 결과 판정

결과 JSON을 파싱하여 아래를 보고한다:
- 통과 또는 실패
- 실패 시 어떤 조건이 깨졌는지
- 생성된 스크린샷 경로 (output/relay-tools/ 아래)

### 4. 서버 유지

검증이 끝나도 서버를 바로 종료하지 않는다.
사용자에게 "브라우저에서 직접 확인하세요. 확인이 끝나면 알려주세요." 라고 안내한다.
사용자가 확인 완료를 알려주면 서버를 종료한다:

```bash
kill $SERVER_PID 2>/dev/null
```

### 5. 실패 시

실패한 항목을 스테이지 코드에서 고치고, 2단계부터 다시 실행한다.

## 출력
- 통과 또는 실패
- 브라우저 확인 URL
- 실패 시 깨진 조건 목록
- 스크린샷 경로
