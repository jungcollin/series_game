(() => {
  "use strict";

  function resize(stageEl, glCanvas, hudCanvas, webgl) {
    const rect = stageEl.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    [glCanvas, hudCanvas].forEach((canvas) => {
      const nextW = Math.floor(width * dpr);
      const nextH = Math.floor(height * dpr);
      if (canvas.width !== nextW || canvas.height !== nextH) {
        canvas.width = nextW;
        canvas.height = nextH;
      }
    });
    const hud = hudCanvas.getContext("2d");
    hud.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (webgl && webgl.renderer && webgl.camera) {
      webgl.renderer.setPixelRatio(dpr);
      webgl.renderer.setSize(width, height, false);
      webgl.camera.aspect = width / height;
      webgl.camera.updateProjectionMatrix();
    }
    return { width, height, dpr, hud };
  }

  function setMode(stageEl, mode) {
    stageEl.dataset.mode = mode;
    stageEl.querySelectorAll("[data-screen]").forEach((node) => {
      const on = node.getAttribute("data-screen") === mode;
      node.classList.toggle("is-on", on);
      node.hidden = !on;
    });
    const live = stageEl.querySelector(".hud-live");
    if (live) live.hidden = mode !== "running";
    const overlay = stageEl.querySelector(".overlay");
    if (overlay) overlay.classList.toggle("is-open", mode !== "running");
  }

  window.V2StageChrome = { resize, setMode };
})();
