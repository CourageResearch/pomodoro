let audioCtx = null;

function getCtx() {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

/**
 * Play a synthesized chime.
 * @param {'work'|'break'} type
 * @param {number} volume 0-100
 */
export function playChime(type, volume = 70) {
  try {
    const ctx = getCtx();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const vol = (volume / 100) * 0.4; // max 0.4 to avoid clipping

    if (type === 'work') {
      // Ascending 3-note chime for work complete
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const noteGain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        noteGain.gain.setValueAtTime(vol, ctx.currentTime + i * 0.2);
        noteGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.2 + 0.5);
        osc.connect(noteGain).connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.2);
        osc.stop(ctx.currentTime + i * 0.2 + 0.5);
      });
    } else {
      // Soft two-tone for break complete
      [392, 523.25].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const noteGain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        noteGain.gain.setValueAtTime(vol * 0.7, ctx.currentTime + i * 0.25);
        noteGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.25 + 0.6);
        osc.connect(noteGain).connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.25);
        osc.stop(ctx.currentTime + i * 0.25 + 0.6);
      });
    }
  } catch {
    // Web Audio not available — fail silently
  }
}

/** Request notification permission (call on first user interaction) */
export function requestPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

/** Show a desktop notification */
export function showNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🍅</text></svg>' });
    } catch {
      // Notification failed — not critical
    }
  }
}
