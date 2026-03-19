const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assertStageSourceIncludesMetaText,
  parseChangedStageSlugs,
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
