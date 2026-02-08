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
    theme: 'dark',
    ambientEnabled: false,
    ambientType: 'rain',
    ambientVolume: 40,
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
  }, 300);
}

function saveImmediate(state) {
  clearTimeout(saveTimeout);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // fail silently
  }
}

export { load, save, saveImmediate, DEFAULTS };
