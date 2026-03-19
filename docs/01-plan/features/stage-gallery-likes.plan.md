# Plan: Stage Gallery & Likes System

## Executive Summary

| Item | Detail |
|------|--------|
| Feature | stage-gallery-likes |
| Created | 2026-03-19 |
| Author | jungcollin |
| Level | Dynamic |

### Value Delivered

| Perspective | Description |
|-------------|-------------|
| Problem | 모든 스테이지가 동등하게 랜덤 노출되어 품질이 낮은 게임도 메인에 나오고, 제작자 기여가 드러나지 않음 |
| Solution | 좋아요 기반 인기도 시스템 + 커뮤니티 갤러리 + 제작자 프로필 노출 |
| Function UX Effect | 메인은 인기 스테이지만 랜덤 릴레이, 갤러리에서 전체 스테이지를 바둑판으로 탐색하며 좋아요 투표 |
| Core Value | 제작자 동기부여 + 플레이어 큐레이션 + 커뮤니티 참여 선순환 |

---

## 1. Background & Problem

### 현재 상태
- `community-stages/registry.js`에 6개 스테이지가 하드코딩 등록
- 메인 페이지(`game.js`)에서 전체 레지스트리를 대상으로 완전 랜덤 선택
- 좋아요/평가 시스템 없음
- 제작자(`creator`) 필드는 있으나 UI에 노출되지 않음
- Supabase는 `leaderboard_runs` 테이블만 사용 중

### 문제점
1. 품질과 무관하게 모든 스테이지가 동일 확률로 메인 릴레이에 등장
2. 플레이어가 개별 스테이지를 선택해서 플레이할 방법이 없음
3. 제작자가 누구인지 게임 플레이 중/후에 알 수 없음
4. 스테이지에 대한 커뮤니티 피드백 채널이 없음

---

## 2. Goals & Non-Goals

### Goals
- G1: 좋아요(like) 시스템을 Supabase에 구축하여 스테이지별 인기도 추적
- G2: 메인 릴레이를 인기 스테이지(좋아요 상위) 풀에서 랜덤 선택하도록 변경
- G3: "사용자 스테이지" 갤러리 페이지를 바둑판(grid) 레이아웃으로 구현
- G4: 갤러리에서 개별 스테이지를 클릭하여 단독 플레이 가능
- G5: 갤러리 카드에 제작자 이름 및 프로필 정보 노출
- G6: 스테이지 등록(registry) 시 제작자 정보 확장 (이름, 프로필 이미지 URL 등)

### Non-Goals
- 사용자 계정/인증 시스템 (좋아요는 브라우저 fingerprint 또는 localStorage 기반)
- 스테이지 업로드 UI (기존 CLI 워크플로우 `/make-stage` + `/publish-stage` 유지)
- 댓글/리뷰 시스템
- 스테이지 검색/필터 (향후 확장 가능하나 이번 범위 아님)

---

## 3. Feature Requirements

### FR-1: Supabase `stage_likes` 테이블
- 스테이지별 좋아요 수를 집계하는 테이블
- 스키마:
  ```sql
  stage_likes (
    id bigint PK,
    stage_id text NOT NULL,
    visitor_id text NOT NULL,      -- localStorage UUID
    created_at timestamptz DEFAULT now()
  )
  UNIQUE(stage_id, visitor_id)     -- 1인 1좋아요
  ```
- `stage_like_counts` 뷰: `stage_id`, `like_count` 집계
- RLS: anon SELECT/INSERT 허용, DELETE는 본인(visitor_id 일치)만

### FR-2: 좋아요 클라이언트 로직
- 브라우저당 고유 `visitor_id`를 localStorage에 생성/저장
- 좋아요 토글: 이미 좋아요한 스테이지는 취소 가능
- 좋아요 상태를 localStorage에도 캐시 (빠른 UI 반영)
- API: Supabase REST로 INSERT/DELETE

### FR-3: 메인 릴레이 인기 기반 랜덤
- `game.js`의 `pickNextStage()` 수정
- 좋아요 수 상위 N개 스테이지를 "인기 풀"로 구성 (N = 전체의 상위 70% 또는 최소 3개)
- 인기 풀 내에서 기존처럼 랜덤 선택
- 좋아요 데이터가 없거나 로드 실패 시 전체 레지스트리 fallback

### FR-4: 스테이지 갤러리 페이지
- 새 파일: `community-stages/index.html` (기존 파일이 있다면 교체)
- 바둑판(grid) 레이아웃: CSS Grid, 반응형 (모바일 2열, 태블릿 3열, 데스크톱 4열)
- 각 카드 구성:
  - 스테이지 썸네일 (스테이지 첫 화면 스크린샷 또는 장르 아이콘)
  - 스테이지 제목
  - 장르 태그
  - 클리어 조건 요약
  - 제작자 프로필 (아바타 + 이름)
  - 좋아요 수 + 좋아요 버튼
- 카드 클릭 시 해당 스테이지 단독 플레이 페이지로 이동

### FR-5: 단독 스테이지 플레이
- 갤러리에서 카드 클릭 시 `?stage={stageId}` 파라미터로 단독 플레이
- 메인 `index.html`에서 `?stage=` 감지 시 릴레이 모드 대신 단독 모드 진입
- 또는 별도 `play.html` 페이지로 분리 (iframe + 좋아요 버튼 + 제작자 정보)
- 단독 플레이 후 "갤러리로 돌아가기" 버튼

### FR-6: 제작자 프로필 확장
- `registry.js` 스키마 확장:
  ```js
  {
    id: "stage-slug",
    title: "Stage Title",
    creator: {
      name: "Creator Name",
      avatar: "./avatars/creator-name.png",  // 또는 GitHub avatar URL
      github: "github-username",             // optional
    },
    genre: "Genre",
    clearCondition: "...",
    path: "./stage-slug/index.html",
    thumbnail: "./stage-slug/thumbnail.png", // optional
  }
  ```
- 하위 호환: `creator`가 문자열이면 `{ name: creator }` 로 정규화
- `create_stage.js` 템플릿 업데이트: `--creator-avatar`, `--creator-github` 옵션 추가

### FR-7: 메인 페이지 갤러리 진입점
- `index.html` 헤더에 "사용자 스테이지" 버튼 추가 (기존 "랭킹", "참여하기" 옆)
- 클릭 시 `community-stages/index.html` 로 이동 (또는 모달)

---

## 4. Technical Approach

### 4.1 데이터 레이어 (Supabase)
- 새 테이블: `stage_likes`
- 새 뷰: `stage_like_counts` (SELECT stage_id, COUNT(*) as like_count GROUP BY stage_id)
- RLS 정책: 읽기 전체 허용, 쓰기는 anon INSERT + visitor_id 기반 DELETE
- SQL 마이그레이션 파일: `relay-tools/supabase/stage_likes.sql`

### 4.2 클라이언트 아키텍처
```
index.html (메인)
  ├── game.js (수정: 인기 기반 pickNextStage)
  ├── likes.js (새로: 좋아요 API 클라이언트)
  └── "사용자 스테이지" 버튼 → community-stages/index.html

community-stages/
  ├── index.html (갤러리 페이지 - 리뉴얼)
  ├── gallery.js (새로: 갤러리 렌더링 + 좋아요 연동)
  ├── gallery.css (새로: 바둑판 레이아웃)
  ├── play.html (새로: 단독 플레이 페이지)
  ├── registry.js (수정: creator 객체 확장)
  └── relay-runtime.js (기존 유지)
```

### 4.3 좋아요 데이터 흐름
```
[갤러리/단독플레이] → likes.js → Supabase stage_likes
                                        ↓
[메인 game.js] ← stage_like_counts 뷰 조회 ← Supabase
                        ↓
              인기 풀 필터링 → 랜덤 선택
```

### 4.4 visitor_id 전략
- `localStorage.getItem("one-life-relay-visitor-id")` 없으면 `crypto.randomUUID()` 생성
- 계정 없이 1디바이스 1좋아요 보장
- 한계: 시크릿 모드, 브라우저 변경 시 중복 가능 (허용 범위)

---

## 5. Implementation Order

| Phase | Task | Files | Priority |
|-------|------|-------|----------|
| 1 | Supabase `stage_likes` 테이블 + RLS + 뷰 생성 | `relay-tools/supabase/stage_likes.sql` | P0 |
| 2 | `likes.js` 클라이언트 모듈 (좋아요 CRUD + visitor_id) | `community-stages/likes.js` | P0 |
| 3 | `registry.js` creator 객체 확장 + 정규화 함수 | `community-stages/registry.js` | P0 |
| 4 | 갤러리 페이지 (바둑판 grid + 제작자 프로필 + 좋아요) | `community-stages/index.html`, `gallery.js`, `gallery.css` | P0 |
| 5 | 단독 플레이 페이지 | `community-stages/play.html` | P1 |
| 6 | 메인 `game.js` 인기 기반 `pickNextStage` 수정 | `game.js` | P0 |
| 7 | 메인 `index.html`에 "사용자 스테이지" 버튼 추가 | `index.html` | P0 |
| 8 | `create_stage.js` 제작자 옵션 확장 | `relay-tools/scripts/create_stage.js` | P1 |

---

## 6. Acceptance Criteria

- [ ] AC-1: 갤러리 페이지에서 모든 등록 스테이지가 바둑판으로 표시됨
- [ ] AC-2: 각 카드에 제작자 이름과 아바타가 노출됨
- [ ] AC-3: 좋아요 버튼 클릭 시 Supabase에 기록되고 카운트가 실시간 업데이트됨
- [ ] AC-4: 같은 브라우저에서 동일 스테이지 중복 좋아요 불가 (토글 가능)
- [ ] AC-5: 갤러리 카드 클릭 시 해당 스테이지를 단독 플레이 가능
- [ ] AC-6: 메인 릴레이가 좋아요 상위 스테이지 풀에서 랜덤 선택
- [ ] AC-7: 좋아요 데이터 없을 시 전체 레지스트리 fallback 동작
- [ ] AC-8: 메인 헤더에 "사용자 스테이지" 버튼이 있고 갤러리로 이동
- [ ] AC-9: 모바일/태블릿/데스크톱 반응형 그리드 동작
- [ ] AC-10: 기존 `creator: "string"` 형태 하위 호환 유지

---

## 7. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Supabase 무료 티어 제한 | 좋아요 요청 병목 | 클라이언트 캐시 + debounce, 뷰 조회 최소화 |
| visitor_id 조작으로 좋아요 어뷰징 | 인기도 왜곡 | 허용 범위로 판단, 추후 rate limiting 추가 가능 |
| 스테이지 수가 적어 인기 필터 무의미 | 전체가 인기 풀 | 최소 3개 이상 보장, 스테이지 적으면 전체 풀 사용 |
| 제작자 아바타 이미지 없음 | 빈 프로필 | 기본 아바타 placeholder + GitHub avatar 자동 연동 |

---

## 8. Implementation Files

### New Files
| File | Purpose |
|------|---------|
| `relay-tools/supabase/stage_likes.sql` | 좋아요 테이블 DDL + RLS |
| `community-stages/likes.js` | 좋아요 API 클라이언트 |
| `community-stages/gallery.js` | 갤러리 렌더링 로직 |
| `community-stages/gallery.css` | 갤러리 스타일 (그리드) |
| `community-stages/play.html` | 단독 플레이 페이지 |

### Modified Files
| File | Change |
|------|--------|
| `community-stages/registry.js` | creator 필드를 객체로 확장 |
| `community-stages/index.html` | 갤러리 페이지로 전면 리뉴얼 |
| `game.js` | `pickNextStage()` 인기 기반 로직 추가 |
| `index.html` | "사용자 스테이지" 버튼 추가 |
| `relay-tools/scripts/create_stage.js` | creator 옵션 확장 |

---

## 9. Dependencies

- Supabase (기존 사용 중, 동일 프로젝트에 테이블 추가)
- 외부 라이브러리 추가 없음 (Vanilla JS 유지)
