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

window.RELAY_RULES = [
  "시작 스테이지는 지금 화면의 앵커 스테이지 1개만 둔다.",
  "앵커를 깨면 다음 스테이지는 팀원이 만든 아무 장르 게임이어도 된다.",
  "단, 다음 스테이지도 공유 목숨은 1개뿐이고 실패하면 전체 런이 끝난다.",
  "외부 스테이지를 깨면 사람들 스테이지 풀에서 다음 게임을 랜덤으로 뽑는다.",
  "각 외부 스테이지는 30~90초 안에 끝나는 단일 챌린지로 제한한다.",
  "추가 목숨, continue, 리스폰 체크포인트, 세이브 복구는 금지한다.",
];

window.RELAY_CREATOR_PROMPT = `당신은 "One Life Relay"에 연결될 외부 스테이지 1개를 만드는 제작자다.

목표:
- 플레이어는 이미 하나뿐인 공유 목숨을 가지고 이 스테이지에 진입한다.
- 이 스테이지를 클리어하면 다음 랜덤 스테이지로 넘어간다.
- 이 스테이지에서 실패하면 전체 런이 즉시 종료된다.

필수 규칙:
1. 장르는 자유다. 플랫폼, 퍼즐, 리듬, 슈팅, 레이싱, 잠입 모두 가능하다.
2. 추가 목숨, continue, checkpoint respawn, 세이브 복구, 광고 부활, 무한 회복을 넣지 마라.
3. 실패 조건은 즉시 명확하게 보여야 한다.
4. 클리어 조건도 즉시 명확하게 보여야 한다.
5. 전체 플레이 타임은 30초에서 90초 사이를 목표로 설계한다.
6. 시작 화면에 조작법과 클리어 조건을 반드시 적는다.
7. 브라우저에서 바로 실행 가능해야 한다.
8. 아래 상태를 반드시 외부에 노출한다:
   - window.render_game_to_text()
   - window.advanceTime(ms)
   - window.relayStageMeta = { id, title, creator, genre, clearCondition }
   - window.relayStageResult = { status: "running" | "cleared" | "failed" }
9. 실패 시 상태는 failed, 클리어 시 상태는 cleared로 즉시 바뀌어야 한다.
10. 시각적 테마와 규칙은 자유지만 "공유 목숨 1개" 규칙만은 절대 깨지지 않아야 한다.

출력 형식:
- 단일 HTML/JS/CSS 또는 간단한 폴더 구조
- 스테이지 제목
- 제작자 이름
- 장르
- 클리어 조건
- 실패 조건
- 위 계약을 지키는 실행 가능한 웹게임`;
