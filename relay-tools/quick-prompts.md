# 릴레이 스테이지 빠른 복붙 프롬프트

Claude Code, Gemini, Codex에 공통으로 넘길 수 있는 안전한 버전이다.

아래 문구를 순서대로 그대로 복붙해서 쓰면 된다.

## 1) 코드 받기 (Fork)

```text
GitHub 저장소 `https://github.com/jungcollin/series_game`를 fork한 뒤 내 fork를 clone해줘.
그리고 원본을 upstream으로 등록해줘:
  git remote add upstream https://github.com/jungcollin/series_game.git
```

## 2) 작업 상태 먼저 확인

```text
새 게임을 시작하기 전에 현재 git 브랜치와 열린 PR 상태를 먼저 확인해줘.
이 브랜치가 이전 게임용 작업 브랜치거나 열린 PR에 연결돼 있으면, 그 상태로 새 게임 작업을 계속하지 말고 먼저 나에게 알려줘.
그리고 지금 어떤 브랜치에서 작업할지 한 줄로 먼저 보고해줘.
```

## 3) 스테이지 만들기

```text
/make-stage [스테이지 설명 한 줄]
필수 메타를 먼저 확정해줘:
- creator 이름
- creator github
- genre
- controls
- clear-condition
- fail-condition
이 값이 비면 create_stage.js를 실행하지 말고 먼저 나한테 물어봐.
그리고 최종으로 선택한 stage-slug를 반드시 마지막에 한 줄로 다시 알려줘.
```

예시:

```text
/make-stage 45초 동안 운석을 피해서 목표 지점까지 도달하는 스테이지
필수 메타를 먼저 확정해줘:
- creator 이름: Collin
- creator github: jungcollin
- genre: Arcade survival
- controls: 방향키 또는 A/D로 이동, Space로 대시
- clear-condition: 45초 동안 운석을 피해서 목표 지점까지 도달
- fail-condition: 운석에 맞거나 맵 아래로 떨어지면 즉시 실패
그리고 최종으로 선택한 stage-slug를 반드시 마지막에 한 줄로 다시 알려줘.
```

## 4) 스테이지 확인

```text
/check-stage <stage-slug>
```

예시:

```text
/check-stage meteor-dodge-run
```

## 5) 게임 올리기 요청

```text
/publish-stage <stage-slug>
```

예시:

```text
/publish-stage meteor-dodge-run
```

## 6) 커밋/푸시/PR까지 한 번에 (터미널 명령)

먼저 로컬 서버를 켠다:

```bash
python3 -m http.server 4173 &
```

그 다음 제출한다:

```bash
node relay-tools/scripts/publish_stage.js --stage <stage-slug> --pr
```

fork 레포에서 실행하면 자동으로 원본 레포에 PR이 생성된다.

같은 브랜치에 열린 PR이 이미 있으면 그 PR이 자동으로 업데이트된다.
이전 PR이 이미 merged 또는 closed 상태면 새 PR이 만들어진다.
