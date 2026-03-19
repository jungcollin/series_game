# 릴레이 스테이지 빠른 복붙 프롬프트

아래 문구를 순서대로 그대로 복붙해서 쓰면 된다.

## 1) 코드 받기 (Fork)

```text
GitHub 저장소 `https://github.com/jungcollin/series_game`를 fork한 뒤 내 fork를 clone해줘.
그리고 원본을 upstream으로 등록해줘:
  git remote add upstream https://github.com/jungcollin/series_game.git
```

## 2) 스테이지 만들기

```text
/make-stage [스테이지 설명 한 줄]
```

예시:

```text
/make-stage 45초 동안 운석을 피해서 목표 지점까지 도달하는 스테이지
```

## 3) 스테이지 확인

```text
/check-stage
```

예시:

```text
/check-stage meteor-dodge-run
```

## 4) 게임 올리기 요청

```text
/publish-stage
```

예시:

```text
/publish-stage meteor-dodge-run
```

## 5) 커밋/푸시/PR까지 한 번에 (터미널 명령)

```bash
node relay-tools/scripts/publish_stage.js --pr
```

fork 레포에서 실행하면 자동으로 원본 레포에 PR이 생성된다.
