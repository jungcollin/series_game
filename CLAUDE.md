# One Life Relay Local Workflow

Use this repository-local workflow instead of any global Claude setting.

## Slash Commands

Custom commands are registered in `.claude/commands/`:
- `/make-stage ...` - 새 릴레이 스테이지 생성
- `/check-stage ...` - 스테이지 검증 (로컬 서버 기동 + Playwright 체크 + 브라우저 확인)
- `/publish-stage ...` - 스테이지 퍼블리시 (검증 + 브랜치 + 커밋 + 푸시 + PR 생성 또는 기존 PR 업데이트)

각 커맨드의 상세 명세는 `relay-tools/*.md`에 있다.

## Execution rules
- Keep all changes inside this repository.
- Use the scripts in `relay-tools/scripts/` when possible.
- Do not rely on global prompts or global skills.
- For `/make-stage`, do not run `create_stage.js` until `creator`, `genre`, `controls`, `clear-condition`, and `fail-condition` are all fixed.
- For `/make-stage`, keep the template's minimal accessibility shell (`skip-link`, hidden instructions, focusable canvas, reduced-motion support`) unless there is a repo-local reason to replace it with an equivalent.
- For `/make-stage`, treat those defaults as a minimum baseline only; visual style, HUD, layout, and game structure remain fully flexible.
- For `/check-stage` and `/publish-stage`, always prefer explicit `stage-slug` over git-change inference.
- For `/publish-stage`, if the current branch already has an open PR, push new commits to that same PR. If the earlier PR for that branch is already merged or closed, create a new PR.
- Before declaring success, run `node relay-tools/scripts/check_stage.js --stage <stage-slug>`.
- `/check-stage` 시 반드시 로컬 HTTP 서버(`python3 -m http.server 4173`)를 기동하여 브라우저에서 확인 가능하게 한다.
- `/check-stage`는 모바일 `menu / running / failed` 스크린샷 생성과 모바일 가로 오버플로 검사를 포함한다.
- `index.html`, `styles.css`, `game.js`, `community-stages/gallery.*`, `community-stages/play.html`를 바꿨으면 `node relay-tools/scripts/check_host_flow.js --base-url http://127.0.0.1:4173 --mobile`도 함께 실행한다.
- `/publish-stage` 시 `--pr` 플래그로 PR까지 한 번에 완료한다.
