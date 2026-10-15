// Runs synchronously in <head>: enables motion styles only when the user allows motion,
// and falls back to fully visible content if the main runtime fails to load.
(function () {
  var d = document.documentElement;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return;
  d.classList.add("motion-ok");
  setTimeout(function () {
    if (!window.__demoRuntime) d.classList.remove("motion-ok");
  }, 2500);
})();
