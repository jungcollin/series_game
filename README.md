# One Life Relay

> 목숨은 하나, 스테이지는 매일 다섯 개. 한 런에서는 이어하기가 없습니다.

플레이: [relay.collinworks.dev](https://relay.collinworks.dev)  
갤러리: [community-stages/gallery.html](https://relay.collinworks.dev/community-stages/gallery.html)  
저장소: [github.com/jungcollin/series_game](https://github.com/jungcollin/series_game)

매일 KST 기준으로 같은 다섯 게임이 모두에게 주어집니다. 한 번 실패하면 이번 런은 끝입니다. 처음부터 다시 도전할 수는 있습니다. 각 게임은 `community-stages/<slug>/` 아래 HTML 파일 하나이고, Pull Request로 올립니다.

## 규칙

- 목숨은 **1개**
- 오늘의 루트는 **5스테이지**, 전원 동일
- 실패하면 **이번 런은 끝**. 새 런으로 다시 도전할 수 있습니다
- 클리어하면 다음 스테이지로

커뮤니티 스테이지는 갤러리에서 따로 플레이할 수 있습니다. 데일리 루트에 들어가는 게임은 검수 풀과 편성 규칙으로 고릅니다. 공식 서버 기록 쓰기는 아직 닫혀 있습니다.

현재 확인/미확인은 [docs/04-report/release-status.md](./docs/04-report/release-status.md)를 보세요.

## 저장소 구조

```text
index.html, game.js, styles.css, daily-relay.js
  데일리 릴레이 호스트. 스테이지는 iframe으로 실행됩니다.

community-stages/
  커뮤니티 스테이지, 갤러리, 호스트 런타임(relay-runtime.js).

relay-tools/
  스테이지 스캐폴드와 Playwright 검증. AI 에이전트 명령의 실제 명세도 여기 있습니다.

relay-api/
  투표, 댓글, 스테이지 랭킹 API. 로컬 실행은 relay-api/README.md.

.claude/commands/, AGENTS.md, CLAUDE.md, GEMINI.md
  Claude / Codex / Gemini가 이 저장소 안에서 스테이지를 만들고 검사할 때 읽는 파일입니다.
```

정적 사이트입니다. 프론트엔드는 빌드 없이 브라우저에서 돌아갑니다.

## 로컬에서 실행

```bash
python3 -m http.server 4173
# http://127.0.0.1:4173
```

또는 `npm start`.

## 스테이지 기여

한 PR에 스테이지 하나만 넣습니다. 절차와 호스트 계약은 [CONTRIBUTING.md](./CONTRIBUTING.md)에 있습니다.

빠르게 시작하려면:

```bash
npm ci
node relay-tools/scripts/create_stage.js --list-presets
node relay-tools/scripts/create_stage.js --draft --preset platformer \
  --title "Meteor Escape" \
  --description "발판을 밟으며 끝까지 달려가는 스테이지"
```

Claude Code, Codex, Gemini를 쓴다면 `relay-tools/quick-prompts.md`를 그대로 붙여 넣으면 됩니다. 슬래시 명령은 `/make-stage`, `/check-stage`, `/publish-stage`입니다.

## 테스트

```bash
npm ci
npm ci --prefix relay-api
npm test
npm run test:api
npm run typecheck --prefix relay-api
node relay-tools/scripts/build_catalog.js --check
```

PR과 `main` Pages 배포는 위 검사와 공개 산출물 점검을 통과해야 합니다. 작업 브랜치는 production에 자동 배포되지 않습니다.

스테이지 하나를 브라우저 검증까지 돌리려면 로컬 서버를 켠 뒤:

```bash
node relay-tools/scripts/check_stage.js --stage <stage-slug> --base-url http://127.0.0.1:4173
```

호스트(메인/갤러리/플레이 페이지)를 바꿨다면:

```bash
node relay-tools/scripts/check_host_flow.js --base-url http://127.0.0.1:4173 --mobile
```

## 만든 사람

**Collin Jung** — [Portfolio](https://jungcollin.github.io/collin-portfolio)

콜린웍스 후원: [Buy Me a Coffee](https://buymeacoffee.com/collinworks)

## License

프로젝트 코드는 [MIT License](./LICENSE)입니다. 스테이지를 올릴 때는 코드와 이미지·사운드를 공개 배포할 권리가 있어야 합니다. 파일이나 스테이지에 별도 라이선스 고지가 있으면 그쪽이 우선합니다.
