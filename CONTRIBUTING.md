# 스테이지 기여

한 PR에 스테이지 하나만 제출합니다. 에셋(이미지, 사운드)은 해당 스테이지 폴더 안에 둡니다. 외부 CDN은 최소화하세요.

## 1. Fork 후 clone

```bash
git clone https://github.com/<your-username>/series_game.git
cd series_game
git remote add upstream https://github.com/jungcollin/series_game.git
```

## 2. 폴더와 파일

`community-stages/<stage-slug>/`에 아래 두 파일을 만듭니다.

**`index.html`** — 게임 본체 (단일 HTML)

- 시작 화면에 조작법, 클리어 조건, 실패 조건을 적습니다.
- 키보드만으로 끝내지 마세요. 모바일에서 터치로 시작하고, 진행 중 입력도 화면 버튼이나 제스처로 제공해야 합니다.
- `../relay-runtime.js`를 불러오고, 준비되면 `window.RelayStageHost.onStageReady(...)`를 호출합니다.
- 클리어 시 `window.RelayStageHost.onStageCleared(...)`, 실패 시 `window.RelayStageHost.onStageFailed(...)`.
- `window.parent`에 직접 접근하거나 임의 `postMessage`를 보내지 않습니다.
- 추가 목숨, 이어하기, 체크포인트 리스폰은 넣지 않습니다.

**`meta.json`**

```json
{
  "id": "your-stage-slug",
  "title": "스테이지 이름",
  "description": "한 줄 설명",
  "creator": { "name": "닉네임", "github": "your-github" },
  "genre": "arcade",
  "clearCondition": "클리어 조건",
  "failCondition": "실패 조건",
  "controls": "조작법"
}
```

`clearCondition`과 `failCondition`은 한 줄로 짧게 씁니다. 갤러리와 플레이 페이지에서 2줄로 잘립니다.

목록 파일 `community-stages/registry.js`는 메타 기준으로 생성합니다.

```bash
node relay-tools/scripts/sync_registry.js
```

썸네일 `thumbnail.png`가 있으면 갤러리 카드에 쓰입니다. `check_stage.js`가 플레이 장면으로 자동 생성할 수 있습니다.

스캐폴드를 쓰려면:

```bash
node relay-tools/scripts/create_stage.js --slug your-stage-slug \
  --title "스테이지 이름" --creator "닉네임" --genre "arcade" \
  --controls "조작법" --clear-condition "클리어 조건" --fail-condition "실패 조건" \
  --description "한 줄 설명"
```

## 3. 로컬에서 확인

```bash
python3 -m http.server 4173
```

- 스테이지: http://127.0.0.1:4173/community-stages/your-stage-slug/index.html
- 런처: http://127.0.0.1:4173/community-stages/index.html
- 갤러리: http://127.0.0.1:4173/community-stages/gallery.html

에이전트 검증:

```bash
node relay-tools/scripts/check_stage.js --stage your-stage-slug --base-url http://127.0.0.1:4173
```

이 스크립트는 모바일 `menu / running / failed` 스크린샷과 가로 오버플로 검사도 합니다.

## 4. PR

```bash
git checkout -b feat/add-your-stage-slug
git add community-stages/your-stage-slug/ community-stages/registry.js
git commit -m "feat: add relay stage your-stage-slug"
git push origin feat/add-your-stage-slug
```

본문에 장르, 조작법, 클리어/실패 조건, 로컬에서 어떻게 확인했는지 적어 주세요.

AI로 작업한다면 `relay-tools/quick-prompts.md`와 `/make-stage`, `/check-stage`, `/publish-stage`를 사용하세요. 상세 명세는 `relay-tools/create-stage.md`, `check-stage.md`, `publish-stage.md`입니다.

## 호스트 계약 (검증이 보는 것)

스테이지 페이지는 아래를 노출해야 합니다. 템플릿(`relay-tools/templates/stage-template.html`)에 이미 들어 있습니다.

- `window.render_game_to_text()`
- `window.advanceTime(ms)`
- `window.relayStageMeta`
- `window.relayStageResult` (`running` | `cleared` | `failed`)
- `window.relayStageDebug.forceClear()` / `forceFail()`
- `window.RelayStageHost` 콜백

접근성 최소선(skip-link, 숨김 조작 설명, 포커스 가능한 canvas, `prefers-reduced-motion`)은 유지하세요. 비주얼과 게임 규칙은 자유입니다.
