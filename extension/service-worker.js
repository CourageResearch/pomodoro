// Service Worker — manages declarativeNetRequest rules for site blocking

function normalizeDomain(input) {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '');
  d = d.replace(/^www\./, '');
  d = d.replace(/[\/\?#:].*$/, '');
  return d;
}

async function getState() {
  const data = await chrome.storage.sync.get({ blocklist: [], blockingEnabled: true });
  return data;
}

// Serialize updateRules calls to prevent concurrent "duplicate ID" errors
let rulesQueue = Promise.resolve();

function scheduleUpdateRules(blocklist, enabled) {
  rulesQueue = rulesQueue
    .then(() => updateRules(blocklist, enabled))
    .catch(() => {});
}

async function updateRules(blocklist, enabled) {
  // Remove all existing dynamic rules
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing.map(r => r.id);

  const addRules = [];
  if (enabled && blocklist.length > 0) {
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

// Badge — show work-session indicator on extension icon
function updateBadge(isWorking) {
  if (isWorking) {
    chrome.action.setBadgeText({ text: ' ' });
    chrome.action.setBadgeBackgroundColor({ color: '#d4634a' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Apply rules on install/startup
chrome.runtime.onInstalled.addListener(async () => {
  const { blocklist, blockingEnabled } = await getState();
  scheduleUpdateRules(blocklist, blockingEnabled);
});

chrome.runtime.onStartup.addListener(async () => {
  const { blocklist, blockingEnabled } = await getState();
  scheduleUpdateRules(blocklist, blockingEnabled);
  // Clear badge on startup (no session running yet)
  updateBadge(false);
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'rulesChanged') {
    const blocklist = Array.isArray(msg.blocklist) ? msg.blocklist : [];
    const blockingEnabled = msg.blockingEnabled !== false;
    const currentTaskName = msg.currentTaskName || null;
    // Persist to sync storage (don't trigger storage.onChanged loop — see flag below)
    skipNextStorageChange = true;
    chrome.storage.sync.set({ blocklist, blockingEnabled, currentTaskName });
    scheduleUpdateRules(blocklist, blockingEnabled);
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'timerState') {
    updateBadge(!!msg.isWorking);
    sendResponse({ ok: true });
    return false;
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
    getState().then(({ blocklist, blockingEnabled }) => {
      scheduleUpdateRules(blocklist, blockingEnabled);
    });
  }
});
