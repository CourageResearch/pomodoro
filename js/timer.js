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
  let intervalId = null;   // Background fallback (runs even in background tabs)
  let onTick = null;       // (secondsLeft) => void
  let onComplete = null;   // () => void

  function tick() {
    if (!running) return;
    const now = Date.now();
    const left = Math.max(0, Math.ceil((targetTime - now) / 1000));

    if (onTick) onTick(left);

    if (left <= 0) {
      stop();
      if (onComplete) onComplete();
      return;
    }

    rafId = requestAnimationFrame(tick);
  }

  // Background fallback — setInterval is throttled to ~1s in background tabs
  // but still runs (unlike rAF which is fully paused)
  function bgTick() {
    if (!running) return;
    const now = Date.now();
    const left = Math.max(0, Math.ceil((targetTime - now) / 1000));

    if (onTick) onTick(left);

    if (left <= 0) {
      stop();
      if (onComplete) onComplete();
    }
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
    clearInterval(intervalId);
    remaining = 0;
  }

  return {
    /** Set the countdown duration in seconds (does not start) */
    set(seconds) {
      running = false;
      cancelAnimationFrame(rafId);
      clearInterval(intervalId);
      remaining = seconds;
      if (onTick) onTick(remaining);
    },

    start() {
      if (running) return;
      if (remaining <= 0) return;
      running = true;
      targetTime = Date.now() + remaining * 1000;
      rafId = requestAnimationFrame(tick);
      intervalId = setInterval(bgTick, 1000);
    },

    pause() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(rafId);
      clearInterval(intervalId);
      const now = Date.now();
      remaining = Math.max(0, Math.ceil((targetTime - now) / 1000));
    },

    reset(seconds) {
      running = false;
      cancelAnimationFrame(rafId);
      clearInterval(intervalId);
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
        stop();
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
