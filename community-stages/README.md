# Community Stages

새로 참여하는 제작자는 자신의 스테이지를 아래 경로 규칙으로 추가합니다.

- 기본 경로: `community-stages/<stage-slug>/index.html`
- 메타 정보: `community-stages/<stage-slug>/meta.json`
- 목록 등록: `community-stages/registry.js` (메타 기준 자동 생성)
- 플레이 페이지: `community-stages/index.html`
- 에셋이 있으면 같은 폴더에 함께 둡니다.
- 갤러리 썸네일은 같은 폴더의 `thumbnail.png|jpg|jpeg|webp|avif`를 자동으로 읽습니다.
- 다른 파일명을 쓰고 싶으면 `meta.json`에 선택 필드 `thumbnail`을 추가합니다.
- 하나의 스테이지만 제출합니다.
- 시작 화면에는 조작법, 클리어 조건, 실패 조건을 반드시 적습니다.
- 실패하면 즉시 종료되고, 클리어하면 즉시 끝나는 구조여야 합니다.

필수 메타:

- `id`
- `title`
- `description`
- `creator.name`
- `genre`
- `clearCondition`
- `failCondition`
- `controls`

PR 가이드:

- 제목: `feat: add relay stage <stage-slug>`
- 본문에 아래 내용을 적습니다.
  - 장르
  - 조작법
  - 클리어 조건
  - 실패 조건
  - 테스트 방법
