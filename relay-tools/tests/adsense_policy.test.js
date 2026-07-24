const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const test = require("node:test");

test("keeps gameplay and community action screens ad-free", async () => {
  const files = await Promise.all([
    readFile("index.html", "utf8"),
    readFile("community-stages/play.html", "utf8"),
    readFile("community-stages/gallery.html", "utf8"),
  ]);

  for (const html of files) {
    assert.doesNotMatch(html, /googlesyndication|adsbygoogle|google-adsense-account|ca-pub-/i);
  }
});

test("keeps seller authorization while ads are paused", async () => {
  const ads = await readFile("ads.txt", "utf8");
  assert.match(ads, /google\.com, pub-5530335738226445, DIRECT, f08c47fec0942fa0/);
});
