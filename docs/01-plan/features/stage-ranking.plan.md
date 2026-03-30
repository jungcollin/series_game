# Stage Ranking Planning Document

> **Summary**: 커뮤니티 스테이지 개별 게임에 대한 랭킹 시스템 추가
>
> **Project**: One Life Relay
> **Author**: Claude
> **Date**: 2026-03-30
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 개별 스테이지를 플레이해도 기록이 남지 않아 재방문 동기가 없다. 현재 랭킹은 릴레이 전체 런만 추적한다. |
| **Solution** | play.html에서 스테이지 클리어 시 기록을 Supabase에 저장하고, 해당 스테이지의 Top 10 랭킹을 표시한다. |
| **Function/UX Effect** | 클리어 오버레이에서 닉네임 입력 후 기록 저장, 게임 프레임 아래에 랭킹 테이블 상시 표시 |
| **Core Value** | 개별 게임의 경쟁 요소를 부여하여 재플레이율과 체류 시간을 높인다 |

---

## 1. Overview

### 1.1 Purpose

play.html에서 각 커뮤니티 스테이지를 개별 플레이할 때, 클리어 시간 기반 랭킹을 기록하고 조회할 수 있게 한다.

### 1.2 Background

- 현재 `leaderboard_runs` 테이블은 릴레이 전체 런(클리어 개수 + 총 시간)만 추적
- play.html에서 개별 스테이지를 플레이하면 클리어/실패 오버레이만 표시되고 기록이 남지 않음
- 각 스테이지는 이미 `durationSec`을 `RelayHost.onStageCleared(payload)`로 보고하고 있어 인프라 준비 완료
- 투표(likes), 댓글은 이미 per-stage로 존재 -- 랭킹만 빠진 상태

### 1.3 Related Documents

- 기존 좋아요 시스템: `docs/01-plan/features/stage-gallery-likes.plan.md`

---

## 2. Scope

### 2.1 In Scope

- [ ] Supabase에 `stage_rankings` 테이블 생성
- [ ] play.html 클리어 시 닉네임 입력 + 기록 저장 UI
- [ ] play.html 게임 프레임 아래 Top 10 랭킹 테이블 표시
- [ ] 랭킹 정렬: 클리어 시간(durationSec) 오름차순
- [ ] 동일 플레이어의 최고 기록만 표시 (개인 베스트)
- [ ] 기록 저장 후 랭킹 테이블 즉시 갱신

### 2.2 Out of Scope

- 릴레이 모드(game.js) 내 per-stage 랭킹 (릴레이는 기존 전체 런 랭킹 유지)
- 인증 기반 사용자 시스템 (기존 visitor_id + 닉네임 방식 유지)
- 랭킹 삭제/관리자 기능
- gallery.html 카드에 랭킹 미리보기

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 스테이지 클리어 시 클리어 시간을 캡처한다 | High | Pending |
| FR-02 | 클리어 오버레이에 닉네임 입력 필드와 "기록 저장" 버튼을 표시한다 | High | Pending |
| FR-03 | 닉네임은 localStorage에 기억하여 다음에 자동 입력한다 | Medium | Pending |
| FR-04 | Supabase `stage_rankings` 테이블에 기록을 upsert한다 (같은 visitor+stage의 최고 기록만 유지) | High | Pending |
| FR-05 | 게임 프레임 아래, 댓글 위에 Top 10 랭킹 테이블을 표시한다 | High | Pending |
| FR-06 | 랭킹 테이블: 순위, 닉네임, 클리어 시간, 날짜 컬럼 | High | Pending |
| FR-07 | 기록 저장 후 랭킹 테이블을 즉시 재조회하여 갱신한다 | Medium | Pending |
| FR-08 | 실패(GAME OVER) 시에는 기록 저장 UI를 표시하지 않는다 | High | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | 랭킹 조회 < 500ms | Supabase REST API 응답 시간 |
| UX | 기록 저장 플로우 2클릭 이내 (닉네임 입력 + 저장) | 사용자 테스트 |
| 호환성 | 기존 투표/댓글 시스템과 충돌 없음 | play.html 통합 테스트 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] `stage_rankings` Supabase 테이블 생성 및 RLS 정책 설정
- [ ] play.html에서 스테이지 클리어 후 기록 저장 가능
- [ ] 랭킹 테이블이 정상 표시됨
- [ ] 모바일/데스크톱 반응형 동작
- [ ] 기존 투표/댓글 기능에 영향 없음

### 4.2 Quality Criteria

- [ ] 가로 오버플로 없음 (모바일 390px)
- [ ] 랭킹 테이블 빈 상태 처리 (아직 기록 없음)
- [ ] 네트워크 오류 시 사용자 피드백

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 동일 유저가 닉네임 변경으로 중복 기록 | Low | Medium | visitor_id 기준 upsert로 최고 기록만 유지 |
| 치팅 (비정상적 클리어 시간) | Medium | Low | 최소 시간 임계값 설정 (예: 1초 미만 거부), Supabase RLS check |
| play.html inline CSS 비대화 | Low | High | 랭킹 관련 CSS를 최소한으로 추가 |

---

## 6. Architecture Considerations

### 6.1 Project Level

이 프로젝트는 static HTML + Supabase REST API 구조. 프레임워크 없는 바닐라 JS.

### 6.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| DB 테이블 | 새 테이블 vs leaderboard_runs 확장 | **새 테이블 `stage_rankings`** | 릴레이 런과 개별 스테이지 기록은 성격이 다름 |
| 기록 저장 | visitor_id별 전체 기록 vs 최고 기록만 | **최고 기록만 (upsert)** | 테이블 크기 관리 + 랭킹 의미 명확 |
| 닉네임 | 별도 입력 vs 댓글 닉네임 공유 | **댓글 닉네임 공유** | 이미 `one-life-relay-comment-name` localStorage 키 사용 중 |
| API 클라이언트 | likes-client.js 확장 vs 별도 모듈 | **별도 `ranking-client.js`** | 단일 책임 원칙, likes와 독립적 |
| 랭킹 표시 위치 | 게임 프레임 내부 vs 프레임 아래 | **프레임 아래 (댓글 위)** | iframe 바깥이므로 항상 접근 가능 |

### 6.3 Supabase 테이블 설계

```sql
CREATE TABLE stage_rankings (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stage_id    TEXT NOT NULL,
  visitor_id  TEXT NOT NULL,
  player_name TEXT NOT NULL CHECK (char_length(player_name) BETWEEN 2 AND 24),
  duration_sec NUMERIC(8,1) NOT NULL CHECK (duration_sec >= 1.0),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (stage_id, visitor_id)
);

-- 인덱스
CREATE INDEX idx_stage_rankings_stage_id ON stage_rankings (stage_id, duration_sec ASC);

-- RLS
ALTER TABLE stage_rankings ENABLE ROW LEVEL SECURITY;
-- 누구나 조회
CREATE POLICY "Public read" ON stage_rankings FOR SELECT USING (true);
-- Anon 삽입/업데이트 (자기 visitor_id만)
CREATE POLICY "Anon upsert" ON stage_rankings FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon update own" ON stage_rankings FOR UPDATE USING (true);
```

### 6.4 API 엔드포인트 설계

```
GET  /rest/v1/stage_rankings?stage_id=eq.{id}&order=duration_sec.asc&limit=10
POST /rest/v1/stage_rankings  (Prefer: return=representation,resolution=merge-duplicates)
     on_conflict: stage_id, visitor_id
     body: { stage_id, visitor_id, player_name, duration_sec }
```

### 6.5 데이터 흐름

```
스테이지 iframe
  → RelayHost.onStageCleared({ stageId, durationSec })
  → play.html: 클리어 오버레이 + 닉네임 입력
  → "기록 저장" 클릭
  → ranking-client.js: upsert to stage_rankings
  → 성공 시: 랭킹 테이블 재조회 + 갱신
```

### 6.6 UI 배치

```
┌──────────────────────────────────────┐
│ Navbar (STAGES active)               │
├──────────────────────────────────────┤
│ Topbar: Title / Votes                │
├──────────────────────────────────────┤
│ Game iframe                          │
│  ┌──── Clear Overlay ────┐           │
│  │ CLEAR! 12.3초         │           │
│  │ 닉네임: [____] [저장]  │           │
│  │ [다시 플레이] [갤러리]  │           │
│  └───────────────────────┘           │
├──────────────────────────────────────┤
│ RANKING (Top 10)                     │  ← NEW
│ #  이름      시간     날짜           │
│ 1  player1   8.2초   03.30          │
│ 2  player2   12.3초  03.30          │
│ ...                                  │
├──────────────────────────────────────┤
│ Comments                             │
└──────────────────────────────────────┘
```

---

## 7. Convention Prerequisites

### 7.1 Existing Conventions

- [x] Supabase REST API 패턴 (`likes-client.js` 참조)
- [x] localStorage 키 네이밍: `one-life-relay-*`
- [x] HTML 이스케이프: `escapeHtml()` 함수
- [x] 투표/댓글과 동일한 visitor_id 체계
- [x] 반응형 breakpoints: 680px, 420px

### 7.2 New Files

| File | Purpose |
|------|---------|
| `community-stages/ranking-client.js` | 랭킹 API 클라이언트 (fetch/save) |

### 7.3 Modified Files

| File | Changes |
|------|---------|
| `community-stages/play.html` | 클리어 오버레이에 닉네임+저장 UI, 랭킹 테이블 섹션, ranking-client.js 로드 |

---

## 8. Next Steps

1. [ ] Design 문서 작성 (`stage-ranking.design.md`)
2. [ ] Supabase 테이블 생성 (수동)
3. [ ] `ranking-client.js` 구현
4. [ ] `play.html` UI 통합
5. [ ] 모바일/데스크톱 검증

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-30 | Initial draft | Claude |
