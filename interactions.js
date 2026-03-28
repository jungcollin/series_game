/**
 * Premium UI Interactions
 * Provides 3D Tilt, Magnetic Buttons, Glow effects, and Reveal Animations.
 */

(function () {
  "use strict";

  // Configuration
  const TILT_MAX_ROTATION = -10; // degrees
  const MAGNETIC_POWER = 0.2; // 20% pull

  // --- 1. Reveal (Intersection Observer) ---
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-revealed");
          // Optional: unobserve after reveal
          // revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
  );

  function initReveals(elements) {
    elements.forEach((el) => revealObserver.observe(el));
  }

  // --- 2. Dynamic Glow & Tilt (Mouse Move) ---
  function handleTiltAndGlow(e) {
    const el = e.currentTarget;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const rect = el.getBoundingClientRect();
    // Glow coordinates
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    el.style.setProperty("--glow-x", `${x}px`);
    el.style.setProperty("--glow-y", `${y}px`);

    // Tilt calculations
    if (el.classList.contains("tilt-card")) {
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const rotateX = ((y - centerY) / centerY) * TILT_MAX_ROTATION;
      const rotateY = -((x - centerX) / centerX) * TILT_MAX_ROTATION;

      el.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
    }
  }

  function handleTiltReset(e) {
    const el = e.currentTarget;
    if (el.classList.contains("tilt-card")) {
      el.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
    }
  }

  function initTiltAndGlow(elements) {
    elements.forEach((el) => {
      if (!el.dataset.interactBound) {
        el.dataset.interactBound = "true";
        el.addEventListener("mousemove", handleTiltAndGlow);
        el.addEventListener("mouseleave", handleTiltReset);
      }
    });
  }

  // --- 3. Magnetic Buttons ---
  function handleMagneticMove(e) {
    const el = e.currentTarget;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    el.style.transform = `translate(${x * MAGNETIC_POWER}px, ${y * MAGNETIC_POWER}px)`;
  }

  function handleMagneticReset(e) {
    e.currentTarget.style.transform = `translate(0px, 0px)`;
  }

  function initMagnetic(elements) {
    elements.forEach((el) => {
      if (!el.dataset.magnetBound) {
        el.dataset.magnetBound = "true";
        el.addEventListener("mousemove", handleMagneticMove);
        el.addEventListener("mouseleave", handleMagneticReset);
      }
    });
  }

  // --- 4. Scramble Text Animation ---
  class Scrambler {
    constructor(el) {
      this.el = el;
      this.chars = '!<>-_\\\\/[]{}—=+*^?#________';
      this.update = this.update.bind(this);
    }
    setText(newText) {
      const oldText = this.el.innerText;
      const length = Math.max(oldText.length, newText.length);
      const promise = new Promise((resolve) => this.resolve = resolve);
      this.queue = [];
      for (let i = 0; i < length; i++) {
        const from = oldText[i] || '';
        const to = newText[i] || '';
        const start = Math.floor(Math.random() * 40);
        const end = start + Math.floor(Math.random() * 40);
        this.queue.push({ from, to, start, end });
      }
      cancelAnimationFrame(this.frameRequest);
      this.frame = 0;
      this.update();
      return promise;
    }
    update() {
      let output = '';
      let complete = 0;
      for (let i = 0, n = this.queue.length; i < n; i++) {
        let { from, to, start, end, char } = this.queue[i];
        if (this.frame >= end) {
          complete++;
          output += to;
        } else if (this.frame >= start) {
          if (!char || Math.random() < 0.28) {
            char = this.randomChar();
            this.queue[i].char = char;
          }
          output += `<span class="dud">${char}</span>`;
        } else {
          output += from;
        }
      }
      this.el.innerHTML = output;
      if (complete === this.queue.length) {
        this.resolve();
      } else {
        this.frameRequest = requestAnimationFrame(this.update);
        this.frame++;
      }
    }
    randomChar() {
      return this.chars[Math.floor(Math.random() * this.chars.length)];
    }
  }

  function initScramble(elements) {
    elements.forEach(el => {
      if(!el.dataset.scrambleBound) {
        el.dataset.scrambleBound = "true";
        const text = el.dataset.text || el.innerText;
        el.innerText = "";
        const fx = new Scrambler(el);
        setTimeout(() => fx.setText(text), 200);
      }
    });
  }

  // --- Initialization & Mutation Observer ---
  function scanAndInit() {
    initReveals(document.querySelectorAll(".reveal-up:not(.is-revealed)"));
    initTiltAndGlow(document.querySelectorAll(".tilt-card, .glow-target"));
    initMagnetic(document.querySelectorAll(".magnetic-btn"));
    initScramble(document.querySelectorAll(".scramble-text"));
  }

  document.addEventListener("DOMContentLoaded", () => {
    scanAndInit();

    // Observe DOM for newly added elements (e.g., gallery cards fetched via API)
    const observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          shouldScan = true;
          break;
        }
      }
      if (shouldScan) {
        scanAndInit();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });

})();
