# Design: Relay Stage Quality Improvement

## Executive Summary

| Item | Detail |
|------|--------|
| Feature | relay-stage-quality-improvement |
| Created | 2026-03-22 |
| Plan Reference | `docs/01-plan/features/relay-stage-quality-improvement.plan.md` |
| Status | Draft |

### Value Delivered

| Perspective | Description |
|-------------|-------------|
| Problem | ~97개 릴레이 스테이지의 획일적 네온 비주얼, 과도한 장식, 비대한 HUD |
| Solution | 20개 대표 선정 + 비주얼 리디자인 + 코드 다이어트 + 77개 정리 |
| Function UX Effect | 각 게임이 고유 비주얼과 느낌을 가지며 "또 같은 게임" 탈피 |
| Core Value | 양보다 질 — 고퀄리티 20개로 갤러리 신뢰도 향상 |

---

## 1. 대표 스테이지 선정 목록 (확정)

### 1.1 전체 선정 (20개 유지 / 77개 제거)

| # | 메커닉 | 1순위 | 모디파이어 | 2순위 | 모디파이어 |
|---|--------|------|-----------|------|-----------|
| 1 | pulse-fencing | paper-temple | shrink | midnight-harbor | tempo |
| 2 | debt-auction | biomech-theater | collapse | neon-observatory | witness |
| 3 | weather-mixing | dusk-subway | collapse | moon-greenhouse | cursed |
| 4 | tide-anchoring | dream-motel | cursed | paper-temple | collapse |
| 5 | echo-weaving | storm-archive | witness | dusk-subway | inverse |
| 6 | magnet-braiding | dusk-subway | sync | moon-greenhouse | inverse |
| 7 | shadow-stitch | paper-temple | witness | glass-aquarium | collapse |
| 8 | mirror-theft | crystal-foundry | collapse | glass-aquarium | inverse |
| 9 | gravity-folding | neon-observatory | charge | crystal-foundry | cursed |
| 10 | orbit-herding | glass-aquarium | witness | paper-temple | cursed |

### 1.2 제거 대상 (77개)

registry.js에서 제거하고 디렉토리를 삭제한다. 필요 시 git history에서 복원 가능.

---

## 2. 비주얼 리디자인 명세

### 2.1 레퍼런스: memory-dodge 비주얼 패턴

memory-dodge를 퀄리티 기준으로 삼는다. 핵심 패턴:

```
배경:     단일 radial gradient (#0f172a → #1e293b), 2줄
색상:     cool (#3b82f6 blue), danger (#ef4444 red), safe (#22c55e green) — 3색
폰트:     "Trebuchet MS", 기본 weight/size 변형만 사용
shadowBlur: 플레이어 glow + 존 glow — 2곳만
HUD:      상단 바 1개 (시간 + 난이도) — 2개 값
오버레이:  흰색 카드 + 컬러 보더 accent, renderCard() 패턴
파일 크기: 665줄
```

### 2.2 장소별 고유 색상 팔레트

각 장소에 네온이 아닌 고유 색상 정체성을 부여한다. 장소당 3색 (primary, secondary, danger).

| 장소 | primary | secondary | danger | 테마 키워드 |
|------|---------|-----------|--------|------------|
| paper-temple | `#d4a574` warm gold | `#f5e6d3` cream | `#c0392b` vermillion | 한지, 먹, 붓글씨 |
| midnight-harbor | `#2c3e50` dark navy | `#5dade2` harbor blue | `#e74c3c` signal red | 항구 조명, 안개, 등대 |
| biomech-theater | `#6c3483` deep purple | `#aed6f1` surgical blue | `#e67e22` amber alert | 유기체, 수술실, 금속 |
| neon-observatory | `#1a1a2e` midnight | `#e6e6fa` lavender | `#ff6b6b` coral | 별빛, 망원경, 천체도 |
| dusk-subway | `#c0785c` sunset clay | `#f4e4ba` platform cream | `#8b0000` emergency red | 석양, 플랫폼, 타일 |
| moon-greenhouse | `#2d5016` forest green | `#b8d4a3` leaf light | `#d4a017` amber | 달빛, 식물, 유리온실 |
| dream-motel | `#4a1942` plum | `#d4a5c7` dusty rose | `#ff4757` hot pink | 네온사인(1개만), 모텔 |
| storm-archive | `#1c2833` charcoal | `#aab7b8` steel gray | `#f39c12` lightning gold | 번개, 금속 선반, 문서 |
| crystal-foundry | `#1b4332` dark teal | `#a8dadc` ice blue | `#e76f51` forge orange | 수정, 주조, 용광로 |
| glass-aquarium | `#023e8a` deep ocean | `#90e0ef` shallow water | `#d00000` warning red | 수중, 유리, 기포 |

### 2.3 비주얼 변환 규칙 (Before → After)

모든 선정 스테이지에 일괄 적용:

#### R1. 배경 (drawBackdrop)
```
Before: 30~60줄 (radial gradients 2~3개 + light shafts + ring arcs + spoke lines + animated stars)
After:  단일 radial/linear gradient + 장소별 앰비언트 요소 1개 (최대 10줄)

앰비언트 예시:
  paper-temple  → 느린 잉크 번짐 효과 (1개 반투명 원)
  midnight-harbor → 수면 반사 라인 1개
  storm-archive → 먼 번개 flash (간헐적)
```

#### R2. 색상
```
Before: CSS 변수 5~6개 네온 색상
After:  장소별 팔레트 3색 (2.2 테이블 참조)
        shadowBlur 허용: 플레이어 + 위험 요소 — 최대 2개
        나머지 요소: shadowBlur 제거, flat 렌더링
```

#### R3. 오버레이 카드 (메뉴/실패/클리어)
```
Before: 그라디언트 보더 + 글래스모피즘 + 뱃지 그리드
After:  memory-dodge renderCard() 패턴 채택

renderCard(title, lines) {
  // 반투명 배경 + 단색 상단 보더
  // 제목 (bold, 큰 사이즈)
  // 본문 라인 (일반 사이즈)
  // 하단 액션 프롬프트
}

메뉴 카드 내용:
  - 제목 (게임 이름)
  - 설명 1줄
  - 조작법 1줄
  - 클리어/실패 조건 각 1줄
  - "TAP or ENTER" 시작 프롬프트
```

#### R4. HUD
```
Before: 4~8개 패널 (combo, breaks, amplify bar, timer, round, heat, gauge...)
After:  상단 바 1개에 최대 4개 값

필수 값: 타이머 (or 진행도)
선택 값: 메커닉 핵심 지표 1~2개 + 모디파이어 상태 1개

예시 (pulse-fencing-shrink):
  [Timer: 23s] [Streak: 12/20] [Safe Zone: 72%]

예시 (debt-auction-collapse):
  [Wave: 3/5] [Core: ██████░░] [Collapse: 45%]
```

#### R5. 폰트
```
Before: "Avenir Next Condensed", letter-spacing: 2px, uppercase transforms
After:  "Trebuchet MS", "Segoe UI", sans-serif
        크기: title 28px / body 16px / label 13px
        weight: bold(title), normal(body)
        transform: none (uppercase 제거)
```

#### R6. 고유 정체성 요소
```
각 장소에 1개의 특징적 비주얼 요소를 추가한다.
네온 glow가 아닌, 장소를 연상시키는 구체적 오브젝트.

paper-temple   → 붓터치 스타일 경계선, 한지 텍스처 배경
midnight-harbor → 등대 실루엣, 수면 반사
biomech-theater → 유기적 곡선 배경 요소, 맥박 라인
neon-observatory → 별자리 점선, 천체 궤도 링 (장식이 아닌 게임 영역 표시)
dusk-subway    → 플랫폼 바닥선, 열차 실루엣 배경
moon-greenhouse → 달 실루엣, 식물 줄기 라인
dream-motel    → 모텔 간판 (dream-motel-debt-auction-heat의 건물 참조)
storm-archive  → 번개 flash, 선반 실루엣
crystal-foundry → 수정 파편 장식, 용광로 glow
glass-aquarium → 기포 파티클, 유리 프레임
```

---

## 3. 코드 다이어트 명세

### 3.1 삭제 대상 함수/코드 패턴

| 패턴 | 현재 줄 수 | 삭제 후 | 비고 |
|------|-----------|--------|------|
| `drawBackdrop()` 장식 코드 | 30~60줄 | 5~10줄 | R1 적용 |
| 복수 CSS 변수 네온 색상 | 10~15줄 | 3줄 | R2 적용 |
| 글래스모피즘 오버레이 | 40~80줄 | 15~20줄 | R3 renderCard 패턴 |
| 과잉 HUD 패널 렌더링 | 30~60줄 | 10~15줄 | R4 적용 |
| 다중 shadowBlur 설정 | 산재 | 2곳만 | R2 적용 |
| 미사용 glyph/sigil 커스텀 드로잉 | 20~40줄 | 유지/간소화 | 게임플레이 필수면 유지 |

### 3.2 유지 대상 (절대 삭제 금지)

- 게임 로직 (state machine, update, collision)
- 모디파이어 메커닉 코드
- relay-runtime 연동 (reportFailed/Cleared/Ready)
- 접근성 셸 (skip-link, sr-only, aria, reduced-motion)
- 모바일 컨트롤 div
- relayStageMeta / relayStageResult

### 3.3 타겟 파일 크기

| 카테고리 | 현재 | 목표 |
|---------|------|------|
| 단순 메커닉 (pulse-fencing, mirror-theft) | 1,200~1,500줄 | 600~800줄 |
| 복잡 메커닉 (debt-auction, weather-mixing) | 1,700~2,100줄 | 800~1,000줄 |

---

## 4. 미선정 스테이지 정리 절차

### 4.1 순서

1. `registry.js`에서 77개 미선정 스테이지 엔트리 제거
2. `community-stages/` 아래 77개 디렉토리 삭제
3. `sync_registry.js` 실행하여 registry 정합성 확인
4. 갤러리 페이지에서 미노출 확인

### 4.2 registry.js 수정

유지 대상 20개 + 기존 독립 게임 ~22개 = 총 ~42개 스테이지만 남긴다.

### 4.3 복원 정책

- git history에서 언제든 복원 가능
- 별도 백업 불필요

---

## 5. 파일럿 실행 명세

### 5.1 파일럿 대상

**paper-temple-pulse-fencing-shrink** (1순위 선정)

선정 이유:
- pulse-fencing 중 가장 독특한 메커닉 (반경 이동 + 시간 제한)
- paper-temple은 한지/먹/붓글씨 테마로 네온과 가장 대비됨
- 리디자인 효과가 가장 극적으로 드러날 장소

### 5.2 파일럿 변환 체크리스트

- [ ] 배경: 현재 장식 코드 → 한지 텍스처 느낌 단일 그라디언트 + 붓터치 앰비언트
- [ ] 색상: 네온 5~6색 → warm gold / cream / vermillion 3색
- [ ] shadowBlur: 전체 제거 → 플레이어 + shrink 경계선 2곳만
- [ ] 오버레이: 글래스모피즘 → renderCard() 패턴 (cream 배경 + gold 보더)
- [ ] HUD: 과잉 패널 → [Timer] [Streak: N/20] [Safe Zone: N%] 3개
- [ ] 폰트: 과도한 스타일 → Trebuchet MS 기본
- [ ] 고유 요소: 붓터치 스타일 경계선 추가
- [ ] 코드 크기: 현재 줄 수 → 600~800줄 타겟
- [ ] /check-stage 통과

### 5.3 파일럿 성공 기준

- [ ] memory-dodge와 나란히 놓았을 때 퀄리티 격차 없음
- [ ] "paper-temple"이라는 장소 정체성이 시각적으로 명확
- [ ] 게임플레이에 영향 없음 (모디파이어 동작 동일)
- [ ] 모바일 390px에서 HUD 오버플로 없음

---

## 6. 구현 순서

| Step | 작업 | 입력 | 산출물 | 검증 |
|------|------|------|--------|------|
| 1 | paper-temple-pulse-fencing-shrink 파일럿 리디자인 | 현재 index.html | 리디자인된 index.html | /check-stage |
| 2 | 파일럿 리뷰 (사용자 확인) | 브라우저 확인 | 방향 확정 or 수정 요청 | — |
| 3 | 나머지 19개 리디자인 | 파일럿 패턴 적용 | 19개 수정된 index.html | /check-stage 각각 |
| 4 | 77개 미선정 스테이지 삭제 | 선정 목록 | 정리된 registry.js + 디렉토리 삭제 | sync_registry.js |
| 5 | 전체 갤러리 확인 | — | 최종 검증 리포트 | check_host_flow.js |

---

## 7. 의존성

| 의존 대상 | 용도 | 비고 |
|----------|------|------|
| memory-dodge/index.html | renderCard, 색상 패턴, HUD 패턴 레퍼런스 | 수정하지 않음 |
| relay-runtime.js | 스테이지 라이프사이클 | 수정하지 않음 |
| registry.js | 스테이지 등록/제거 | Step 4에서 수정 |
| check_stage.js | 파일럿/전체 검증 | 기존 스크립트 활용 |
| sync_registry.js | 레지스트리 동기화 | 정리 후 실행 |
