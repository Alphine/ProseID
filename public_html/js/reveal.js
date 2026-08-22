/**
 * Tiny scroll-reveal helper for the landing page. Adds `.in-view` to any
 * `.reveal` element once it's scrolled into view, letting landing.css fade
 * + slide it in. No dependency, ~15 lines.
 */
(function () {
  const els = document.querySelectorAll(".reveal, .reveal-stagger");
  if (!els.length || !("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("in-view"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          io.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );
  els.forEach((el) => io.observe(el));
})();
