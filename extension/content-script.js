// Content script — bridge between the Pomodoro website and the extension service worker.
// Injected on the Pomodoro app page. Reads blocklist from localStorage and relays
// updates to the service worker via chrome.runtime.sendMessage.

const STORAGE_KEY = 'pomodoro_app';

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
      currentTaskName,
    };
  } catch {
    return null;
  }
}

function sendToServiceWorker(blocklist, blockingEnabled, currentTaskName) {
  chrome.runtime.sendMessage({
    type: 'rulesChanged',
    blocklist,
    blockingEnabled,
    currentTaskName: currentTaskName || null,
  }).catch(() => {
    // Extension context may not be available — fail silently
  });
}

// On load: read from localStorage and send initial state
const initial = readFromStorage();
if (initial) {
  sendToServiceWorker(initial.blocklist, initial.blockingEnabled, initial.currentTaskName);
}

// Store the Pomodoro app URL so the blocked page can link back to it
chrome.storage.sync.set({ pomodoroAppUrl: window.location.origin });

// Listen for updates from the website via window.postMessage
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!event.data) return;

  if (event.data.type === 'pomodoro-blocklist-update') {
    const { blocklist, blockingEnabled, currentTaskName } = event.data;
    sendToServiceWorker(
      Array.isArray(blocklist) ? blocklist : [],
      blockingEnabled !== false,
      currentTaskName || null
    );
  }

  if (event.data.type === 'pomodoro-timer-state') {
    chrome.runtime.sendMessage({
      type: 'timerState',
      isWorking: !!event.data.isWorking,
    }).catch(() => {});
  }
});
