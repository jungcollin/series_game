# Design: Stage Gallery & Likes System

## Executive Summary

| Item | Detail |
|------|--------|
| Feature | stage-gallery-likes |
| Plan Reference | `docs/01-plan/features/stage-gallery-likes.plan.md` |
| Created | 2026-03-19 |
| Author | jungcollin |

### Value Delivered

| Perspective | Description |
|-------------|-------------|
| Problem | 모든 스테이지가 동등하게 랜덤 노출되어 품질이 낮은 게임도 메인에 나오고, 제작자 기여가 드러나지 않음 |
| Solution | 좋아요 기반 인기도 시스템 + 커뮤니티 갤러리 + 제작자 프로필 노출 |
| Function UX Effect | 메인은 인기 스테이지만 랜덤 릴레이, 갤러리에서 전체 스테이지를 바둑판으로 탐색하며 좋아요 투표 |
| Core Value | 제작자 동기부여 + 플레이어 큐레이션 + 커뮤니티 참여 선순환 |

---

## 1. System Architecture

### 1.1 전체 구조

```
┌─────────────────────────────────────────────────────────┐
│  index.html (메인 릴레이)                                 │
│  ├── game.js (인기 기반 pickNextStage)                    │
│  ├── likes-client.js (좋아요 API + visitor_id)            │
│  └── [사용자 스테이지] 버튼 → community-stages/gallery.html│
├─────────────────────────────────────────────────────────┤
│  community-stages/gallery.html (갤러리)                   │
│  ├── gallery.js (그리드 렌더링 + 좋아요 연동)               │
│  ├── gallery.css (바둑판 레이아웃)                         │
│  ├── likes-client.js (공유 모듈)                          │
│  └── registry.js (creator 객체 확장)                      │
├─────────────────────────────────────────────────────────┤
│  community-stages/play.html (단독 플레이)                  │
│  ├── iframe (스테이지 로드)                                │
│  ├── likes-client.js (좋아요 버튼)                        │
│  └── 제작자 정보 + 갤러리 복귀 버튼                         │
├─────────────────────────────────────────────────────────┤
│  Supabase                                               │
│  ├── stage_likes (좋아요 원본 테이블)                      │
│  └── stage_like_counts (집계 뷰)                          │
└─────────────────────────────────────────────────────────┘
```

### 1.2 파일 구조

```
series_game/
├── index.html                          # [수정] "사용자 스테이지" 버튼 추가
├── game.js                             # [수정] 인기 기반 pickNextStage
├── styles.css                          # [수정] 갤러리 버튼 스타일 (최소)
├── community-stages/
│   ├── index.html                      # [유지] 기존 런처 (호환성)
│   ├── gallery.html                    # [신규] 갤러리 페이지
│   ├── gallery.js                      # [신규] 갤러리 렌더링 로직
│   ├── gallery.css                     # [신규] 갤러리 스타일
│   ├── play.html                       # [신규] 단독 플레이 페이지
│   ├── likes-client.js                 # [신규] 좋아요 API 클라이언트
│   ├── registry.js                     # [수정] creator 객체 확장
│   └── relay-runtime.js               # [유지]
└── relay-tools/
    ├── supabase/
    │   ├── leaderboard_runs.sql        # [유지]
    │   └── stage_likes.sql             # [신규] 좋아요 DDL
    └── scripts/
        └── create_stage.js             # [수정] creator 옵션 확장
```

---

## 2. Database Design (Supabase)

### 2.1 `stage_likes` 테이블

```sql
CREATE TABLE IF NOT EXISTS public.stage_likes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stage_id text NOT NULL,
  visitor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 1인 1스테이지 1좋아요
CREATE UNIQUE INDEX IF NOT EXISTS stage_likes_unique_idx
  ON public.stage_likes (stage_id, visitor_id);

-- 집계 쿼리 성능
CREATE INDEX IF NOT EXISTS stage_likes_stage_id_idx
  ON public.stage_likes (stage_id);
```

### 2.2 `stage_like_counts` 뷰

```sql
CREATE OR REPLACE VIEW public.stage_like_counts AS
  SELECT stage_id, COUNT(*)::int AS like_count
  FROM public.stage_likes
  GROUP BY stage_id;
```

### 2.3 RLS 정책

```sql
ALTER TABLE public.stage_likes ENABLE ROW LEVEL SECURITY;

-- 누구나 좋아요 수 조회 가능
CREATE POLICY "Anyone can read likes"
  ON public.stage_likes FOR SELECT
  TO anon, authenticated
  USING (true);

-- 누구나 좋아요 추가 가능 (visitor_id 필수)
CREATE POLICY "Anyone can insert likes"
  ON public.stage_likes FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(trim(visitor_id)) >= 8
    AND char_length(trim(stage_id)) >= 1
  );

-- 본인 좋아요만 삭제 가능 (visitor_id 일치)
CREATE POLICY "Visitors can delete own likes"
  ON public.stage_likes FOR DELETE
  TO anon, authenticated
  USING (visitor_id = current_setting('request.headers')::json->>'x-visitor-id');
```

> **NOTE**: Supabase anon DELETE에서 visitor_id 검증이 어려우므로, 실제 구현에서는 DELETE를 RPC 함수로 래핑하거나, 클라이언트에서 `visitor_id` 매칭 조건을 쿼리 파라미터로 전달합니다.

### 2.4 실용적 DELETE 전략

RLS에서 `current_setting`을 사용하기 어려우므로, DELETE 시 REST 필터를 사용:

```
DELETE /rest/v1/stage_likes?stage_id=eq.{stageId}&visitor_id=eq.{visitorId}
```

RLS는 단순 허용으로:
```sql
CREATE POLICY "Anyone can delete likes"
  ON public.stage_likes FOR DELETE
  TO anon, authenticated
  USING (true);
```

클라이언트가 반드시 `visitor_id=eq.{본인id}` 필터를 포함해야 하며, 다른 사용자의 visitor_id를 모르므로 실질적으로 본인 것만 삭제 가능합니다.

---

## 3. Module Design

### 3.1 `likes-client.js` - 좋아요 API 클라이언트

```js
// 위치: community-stages/likes-client.js
// 메인 index.html과 gallery.html, play.html 모두에서 로드

window.LikesClient = (function () {
  const SUPABASE_URL = "https://ikrhlbwsrahnswuhuyka.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbG...";  // 기존 game.js와 동일
  const VISITOR_ID_KEY = "one-life-relay-visitor-id";
  const LIKES_CACHE_KEY = "one-life-relay-liked-stages";

  // --- visitor_id ---
  function getVisitorId() { ... }

  // --- localStorage 캐시 ---
  function getCachedLikes() { ... }        // returns Set<stageId>
  function setCachedLike(stageId) { ... }
  function removeCachedLike(stageId) { ... }

  // --- Supabase API ---
  async function fetchLikeCounts() { ... }
  // GET /rest/v1/stage_like_counts?select=stage_id,like_count
  // Returns: Map<stageId, likeCount>

  async function fetchMyLikes(visitorId) { ... }
  // GET /rest/v1/stage_likes?visitor_id=eq.{visitorId}&select=stage_id
  // Returns: Set<stageId>

  async function addLike(stageId) { ... }
  // POST /rest/v1/stage_likes { stage_id, visitor_id }

  async function removeLike(stageId) { ... }
  // DELETE /rest/v1/stage_likes?stage_id=eq.{stageId}&visitor_id=eq.{visitorId}

  async function toggleLike(stageId) { ... }
  // 캐시 확인 → 있으면 removeLike, 없으면 addLike → 캐시 업데이트

  return {
    getVisitorId,
    fetchLikeCounts,
    fetchMyLikes,
    addLike,
    removeLike,
    toggleLike,
    getCachedLikes,
  };
})();
```

**설계 결정:**
- IIFE 패턴으로 `window.LikesClient` 전역 노출 (기존 `window.RelayRuntime` 패턴과 일관)
- Supabase 자격증명은 기존 `game.js`와 동일한 값 사용
- localStorage 캐시로 좋아요 상태를 즉시 반영 (optimistic UI)
- API 실패 시 캐시 롤백

### 3.2 `registry.js` - Creator 객체 확장

**Before:**
```js
{
  id: "vanishing-picks",
  creator: "Contributor",
  ...
}
```

**After:**
```js
{
  id: "vanishing-picks",
  creator: {
    name: "Contributor",
    avatar: null,       // GitHub avatar URL 또는 null
    github: null,       // GitHub username 또는 null
  },
  ...
}
```

**정규화 함수** (relay-runtime.js에 추가):
```js
function normalizeCreator(creator) {
  if (typeof creator === "string") {
    return { name: creator, avatar: null, github: null };
  }
  return {
    name: creator.name || "Unknown",
    avatar: creator.avatar || null,
    github: creator.github || null,
  };
}
```

**기본 아바타:** GitHub username이 있으면 `https://github.com/{username}.png?size=80` 사용. 없으면 CSS로 이니셜 원형 아바타 생성.

### 3.3 `game.js` - 인기 기반 `pickNextStage` 수정

```js
// 새로 추가되는 상태
const state = {
  ...existingState,
  likeCounts: new Map(),       // stageId → likeCount
  likeCountsLoaded: false,
};

// 앱 시작 시 좋아요 데이터 로드
async function loadLikeCounts() {
  try {
    state.likeCounts = await window.LikesClient.fetchLikeCounts();
    state.likeCountsLoaded = true;
  } catch (error) {
    state.likeCounts = new Map();
    state.likeCountsLoaded = false;
  }
}

// pickNextStage 수정
function pickNextStage() {
  if (!COMMUNITY_STAGE_REGISTRY.length) return null;

  const excluded = new Set([...state.history, ...state.unavailableStageIds]);
  const available = COMMUNITY_STAGE_REGISTRY.filter((e) => !excluded.has(e.id));
  if (!available.length) return null;

  // 좋아요 데이터가 있으면 인기 풀 필터링
  if (state.likeCountsLoaded && state.likeCounts.size > 0) {
    const withLikes = available
      .map((s) => ({ ...s, likes: state.likeCounts.get(s.id) || 0 }))
      .sort((a, b) => b.likes - a.likes);

    // 상위 70% 또는 최소 3개
    const poolSize = Math.max(3, Math.ceil(withLikes.length * 0.7));
    const popularPool = withLikes.slice(0, Math.min(poolSize, withLikes.length));

    return popularPool[Math.floor(Math.random() * popularPool.length)];
  }

  // fallback: 전체 랜덤
  if (window.RelayRuntime) {
    return window.RelayRuntime.pickRandomNext(COMMUNITY_STAGE_REGISTRY, {
      history: Array.from(excluded),
      currentStageId: state.currentStage?.id || null,
    });
  }
  return available[Math.floor(Math.random() * available.length)];
}
```

**초기화 순서:**
```js
// 기존: loadLeaderboard() → startNewRun()
// 변경: loadLikeCounts() → loadLeaderboard() → startNewRun()
loadLikeCounts().then(() => {
  loadLeaderboard();
  startNewRun();
});
```

---

## 4. UI Design

### 4.1 메인 페이지 (`index.html`) 변경

**헤더에 버튼 추가:**
```html
<div class="hero-actions">
  <button id="open-gallery" type="button" class="action-btn">
    사용자 스테이지
  </button>
  <button id="open-leaderboard" type="button" class="action-btn">
    랭킹
  </button>
  <button id="open-prompt" type="button" class="action-btn action-btn-primary">
    참여하기
  </button>
</div>
```

**JS:** `open-gallery` 클릭 → `window.location.href = "./community-stages/gallery.html"`

**스크립트 추가:**
```html
<script src="./community-stages/likes-client.js"></script>
```

### 4.2 갤러리 페이지 (`community-stages/gallery.html`)

**레이아웃:**
```
┌──────────────────────────────────────────────┐
│  ONE LIFE RELAY                [메인으로] 버튼│
│  Community Stages                            │
│  전체 스테이지를 둘러보고 좋아요를 눌러보세요    │
├──────────────────────────────────────────────┤
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐    │
│  │ 썸네일 │  │ 썸네일 │  │ 썸네일 │  │ 썸네일 │    │
│  │      │  │      │  │      │  │      │    │
│  │ 제목  │  │ 제목  │  │ 제목  │  │ 제목  │    │
│  │ 장르  │  │ 장르  │  │ 장르  │  │ 장르  │    │
│  │[아바]이름│[아바]이름│[아바]이름│[아바]이름│    │
│  │ ♥ 12 │  │ ♥ 8  │  │ ♥ 24 │  │ ♥ 3  │    │
│  └──────┘  └──────┘  └──────┘  └──────┘    │
│  ┌──────┐  ┌──────┐                         │
│  │ ...  │  │ ...  │                         │
│  └──────┘  └──────┘                         │
└──────────────────────────────────────────────┘
```

**갤러리 카드 HTML 구조:**
```html
<article class="stage-card" data-stage-id="{stageId}">
  <div class="stage-card-thumb" style="background-color: {genreColor}">
    <span class="stage-card-genre">{genre}</span>
  </div>
  <div class="stage-card-body">
    <h3 class="stage-card-title">{title}</h3>
    <p class="stage-card-condition">{clearCondition}</p>
    <div class="stage-card-creator">
      <img class="creator-avatar" src="{avatarUrl}" alt="" />
      <span class="creator-name">{creatorName}</span>
    </div>
    <div class="stage-card-actions">
      <button class="like-btn" data-stage-id="{stageId}" aria-label="좋아요">
        <span class="like-icon">&#9825;</span>
        <span class="like-count">{count}</span>
      </button>
      <a class="play-btn" href="./play.html?stage={stageId}">플레이</a>
    </div>
  </div>
</article>
```

**반응형 그리드 (gallery.css):**
```css
.gallery-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, 1fr);           /* 모바일 기본 2열 */
}

@media (min-width: 680px) {
  .gallery-grid {
    grid-template-columns: repeat(3, 1fr);          /* 태블릿 3열 */
  }
}

@media (min-width: 1024px) {
  .gallery-grid {
    grid-template-columns: repeat(4, 1fr);          /* 데스크톱 4열 */
  }
}
```

**카드 스타일:**
```css
.stage-card {
  border-radius: 20px;
  border: 3px solid rgba(23, 50, 77, 0.12);
  background: rgba(255, 249, 239, 0.92);
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.stage-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 16px 40px rgba(12, 21, 34, 0.16);
}

.stage-card-thumb {
  aspect-ratio: 16 / 10;
  display: grid;
  place-items: center;
  font-size: 2rem;
}

.stage-card-genre {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.86);
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.stage-card-body {
  padding: 14px;
  display: grid;
  gap: 8px;
}

.stage-card-title {
  margin: 0;
  font-size: 1.1rem;
  line-height: 1.2;
}

.stage-card-condition {
  margin: 0;
  font-size: 0.85rem;
  color: rgba(23, 50, 77, 0.72);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 제작자 프로필 */
.stage-card-creator {
  display: flex;
  align-items: center;
  gap: 8px;
}

.creator-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #17324d;
  object-fit: cover;
}

.creator-avatar-placeholder {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 0.72rem;
  font-weight: 800;
}

.creator-name {
  font-size: 0.84rem;
  font-weight: 700;
  color: rgba(23, 50, 77, 0.82);
}

/* 좋아요 버튼 */
.stage-card-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(23, 50, 77, 0.08);
}

.like-btn {
  appearance: none;
  border: 2px solid rgba(23, 50, 77, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.8);
  padding: 6px 12px;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: border-color 0.15s, background 0.15s;
}

.like-btn[data-liked="true"] {
  border-color: #e04040;
  background: rgba(224, 64, 64, 0.08);
  color: #e04040;
}

.like-btn[data-liked="true"] .like-icon {
  content: "♥";  /* filled heart via JS */
}

.play-btn {
  appearance: none;
  border: 0;
  border-radius: 999px;
  background: var(--accent);
  color: #f8fafc;
  padding: 6px 14px;
  font-size: 0.84rem;
  font-weight: 800;
  cursor: pointer;
  text-decoration: none;
}
```

### 4.3 단독 플레이 페이지 (`community-stages/play.html`)

**레이아웃:**
```
┌──────────────────────────────────────────────┐
│ [< 갤러리로] {스테이지 제목}   ♥ 좋아요 {N}  │
├──────────────────────────────────────────────┤
│                                              │
│              [iframe: 스테이지]                │
│                                              │
├──────────────────────────────────────────────┤
│ [아바타] {제작자명}   {장르}   {클리어 조건}    │
└──────────────────────────────────────────────┘
```

**동작:**
1. URL `?stage={stageId}` 파라미터로 스테이지 식별
2. `registry.js`에서 해당 스테이지 메타데이터 조회
3. iframe에 스테이지 로드 (릴레이 컨텍스트 없이 단독)
4. 좋아요 버튼 표시 + 제작자 정보 표시
5. 클리어/실패 후 "다시 플레이" 또는 "갤러리로 돌아가기"
6. `RelayHost` 콜백을 받되, 릴레이 전환 없이 결과 표시만

### 4.4 장르별 썸네일 색상 매핑

스테이지별 썸네일 이미지 대신 장르 기반 그라데이션으로 대체:

```js
const GENRE_COLORS = {
  "Luck & Speed": { bg: "#f3c677", icon: "🎰" },
  "Arcade survival": { bg: "#7bc8f6", icon: "⚡" },
  "Platformer": { bg: "#7be0a8", icon: "🏃" },
  "Arcade shooter": { bg: "#b57bef", icon: "🚀" },
  "Math quiz": { bg: "#f7a07b", icon: "🧮" },
};
// fallback: { bg: "#c4c4c4", icon: "🎮" }
```

---

## 5. Data Flow

### 5.1 갤러리 로딩 시퀀스

```
gallery.html 로드
  ↓
[1] registry.js 파싱 → stages[] (동기)
  ↓
[2] LikesClient.fetchLikeCounts() → Map<stageId, count> (비동기)
    LikesClient.fetchMyLikes(visitorId) → Set<stageId> (비동기)
  ↓  (Promise.all 병렬)
[3] renderGalleryGrid(stages, likeCounts, myLikes)
  ↓
[4] 카드 클릭 → play.html?stage={id}
    좋아요 클릭 → LikesClient.toggleLike(stageId) → re-render count
```

### 5.2 좋아요 토글 시퀀스

```
사용자 ♥ 클릭
  ↓
[1] 로컬 캐시 확인 (getCachedLikes)
  ↓
[2a] 이미 좋아요 → optimistic UI (♥ → ♡, count-1)
     → removeLike(stageId) API 호출
     → 성공: removeCachedLike(stageId)
     → 실패: 롤백 (♡ → ♥, count+1)

[2b] 아직 좋아요 안함 → optimistic UI (♡ → ♥, count+1)
     → addLike(stageId) API 호출
     → 성공: setCachedLike(stageId)
     → 실패: 롤백 (♥ → ♡, count-1)
```

### 5.3 메인 릴레이 인기 필터

```
game.js 초기화
  ↓
loadLikeCounts() → state.likeCounts = Map<stageId, count>
  ↓
startNewRun() → pickNextStage()
  ↓
[조건] likeCountsLoaded && likeCounts.size > 0
  → YES: available 스테이지를 likes DESC 정렬
         상위 70% (최소 3개) 풀에서 랜덤 선택
  → NO:  전체 레지스트리에서 랜덤 선택 (기존 동작)
```

---

## 6. Implementation Order

| Step | Task | Files | Depends On |
|------|------|-------|------------|
| 1 | Supabase DDL 작성 및 실행 | `relay-tools/supabase/stage_likes.sql` | - |
| 2 | `likes-client.js` 모듈 구현 | `community-stages/likes-client.js` | Step 1 |
| 3 | `registry.js` creator 객체 확장 | `community-stages/registry.js` | - |
| 4 | `relay-runtime.js`에 `normalizeCreator` 추가 | `community-stages/relay-runtime.js` | Step 3 |
| 5 | `gallery.css` 스타일 작성 | `community-stages/gallery.css` | - |
| 6 | `gallery.html` + `gallery.js` 구현 | `community-stages/gallery.html`, `community-stages/gallery.js` | Step 2, 3, 4, 5 |
| 7 | `play.html` 단독 플레이 구현 | `community-stages/play.html` | Step 2, 4 |
| 8 | `game.js` 인기 기반 `pickNextStage` 수정 | `game.js` | Step 2 |
| 9 | `index.html`에 "사용자 스테이지" 버튼 추가 | `index.html` | Step 6 |
| 10 | `create_stage.js` creator 옵션 확장 | `relay-tools/scripts/create_stage.js` | Step 3 |

---

## 7. API Specification

### 7.1 Supabase REST Endpoints

| Operation | Method | Path | Body/Params |
|-----------|--------|------|-------------|
| 좋아요 수 조회 | GET | `/rest/v1/stage_like_counts?select=stage_id,like_count` | - |
| 내 좋아요 목록 | GET | `/rest/v1/stage_likes?visitor_id=eq.{vid}&select=stage_id` | - |
| 좋아요 추가 | POST | `/rest/v1/stage_likes` | `{ stage_id, visitor_id }` |
| 좋아요 삭제 | DELETE | `/rest/v1/stage_likes?stage_id=eq.{sid}&visitor_id=eq.{vid}` | - |

**Headers (공통):**
```
apikey: {SUPABASE_ANON_KEY}
Authorization: Bearer {SUPABASE_ANON_KEY}
Content-Type: application/json
```

**에러 처리:**
- 409 Conflict (중복 INSERT): 이미 좋아요 상태 → 무시
- 네트워크 오류: 캐시 롤백 + 사용자에게 무음 실패

### 7.2 visitor_id 사양

| 항목 | 값 |
|------|-----|
| 키 | `one-life-relay-visitor-id` |
| 형식 | UUID v4 (`crypto.randomUUID()`) |
| 저장소 | `localStorage` |
| 생성 시점 | 최초 `LikesClient` 접근 시 |
| 수명 | 영구 (브라우저 데이터 삭제 전까지) |

---

## 8. registry.js 확장 스키마

### Before (현재)
```js
{
  id: "vanishing-picks",
  title: "Vanishing Picks",
  creator: "Contributor",          // string
  genre: "Luck & Speed",
  clearCondition: "사라지기 전에 통과 선택지를 고르세요",
  path: "./vanishing-picks/index.html",
}
```

### After (확장)
```js
{
  id: "vanishing-picks",
  title: "Vanishing Picks",
  creator: {                        // object
    name: "Contributor",
    avatar: null,                   // GitHub avatar URL 또는 null
    github: null,                   // GitHub username 또는 null
  },
  genre: "Luck & Speed",
  clearCondition: "사라지기 전에 통과 선택지를 고르세요",
  path: "./vanishing-picks/index.html",
}
```

### 하위 호환

`relay-runtime.js`의 `normalizeCreator()` 함수가 문자열/객체 모두 처리:
- `typeof creator === "string"` → `{ name: creator, avatar: null, github: null }`
- `typeof creator === "object"` → `{ name: creator.name || "Unknown", avatar: ..., github: ... }`

기존 `decorateRegistryLinks()`에서 `entry.creator`를 직접 사용하던 부분도 `normalizeCreator`를 거치도록 수정.

---

## 9. Acceptance Criteria Mapping

| AC | Design Section | Verification |
|----|---------------|--------------|
| AC-1: 갤러리 바둑판 표시 | 4.2 갤러리 페이지 | gallery.html 로드 시 registry의 모든 스테이지 카드 렌더링 |
| AC-2: 제작자 아바타+이름 | 4.2 카드 구조, 8. 스키마 | `.stage-card-creator` 영역에 avatar + name 표시 |
| AC-3: 좋아요 Supabase 기록 | 2.1 테이블, 3.1 클라이언트 | toggleLike → INSERT/DELETE → fetchLikeCounts 반영 |
| AC-4: 중복 좋아요 불가 | 2.1 UNIQUE 인덱스 | (stage_id, visitor_id) UNIQUE + 409 처리 |
| AC-5: 단독 플레이 | 4.3 play.html | ?stage={id} → iframe 로드 → 결과 표시 |
| AC-6: 인기 기반 랜덤 | 3.3 pickNextStage | likeCounts 상위 70% 풀에서 선택 |
| AC-7: fallback 동작 | 3.3 fallback 분기 | likeCountsLoaded=false → 전체 랜덤 |
| AC-8: 사용자 스테이지 버튼 | 4.1 메인 변경 | `#open-gallery` 버튼 → gallery.html 이동 |
| AC-9: 반응형 그리드 | 4.2 CSS Grid | 2열/3열/4열 breakpoints |
| AC-10: 하위 호환 | 8. normalizeCreator | string → object 자동 변환 |

---

## 10. Risk & Edge Cases

| Case | Handling |
|------|----------|
| Supabase 뷰 미생성 시 | `fetchLikeCounts` 실패 → fallback (전체 랜덤) |
| visitor_id localStorage 비활성 | catch에서 in-memory fallback UUID 사용 (세션 한정) |
| 스테이지 0개 (빈 registry) | 갤러리: "등록된 스테이지가 없습니다" 메시지 |
| 좋아요 0개 전체 | 인기 풀 = 전체 풀 (fallback) |
| 동시 좋아요 클릭 | debounce 200ms + 요청 중 버튼 disabled |
| play.html에 잘못된 stageId | "스테이지를 찾을 수 없습니다" + 갤러리 복귀 링크 |
| creator 객체에 avatar 없음 | 이니셜 기반 placeholder 아바타 |
