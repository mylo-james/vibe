const system = matchMedia('(prefers-reduced-motion: reduce)');
// Discard the removed manual preference; system accessibility settings stay authoritative.
try {
  localStorage.removeItem('vibe-motion-paused');
} catch {}
const visible = new WeakMap();
function refresh() {
  const stopped = system.matches;
  document.documentElement.dataset.motion = stopped ? 'off' : 'on';
  for (const node of document.querySelectorAll('[data-motion]')) {
    const running =
      !stopped &&
      !document.hidden &&
      visible.get(node) !== false &&
      (!node.classList.contains('player-record') || node.dataset.playing === 'true');
    node.style.animationPlayState = running ? 'running' : 'paused';
  }
}
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) visible.set(entry.target, entry.isIntersecting);
  refresh();
});
for (const node of document.querySelectorAll('[data-motion]')) observer.observe(node);
system.addEventListener('change', refresh);
document.addEventListener('visibilitychange', refresh);
document.addEventListener('vibe:playback', refresh);
refresh();
