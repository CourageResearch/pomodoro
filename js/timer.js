/**
 * Date.now()-based countdown timer.
 * Uses a target end time so it stays accurate even when the browser
 * throttles background tabs.
 */
export function createTimer() {
  let targetTime = 0;     // Unix ms when timer hits zero
  let remaining = 0;       // Seconds remaining (set when paused)
  let running = false;
  let rafId = null;
  let onTick = null;       // (secondsLeft) => void
  let onComplete = null;   // () => void

  function tick() {
    if (!running) return;
    const now = Date.now();
    const left = Math.max(0, Math.ceil((targetTime - now) / 1000));

    if (onTick) onTick(left);

    if (left <= 0) {
      running = false;
      remaining = 0;
      if (onComplete) onComplete();
      return;
    }

    rafId = requestAnimationFrame(tick);
  }

  return {
    /** Set the countdown duration in seconds (does not start) */
    set(seconds) {
      running = false;
      cancelAnimationFrame(rafId);
      remaining = seconds;
      if (onTick) onTick(remaining);
    },

    start() {
      if (running) return;
      if (remaining <= 0) return;
      running = true;
      targetTime = Date.now() + remaining * 1000;
      rafId = requestAnimationFrame(tick);
    },

    pause() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(rafId);
      const now = Date.now();
      remaining = Math.max(0, Math.ceil((targetTime - now) / 1000));
    },

    reset(seconds) {
      running = false;
      cancelAnimationFrame(rafId);
      remaining = seconds;
      if (onTick) onTick(remaining);
    },

    /** Force a UI update (e.g., when tab becomes visible again) */
    sync() {
      if (!running) {
        if (onTick) onTick(remaining);
        return;
      }
      const now = Date.now();
      const left = Math.max(0, Math.ceil((targetTime - now) / 1000));
      if (onTick) onTick(left);
      if (left <= 0) {
        running = false;
        remaining = 0;
        if (onComplete) onComplete();
      }
    },

    isRunning() { return running; },
    getRemaining() {
      if (running) {
        return Math.max(0, Math.ceil((targetTime - Date.now()) / 1000));
      }
      return remaining;
    },
    /** Return the exact target timestamp (ms) so callers can persist it */
    getTargetTime() { return running ? targetTime : 0; },

    onTick(fn) { onTick = fn; },
    onComplete(fn) { onComplete = fn; },
  };
}
