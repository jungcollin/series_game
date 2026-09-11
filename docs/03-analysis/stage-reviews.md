# 20개 예비 검수 (SG-011)

원본: `content/reviews.json`

방법: 정적 게이트(파일 존재, RelayStageHost, 터치/포인터 언급)와 소스 읽기. **사람 플레이와 실기기 재미 검수는 하지 않았다.**

- 예비 공식 후보: 현 데일리 5 + 다양성 9 = 14
- 개선 후보(공식 풀 제외, P3): echo-twins, signal-triangulator, orbital-dock, storm-cargo-crane, command-deck, pottery-wheel
- 최종 승인·격리 전환은 SG-013에서 부분만 수행했다. 예비 판정을 출시 승인으로 쓰지 않는다.

## P3 보강 (2026-09-09)

6개 개선 후보의 검수 질문에 대응하는 보강을 적용했다. 사람 재미 검수 전이므로 공식 풀 복귀는 아니며, 상세는 `content/reviews.json`의 `p3Reinforced`를 본다.

- echo-twins: 규칙 문구 불일치(5초/3개 문) 수정, 상태 연동 인게임 힌트 추가
- signal-triangulator: 지연 거리 원 시각화로 관측 의미 부여. 7개 시드 유일해·교란 안전 수치 검증
- orbital-dock: 도킹 허용 속도·각도 실시간 판정 표시. 키보드/터치 양쪽 입력 성공 재현
- storm-cargo-crane: 예측 착지점 마커로 선택→결과 인과 가시화. 침착/난폭 투하 결과 재현
- command-deck: 실행 전 예측 경로·도착점·벽 충돌 표시. 구역 수 불일치(4→3) 수정
- pottery-wheel: 배율 보정 증분 드래그로 모바일 정밀 조작 확보, 성형 슬라이스 피드백

검증: 6개 스테이지 `check_stage.js` 통과(모바일 menu/running/failed·오버플로 없음), `npm test` 67/67, `build_catalog.js --check` 통과. 실기기 재미 검수는 미실행.

## v1 레거시 분류 (2026-09-09)

2026-09-09 이전 게시된 145개 스테이지 전체를 v1 레거시(커뮤니티 테스트 기여작)로 묶었다. 이들은 빡빡한 검수 없이 참여로 만들어진 스테이지이므로 검수 면제로 갤러리에 유지한다. 공식 데일리 편성은 변함없이 예비 합격 풀만 사용한다. 카탈로그 `generation` 필드와 갤러리 버전 필터/배지로 구분하며, 이후 신규 스테이지는 v2로 `/check-stage` 검수가 필수다.

데일리/랜덤 풀은 `daily-rules.json`의 `v2OnlyWhenPoolAtLeast`(현재 10)로 자동 전환된다. officialEligible인 v2 스테이지가 10개 이상이고 하루 슬롯·메커닉 다양성을 채울 수 있으면 풀이 v2로 제한되고, 그 전까지는 예비 합격 풀(v1 포함)을 유지한다.

## v2 고퀄 110종 공식 편성 (2026-09-12)

운영자 승인으로 v2 고퀄 팩 110종(50+20+20+20)을 `officialEligible` 예비 합격 풀에 넣었다. 기존 v2 신규 3종(orbit-ringer, tilt-marble, neon-rail)과 합치면 임계값 10을 넘기므로 데일리/랜덤 풀은 v2만 사용한다. 갤러리의 v1 레거시는 유지한다. 실기기 재미 검수는 별도다.
