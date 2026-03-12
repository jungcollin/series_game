window.STAGES = [
  {
    id: "anchor-stage",
    name: "Anchor Yard",
    width: 2200,
    height: 540,
    spawn: { x: 90, y: 384 },
    goal: { x: 2050, y: 240, w: 90, h: 120 },
    platforms: [
      { x: 0, y: 430, w: 540, h: 110, kind: "ground" },
      { x: 590, y: 430, w: 190, h: 110, kind: "ground" },
      { x: 830, y: 400, w: 180, h: 140, kind: "ground" },
      { x: 1080, y: 390, w: 140, h: 150, kind: "ground" },
      { x: 1290, y: 340, w: 190, h: 200, kind: "ground" },
      { x: 1560, y: 300, w: 180, h: 240, kind: "ground" },
      { x: 1790, y: 370, w: 250, h: 170, kind: "ground" },
      { x: 360, y: 310, w: 110, h: 18, kind: "ledge" },
      { x: 1160, y: 280, w: 90, h: 16, kind: "ledge" },
      { x: 1680, y: 220, w: 110, h: 16, kind: "ledge" },
    ],
    hazards: [
      { type: "spikes", x: 816, y: 430, w: 42, h: 10 },
      { type: "spikes", x: 1488, y: 420, w: 42, h: 10 },
      { type: "saw", x: 1180, y: 190, w: 32, h: 32, axis: "y", range: 110, speed: 1.35 },
    ],
    pickups: [
      { x: 410, y: 260, r: 12, points: 150 },
      { x: 1160, y: 230, r: 12, points: 150 },
      { x: 1680, y: 170, r: 12, points: 150 },
    ],
  },
];

window.RELAY_POOL = [
  {
    id: "metro-dodge",
    title: "Metro Dodge",
    creator: "Mina",
    genre: "Top-down dodger",
    clearCondition: "30초 동안 열차와 경고선 피하기",
    ruleFocus: "추가 체력, 무적, 리스폰 없이 즉시 실패",
  },
  {
    id: "orbit-pulse",
    title: "Orbit Pulse",
    creator: "Joon",
    genre: "Rhythm survival",
    clearCondition: "16비트 패턴 3세트를 모두 맞추기",
    ruleFocus: "판정 놓치면 즉시 런 종료",
  },
  {
    id: "tiny-heist",
    title: "Tiny Heist",
    creator: "Hana",
    genre: "Stealth puzzle",
    clearCondition: "경비 시야를 피해서 키 획득 후 탈출",
    ruleFocus: "들키면 즉시 실패, 체크포인트 금지",
  },
  {
    id: "brick-drift",
    title: "Brick Drift",
    creator: "Theo",
    genre: "Micro racing",
    clearCondition: "짧은 트랙 2랩 완주",
    ruleFocus: "벽 충돌 1회로 실격",
  },
  {
    id: "signal-shot",
    title: "Signal Shot",
    creator: "Ari",
    genre: "Aim challenge",
    clearCondition: "제한 시간 내 목표 5개 명중",
    ruleFocus: "탄 수, 시간, 체력 모두 1번 실수 허용 없음",
  },
  {
    id: "box-fall",
    title: "Box Fall",
    creator: "Doyun",
    genre: "Physics puzzle",
    clearCondition: "상자 배치를 이용해 출구까지 도달",
    ruleFocus: "낙사나 압사 즉시 종료",
  },
];

window.RELAY_CREATOR_PROMPT = `이 프로젝트에서는 전역 설정이 아니라 로컬 워크플로를 사용합니다.

저장소:
- https://github.com/jungcollin/series_game
- git clone git@github.com:jungcollin/series_game.git

1. /make-stage <<one-line stage description>>
2. /check-stage <stage-slug>
3. /publish-stage <stage-slug>

로컬 규칙 파일:
- AGENTS.md
- CLAUDE.md
- GEMINI.md
- relay-tools/create-stage.md
- relay-tools/check-stage.md
- relay-tools/publish-stage.md

핵심 계약:
- community-stages/<stage-slug>/index.html
- community-stages/registry.js 등록
- parent.RelayHost.onStageCleared(...)
- parent.RelayHost.onStageFailed(...)
- window.render_game_to_text()
- window.advanceTime(ms)
- window.relayStageMeta
- window.relayStageResult
- window.relayStageDebug = { forceClear(), forceFail() }

공유 목숨은 1개이며, 실패는 즉시 종료, 클리어는 즉시 완료입니다.`;
