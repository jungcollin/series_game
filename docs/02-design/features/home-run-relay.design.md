# Design: Home Run Relay

## Executive Summary

| Item | Detail |
|------|--------|
| Feature | home-run-relay |
| Stage Slug | `home-run-relay` |
| Created | 2026-03-20 |
| Author | jungcollin |
| Type | Community relay stage |

### Value Delivered

| Perspective | Description |
|-------------|-------------|
| Problem | 기존 스테이지는 피하기/점프 중심이 많고, 정밀한 위치 판정과 타이밍 판정을 동시에 요구하는 스포츠형 스테이지가 없음 |
| Solution | 2.5D 야구 타격 스테이지를 추가해 클릭/터치 위치 지정과 별도 스윙 타이밍 입력을 조합한 고난도 홈런 챌린지를 제공 |
| Function UX Effect | 플레이어는 타자 뒤 3인칭 시점에서 낙하지점을 읽고, 배트를 정확한 위치로 이동한 뒤 이상적인 타이밍에 스윙해야만 홈런을 만들 수 있음 |
| Core Value | 높은 판독성, 엄격한 판정, 공정한 난이도 상승 |

---

## 1. Stage Definition

### 1.1 Fixed Metadata

| Field | Value |
|------|-------|
| `title` | `Home Run Relay` |
| `creator` | `jungcollin` |
| `creator-github` | `jungcollin` |
| `genre` | `sports / precision batting` |
| `controls` | `마우스/터치로 배트 위치 지정, Space/클릭/화면 버튼으로 스윙, Enter로 시작/재시작` |
| `clear-condition` | `총 5구 안에 홈런 3개를 치면 클리어` |
| `fail-condition` | `5구 종료 시 홈런 3개 미만이면 실패` |

### 1.2 Player Promise

- 화면은 타자 뒤 3인칭 시점으로 고정한다.
- 투구 직후부터 착지 예상 위치 마커를 계속 표시한다.
- 플레이어는 배트 위치와 스윙 타이밍을 각각 직접 맞춘다.
- 홈런은 "거의 정확한 위치 + 거의 정확한 타이밍"일 때만 허용한다.
- 조금 어긋나면 안타, 많이 어긋나면 파울로 처리한다.
- 공을 하나씩 성공할수록 변화구, 속도, 투수 폼이 추가되어 난이도가 올라간다.

---

## 2. Experience Goals

### 2.1 Game Feel

- 첫 공은 규칙을 이해하는 학습 구간이어야 한다.
- 두 번째 홈런부터는 읽기 쉬운 정보는 유지하되 실행 난도만 상승해야 한다.
- 실패는 억울함보다 "조금 늦었다" 또는 "조금 빗맞았다"로 해석되어야 한다.
- 390px 모바일 폭에서도 조준 버튼, 스윙 버튼, 결과 오버레이가 가로로 넘치지 않아야 한다.

### 2.2 Visual Direction

- 2.5D 의사 3D 방식으로 구현한다.
- 경기장은 원근이 느껴지는 다이아몬드와 외야 벽, 마운드, 타석을 가진다.
- 투수/타자/배트/공은 깊이감을 가진 단순 지오메트리로 렌더링한다.
- 낙하지점 마커는 필드 위에 밝은 링 형태로 유지한다.
- 홈런 타구는 카메라 쉐이크, 타구 궤적 강조, 관중/조명 플래시로 보상한다.

---

## 3. System Architecture

### 3.1 Runtime Shape

단일 파일 스테이지로 구성한다.

```text
community-stages/home-run-relay/
├── index.html      # 게임 UI, 렌더링, 로직
└── meta.json       # stage metadata
```

### 3.2 Major Modules Inside `index.html`

| Module | Responsibility |
|--------|----------------|
| Stage shell | 시작/실패/클리어 카드, HUD, 모바일 버튼, 접근성 설명 |
| Renderer | 2D canvas 위에 원근 투영을 적용한 2.5D 장면 렌더링 |
| Pitch sequencer | 5구 시퀀스, 구종/속도/폼/난이도 증가 관리 |
| Bat control | 클릭/터치 위치를 배트 목표 좌표로 변환, 보간 이동 |
| Swing judge | 위치 오차 + 시간 오차를 계산해 홈런/안타/파울 판정 |
| Stage contract | Relay host 연동, 결과 상태, debug API |

### 3.3 Why 2.5D Instead of Full 3D

- 완전한 3D 엔진 없이도 "타자 뒤 3인칭"과 깊이감을 충분히 줄 수 있다.
- 판정은 월드 좌표 기준으로 일관되게 유지하고, 시각 효과만 원근 투영으로 분리할 수 있다.
- 모바일 브라우저에서 성능과 디버깅 비용이 낮다.
- 기존 저장소의 단일 HTML 스테이지 패턴과 맞는다.

---

## 4. Gameplay Design

### 4.1 Core Loop

1. 메뉴 카드에서 조작법, 클리어 조건, 실패 조건을 읽고 시작한다.
2. 투수가 준비 동작을 취한다.
3. 릴리스 직후 공이 날아가고, 낙하지점 마커가 필드 위에 유지된다.
4. 플레이어는 클릭/터치로 배트 위치를 옮긴다.
5. 공이 임팩트 존에 들어오는 순간 스윙한다.
6. 판정 결과를 홈런/안타/파울로 표시하고 다음 투구로 넘어간다.
7. 5구 내 홈런 3개면 클리어, 그렇지 않으면 실패한다.

### 4.2 Input Model

#### Desktop

- 마우스 이동 또는 클릭 위치를 기준으로 배트의 좌우/상하 목표점을 정한다.
- `Space` 또는 캔버스 클릭으로 스윙한다.
- `Enter`로 시작/재시작한다.

#### Mobile

- 타격 존 아래에 `좌`, `중앙`, `우` 보조 버튼과 `스윙` 버튼을 제공한다.
- 필드 직접 터치도 허용해 배트 위치를 지정한다.
- 버튼 크기는 최소 56px 이상으로 유지한다.

### 4.3 Spatial Model

- 월드 좌표는 `x`(좌우), `y`(높이), `z`(투수→타자 깊이)로 관리한다.
- 공은 투수 릴리스 지점에서 타격 존까지 보간/곡선 이동한다.
- 배트는 실제 스윙 순간에만 충돌면을 가진다.
- 낙하지점 마커는 공의 목표 `x/z`를 시각적으로 투영한 고정 링이다.

---

## 5. Shot Progression

### 5.1 Match Structure

- 총 투구 수: 5
- 클리어: 홈런 3개 이상
- 결과 종류: `home_run`, `single`, `foul`
- 안타와 파울은 진행은 되지만 클리어 카운트에는 포함되지 않는다.

### 5.2 Per-Pitch Difficulty Plan

| Pitch | Pattern | Difficulty Change |
|------|---------|-------------------|
| 1 | 기본 오버핸드 직구 | 규칙 학습용. 가장 읽기 쉬운 속도와 폼 |
| 2 | 구속 상승 직구 | 타이밍 오차 허용 범위 압박 시작 |
| 3 | 낙차 큰 변화구 | 위치와 높이 보정 요구 |
| 4 | 반대손 투구 | 릴리스 방향 반전으로 읽기 교란 |
| 5 | 뒤로 물러난 뒤 던지는 딜레이 폼 + 빠른 공 | 준비 동작과 릴리스 타이밍 모두 흔듦 |

### 5.3 Escalation Rules

- 홈런 또는 안타가 나올수록 다음 투구에서 시각적 속도 체감과 폼 변화량을 증가시킨다.
- 파울은 읽기 실패로 간주하되, 다음 공 난이도는 그대로 유지한다.
- 마지막 공은 항상 가장 극적인 폼을 사용한다.

---

## 6. Hit Judgment

### 6.1 Inputs to Judge

판정은 아래 두 값으로 계산한다.

- `position_error`: 스윙 시점의 배트 중심과 이상적인 임팩트 좌표의 거리
- `timing_error_ms`: 스윙 시점과 이상적인 임팩트 시점 차이

### 6.2 Outcome Bands

초기 수치는 구현 시 소폭 미세조정 가능하지만, 범주 자체는 고정한다.

| Result | Position Error | Timing Error | Meaning |
|--------|----------------|--------------|---------|
| Home run | 매우 작음 | 매우 작음 | 거의 완벽한 위치와 타이밍 |
| Single | 작거나 중간 | 작거나 중간 | 조금 빗맞았지만 인플레이 |
| Foul | 큼 또는 매우 큼 | 큼 또는 매우 큼 | 많이 벗어난 접촉 |

### 6.3 Recommended Numeric Defaults

| Result | Position Threshold | Timing Threshold |
|--------|--------------------|------------------|
| Home run | `<= 0.28` world units | `<= 55ms` |
| Single | `<= 0.62` world units | `<= 130ms` |
| Foul | 그 외 모든 접촉 | 그 외 |

### 6.4 Non-Contact Rule

- 배트가 임팩트 프레임에 충돌면을 갖지 못했으면 자동 파울 처리한다.
- 너무 이른 스윙 또는 너무 늦은 스윙도 파울로 간주한다.
- 매 샷 후 결과 패널에 `타이밍 빠름/늦음`, `위치 좌/우/위/아래` 힌트를 짧게 보여준다.

---

## 7. State Machine

```text
menu
  -> running_intro
  -> pitch_active
  -> result_pause
  -> pitch_active (next pitch)
  -> cleared | failed
```

### 7.1 State Responsibilities

| State | Description |
|-------|-------------|
| `menu` | 조작법, 목표, 실패 조건 표시 |
| `running_intro` | 투수 준비 모션, HUD 초기화 |
| `pitch_active` | 공 비행, 배트 이동, 스윙 입력 허용 |
| `result_pause` | 판정 결과 텍스트, 다음 공 준비 |
| `cleared` | 홈런 3개 달성, host clear report |
| `failed` | 5구 종료 시 조건 미달, host fail report |

---

## 8. Rendering Plan

### 8.1 Camera and Projection

- 카메라는 타자 뒤 상단에 고정한다.
- 월드 좌표를 단순 원근 투영해 화면 좌표로 변환한다.
- 타자, 배트, 공, 투수, 마운드, 외야 벽 모두 동일한 투영 함수 사용한다.

### 8.2 Animated Elements

- 투수: 대기, 와인드업, 릴리스, 팔로스루
- 배트: 이동 대기, 스윙, 복귀
- 공: 직선형 또는 베지어 기반 궤적
- 결과 연출: 홈런 플래시, 안타 라인드라이브, 파울 측면 궤적

### 8.3 Reduced Motion

- `prefers-reduced-motion`에서는 카메라 쉐이크와 과한 플래시를 줄인다.
- 결과는 색상만이 아니라 텍스트 라벨로도 표현한다.

---

## 9. UI and Accessibility

### 9.1 Required UI

- 시작 카드: 조작법, 클리어 조건, 실패 조건
- 상단 HUD: 현재 구수, 홈런 수, 남은 기회
- 하단 보조 입력: 모바일용 위치 버튼 + 스윙 버튼
- 결과 토스트: `홈런`, `안타`, `파울`과 간단한 오차 피드백

### 9.2 Accessibility Rules

- `skip-link` 유지
- 캔버스 `aria-label`과 숨김 조작 설명 유지
- 모바일 버튼은 실제 `button` 요소 사용
- 포커스 링 제거 금지
- 카드/오버레이는 390px 폭에서도 가로 스크롤 없이 읽혀야 함

---

## 10. Relay Contract

다음 계약을 기존 스테이지와 동일하게 제공한다.

```js
window.render_game_to_text()
window.advanceTime(ms)
window.relayStageMeta = { id, title, creator, genre, clearCondition }
window.relayStageResult = { status: "running" | "cleared" | "failed" }
window.relayStageDebug = { forceClear(), forceFail() }
parent.RelayHost.onStageCleared(...)
parent.RelayHost.onStageFailed(...)
```

### 10.1 Text Render Contract

`window.render_game_to_text()`는 최소 아래 정보를 반환해야 한다.

- 현재 상태: menu / running / cleared / failed
- 현재 투구 번호
- 홈런 수
- 마지막 판정 결과
- 다음 공 난이도 설명

---

## 11. Error Handling

- 리사이즈 시 투영값과 HUD 배치를 다시 계산한다.
- 입력 좌표가 캔버스 밖이면 가장 가까운 유효 타격 존으로 clamp 한다.
- 결과 판정 중복 보고를 막기 위해 clear/fail host report는 1회만 허용한다.
- 프레임 드롭 시 `MAX_DT` 고정 갱신으로 급격한 판정 붕괴를 막는다.

---

## 12. Testing Strategy

### 12.1 Functional Checks

- 메뉴에서 시작 가능
- 5구 중 3홈런 시 클리어
- 5구 종료 후 3홈런 미만이면 실패
- 홈런/안타/파울이 위치/타이밍 오차에 따라 구분됨
- 투수 폼과 구속 변화가 투구별로 적용됨

### 12.2 Integration Checks

- `node relay-tools/scripts/check_stage.js --stage home-run-relay --base-url http://127.0.0.1:4173`
- UI 변경 범위에 포함되므로 `node relay-tools/scripts/check_host_flow.js --base-url http://127.0.0.1:4173 --mobile`

### 12.3 Visual Checks

- 모바일 `menu / running / failed` 스크린샷에서 가로 오버플로 없음
- 타격 마커와 배트 위치가 작은 화면에서도 동시에 보임
- 홈런 연출이 과도한 레이아웃 이동 없이 끝남

---

## 13. Open Implementation Notes

- 공 궤적 데이터는 각 투구별 파라미터 객체로 정의해 디버깅하기 쉽게 만든다.
- 판정 수치는 첫 구현 후 `/check-stage` 결과를 보며 미세조정할 수 있다.
- 풀 3D 엔진 도입은 현재 범위에서 제외한다.
