#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const profiles = {
  "orbital-salvage": { mode: "collector", theme: "space", player: "ship", target: 7, mistakes: 4, timeLimit: 36, speed: 14, spawn: 1.28, requiresAction: true, actionLabel: "회수", hitLabel: "에너지 코어 회수", dangerLabel: "궤도 파편 충돌", missLabel: "코어를 놓쳤습니다", palette: { sky: 0x020617, fog: 0x07152b, light: 0xdbeafe, ground: 0x02030a, accent: 0x8b5cf6, glow: 0x22d3ee, floor: 0x111827, floorGlow: 0x172554, deco: 0x334155, player: 0xe2e8f0, playerGlow: 0x2563eb, good: 0x22d3ee, danger: 0xfb7185 } },
  "mech-arena-zero": { mode: "shooter", theme: "city", player: "mech", target: 8, mistakes: 6, timeLimit: 36, speed: 11, spawn: 1.32, actionLabel: "발사", hitLabel: "적 메카 격파", dangerLabel: "적 탄환 피격", missLabel: "적 메카가 방어선을 돌파", palette: { sky: 0x09090b, fog: 0x18181b, light: 0xfef3c7, ground: 0x030712, accent: 0xf59e0b, glow: 0xf97316, floor: 0x292524, floorGlow: 0x451a03, deco: 0x44403c, player: 0xd6d3d1, playerGlow: 0xf59e0b, good: 0xfbbf24, danger: 0xef4444 } },
  "crystal-cavern-rush": { mode: "timing", theme: "cavern", player: "ship", target: 6, mistakes: 4, timeLimit: 38, speed: 9, spawn: 1.62, requiresAction: true, actionLabel: "채굴", hitLabel: "진짜 수정 채굴", dangerLabel: "불안정 수정 폭발", missLabel: "수정 채굴 기회를 놓쳤습니다", fog: 0.026, palette: { sky: 0x071a16, fog: 0x052e2b, light: 0xccfbf1, ground: 0x020617, accent: 0x34d399, glow: 0x5eead4, floor: 0x134e4a, floorGlow: 0x115e59, deco: 0x164e63, player: 0xecfeff, playerGlow: 0x14b8a6, good: 0xa7f3d0, danger: 0xf472b6 } },
  "neon-hoverline": { mode: "runner", theme: "city", player: "ship", duration: 18, mistakes: 2, speed: 22, spawn: 1.16, actionLabel: "", dangerLabel: "에너지 장벽 충돌", palette: { sky: 0x030712, fog: 0x0f172a, light: 0xe0f2fe, ground: 0x020617, accent: 0x06b6d4, glow: 0xa3e635, floor: 0x172554, floorGlow: 0x1d4ed8, deco: 0x312e81, player: 0xf8fafc, playerGlow: 0x06b6d4, good: 0xa3e635, danger: 0xf43f5e } },
  "abyssal-gate": { mode: "collector", theme: "underwater", player: "sub", target: 7, mistakes: 4, timeLimit: 38, speed: 10, spawn: 1.42, requiresAction: false, actionLabel: "", hitLabel: "발광 관문 통과", dangerLabel: "심해 암초 충돌", missLabel: "관문을 놓쳤습니다", fog: 0.032, palette: { sky: 0x001b2e, fog: 0x003049, light: 0xcffafe, ground: 0x020617, accent: 0x0891b2, glow: 0x22d3ee, floor: 0x083344, floorGlow: 0x155e75, deco: 0x164e63, player: 0xfbbf24, playerGlow: 0x0ea5e9, good: 0x67e8f9, danger: 0xfb7185 } },
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
