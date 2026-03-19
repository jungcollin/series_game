const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createStageInRepo } = require("../scripts/create_stage.js");
const { syncRegistry } = require("../scripts/stage_metadata.js");

const templatePath = path.resolve(__dirname, "../templates/stage-template.html");

function makeRepoFixture() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "relay-create-stage-"));
  fs.mkdirSync(path.join(repoRoot, "community-stages"), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, "relay-tools", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(repoRoot, "relay-tools", "templates", "stage-template.html"),
    fs.readFileSync(templatePath, "utf8")
  );
  fs.writeFileSync(
    path.join(repoRoot, "community-stages", "registry.js"),
    "window.COMMUNITY_STAGE_REGISTRY = [];\n"
  );
  return repoRoot;
}

test("createStageInRepo scaffolds the minimal accessibility shell and metadata", () => {
  const repoRoot = makeRepoFixture();
  const output = createStageInRepo({
    repoRoot,
    args: {
      slug: "access-test",
      title: "Access Test",
      creator: "Tester",
      "creator-github": "tester",
      genre: "arcade",
      controls: "방향키",
      "clear-condition": "10초 버티기",
      "fail-condition": "벽에 닿기",
      description: "테스트 설명",
    },
  });

  assert.equal(output.slug, "access-test");
  assert.equal(output.directory, "access-test");

  const stageHtml = fs.readFileSync(
    path.join(repoRoot, "community-stages", "access-test", "index.html"),
    "utf8"
  );
  assert.match(stageHtml, /class="skip-link"/);
  assert.match(stageHtml, /href="#game"/);
  assert.match(stageHtml, /id="stage-instructions"/);
  assert.match(stageHtml, /aria-describedby="stage-instructions"/);
  assert.match(stageHtml, /tabindex="0"/);
  assert.match(stageHtml, /canvas:focus-visible/);
  assert.match(stageHtml, /function startFromTouch/);
  assert.match(stageHtml, /touchstart/);
  assert.match(stageHtml, /모바일에서는 화면 터치나 버튼 조작도 함께 제공해야 합니다/);
  assert.match(stageHtml, /390픽셀 폭 모바일에서도 가로로 넘치지 않게 유지해야 합니다/);
  assert.match(stageHtml, /\.mobile-controls__row\s*\{[\s\S]*flex-wrap:\s*wrap/);
  assert.match(stageHtml, /@media \(max-width: 420px\)/);
  assert.match(stageHtml, /prefers-reduced-motion: reduce/);
  assert.match(stageHtml, /조작: 방향키/);

  const meta = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "community-stages", "access-test", "meta.json"), "utf8")
  );
  assert.equal(meta.id, "access-test");
  assert.equal(meta.creator.name, "Tester");
  assert.equal(meta.creator.github, "tester");
  assert.equal(meta.clearCondition, "10초 버티기");
  assert.equal(meta.failCondition, "벽에 닿기");
  assert.equal(meta.controls, "방향키");

  const registry = fs.readFileSync(path.join(repoRoot, "community-stages", "registry.js"), "utf8");
  assert.match(registry, /id: "access-test"/);
  assert.match(registry, /title: "Access Test"/);
});

test("createStageInRepo rejects missing required fields before writing files", () => {
  const repoRoot = makeRepoFixture();

  assert.throws(
    () =>
      createStageInRepo({
        repoRoot,
        args: {
          slug: "broken-stage",
          title: "Broken Stage",
          creator: "Tester",
          controls: "스페이스",
          "clear-condition": "끝까지 생존",
          "fail-condition": "장애물 충돌",
        },
      }),
    /Missing required argument: --genre/
  );

  assert.equal(fs.existsSync(path.join(repoRoot, "community-stages", "broken-stage")), false);
});

test("syncRegistry picks up a thumbnail file from the stage directory", () => {
  const repoRoot = makeRepoFixture();

  createStageInRepo({
    repoRoot,
    args: {
      slug: "thumb-test",
      title: "Thumb Test",
      creator: "Tester",
      genre: "arcade",
      controls: "방향키",
      "clear-condition": "10초 버티기",
      "fail-condition": "벽에 닿기",
      description: "썸네일 테스트",
    },
  });

  fs.writeFileSync(path.join(repoRoot, "community-stages", "thumb-test", "thumbnail.png"), "png");
  syncRegistry(repoRoot);

  const registry = fs.readFileSync(path.join(repoRoot, "community-stages", "registry.js"), "utf8");
  assert.match(registry, /thumbnail: "\.\/thumb-test\/thumbnail\.png"/);
});
