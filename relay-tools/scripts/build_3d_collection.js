#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const profiles = {
  "orbital-salvage": { mode: "collector", theme: "space", player: "ship", target: 8, mistakes: 3, timeLimit: 28, speed: 18, spawn: 0.92, requiresAction: true, actionLabel: "회수", hitLabel: "에너지 코어 회수", dangerLabel: "궤도 파편 충돌", missLabel: "코어를 놓쳤습니다", palette: { sky: 0x020617, fog: 0x07152b, light: 0xdbeafe, ground: 0x02030a, accent: 0x8b5cf6, glow: 0x22d3ee, floor: 0x111827, floorGlow: 0x172554, deco: 0x334155, player: 0xe2e8f0, playerGlow: 0x2563eb, good: 0x22d3ee, danger: 0xfb7185 } },
  "skyrail-drift": { mode: "runner", theme: "city", player: "ship", duration: 20, mistakes: 1, speed: 27, spawn: 0.82, actionLabel: "", dangerLabel: "공중 차단벽 충돌", palette: { sky: 0x160b35, fog: 0x2e1065, light: 0xf5d0fe, ground: 0x09090b, accent: 0xf472b6, glow: 0x67e8f9, floor: 0x1e1b4b, floorGlow: 0x312e81, deco: 0x4c1d95, player: 0xf8fafc, playerGlow: 0xec4899, good: 0x67e8f9, danger: 0xf43f5e } },
  "mech-arena-zero": { mode: "shooter", theme: "city", player: "mech", target: 10, mistakes: 4, timeLimit: 30, speed: 16, spawn: 1.0, actionLabel: "발사", hitLabel: "적 메카 격파", dangerLabel: "적 탄환 피격", missLabel: "적 메카가 방어선을 돌파", palette: { sky: 0x09090b, fog: 0x18181b, light: 0xfef3c7, ground: 0x030712, accent: 0xf59e0b, glow: 0xf97316, floor: 0x292524, floorGlow: 0x451a03, deco: 0x44403c, player: 0xd6d3d1, playerGlow: 0xf59e0b, good: 0xfbbf24, danger: 0xef4444 } },
  "crystal-cavern-rush": { mode: "timing", theme: "cavern", player: "ship", target: 7, mistakes: 3, timeLimit: 28, speed: 13, spawn: 1.22, requiresAction: true, actionLabel: "채굴", hitLabel: "진짜 수정 채굴", dangerLabel: "불안정 수정 폭발", missLabel: "수정 채굴 기회를 놓쳤습니다", fog: 0.026, palette: { sky: 0x071a16, fog: 0x052e2b, light: 0xccfbf1, ground: 0x020617, accent: 0x34d399, glow: 0x5eead4, floor: 0x134e4a, floorGlow: 0x115e59, deco: 0x164e63, player: 0xecfeff, playerGlow: 0x14b8a6, good: 0xa7f3d0, danger: 0xf472b6 } },
  "neon-hoverline": { mode: "runner", theme: "city", player: "ship", duration: 22, mistakes: 1, speed: 30, spawn: 0.75, actionLabel: "", dangerLabel: "에너지 장벽 충돌", palette: { sky: 0x030712, fog: 0x0f172a, light: 0xe0f2fe, ground: 0x020617, accent: 0x06b6d4, glow: 0xa3e635, floor: 0x172554, floorGlow: 0x1d4ed8, deco: 0x312e81, player: 0xf8fafc, playerGlow: 0x06b6d4, good: 0xa3e635, danger: 0xf43f5e } },
  "abyssal-gate": { mode: "collector", theme: "underwater", player: "sub", target: 9, mistakes: 3, timeLimit: 30, speed: 14, spawn: 1.0, requiresAction: false, actionLabel: "", hitLabel: "발광 관문 통과", dangerLabel: "심해 암초 충돌", missLabel: "관문을 놓쳤습니다", fog: 0.032, palette: { sky: 0x001b2e, fog: 0x003049, light: 0xcffafe, ground: 0x020617, accent: 0x0891b2, glow: 0x22d3ee, floor: 0x083344, floorGlow: 0x155e75, deco: 0x164e63, player: 0xfbbf24, playerGlow: 0x0ea5e9, good: 0x67e8f9, danger: 0xfb7185 } },
  "titan-ascent": { mode: "timing", theme: "city", player: "mech", target: 8, mistakes: 3, timeLimit: 30, speed: 15, spawn: 1.15, requiresAction: true, actionLabel: "고정", hitLabel: "안전 고리 연결", dangerLabel: "붉은 방전판 접촉", missLabel: "안전 고리를 놓쳤습니다", palette: { sky: 0x17120a, fog: 0x29200e, light: 0xfffbeb, ground: 0x0c0a09, accent: 0xd97706, glow: 0xfbbf24, floor: 0x44403c, floorGlow: 0x78350f, deco: 0x57534e, player: 0xe7e5e4, playerGlow: 0xf59e0b, good: 0xfde68a, danger: 0xdc2626 } },
  "drone-siege": { mode: "shooter", theme: "space", player: "ship", target: 12, mistakes: 5, timeLimit: 32, speed: 17, spawn: 0.88, actionLabel: "발사", hitLabel: "침입 드론 격추", dangerLabel: "방어선 피격", missLabel: "드론이 방어선을 넘었습니다", palette: { sky: 0x1c0805, fog: 0x431407, light: 0xffedd5, ground: 0x0c0a09, accent: 0xea580c, glow: 0xfacc15, floor: 0x3f1d14, floorGlow: 0x7c2d12, deco: 0x713f12, player: 0xf5f5f4, playerGlow: 0xf97316, good: 0xfacc15, danger: 0xef4444 } },
  "temple-orb": { mode: "runner", theme: "temple", player: "orb", duration: 24, mistakes: 1, speed: 25, spawn: 0.8, actionLabel: "", dangerLabel: "함정 기둥 충돌", palette: { sky: 0x120d08, fog: 0x292016, light: 0xfef3c7, ground: 0x0c0a09, accent: 0xb45309, glow: 0xfbbf24, floor: 0x44321f, floorGlow: 0x78350f, deco: 0x57534e, player: 0xf59e0b, playerGlow: 0xfde68a, good: 0xfbbf24, danger: 0x991b1b } },
  "reactor-sync": { mode: "timing", theme: "space", player: "orb", target: 8, mistakes: 3, timeLimit: 28, speed: 14, spawn: 1.15, requiresAction: true, actionLabel: "동기화", hitLabel: "위상 동기화 성공", dangerLabel: "위상 역류 발생", missLabel: "동기화 창을 놓쳤습니다", palette: { sky: 0x0b0718, fog: 0x1e1038, light: 0xf5f3ff, ground: 0x030712, accent: 0x7c3aed, glow: 0x2dd4bf, floor: 0x2e1065, floorGlow: 0x4c1d95, deco: 0x312e81, player: 0xddd6fe, playerGlow: 0x8b5cf6, good: 0x5eead4, danger: 0xfb7185 } }
};

function build(repoRoot) {
  const template = fs.readFileSync(path.join(repoRoot, "relay-tools/templates/3d-stage-shell.html"), "utf8");
  for (const [slug, profile] of Object.entries(profiles)) {
    const stageDir = path.join(repoRoot, "community-stages", slug);
    const meta = JSON.parse(fs.readFileSync(path.join(stageDir, "meta.json"), "utf8"));
    const config = { ...profile, id: meta.id, title: meta.title, creator: meta.creator.name, genre: meta.genre, clearCondition: meta.clearCondition, failCondition: meta.failCondition };
    let html = template;
    const values = {
      __TITLE__: meta.title,
      __GENRE__: meta.genre,
      __DESCRIPTION__: meta.description,
      __CONTROLS__: meta.controls,
      __CLEAR__: meta.clearCondition,
      __FAIL__: meta.failCondition,
      __ACCENT__: `#${profile.palette.accent.toString(16).padStart(6, "0")}`,
      __GLOW__: `#${profile.palette.glow.toString(16).padStart(6, "0")}`,
      __CONFIG__: JSON.stringify(config)
    };
    for (const [token, value] of Object.entries(values)) html = html.replaceAll(token, value);
    fs.writeFileSync(path.join(stageDir, "index.html"), html);
  }
}

if (require.main === module) build(path.resolve(__dirname, "../.."));

module.exports = { build, profiles };
