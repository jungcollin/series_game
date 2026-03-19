# Gap Analysis: Stage Gallery & Likes System

## Analysis Overview

| Item | Detail |
|------|--------|
| Feature | stage-gallery-likes |
| Design Document | `docs/02-design/features/stage-gallery-likes.design.md` |
| Analysis Date | 2026-03-19 |
| Match Rate | **97%** |

---

## 1. Implementation Item Match Status

| # | Item | File | Status | Notes |
|---|------|------|:------:|-------|
| 1 | Supabase DDL | `relay-tools/supabase/stage_likes.sql` | Match | Table, indexes, view, RLS all match design |
| 2 | `likes-client.js` | `community-stages/likes-client.js` | Match | IIFE, `window.LikesClient` API surface exact match, 409 handling, debounce guard |
| 3 | `registry.js` creator object | `community-stages/registry.js` | Match | All entries use `{ name, avatar, github }` object format |
| 4 | `relay-runtime.js` normalizeCreator | `community-stages/relay-runtime.js` | Match | Both functions present and exported, handles string/null/object |
| 5 | `gallery.css` | `community-stages/gallery.css` | Match | Responsive grid 2/3/4 columns, card/creator/like styles |
| 6 | `gallery.html` + `gallery.js` | Both exist | Match | Grid rendering, GENRE_STYLES, optimistic like toggle, card click nav, sort bar |
| 7 | `play.html` | `community-stages/play.html` | Match | ?stage={id} parsing, iframe, RelayHost, like button, creator info, error state |
| 8 | `game.js` pickNextStage | `game.js` | Match | likeCounts state, top-70% pool (min 3), loadLikeCounts before startNewRun |
| 9 | `index.html` gallery button | `index.html` | Partial | `<a>` tag instead of `<button>` -- functionally equivalent, better semantics |
| 10 | `create_stage.js` creator options | `relay-tools/scripts/create_stage.js` | Partial | `--creator-avatar`, `--creator-github` added. Template var only passes name string |

---

## 2. Acceptance Criteria Status

| AC | Description | Status |
|----|-------------|:------:|
| AC-1 | Gallery grid shows all stages | Pass |
| AC-2 | Creator avatar + name on each card | Pass |
| AC-3 | Like button -> Supabase + real-time count | Pass |
| AC-4 | No duplicate likes (UNIQUE + 409) | Pass |
| AC-5 | Card click -> standalone play | Pass |
| AC-6 | Main relay picks from popular pool | Pass |
| AC-7 | Fallback to full registry | Pass |
| AC-8 | "사용자 스테이지" button on main | Pass |
| AC-9 | Responsive grid 2/3/4 columns | Pass |
| AC-10 | Backward compat for string creator | Pass |

---

## 3. Match Rate

| Category | Items | Matched | Partial | Missing | Rate |
|----------|:-----:|:-------:|:-------:|:-------:|:----:|
| Implementation Items | 10 | 8 | 2 | 0 | 96% |
| Acceptance Criteria | 10 | 10 | 0 | 0 | 100% |
| **Overall** | **20** | **18** | **2** | **0** | **97%** |

---

## 4. Gaps (Low Severity Only)

| # | Gap | Severity | Impact |
|---|-----|----------|--------|
| 1 | Gallery button: `<a>` vs `<button>` | Low | Better semantics for navigation |
| 2 | `create_stage.js` template var: name-only string | Low | Registry entry is correct; only affects stage HTML display |
| 3 | CSS class `.play-link` vs design `.play-btn` | Low | Cosmetic naming |
| 4 | Sort bar not in design but implemented | Low | Additive UX improvement |

---

## 5. Verdict

**Match Rate 97% >= 90% threshold. Ready for completion report.**
