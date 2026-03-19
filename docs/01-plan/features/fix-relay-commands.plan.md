# Plan: Relay Commands - Codex/Claude Code 양쪽 호환 및 기능 개선

## Executive Summary

| Item | Detail |
|------|--------|
| Feature | relay-commands 크로스 에이전트 호환 |
| Created | 2026-03-19 |
| Author | jungcollin |
| Status | Draft |

### Value Delivered

| Perspective | Description |
|-------------|-------------|
| Problem | 프로젝트를 클론한 사용자가 `/make-stage`, `/check-stage`, `/publish-stage` 커맨드 사용 시 "스킬이 없다"는 오류 발생. Codex와 Claude Code 모두에서 동작하지 않음 |
| Solution | Claude Code는 `.claude/commands/`, Codex는 `AGENTS.md` 기반으로 커맨드를 인식하므로, 두 시스템 모두에 맞는 커맨드 파일 배치 + 상대 경로 전환 + `/publish-stage` PR 자동 생성 통합 |
| Function UX Effect | 클론 즉시 3개 커맨드가 동작하고, `/check-stage`는 브라우저에서 실행 확인 가능, `/publish-stage`는 PR까지 한 번에 완료 |
| Core Value | 기여자 온보딩 마찰 제거 - 클론 → 스테이지 생성 → 검증 → PR 제출이 끊김 없이 진행 |

---

## 1. 현재 상태 분석

### 1.1 근본 원인: 커맨드 등록 구조 불일치

| AI Agent | 커맨드 인식 방식 | 현재 상태 |
|----------|------------------|-----------|
| **Claude Code** | `.claude/commands/*.md` 파일을 슬래시 커맨드로 인식 | 디렉토리 자체가 없음 |
| **Codex** | `AGENTS.md`에서 커맨드 매핑을 읽음 | 절대 경로 하드코딩 (`/Users/collin/...`) |

### 1.2 세부 문제

| # | 문제 | 위치 | 영향 |
|---|------|------|------|
| P1 | `.claude/commands/` 디렉토리 미존재 | 프로젝트 루트 | Claude Code에서 `/make-stage` 등 모든 커맨드 미인식 |
| P2 | AGENTS.md에 절대 경로 하드코딩 | `AGENTS.md:8` | Codex에서 다른 사용자 머신에서 파일 참조 실패 |
| P3 | `/check-stage` 실행 시 서버 필요 | `check_stage.js:96` | 기본 base-url이 `series-game.localhost:1355`로 되어 있어 portless 설정 없이는 동작 불가 |
| P4 | `/publish-stage`가 실제 PR 미생성 | `publish_stage.js` | JSON 출력만 하고 `gh pr create`를 실행하지 않음. AI 에이전트가 별도로 PR을 만들어야 하는데 그 지침이 불명확 |
| P5 | `quick-prompts.md:8`에 절대 경로 | `relay-tools/quick-prompts.md` | 다른 사용자 환경에서 무의미 |

---

## 2. 목표 (Goals)

1. **프로젝트 클론 즉시 3개 커맨드가 Claude Code와 Codex 양쪽에서 동작**
2. **`/check-stage` 실행 시 로컬 서버 자동 기동 + Playwright 검증 + 결과 리포트**
3. **`/publish-stage` 실행 시 변경 파일 감지 → 브랜치 생성 → 커밋 → 푸시 → `gh pr create`까지 한 번에 완료**
4. **절대 경로 제거 - 모든 참조를 상대 경로로 전환**

## 3. Non-Goals

- relay-tools 스크립트의 내부 로직 리팩토링 (동작에 문제 없음)
- CI/CD workflow 변경 (`.github/workflows/relay-pr-review.yml`은 현 상태 유지)
- 게임 엔진(`game.js`, `stages.js`) 수정

---

## 4. 구현 계획

### Task 1: `.claude/commands/` 디렉토리 생성 (P1 해결)

Claude Code가 슬래시 커맨드로 인식하도록 `.claude/commands/` 에 3개 파일 생성.

| 파일 | 내용 |
|------|------|
| `.claude/commands/make-stage.md` | `relay-tools/create-stage.md` 내용을 Claude Code command 형식으로 래핑 |
| `.claude/commands/check-stage.md` | `relay-tools/check-stage.md` + 서버 자동 기동 로직 포함 |
| `.claude/commands/publish-stage.md` | `relay-tools/publish-stage.md` + PR 생성 전체 플로우 포함 |

**핵심**: `relay-tools/*.md`는 원본 프롬프트 문서로 유지하고, `.claude/commands/*.md`는 Claude Code 전용 래퍼로 만든다. 두 곳이 중복되지 않도록 `.claude/commands/*.md`에서 `relay-tools/*.md`를 참조하는 구조로 작성.

### Task 2: AGENTS.md 상대 경로 전환 (P2 해결)

```diff
- Read [relay-tools/create-stage.md](/Users/collin/Project/etc/series_game/relay-tools/create-stage.md)
+ Read relay-tools/create-stage.md (이 레포 루트 기준 상대 경로)
```

Codex는 `AGENTS.md`를 자동으로 읽으므로, 절대 경로를 상대 경로로 바꾸면 어떤 머신에서든 동작.

### Task 3: `/check-stage` 실행 가능하게 개선 (P3 해결)

현재 `check_stage.js`는 이미 잘 만들어져 있음. 문제는 **서버가 실행 중이어야 한다는 전제조건**이 커맨드 프롬프트에 없다는 것.

**방안**: 커맨드 프롬프트에 서버 기동/종료 단계를 명시.

```
순서:
1. 로컬 HTTP 서버 기동 (`python3 -m http.server 4173 &`)
2. `node relay-tools/scripts/check_stage.js --stage <slug> --base-url http://127.0.0.1:4173` 실행
3. 결과 JSON 파싱 → 스크린샷 경로 확인
4. 서버 종료
5. 결과 보고
```

### Task 4: `publish_stage.js` 스크립트에 PR 생성 직접 내장 (P4 해결)

현재 `publish_stage.js`는 PR 제목/본문을 JSON으로 출력만 하고, 실제 PR 생성은 하지 않음.
AI 에이전트 해석에 의존하지 않고 **스크립트 자체에서 `gh pr create`까지 실행**하도록 개선.

**방안**: `publish_stage.js`에 `--pr` 플래그 추가. 기존 `--commit`, `--push`와 조합하여 한 번에 완료.

```
--pr 플래그 동작:
1. check_stage.js 재실행 (기존 로직 유지)
2. 브랜치 생성: `stage/<stage-slug>` (현재 main이면 자동 생성)
3. 관련 파일 스테이징: `community-stages/<slug>/`, `community-stages/registry.js`
4. 커밋: `feat: add relay stage <slug>`
5. 푸시: `git push -u origin stage/<stage-slug>`
6. PR 생성: `gh pr create --title "<prTitle>" --body "<prBody>" --base main`
7. PR URL을 JSON 결과에 포함하여 출력
```

**사용법** (터미널에서 직접 또는 AI 에이전트 통해):
```bash
node relay-tools/scripts/publish_stage.js --stage <slug> --pr
# --pr은 --commit + --push를 암묵적으로 포함
```

**커맨드 프롬프트**(`/publish-stage`)에서는 이 스크립트를 `--pr` 플래그로 호출하도록 안내.

### Task 5: quick-prompts.md 절대 경로 제거 (P5 해결)

`relay-tools/quick-prompts.md:8`의 `/Users/jungcollin/Project/etc/series_game`를 제거하고, 상대 경로 또는 일반적인 설명으로 교체.

---

## 5. 변경 파일 목록

| 파일 | 작업 | 설명 |
|------|------|------|
| `.claude/commands/make-stage.md` | 신규 | Claude Code 슬래시 커맨드 |
| `.claude/commands/check-stage.md` | 신규 | Claude Code 슬래시 커맨드 (서버 기동 포함) |
| `.claude/commands/publish-stage.md` | 신규 | Claude Code 슬래시 커맨드 (`--pr` 호출) |
| `relay-tools/scripts/publish_stage.js` | 수정 | `--pr` 플래그 추가 (브랜치/커밋/푸시/PR 생성 내장) |
| `AGENTS.md` | 수정 | 절대 경로 → 상대 경로 전환 |
| `CLAUDE.md` | 수정 | `.claude/commands/` 존재를 반영한 안내 갱신 |
| `GEMINI.md` | 수정 | 절대 경로가 있다면 상대 경로로 전환 |
| `relay-tools/quick-prompts.md` | 수정 | 절대 경로 제거 |

---

## 6. 구현 순서

```
Task 2 (AGENTS.md 상대경로) ─┐
Task 5 (quick-prompts 경로)  ├─ 병렬 가능 (독립적)
                              │
Task 1 (.claude/commands/)   ─┘
         │
         ├─ Task 3 (check-stage 서버 기동)  ← Task 1 완료 후
         └─ Task 4 (publish-stage PR 생성)  ← Task 1 완료 후
```

---

## 7. 검증 방법

| 검증 항목 | 방법 |
|-----------|------|
| Claude Code 커맨드 인식 | 새 세션에서 `/make-stage`, `/check-stage`, `/publish-stage` 탭 완성 확인 |
| Codex 커맨드 인식 | `AGENTS.md` 읽기로 커맨드 매핑 확인 |
| `/check-stage` 실행 | 기존 스테이지(`galaxy-boss`)로 체크 스크립트 실행 → JSON pass 확인 |
| `/publish-stage` PR | 테스트 브랜치에서 더미 스테이지 → PR 생성 → URL 확인 |
| 상대 경로 | `grep -r '/Users/' .` 결과 0건 확인 |
