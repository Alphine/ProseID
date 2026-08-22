/**
 * Landing page 3D tilt + scroll parallax wiring. See js/tilt.js for the
 * shared tilt implementation. Scroll parallax only writes --ty/--chip-ty
 * custom properties; landing.css composes them into `transform`.
 */
import { enableTilt } from "./tilt.js";

const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

document.querySelectorAll(".feature-card, .usecase-card, .stat-card").forEach((el) => enableTilt(el, 6));

const heroVisual = document.querySelector(".hero-visual");
if (heroVisual) enableTilt(heroVisual, 4);

// Nav elevation on scroll — cheap, always on regardless of reduced-motion
// (it's a state toggle, not a continuous animation).
const nav = document.querySelector(".landing-nav");
if (nav) {
  const onNavScroll = () => nav.classList.toggle("scrolled", window.scrollY > 20);
  window.addEventListener("scroll", onNavScroll, { passive: true });
  onNavScroll();
}

if (!reduceMotion) {
  // Scroll parallax — hero visual drifts slower than scroll, chips drift a
  // touch more than the visual for a layered depth cue.
  const heroCopy = document.querySelector(".hero-copy");
  const chips = document.querySelectorAll(".hero-chip");
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      if (heroCopy) heroCopy.style.setProperty("--ty", Math.min(y * 0.06, 40) + "px");
      if (heroVisual) heroVisual.style.setProperty("--ty", Math.min(y * 0.1, 60) + "px");
      chips.forEach((chip, i) => {
        const dir = i % 2 === 0 ? 1 : -1;
        chip.style.setProperty("--chip-ty", Math.min(y * 0.16, 90) * dir + "px");
      });
      ticking = false;
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
}
