# /publish-stage

입력은 `stage-slug` 하나를 명시하는 것을 기본으로 한다.
- 예: `/publish-stage meteor-dodge-run`
- 자동 추론도 가능하지만, 다음 제작자 프롬프트에서는 항상 slug를 명시한다.

이 커맨드의 상세 명세는 `relay-tools/publish-stage.md`에 있다.

## 순서

### 1. 검증 + 커밋 + 푸시 + PR 생성 또는 기존 PR 업데이트를 한 번에 실행

```bash
node relay-tools/scripts/publish_stage.js --stage <stage-slug> --pr --base-url http://127.0.0.1:4173
```

`--pr` 플래그는 아래를 자동 수행한다:
1. `sync_registry.js` 실행으로 registry를 메타 기준으로 갱신
2. `check_stage.js` 재실행 (검증 통과 필수)
3. 현재 브랜치가 `main`이면 `stage/<stage-slug>` 브랜치를 새로 만든다
4. 현재 브랜치가 이미 feature branch면 그 브랜치를 그대로 사용한다
5. 관련 파일 스테이징: `community-stages/<slug>/`, `community-stages/registry.js`
6. 커밋: `feat: add relay stage <slug>`
7. 현재 작업 브랜치를 `origin`에 push
8. 현재 브랜치에 열린 PR이 있으면 그 PR을 그대로 업데이트한다
9. 이전 PR이 이미 merged 또는 closed 상태면 새 PR을 만든다
10. PR URL 출력

### 2. Fork vs Direct 워크플로우 (자동 감지)

스크립트가 git remote를 분석하여 자동으로 판단한다:

**Fork 워크플로우** (upstream remote가 있을 때):
- `origin` = 기여자의 fork
- `upstream` = 원본 레포 (jungcollin/series_game)
- push는 fork의 origin으로
- PR은 `gh pr create --repo <upstream> --head <fork-owner>:<branch>` 로 원본에 생성

**Direct 워크플로우** (upstream remote가 없을 때):
- `origin` = 원본 레포 (레포 오너 또는 collaborator)
- push와 PR 모두 origin 대상

기여자는 별도 설정 없이 fork 후 그대로 `--pr`을 사용하면 된다.

### 3. 서버가 안 떠 있을 경우

먼저 로컬 서버를 기동한다:
```bash
python3 -m http.server 4173 &
```

### 4. 결과 출력

- 검증 결과 (pass/fail)
- 변경된 파일 목록
- PR 처리 방식 (기존 PR 업데이트 또는 새 PR 생성)
- fork 여부
- PR URL

PR URL을 사용자에게 최종 출력한다.

## 주의

- `--pr` 없이 실행하면 기존처럼 JSON 출력만 한다 (dry-run 용도).
- 검증(check_stage.js)이 실패하면 PR 생성을 중단하고 실패 원인을 출력한다.
- main 브랜치에서 직접 푸시하지 않는다. 이미 feature branch에서 작업 중이면 그 브랜치를 유지한다.
