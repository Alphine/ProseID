/**
 * Shared cursor-follow 3D tilt effect. Only ever writes CSS custom
 * properties (--rot-x, --rot-y, --tilt-scale) — the actual `transform`
 * composition lives in CSS so this can coexist with other transform
 * sources (e.g. scroll parallax) on the same element without clobbering.
 * Used by the landing page cards and, with a smaller max angle, by the
 * composer's "Add to scene" cards for a consistent, subtle feel.
 */
export function enableTilt(el, max = 6) {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let raf = null;
  let rotX = 0, rotY = 0, targetX = 0, targetY = 0;

  function apply() {
    rotX += (targetX - rotX) * 0.18;
    rotY += (targetY - rotY) * 0.18;
    el.style.setProperty("--rot-x", rotX.toFixed(2) + "deg");
    el.style.setProperty("--rot-y", rotY.toFixed(2) + "deg");
    const settled = targetX === 0 && targetY === 0 && Math.abs(rotX) < 0.05 && Math.abs(rotY) < 0.05;
    el.style.setProperty("--tilt-scale", settled ? "1" : "1.015");
    if (Math.abs(targetX - rotX) > 0.02 || Math.abs(targetY - rotY) > 0.02) {
      raf = requestAnimationFrame(apply);
    } else {
      raf = null;
    }
  }

  el.addEventListener("mousemove", (e) => {
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    targetX = -py * max;
    targetY = px * max;
    if (!raf) raf = requestAnimationFrame(apply);
  });
  el.addEventListener("mouseleave", () => {
    targetX = 0; targetY = 0;
    if (!raf) raf = requestAnimationFrame(apply);
  });
}
