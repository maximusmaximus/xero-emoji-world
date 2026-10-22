/**
 * Mobile behaviour:
 *  - Native one-finger scrolling across the landscape (the #scroller is overflow:auto).
 *  - Pinch zoom disabled: viewport meta, CSS touch-action: pan-x pan-y, plus iOS Safari
 *    `gesture*` events and multi-touch `touchmove` are cancelled (iOS ignores user-scalable=no).
 *  - Double-tap zoom blocked.
 *  - After 30s of use, enter fullscreen. Browsers require a user gesture for requestFullscreen,
 *    so once 30s have elapsed we arm a one-shot listener and go fullscreen on the next tap/scroll-end.
 *    iOS Safari (iPhone) has no element Fullscreen API: we fall back to `scrollTo(0,1)` and
 *    recommend "Add to Home Screen" (manifest display=fullscreen) — documented in ARCHITECTURE.md.
 */
export const FULLSCREEN_AFTER_MS = 30_000;

export function isSmallViewport() { return matchMedia('(max-width: 900px), (pointer: coarse)').matches; }

export function installMobileGuards() {
  const stop = (e: Event) => e.preventDefault();
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, stop, { passive: false });
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  let lastTouch = 0;
  document.addEventListener('touchend', (e) => { const now = Date.now(); if (now - lastTouch < 300) e.preventDefault(); lastTouch = now; }, { passive: false });
  addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false }); // trackpad pinch
}

export function scheduleFullscreen() {
  if (!isSmallViewport()) return;
  setTimeout(() => {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    const go = () => {
      if (document.fullscreenElement) return;
      const req = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
      if (req) req().then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.('landscape').catch(() => {})).catch(() => {});
      else scrollTo(0, 1); // iOS Safari fallback
    };
    go(); // works if the browser still counts a recent gesture
    const once = () => { go(); if (document.fullscreenElement) for (const ev of ['pointerup', 'touchend', 'keydown']) removeEventListener(ev, once, true); };
    for (const ev of ['pointerup', 'touchend', 'keydown']) addEventListener(ev, once, true);
  }, FULLSCREEN_AFTER_MS);
}
