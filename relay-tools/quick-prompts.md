# 릴레이 스테이지 빠른 복붙 프롬프트

아래 문구를 순서대로 그대로 복붙해서 쓰면 된다.

## 1) 코드 받기 (저장소 + 현재 폴더 명시)

```text
현재 폴더 `/Users/jungcollin/Project/etc/series_game` 기준으로,
GitHub 저장소 `https://github.com/jungcollin/series_game.git`의 `main` 최신 코드를 받아줘.
이미 git 저장소면 `git pull origin main` 하고,
아니면 같은 경로에 `git clone`으로 받아서 바로 그 폴더 기준으로 다음 단계 진행해줘.
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

## 5) 커밋/푸시까지 한 번에 (터미널 명령)

```bash
node relay-tools/scripts/publish_stage.js --commit --push
```
