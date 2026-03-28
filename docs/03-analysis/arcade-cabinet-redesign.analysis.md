# Arcade Cabinet Redesign - Gap Analysis

> Date: 2026-03-27 | Analyst: gap-detector

## Match Rate: 90%

| Category | Score | Status |
|----------|:-----:|:------:|
| Design Match | 90% | PASS |
| SVG Craftsmanship | 95% | PASS |
| Mobile Responsive | 95% | PASS |
| CRT Effect Parity | 100% | PASS |
| **Overall** | **90%** | **PASS** |

## Success Criteria

| # | Criterion | Result | Evidence |
|---|-----------|:------:|----------|
| SC-1 | `.relay-frame-shell` SVG 캐비닛 | CHANGED | SVG는 `::after` 컨트롤 패널에 적용. 캐비닛 본체는 CSS (gradient + gold border). 동일한 시각적 결과 달성 |
| SC-2 | 조이스틱: 볼탑 + specular + 샤프트 + 베이스 | PASS | 2개. 각각 `radialGradient` 볼, 2개 `<ellipse>` specular, `linearGradient` 샤프트, base plate + 내부 링 |
| SC-3 | 버튼: 오목면 + 링 + 드롭 셰도우 (6개+) | PASS | 6개 (3R+1W+2B). 각각 ring + concave inner + `#well` inset filter + `#ds` drop shadow |
| SC-4 | 나사(4+), 스피커 그릴, 패널 질감 | PASS | 나사 12개, 듀얼 레이어 스피커 그릴 패턴, `feTurbulence` 노이즈 필터 |
| SC-5 | 모바일(390px) 비례 축소 | PASS | SVG `viewBox` + CSS `aspect-ratio` 3단계 반응형 |
| SC-6 | CRT 효과 유지 | PASS | 스캔라인 + 비네팅 동일 파라미터 |
| SC-7 | play.html CRT 처리 유지 | PASS | 동일한 스캔라인/비네팅 파라미터 확인 |

**7/7 criteria functionally satisfied. 1 via changed approach.**

## SVG Detail Audit

| Element | Count |
|---------|:-----:|
| 3D 버튼 (concave) | 6 |
| 조이스틱 (specular) | 2 |
| 나사 (cross-slot) | 12 |
| 스피커 그릴 (dual-pattern) | 1 |
| Noise/grain 필터 | 1 |
| T-몰딩 | 1 |
| SVG gradients | 11 |
| SVG filters | 3 |
| SVG patterns | 2 |

## Verdict

Match Rate >= 90%. Iteration 불필요. `/pdca report` 진행 가능.
