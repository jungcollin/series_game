# /publish-stage

입력은 선택적으로 `stage-slug` 하나다.
- 예: `/publish-stage meteor-dodge-run`
- 생략 시: Git 변경 파일에서 `community-stages/<stage-slug>/...`를 자동 추론한다.

이 커맨드의 상세 명세는 `relay-tools/publish-stage.md`에 있다.

## 순서

### 1. 검증 + 브랜치 + 커밋 + 푸시 + PR 한 번에 실행

```bash
node relay-tools/scripts/publish_stage.js --stage <stage-slug> --pr --base-url http://127.0.0.1:4173
```

`--pr` 플래그는 아래를 자동 수행한다:
1. `check_stage.js` 재실행 (검증 통과 필수)
2. 브랜치 생성: `stage/<stage-slug>` (이미 있으면 그대로 사용)
3. 관련 파일 스테이징: `community-stages/<slug>/`, `community-stages/registry.js`
4. 커밋: `feat: add relay stage <slug>`
5. 푸시: `git push -u origin stage/<stage-slug>`
6. PR 생성 (fork/direct 자동 감지)
7. PR URL 출력

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
- 커밋 해시
- fork 여부
- PR URL

PR URL을 사용자에게 최종 출력한다.

## 주의

- `--pr` 없이 실행하면 기존처럼 JSON 출력만 한다 (dry-run 용도).
- 검증(check_stage.js)이 실패하면 PR 생성을 중단하고 실패 원인을 출력한다.
- main 브랜치에서 직접 푸시하지 않는다. 반드시 `stage/<slug>` 브랜치를 사용한다.
