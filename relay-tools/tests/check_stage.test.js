const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assertMobileLayoutMetrics,
  assertStageSourceIncludesMobileSupport,
  assertStageSourceIncludesMetaText,
  findOverflowingElements,
  parseChangedStageSlugs,
  parseStageRenderText,
  stageThumbnailPath,
} = require("../scripts/check_stage.js");

test("parseChangedStageSlugs finds changed stage dirs, handles renames, and deduplicates", () => {
  const gitStatus = [
    " M community-stages/galaxy-boss/index.html",
    " M community-stages/galaxy-boss/meta.json",
    "R  community-stages/old-stage/index.html -> community-stages/new-stage/index.html",
    "?? community-stages/new-stage/meta.json",
    " M styles.css",
  ].join("\n");

  assert.deepEqual(parseChangedStageSlugs(gitStatus), ["galaxy-boss", "new-stage"]);
});

test("assertStageSourceIncludesMetaText passes only when exact meta strings are present", () => {
  const stageMeta = {
    clearCondition: "별 5개 모으기",
    failCondition: "적에게 닿기",
    controls: "방향키와 스페이스",
  };
  const validSource = `
    <section>
      <p>클리어 조건: 별 5개 모으기</p>
      <p>실패 조건: 적에게 닿기</p>
      <p>조작: 방향키와 스페이스</p>
    </section>
  `;

  assert.doesNotThrow(() => assertStageSourceIncludesMetaText(validSource, stageMeta));
  assert.throws(
    () =>
      assertStageSourceIncludesMetaText(
        validSource.replace("적에게 닿기", "적 피하기"),
        stageMeta
      ),
    /Stage source must include the exact failCondition text from meta\.json: 적에게 닿기/
  );
});

test("assertStageSourceIncludesMobileSupport requires touch input hooks and touch copy", () => {
  const stageMeta = { id: "mobile-stage" };
  const validSource = `
    <p>터치 또는 Enter로 시작</p>
    <button class="mobile-btn">왼쪽</button>
    <script>
      canvas.addEventListener("touchstart", () => {});
    </script>
  `;

  assert.doesNotThrow(() => assertStageSourceIncludesMobileSupport(validSource, stageMeta));
  assert.throws(
    () => assertStageSourceIncludesMobileSupport("<p>터치 또는 Enter로 시작</p>", stageMeta),
    /touchstart or pointerdown mobile input/
  );
  assert.throws(
    () =>
      assertStageSourceIncludesMobileSupport(
        '<script>canvas.addEventListener("touchstart", () => {});</script>',
        stageMeta
      ),
    /mention touch\/mobile controls/
  );
});

test("findOverflowingElements returns only entries that exceed the mobile viewport width", () => {
  const elements = [
    { label: "safe", left: 0, right: 390, width: 390 },
    { label: "right-overflow", left: 8, right: 404, width: 396 },
    { label: "left-overflow", left: -8, right: 120, width: 128 },
  ];

  assert.deepEqual(
    findOverflowingElements(elements, 390).map((entry) => entry.label),
    ["right-overflow", "left-overflow"]
  );
});

test("assertMobileLayoutMetrics rejects horizontal overflow and undersized canvases", () => {
  const stageMeta = { id: "mobile-layout-stage" };
  const validMetrics = {
    viewport: { width: 390, height: 844 },
    documentScrollWidth: 390,
    canvas: { width: 390, height: 420 },
    elements: [{ label: "canvas#game", left: 0, right: 390, width: 390 }],
  };

  assert.doesNotThrow(() => assertMobileLayoutMetrics(validMetrics, stageMeta, "running"));
  assert.throws(
    () =>
      assertMobileLayoutMetrics(
        {
          ...validMetrics,
          documentScrollWidth: 410,
        },
        stageMeta,
        "menu"
      ),
    /overflows horizontally/
  );
  assert.throws(
    () =>
      assertMobileLayoutMetrics(
        {
          ...validMetrics,
          elements: [{ label: "button.mobile-btn", left: 0, right: 410, width: 410 }],
        },
        stageMeta,
        "failed"
      ),
    /overflowing elements/
  );
  assert.throws(
    () =>
      assertMobileLayoutMetrics(
        {
          ...validMetrics,
          canvas: { width: 240, height: 180 },
        },
        stageMeta,
        "running"
      ),
    /canvas is too narrow|canvas is too short/
  );
});

test("parseStageRenderText returns parsed stage state only for valid JSON objects", () => {
  assert.deepEqual(parseStageRenderText('{"mode":"running","time_remaining":12.4}'), {
    mode: "running",
    time_remaining: 12.4,
  });
  assert.equal(parseStageRenderText(""), null);
  assert.equal(parseStageRenderText("not-json"), null);
  assert.equal(parseStageRenderText("123"), null);
});

test("stageThumbnailPath points at the stage-local thumbnail.png file", () => {
  assert.equal(
    stageThumbnailPath("/tmp/repo", "meteor-dodge"),
    "/tmp/repo/community-stages/meteor-dodge/thumbnail.png"
  );
});
