// Content script — bridge between the Pomodoro website and the extension service worker.
// Runs at document_start so it can restore timer state before app.js loads.

const STORAGE_KEY = 'pomodoro_app';
const TIMER_KEY = 'pomodoro_timer_active';

// ---- Restore timer state from extension storage BEFORE app.js runs ----
try {
  chrome.runtime.sendMessage({ type: 'getTimerState' }, (timerState) => {
    if (chrome.runtime.lastError) return;
    if (timerState && timerState.endTime) {
      const remaining = Math.max(0, Math.ceil((timerState.endTime - Date.now()) / 1000));
      if (remaining > 0) {
        localStorage.setItem(TIMER_KEY, JSON.stringify(timerState));
      } else {
        localStorage.removeItem(TIMER_KEY);
      }
    }
  });
} catch {
  // Extension context not available
}

// ---- Read blocklist from localStorage ----
function readFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.settings) return null;

    // Resolve current task name
    let currentTaskName = null;
    if (data.currentTaskId && Array.isArray(data.tasks)) {
      const task = data.tasks.find(t => t.id === data.currentTaskId && !t.done);
      if (task) currentTaskName = task.name;
    }

    return {
      blocklist: Array.isArray(data.settings.blocklist) ? data.settings.blocklist : [],
      blockingEnabled: data.settings.blockingEnabled !== false,
      blockingMode: data.settings.blockingMode || 'focus',
      currentTaskName,
    };
  } catch {
    return null;
  }
}

function sendToServiceWorker(blocklist, blockingEnabled, blockingMode, currentTaskName) {
  try {
    chrome.runtime.sendMessage({
      type: 'rulesChanged',
      blocklist,
      blockingEnabled,
      blockingMode: blockingMode || 'focus',
      currentTaskName: currentTaskName || null,
    }).catch(() => {});
  } catch {
    // Extension context invalidated — fail silently
  }
}

// Wait for DOM to be ready before reading localStorage (runs at document_start)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', onReady);
} else {
  onReady();
}

function onReady() {
  const initial = readFromStorage();
  if (initial) {
    sendToServiceWorker(initial.blocklist, initial.blockingEnabled, initial.blockingMode, initial.currentTaskName);
  }
  // Store the Pomodoro app URL so the blocked page can link back to it
  try {
    chrome.storage.sync.set({ pomodoroAppUrl: window.location.origin });
  } catch {}
}

// Listen for updates from the website via window.postMessage
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!event.data) return;

  if (event.data.type === 'pomodoro-blocklist-update') {
    const { blocklist, blockingEnabled, blockingMode, currentTaskName } = event.data;
    sendToServiceWorker(
      Array.isArray(blocklist) ? blocklist : [],
      blockingEnabled !== false,
      blockingMode || 'focus',
      currentTaskName || null
    );
  }

  if (event.data.type === 'pomodoro-timer-state') {
    try {
      chrome.runtime.sendMessage({
        type: 'timerState',
        isWorking: !!event.data.isWorking,
        remainingSeconds: event.data.remainingSeconds || 0,
        endTime: event.data.endTime || null,
        mode: event.data.mode || 'work',
      }).catch(() => {});
    } catch {
      // Extension context invalidated — fail silently
    }
  }
});
