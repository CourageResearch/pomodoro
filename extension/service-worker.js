// Service Worker — manages declarativeNetRequest rules for site blocking

function normalizeDomain(input) {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '');
  d = d.replace(/^www\./, '');
  d = d.replace(/[\/\?#:].*$/, '');
  return d;
}

async function getState() {
  const data = await chrome.storage.sync.get({ blocklist: [], blockingEnabled: true, blockingMode: 'focus' });
  return data;
}

// Track whether a work session is active — only block sites during focus sessions
let timerIsWorking = false;

// Serialize updateRules calls to prevent concurrent "duplicate ID" errors
let rulesQueue = Promise.resolve();

function scheduleUpdateRules(blocklist, enabled, blockingMode) {
  rulesQueue = rulesQueue
    .then(() => updateRules(blocklist, enabled, blockingMode || 'focus'))
    .catch(() => {});
}

async function updateRules(blocklist, enabled, blockingMode) {
  // Remove all existing dynamic rules
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing.map(r => r.id);

  const shouldBlock = blockingMode === 'always' || timerIsWorking;
  const addRules = [];
  if (enabled && shouldBlock && blocklist.length > 0) {
    blocklist.forEach((domain, i) => {
      addRules.push({
        id: i + 1,
        priority: 1,
        action: {
          type: 'redirect',
          redirect: {
            extensionPath: '/blocked.html?domain=' + encodeURIComponent(domain)
          }
        },
        condition: {
          urlFilter: '||' + domain,
          resourceTypes: ['main_frame']
        }
      });
    });
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: removeIds,
    addRules: addRules
  });
}

// Icon — draw remaining minutes directly onto the extension icon (large, readable)
function updateBadge(isWorking, remainingSeconds) {
  if (isWorking && remainingSeconds > 0) {
    const mins = Math.ceil(remainingSeconds / 60);
    drawTimerIcon(String(mins));
  } else {
    // Restore default icon
    chrome.action.setIcon({ path: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' } });
    chrome.action.setBadgeText({ text: '' });
  }
}

function drawTimerIcon(text) {
  const size = 128;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Red circle background
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = '#d4634a';
  ctx.fill();

  // White text — large and bold
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontSize = text.length <= 2 ? 96 : 72;
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillText(text, size / 2, size / 2 + 4);

  const imageData = ctx.getImageData(0, 0, size, size);
  chrome.action.setIcon({ imageData: { 128: imageData } });
  chrome.action.setBadgeText({ text: '' }); // Clear badge, icon IS the display now
}

// Restore timerIsWorking from persisted state and apply rules
async function initRules() {
  const timerData = await chrome.storage.local.get('timerState');
  if (timerData.timerState && timerData.timerState.endTime > Date.now() && timerData.timerState.mode === 'work') {
    timerIsWorking = true;
  } else {
    timerIsWorking = false;
  }
  const { blocklist, blockingEnabled, blockingMode } = await getState();
  scheduleUpdateRules(blocklist, blockingEnabled, blockingMode);
}

chrome.runtime.onInstalled.addListener(() => initRules());
chrome.runtime.onStartup.addListener(() => initRules());

// Listen for messages from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'rulesChanged') {
    const blocklist = Array.isArray(msg.blocklist) ? msg.blocklist : [];
    const blockingEnabled = msg.blockingEnabled !== false;
    const blockingMode = msg.blockingMode || 'focus';
    const currentTaskName = msg.currentTaskName || null;
    // Persist to sync storage (don't trigger storage.onChanged loop — see flag below)
    skipNextStorageChange = true;
    chrome.storage.sync.set({ blocklist, blockingEnabled, blockingMode, currentTaskName });
    scheduleUpdateRules(blocklist, blockingEnabled, blockingMode);
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'timerState') {
    const wasWorking = timerIsWorking;
    timerIsWorking = !!(msg.isWorking && msg.mode === 'work');
    updateBadge(!!msg.isWorking, msg.remainingSeconds || 0);
    // Persist timer state in extension storage (survives page refresh)
    if (msg.isWorking && msg.endTime) {
      chrome.storage.local.set({ timerState: { endTime: msg.endTime, mode: msg.mode || 'work' } });
    } else if (!msg.isWorking) {
      chrome.storage.local.remove('timerState');
    }
    // Re-apply blocking rules when work session starts/stops
    if (wasWorking !== timerIsWorking) {
      getState().then(({ blocklist, blockingEnabled, blockingMode }) => {
        scheduleUpdateRules(blocklist, blockingEnabled, blockingMode);
      });
    }
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'getTimerState') {
    chrome.storage.local.get('timerState', (data) => {
      sendResponse(data.timerState || null);
    });
    return true; // async response
  }
});

// Re-apply when storage changes (cross-device sync only)
let skipNextStorageChange = false;

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    if (skipNextStorageChange) {
      skipNextStorageChange = false;
      return;
    }
    getState().then(({ blocklist, blockingEnabled, blockingMode }) => {
      scheduleUpdateRules(blocklist, blockingEnabled, blockingMode);
    });
  }
});
