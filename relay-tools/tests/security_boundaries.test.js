const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

test("host frames use sandboxed token-bound messaging without same-origin access", () => {
  const home = read("index.html");
  const play = read("community-stages/play.html");
  const game = read("game.js");
  for (const source of [home, play]) {
    assert.match(source, /sandbox="allow-scripts allow-pointer-lock"/);
    assert.doesNotMatch(source, /sandbox="[^"]*allow-same-origin/);
  }
  assert.match(game, /event\.source !== relayFrameEl\?\.contentWindow/);
  assert.match(game, /message\.token !== state\.stageMessageToken/);
  assert.match(play, /event\.source !== frameEl\.contentWindow/);
  assert.match(play, /message\.token !== stageMessageToken/);
});

test("all relay stages use the runtime bridge instead of direct parent host access", () => {
  const stagesRoot = path.join(repoRoot, "community-stages");
  for (const entry of fs.readdirSync(stagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const stagePath = path.join(stagesRoot, entry.name, "index.html");
    if (!fs.existsSync(stagePath)) continue;
    const source = fs.readFileSync(stagePath, "utf8");
    assert.doesNotMatch(source, /(?:window\.)?parent\.RelayHost/, entry.name);
    if (source.includes("RelayStageHost")) assert.match(source, /relay-runtime\.js/, entry.name);
  }
});

test("contributor documentation uses the sandbox-compatible runtime bridge", () => {
  const contributing = read("CONTRIBUTING.md");
  assert.match(contributing, /RelayStageHost\.onStageReady/);
  assert.match(contributing, /RelayStageHost\.onStageCleared/);
  assert.match(contributing, /RelayStageHost\.onStageFailed/);
  assert.doesNotMatch(contributing, /parent\.postMessage/);
});

test("PR and Pages workflows keep untrusted code read-only and main-only", () => {
  const review = read(".github/workflows/relay-pr-review.yml");
  const pages = read(".github/workflows/deploy-pages.yml");
  const verify = read(".github/workflows/verify.yml");
  assert.doesNotMatch(review, /pull-requests:\s*write|RELAY_REVIEW_TOKEN|event:\s*['"]?APPROVE/);
  assert.match(review, /persist-credentials:\s*false/);
  assert.match(review, /--directory "\$RUNNER_TEMP\/relay-site"/);
  assert.doesNotMatch(pages, /codex\/local-relay-workflow/);
  assert.match(pages, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(pages, /needs:\s*verify/);
  assert.match(pages, /build_pages_site\.js/);
  assert.match(verify, /npm test/);
  assert.match(verify, /npm run test:api/);
  assert.match(verify, /typecheck/);
  assert.doesNotMatch(verify, /secrets\.|DATABASE_URL|SESSION_SIGNING_SECRET/);
  assert.doesNotMatch(pages, /secrets\.|DATABASE_URL|SESSION_SIGNING_SECRET/);
});

test("stage browser checks block HTTP, WebSocket, and service worker egress", () => {
  const checker = read("relay-tools/scripts/check_stage.js");
  assert.match(checker, /context\.route\("\*\*\/\*"/);
  assert.match(checker, /context\.routeWebSocket\("\*\*\/\*"/);
  assert.equal((checker.match(/serviceWorkers:\s*"block"/g) || []).length, 4);
});

test("public clients do not send caller-selected visitor ids or ranking writes", () => {
  const likes = read("community-stages/likes-client.js");
  const rankings = read("community-stages/ranking-client.js");
  const play = read("community-stages/play.html");
  assert.doesNotMatch(likes, /visitor_id|getVisitorId/);
  assert.doesNotMatch(rankings, /saveRanking|method:\s*"POST"/);
  assert.doesNotMatch(play, /visitor_id|getVisitorId|saveRanking/);
});
