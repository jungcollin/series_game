# Stage Ranking Design Document

> **Summary**: play.html 개별 스테이지 클리어 시간 랭킹 시스템
>
> **Project**: One Life Relay
> **Author**: Claude
> **Date**: 2026-03-30
> **Status**: Draft
> **Plan Reference**: `docs/01-plan/features/stage-ranking.plan.md`

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 개별 스테이지 플레이 기록이 없어 경쟁/재방문 동기 부재 |
| **Solution** | Supabase `stage_rankings` 테이블 + ranking-client.js + play.html UI 확장 |
| **Function/UX Effect** | 클리어 시 닉네임 입력으로 기록 저장, 프레임 아래 Top 10 랭킹 상시 표시 |
| **Core Value** | per-stage 경쟁으로 재플레이율 향상 |

---

## 1. Shared

### 1.1 Entity

```
StageRanking {
  id:           bigint (auto)
  stage_id:     text (FK-like, references registry entry id)
  visitor_id:   text (anonymous UUID from localStorage)
  player_name:  text (2-24 chars)
  duration_sec: numeric(8,1) (>= 1.0)
  created_at:   timestamptz
  updated_at:   timestamptz
  UNIQUE(stage_id, visitor_id) -- 유저당 스테이지별 1개 기록만 (최고 기록 upsert)
}
```

### 1.2 API Contract

| Method | Endpoint | Description | Headers |
|--------|----------|-------------|---------|
| GET | `/rest/v1/stage_rankings?stage_id=eq.{id}&order=duration_sec.asc&limit=10` | 스테이지별 Top 10 조회 | apikey, Authorization |
| POST | `/rest/v1/stage_rankings?on_conflict=stage_id,visitor_id` | 기록 upsert (기존보다 빠를 때만 갱신) | apikey, Authorization, `Prefer: return=representation,resolution=merge-duplicates` |

**POST Body:**
```json
{
  "stage_id": "balloon-flight",
  "visitor_id": "uuid-from-localStorage",
  "player_name": "닉네임",
  "duration_sec": 12.3,
  "updated_at": "now()"
}
```

**GET Response:**
```json
[
  { "player_name": "player1", "duration_sec": 8.2, "visitor_id": "...", "updated_at": "2026-03-30T..." },
  { "player_name": "player2", "duration_sec": 12.3, "visitor_id": "...", "updated_at": "2026-03-30T..." }
]
```

### 1.3 Error Codes

| Code | Meaning | Client Handling |
|------|---------|-----------------|
| 200 | 조회 성공 | 랭킹 테이블 렌더링 |
| 201 | 기록 저장 성공 | 랭킹 재조회 + 성공 메시지 |
| 409 | Conflict (upsert 시 정상) | Prefer 헤더로 자동 처리됨 |
| 400 | 유효성 검증 실패 (이름 길이, 시간 범위) | "기록을 저장하지 못했습니다" 피드백 |
| 500 | 서버 오류 | "서버 오류. 잠시 후 다시 시도해 주세요" 피드백 |

### 1.4 Supabase SQL

```sql
CREATE TABLE stage_rankings (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stage_id     TEXT NOT NULL,
  visitor_id   TEXT NOT NULL,
  player_name  TEXT NOT NULL CHECK (char_length(player_name) BETWEEN 2 AND 24),
  duration_sec NUMERIC(8,1) NOT NULL CHECK (duration_sec >= 1.0),
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (stage_id, visitor_id)
);

CREATE INDEX idx_stage_rankings_leaderboard
  ON stage_rankings (stage_id, duration_sec ASC);

ALTER TABLE stage_rankings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read rankings"
  ON stage_rankings FOR SELECT USING (true);
CREATE POLICY "Anyone can insert rankings"
  ON stage_rankings FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update own rankings"
  ON stage_rankings FOR UPDATE USING (true);
```

---

## 2. Frontend (play.html)

### 2.1 New File: `community-stages/ranking-client.js`

likes-client.js 패턴을 따르는 독립 모듈. IIFE로 `window.RankingClient` 노출.

```
RankingClient {
  fetchRankings(stageId): Promise<Array<RankingEntry>>
    - GET stage_rankings?stage_id=eq.{id}&order=duration_sec.asc&limit=10
    - returns: [{ player_name, duration_sec, visitor_id, updated_at }]

  saveRanking(stageId, playerName, durationSec): Promise<Object>
    - POST stage_rankings?on_conflict=stage_id,visitor_id
    - body: { stage_id, visitor_id, player_name, duration_sec, updated_at: "now()" }
    - visitor_id는 LikesClient.getVisitorId() 재사용
    - returns: upserted row
}
```

**상수:**
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`: likes-client.js와 동일값
- `supabaseRequest()`: likes-client.js의 동일 패턴 복제 (모듈간 결합 방지)

### 2.2 Modified: `community-stages/play.html`

#### 2.2.1 script 태그 추가

```html
<!-- 기존 -->
<script src="./relay-runtime.js"></script>
<script src="./registry.js"></script>
<script src="./likes-client.js"></script>
<!-- 추가 -->
<script src="./ranking-client.js"></script>
```

#### 2.2.2 CSS 추가 (inline `<style>` 내)

```css
/* Ranking Section */
.ranking-section {
  padding: 20px;
  border: 1px solid var(--wire);
  background: var(--surface);
  display: grid;
  gap: 12px;
}

.ranking-title {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-2);
}

.ranking-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
}

.ranking-table th {
  text-align: left;
  padding: 8px 10px;
  font-weight: 700;
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-3);
  border-bottom: 1px solid var(--wire);
}

.ranking-table td {
  padding: 8px 10px;
  color: var(--ink-2);
  border-bottom: 1px solid var(--wire);
}

.ranking-table tr[data-is-mine="true"] td {
  color: var(--ink);
  font-weight: 700;
}

.ranking-empty {
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 600;
}

/* Overlay ranking save form */
.overlay-ranking-form {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.overlay-ranking-form input {
  appearance: none;
  border: 1px solid var(--wire);
  padding: 8px 12px;
  background: var(--void);
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 0.88rem;
  width: 140px;
  text-align: center;
}

.overlay-ranking-form input:focus {
  outline: none;
  border-color: var(--wire-active);
}

.overlay-ranking-form button {
  appearance: none;
  border: 1px solid var(--ink);
  background: var(--ink);
  color: var(--void);
  padding: 8px 16px;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.overlay-ranking-form button:hover {
  background: #d0d0d0;
}

.overlay-ranking-form button:disabled {
  opacity: 0.5;
  cursor: default;
}

.overlay-ranking-status {
  margin-top: 6px;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--ink-3);
  text-align: center;
}

/* Mobile */
@media (max-width: 680px) {
  .ranking-section {
    gap: 10px;
    padding: 14px 12px;
  }
  .ranking-table { font-size: 0.72rem; }
  .ranking-table th,
  .ranking-table td { padding: 6px 8px; }
  .overlay-ranking-form input { width: 120px; font-size: 0.82rem; }
}

@media (max-width: 420px) {
  .ranking-table .ranking-col-date { display: none; }
}
```

#### 2.2.3 클리어 오버레이 HTML 변경

**기존 overlay 구조:**
```html
<div class="play-overlay-card">
  <h2 id="overlay-title"></h2>
  <p id="overlay-copy"></p>
  <div class="overlay-actions">
    <button id="play-retry">다시 플레이</button>
    <a href="./gallery.html">갤러리로</a>
  </div>
</div>
```

**변경 후:**
```html
<div class="play-overlay-card">
  <h2 id="overlay-title"></h2>
  <p id="overlay-copy"></p>
  <!-- 랭킹 저장 (클리어 시만 표시) -->
  <div id="overlay-ranking" hidden>
    <div class="overlay-ranking-form">
      <input id="ranking-name" type="text" placeholder="닉네임" maxlength="24" autocomplete="nickname" />
      <button id="ranking-save" type="button">기록 저장</button>
    </div>
    <p id="ranking-status" class="overlay-ranking-status" aria-live="polite"></p>
  </div>
  <div class="overlay-actions">
    <button id="play-retry">다시 플레이</button>
    <a href="./gallery.html">갤러리로</a>
  </div>
</div>
```

#### 2.2.4 랭킹 테이블 섹션 (프레임 아래, 댓글 위)

```html
<!-- 기존: play-frame-wrap 다음, comments-section 이전 -->
<div class="ranking-section">
  <h3 class="ranking-title">RANKING</h3>
  <div id="ranking-content">
    <p class="ranking-empty">랭킹을 불러오는 중...</p>
  </div>
</div>
```

#### 2.2.5 JS 로직

```
변수:
  lastClearDuration = null  // 마지막 클리어 시간 (durationSec)
  rankingSaved = false      // 현재 클리어에서 이미 저장했는지

RelayHost.onStageCleared(payload) 수정:
  1. 기존: overlay 표시 (CLEAR!, 클리어 메시지)
  2. 추가: lastClearDuration = payload.durationSec
  3. 추가: rankingSaved = false
  4. 추가: overlay-ranking 섹션 표시 (hidden = false)
  5. 추가: ranking-name 값 = getSavedName() (댓글 닉네임 재사용)
  6. 추가: overlayCopyEl 텍스트에 시간 포함: "{title} 클리어! ({duration}초)"

RelayHost.onStageFailed(payload) 수정:
  - overlay-ranking 섹션 숨김 (hidden = true)
  - lastClearDuration = null

ranking-save 클릭 핸들러:
  1. playerName = ranking-name.value.trim()
  2. 유효성: 2 <= length <= 24, lastClearDuration != null
  3. 버튼 disabled = true, status = "저장 중..."
  4. saveName(playerName) -- localStorage 저장 (댓글과 공유)
  5. RankingClient.saveRanking(stageId, playerName, lastClearDuration)
     .then: status = "기록이 저장되었습니다!", rankingSaved = true, refreshRankingTable()
     .catch: status = "저장에 실패했습니다. 다시 시도해 주세요."
     .finally: 버튼 disabled = false

refreshRankingTable():
  1. RankingClient.fetchRankings(stageId)
  2. 결과를 ranking-content에 렌더링
  3. 빈 경우: "아직 기록이 없습니다."

renderRankingTable(rankings):
  <table class="ranking-table">
    <thead><tr>
      <th>#</th><th>이름</th><th>시간</th><th class="ranking-col-date">날짜</th>
    </tr></thead>
    <tbody>
      rankings.map((r, i) =>
        <tr data-is-mine="{r.visitor_id === myVisitorId}">
          <td>{i+1}</td>
          <td>{escapeHtml(r.player_name)}</td>
          <td>{r.duration_sec}초</td>
          <td class="ranking-col-date">{formatDate(r.updated_at)}</td>
        </tr>
      )
    </tbody>
  </table>

페이지 초기 로드:
  - refreshRankingTable() 호출하여 진입 시 즉시 랭킹 표시

다시 플레이 (retry) 클릭:
  - overlay-ranking hidden = true
  - lastClearDuration = null
  - 기존 loadStage() 호출
```

### 2.3 Data Flow Diagram

```
                    play.html
                       │
     ┌─────────────────┼──────────────────┐
     │                 │                  │
  페이지 로드       클리어 이벤트      기록 저장 클릭
     │                 │                  │
     ▼                 ▼                  ▼
fetchRankings()   overlay 표시       saveRanking()
     │            + 닉네임 폼            │
     ▼                                   ▼
  테이블 렌더       ┌──────────┐    fetchRankings()
                    │ Supabase │         │
                    │ stage_   │         ▼
                    │ rankings │    테이블 갱신
                    └──────────┘
```

### 2.4 State Management

| Variable | Type | Initial | Mutated By |
|----------|------|---------|------------|
| `lastClearDuration` | number\|null | null | onStageCleared, onStageFailed, retry |
| `rankingSaved` | boolean | false | saveRanking success, retry |
| `myVisitorId` | string | LikesClient.getVisitorId() | (immutable) |

---

## 3. Implementation Order

| Step | Task | File | Depends On |
|------|------|------|------------|
| 1 | Supabase 테이블 + RLS 생성 | (Supabase Dashboard) | - |
| 2 | ranking-client.js 작성 | `community-stages/ranking-client.js` | Step 1 |
| 3 | play.html에 CSS 추가 | `community-stages/play.html` | - |
| 4 | play.html에 랭킹 테이블 HTML + JS 추가 | `community-stages/play.html` | Step 2, 3 |
| 5 | play.html 클리어 오버레이에 저장 UI + JS 추가 | `community-stages/play.html` | Step 2, 3 |
| 6 | 모바일/데스크톱 스크린샷 검증 | - | Step 4, 5 |

---

## 4. Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| 닉네임 미입력 (2자 미만) | 저장 버튼 비활성 또는 "닉네임을 2자 이상 입력해 주세요" |
| durationSec < 1.0 (치팅 의심) | Supabase CHECK constraint가 거부, 클라이언트에 에러 표시 |
| 이전 기록보다 느린 시간 | upsert 시 `updated_at`만 갱신되지만 `duration_sec`은 서버측에서 LEAST 비교 필요 -- 또는 클라이언트에서 기존 기록 조회 후 더 빠를 때만 저장 |
| 네트워크 오류 | "저장에 실패했습니다" 메시지, 기록은 유실 |
| 랭킹 0건 (신규 스테이지) | "아직 기록이 없습니다. 첫 번째 기록을 남겨보세요!" |
| 같은 클리어에서 중복 저장 시도 | rankingSaved 플래그로 저장 버튼 텍스트를 "저장 완료"로 변경 |

### 4.1 Best Record Upsert 전략

Supabase REST API의 `resolution=merge-duplicates`는 무조건 덮어쓴다. 최고 기록만 유지하려면 두 가지 선택:

**Option A (권장): 클라이언트 비교**
- 페이지 로드 시 fetchRankings()에서 자기 기록 확인
- saveRanking() 호출 전에 `newDuration < existingDuration` 비교
- 더 느리면 "이전 기록({existing}초)이 더 빠릅니다!" 메시지
- 더 빠르면 upsert 실행

**Option B: Supabase Function**
- DB function으로 LEAST 비교 후 저장
- 복잡도 증가, 현재 프로젝트 패턴과 불일치

→ **Option A 채택**: 클라이언트에서 비교. 단순하고 기존 패턴과 일치.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-30 | Initial draft | Claude |
