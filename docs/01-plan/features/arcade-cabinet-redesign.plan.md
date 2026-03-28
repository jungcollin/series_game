# Plan: Arcade Cabinet SVG Redesign

## Executive Summary

| Item | Detail |
|------|--------|
| Feature | arcade-cabinet-redesign |
| Created | 2026-03-27 |
| Duration | Single sprint |

### Value Delivered

| Perspective | Description |
|-------------|-------------|
| Problem | CSS radial-gradient로 그린 버튼/조이스틱이 플랫하고 뻔해서 "AI가 만든 느낌" |
| Solution | SVG 일러스트로 실제 오락기 캐비닛을 정교하게 표현. 3D 하이라이트, 소재 질감, 나사/스피커 그릴 등 디테일 포함 |
| Function UX Effect | 게임 프레임이 실제 아케이드 캐비닛 안에 있는 것처럼 보여 몰입감 상승 |
| Core Value | "이걸 CSS로 만들었어?" 수준의 완성도로 사이트 독창성 차별화 |

---

## 1. Background

현재 게임 프레임 영역은 CSS `radial-gradient`로 조이스틱과 버튼을 표현하고 있다.
원형 그라데이션으로 그린 도형은 색이 균일하고 그림자/하이라이트가 없어서
누가 봐도 "코드로 생성한" 느낌이 강하다.

사용자가 공유한 실제 아케이드 캐비닛 사진을 참고하면:
- 버튼에 오목한 상단면 + 링 베이스 + 그림자가 있음
- 조이스틱에 구형 볼탑 + 반사광(specular highlight) + 샤프트가 있음
- 패널 표면에 미세한 질감(브러시드 메탈, 매트 플라스틱)이 있음
- 나사, T-몰딩, 스피커 그릴 같은 물리적 디테일이 있음

## 2. Goal

게임 프레임 영역(`.relay-frame-shell`)의 CSS-only 캐비닛을 **SVG 일러스트 기반**으로 교체하여
실제 아케이드 캐비닛의 물리적 질감과 디테일을 표현한다.

### Non-Goals
- 각 게임 스테이지의 게임 내부 디자인 변경 (iframe 안은 건드리지 않음)
- gallery.html / launcher.html 등 게임 프레임이 없는 페이지 변경
- HTML 구조 변경 (CSS + SVG 에셋만으로 해결)

## 3. Success Criteria

1. `.relay-frame-shell` 영역이 SVG 캐비닛 일러스트로 감싸진다
2. 조이스틱: 구형 볼탑 + specular highlight + 샤프트 + 베이스 플레이트 표현
3. 버튼: 오목한 상단면 + 링 베이스 + 드롭 셰도우 표현 (최소 6개)
4. 캐비닛 디테일: 나사(4개+), 스피커 그릴, 패널 질감(noise/grain)
5. 모바일(390px)에서도 캐비닛이 깨지지 않고 비례 축소
6. CRT 효과(스캔라인, 비네팅)가 유지됨
7. `play.html`의 게임 프레임에도 동일한 CRT 스크린 처리 유지

## 4. Technical Approach

### 4.1 SVG 캐비닛 구조

```
assets/arcade-cabinet.svg
├── <defs>
│   ├── noise filter (feTurbulence) — 패널 질감
│   ├── button gradient — 오목한 3D 버튼
│   ├── joystick gradient — 구형 볼탑
│   └── metallic gradient — 금속 트림
├── cabinet-body (rect + rounded corners)
│   ├── top-bezel (screen 위 어두운 영역)
│   ├── screen-cutout (transparent rect — iframe 위치)
│   ├── control-panel (gold/amber surface)
│   │   ├── joystick-1 (ball + shaft + base)
│   │   ├── joystick-2 (ball + shaft + base)
│   │   ├── button-row-1 (3 buttons with rings)
│   │   ├── button-row-2 (3 buttons with rings)
│   │   └── panel-screws (4 corner screws)
│   ├── speaker-grill (repeating slits or holes)
│   └── front-panel (dark, below control panel)
├── t-molding (thin colored edge strip)
└── corner-screws (decorative hex bolts)
```

### 4.2 CSS 통합 방식

```css
.relay-frame-shell {
  position: relative;
  background: url('../assets/arcade-cabinet.svg') center / contain no-repeat;
  /* SVG가 전체 셸을 채움 */
  /* iframe은 padding으로 screen-cutout 위치에 정렬 */
}
```

- SVG의 screen-cutout 영역을 투명으로 두고, iframe이 그 뒤에 보이도록 배치
- CRT 효과(::before, ::after)는 `.relay-frame-wrap`에 유지
- 모바일에서는 SVG가 `contain`으로 비례 축소

### 4.3 SVG 디테일 기법

| 요소 | SVG 기법 |
|------|----------|
| 패널 질감 | `<filter>` + `feTurbulence` + `feColorMatrix` |
| 버튼 3D | `radialGradient` (중심 밝고 가장자리 어두움) + `<circle>` 중첩 |
| 볼탑 반사 | `radialGradient` + 작은 흰색 `<ellipse>` (specular) |
| 나사 | `<circle>` + 십자홈 `<line>` 2개 + 그림자 |
| 스피커 그릴 | `<pattern>` + 반복 원형 또는 슬릿 |
| T-몰딩 | `<rect>` with `linearGradient` (하이라이트 + 그림자) |
| 금속 트림 | `linearGradient` with multiple stops (반사광 시뮬레이션) |

### 4.4 파일 구조

```
assets/
  arcade-cabinet.svg       # 메인 캐비닛 일러스트 (인라인 가능)
styles.css                 # .relay-frame-shell SVG 적용
community-stages/play.html # play 프레임 CRT 효과 유지
```

## 5. Evaluation Method

- 검증 방식: 로컬 서버 + 브라우저 스크린샷 비교
- 검증 환경: `python3 -m http.server 4173` (portless alias)
- 데스크톱(1280px) + 모바일(390px) 양쪽 확인

## 6. Sprints

- [x] Sprint 1: SVG 캐비닛 일러스트 제작 + CSS 통합
  - 완료 기준:
    1. `assets/arcade-cabinet.svg` 파일 생성
    2. SVG에 버튼 6개(3D), 조이스틱 2개(specular), 나사 4개+, 스피커 그릴 포함
    3. `.relay-frame-shell`에 SVG 적용, iframe이 screen-cutout에 정렬
    4. CRT 효과(스캔라인, 비네팅) 유지
    5. 모바일 390px에서 비례 축소 확인
    6. `check_stage.js` 검증 통과
  - 변경 파일: `assets/arcade-cabinet.svg`, `styles.css`, `community-stages/play.html`

## 7. Risk

| Risk | Mitigation |
|------|------------|
| SVG 파일 크기가 커질 수 있음 | SVGO로 최적화, 불필요한 경로 제거 |
| iframe 위치 정렬이 어려울 수 있음 | padding 기반 정렬 + aspect-ratio 고정 |
| 모바일에서 디테일이 뭉개질 수 있음 | 모바일용 간소화 미디어 쿼리 대비 |
