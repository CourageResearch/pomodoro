const STORAGE_KEY = 'pomodoro_app';

const DEFAULTS = {
  settings: {
    workDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    longBreakInterval: 4,
    autoStartBreaks: false,
    autoStartPomodoros: false,
    soundEnabled: true,
    volume: 70,
    dailyGoal: 8,
    theme: 'light',
    ambientEnabled: false,
    ambientType: 'rain',
    ambientVolume: 40,
    blockingEnabled: true,
    blocklist: [],
  },
  tasks: [],
  sessions: [],
  pomodorosCompleted: 0,
  currentTaskId: null,
  achievements: [],
  streakData: { lastDate: null, count: 0 },
  mode: 'work',
  timerEndTime: null,
};

let saveTimeout = null;

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const data = JSON.parse(raw);
    // Merge with defaults so new keys are always present
    return {
      settings: { ...DEFAULTS.settings, ...data.settings },
      tasks: Array.isArray(data.tasks) ? data.tasks.map(t => ({ notes: '', tags: [], ...t })) : [],
      sessions: Array.isArray(data.sessions) ? data.sessions : [],
      pomodorosCompleted: data.pomodorosCompleted || 0,
      currentTaskId: data.currentTaskId ?? null,
      achievements: Array.isArray(data.achievements) ? data.achievements : [],
      streakData: { ...DEFAULTS.streakData, ...data.streakData },
      mode: data.mode || 'work',
      timerEndTime: data.timerEndTime || null,
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function save(state) {
  // Debounced save — 300ms
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or unavailable — fail silently
    }
    // Fire-and-forget sync to server
    syncToServer(state);
  }, 300);
}

function saveImmediate(state) {
  clearTimeout(saveTimeout);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // fail silently
  }
  syncToServer(state);
}

// Merge server state with local state
// Server wins for sessions (union by timestamp) and streakData
// Local wins for transient fields like timerEndTime
function mergeStates(local, server) {
  if (!server || Object.keys(server).length === 0) return local;

  // Union sessions by timestamp (deduplicate)
  const localSessions = Array.isArray(local.sessions) ? local.sessions : [];
  const serverSessions = Array.isArray(server.sessions) ? server.sessions : [];
  const sessionMap = new Map();
  for (const s of serverSessions) {
    sessionMap.set(s.timestamp, s);
  }
  for (const s of localSessions) {
    if (!sessionMap.has(s.timestamp)) {
      sessionMap.set(s.timestamp, s);
    }
  }
  const mergedSessions = [...sessionMap.values()].sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );

  // For blocklist, use whichever has more entries (don't lose server data)
  const localBlocklist = local.settings?.blocklist || [];
  const serverBlocklist = server.settings?.blocklist || [];
  const mergedBlocklist = localBlocklist.length >= serverBlocklist.length
    ? localBlocklist
    : [...new Set([...serverBlocklist, ...localBlocklist])];

  return {
    settings: { ...DEFAULTS.settings, ...server.settings, ...local.settings, blocklist: mergedBlocklist },
    tasks: (local.tasks && local.tasks.length > 0) ? local.tasks : (server.tasks || []),
    sessions: mergedSessions,
    pomodorosCompleted: Math.max(local.pomodorosCompleted || 0, server.pomodorosCompleted || 0),
    currentTaskId: local.currentTaskId ?? server.currentTaskId ?? null,
    achievements: unionArrays(local.achievements, server.achievements),
    streakData: (server.streakData && server.streakData.count > (local.streakData?.count || 0))
      ? server.streakData
      : (local.streakData || DEFAULTS.streakData),
    mode: local.mode || server.mode || 'work',
    timerEndTime: local.timerEndTime || null, // local wins — transient
  };
}

function unionArrays(a, b) {
  if (!Array.isArray(a)) a = [];
  if (!Array.isArray(b)) b = [];
  return [...new Set([...a, ...b])];
}

async function syncFromServer() {
  try {
    const res = await fetch('/api/state');
    if (!res.ok) return;
    const serverState = await res.json();
    if (!serverState || Object.keys(serverState).length === 0) return;

    const localState = load();
    const merged = mergeStates(localState, serverState);

    // Write merged state back to localStorage
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // fail silently
    }
  } catch {
    // Server unavailable — continue with localStorage only
  }
}

function syncToServer(state) {
  // Strip transient fields before sending to server
  const { timerEndTime, ...persistable } = state;
  fetch('/api/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(persistable),
  }).catch(() => {
    // Server unavailable — fail silently
  });
}

export { load, save, saveImmediate, syncFromServer, DEFAULTS };
