# One Life Relay

> 목숨은 하나, 스테이지는 랜덤, 재도전은 없다.

AI 시대, 게임 만들기가 이렇게 쉬워졌는데 — 직접 만든 게임을 남들이 플레이하면 어떨까?

One Life Relay는 **누구나 게임 스테이지를 만들어서 올릴 수 있는** 오픈소스 아케이드 릴레이 게임입니다.
Claude, ChatGPT, Cursor 뭘 쓰든 상관없습니다. HTML 파일 하나면 당신의 스테이지가 다른 플레이어에게 랜덤으로 돌아갑니다.

현재 **100개 이상의 커뮤니티 스테이지**가 등록되어 있습니다.

## 규칙은 단순합니다

- 목숨은 **1개**
- 스테이지는 **랜덤** 순서
- 실패하면 **처음부터**
- 클리어하면 다음 스테이지로

## 스테이지 만들어서 참여하기

AI한테 시키든, 직접 짜든, 방법은 자유입니다. 아래 절차만 지키면 됩니다.

### 1. Fork

GitHub에서 이 저장소를 **Fork**한 뒤, 본인의 Fork를 clone합니다.

```bash
git clone https://github.com/<your-username>/series_game.git
cd series_game
```

### 2. 스테이지 만들기

`community-stages/<your-stage-slug>/` 폴더를 만들고 아래 두 파일을 넣으세요.

**`index.html`** — 게임 본체 (단일 HTML 파일)
- 시작 화면에 조작법, 클리어 조건, 실패 조건 표시
- 클리어 시 `parent.postMessage({ type: 'clear' }, '*')`
- 실패 시 `parent.postMessage({ type: 'fail' }, '*')`

**`meta.json`** — 스테이지 메타 정보

```json
{
  "id": "your-stage-slug",
  "title": "스테이지 이름",
  "description": "한 줄 설명",
  "creator": { "name": "닉네임" },
  "genre": "arcade",
  "clearCondition": "클리어 조건 (간결하게)",
  "failCondition": "실패 조건",
  "controls": "조작법"
}
```

### 3. Fork에서 PR 보내기

```bash
git checkout -b feat/add-your-stage-slug
git add community-stages/your-stage-slug/
git commit -m "feat: add relay stage your-stage-slug"
git push origin feat/add-your-stage-slug
```

GitHub에서 본인의 Fork → 원본 저장소로 **Pull Request**를 열어주세요.

**PR 본문에 포함할 내용:**
- 장르
- 조작법
- 클리어 / 실패 조건
- 테스트 방법 (로컬에서 어떻게 확인했는지)

### 주의사항

- **하나의 PR에 하나의 스테이지**만 제출합니다
- 에셋(이미지, 사운드)은 스테이지 폴더 안에 함께 넣으세요
- 썸네일(`thumbnail.png`)을 넣으면 갤러리에 자동 표시됩니다
- 외부 CDN 의존은 최소화해 주세요

## 로컬에서 실행하기

```bash
python3 -m http.server 4173
# http://127.0.0.1:4173 에서 확인
```

별도 빌드 과정 없이 바로 브라우저에서 플레이할 수 있습니다.

## 기술 스택

- Vanilla HTML / CSS / JavaScript
- 빌드 도구 없음 — 브라우저만 있으면 됨
- 각 스테이지는 iframe으로 격리 실행
- `postMessage` 기반 스테이지-호스트 통신

## 만든 사람

**Collin Jung** — [Portfolio](https://jungcollin.github.io/collin-portfolio)

## License

MIT
