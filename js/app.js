import { createTimer } from './timer.js';
import { createUI } from './ui.js';
import { createTaskManager } from './tasks.js';
import { createStats } from './stats.js';
import { load, save, saveImmediate, syncFromServer } from './storage.js';
import { playChime, showNotification, requestPermission } from './notifications.js';
import { createAmbient } from './ambient.js';
import { createAchievements } from './achievements.js';

// ---- Sync from server, then load persisted state ----
await syncFromServer();
const state = load();
const settings = state.settings;
const timer = createTimer();
const ui = createUI();
const tasks = createTaskManager(state.tasks, state.currentTaskId);
const stats = createStats(state.sessions);
const ambient = createAmbient();
const achievements = createAchievements(state.achievements || []);

let mode = state.mode || 'work'; // 'work' | 'shortBreak' | 'longBreak'
let pomodorosCompleted = state.pomodorosCompleted || 0;
let streakData = state.streakData || { lastDate: null, count: 0 };
let distractionCount = 0;

// ---- Helpers ----
function getDuration(m) {
  switch (m) {
    case 'work': return settings.workDuration * 60;
    case 'shortBreak': return settings.shortBreakDuration * 60;
    case 'longBreak': return settings.longBreakDuration * 60;
  }
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// ===========================================================================
// TIMER PERSISTENCE — uses cookie (synchronous, survives any type of refresh)
// plus localStorage as backup. Cookies can't be lost by async race conditions.
// ===========================================================================
const TIMER_KEY = 'pomodoro_timer_active';
const TIMER_COOKIE = 'pomodoro_timer';

function saveTimerState() {
  if (!timer.isRunning()) return;
  const data = JSON.stringify({ endTime: timer.getTargetTime(), mode });
  // Write to cookie (synchronous, bulletproof)
  document.cookie = `${TIMER_COOKIE}=${encodeURIComponent(data)};path=/;max-age=86400;SameSite=Lax`;
  // Also write to localStorage as backup
  try { localStorage.setItem(TIMER_KEY, data); } catch {}
}

function clearTimerState() {
  document.cookie = `${TIMER_COOKIE}=;path=/;max-age=0`;
  try { localStorage.removeItem(TIMER_KEY); } catch {}
}

function loadTimerState() {
  // Try cookie first (most reliable)
  const cookieMatch = document.cookie.match(new RegExp('(?:^|;\\s*)' + TIMER_COOKIE + '=([^;]*)'));
  const sources = [];
  if (cookieMatch) {
    try { sources.push(JSON.parse(decodeURIComponent(cookieMatch[1]))); } catch {}
  }
  // Try localStorage as backup
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    if (raw) sources.push(JSON.parse(raw));
  } catch {}

  for (const data of sources) {
    if (!data || !data.endTime) continue;
    const remaining = Math.max(0, Math.ceil((data.endTime - Date.now()) / 1000));
    if (remaining > 0) {
      return { remaining, mode: data.mode || 'work' };
    }
  }
  // Expired or not found — clean up
  clearTimerState();
  return null;
}
// ===========================================================================

function persist() {
  save({
    settings,
    tasks: tasks.getAll(),
    sessions: stats.getSessions(),
    pomodorosCompleted,
    currentTaskId: tasks.getCurrentId(),
    achievements: achievements.getUnlockedIds(),
    streakData,
    mode,
    timerEndTime: timer.isRunning() ? timer.getTargetTime() : null,
  });
}

function persistNow() {
  saveImmediate({
    settings,
    tasks: tasks.getAll(),
    sessions: stats.getSessions(),
    pomodorosCompleted,
    currentTaskId: tasks.getCurrentId(),
    achievements: achievements.getUnlockedIds(),
    streakData,
    mode,
    timerEndTime: timer.isRunning() ? timer.getTargetTime() : null,
  });
}

function refreshStats() {
  const todayPoms = stats.todayPomodoros();
  ui.updateStats(
    todayPoms,
    stats.todayFocusMinutes(),
    tasks.getCompletedCount()
  );
  ui.updateDailyGoal(todayPoms, settings.dailyGoal);
  ui.setEarned(todayPoms > 0);
  ui.updateStreak(streakData.count);
}

function refreshTasks() {
  ui.renderTasks(tasks.getAll(), tasks.getCurrentId(), {
    onToggle(id) {
      tasks.toggleDone(id);
      refreshTasks();
      refreshStats();
      checkAchievements();
      persist();
    },
    onDelete(id) {
      tasks.remove(id);
      refreshTasks();
      ui.updateCurrentTask(tasks.getCurrent());
      persist();
    },
    onSelect(id) {
      tasks.select(id);
      refreshTasks();
      ui.updateCurrentTask(tasks.getCurrent());
      persist();
      notifyExtension();
    },
    onEdit(id, changes) {
      tasks.update(id, changes);
      refreshTasks();
      // Update current task display if editing the selected task
      if (id === tasks.getCurrentId()) {
        ui.updateCurrentTask(tasks.getCurrent());
      }
      persist();
    },
    onEditCancel() {
      refreshTasks();
    },
    onNoteChange(id, notes) {
      tasks.update(id, { notes });
      persist();
    },
    onReorder(fromIndex, toIndex) {
      tasks.reorder(fromIndex, toIndex);
      refreshTasks();
      persist();
    },
  });
}

function switchMode(newMode, autoStart = false) {
  mode = newMode;
  const duration = getDuration(mode);
  timer.reset(duration);
  clearTimerState();
  ui.setTotalDuration(duration);
  ui.setMode(mode);
  ui.setStartButton(false);
  ui.updateTimer(duration);
  ui.resetTabTitle();
  ui.updatePomodoroDots(pomodorosCompleted, settings.longBreakInterval);

  // Hide distraction counter during breaks
  if (mode !== 'work') ui.hideDistractionCounter();

  if (autoStart) {
    timer.start();
    saveTimerState();
    ui.setStartButton(true);
    if (mode === 'work') {
      startAmbientIfEnabled();
      distractionCount = 0;
      ui.updateDistractionCount(0);
      ui.showDistractionCounter();
    }
  }
  notifyTimerState();
}

// ---- Ambient sound helpers ----
function startAmbientIfEnabled() {
  if (settings.ambientEnabled) {
    ambient.setVolume(settings.ambientVolume);
    ambient.play(settings.ambientType);
  }
}

function stopAmbient() {
  if (ambient.isPlaying()) {
    ambient.stop();
  }
}

// ---- Streak tracking ----
function updateStreak() {
  const today = todayKey();
  if (streakData.lastDate === today) return; // Already counted today

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  if (streakData.lastDate === yesterdayKey) {
    streakData.count++;
  } else if (streakData.lastDate !== today) {
    streakData.count = 1;
  }
  streakData.lastDate = today;
}

// ---- Achievement checking ----
function checkAchievements() {
  const allTasks = tasks.getAll();
  const ctx = {
    totalPomodoros: stats.totalPomodoros(),
    todayPomodoros: stats.todayPomodoros(),
    streak: streakData.count,
    allTasksDone: allTasks.length > 0 && allTasks.every(t => t.done),
    taskCount: allTasks.length,
    dailyGoal: settings.dailyGoal,
  };

  const newUnlocks = achievements.check(ctx);
  newUnlocks.forEach((a, i) => {
    // Stagger toasts if multiple
    setTimeout(() => ui.showAchievementUnlock(a), i * 3200);
  });

  if (newUnlocks.length > 0) {
    ui.renderAchievements(achievements.getAll());
  }
}

// ---- Timer callbacks ----
let lastTickSecond = -1;

timer.onTick((seconds) => {
  ui.updateTimer(seconds);
  const currentTask = tasks.getCurrent();
  ui.updateTabTitle(seconds, mode, currentTask?.name || null);

  // Throttle persistence to once per second (tick fires at ~60fps)
  if (seconds !== lastTickSecond) {
    lastTickSecond = seconds;
    saveTimerState();
    notifyTimerState();
    // Persist full state every 30 seconds
    if (seconds % 30 === 0) persist();
  }
});

timer.onComplete(() => {
  clearTimerState();
  ui.setStartButton(false);
  stopAmbient();

  if (mode === 'work') {
    pomodorosCompleted++;
    tasks.incrementCurrent();
    refreshTasks();

    if (settings.soundEnabled) playChime('work', settings.volume);
    showNotification('Work session complete!', 'Time for a break.');

    // Persist session immediately so it survives a refresh during check-in
    persistNow();

    ui.hideDistractionCounter();

    // Show check-in (note is optional, just hit Done to move on)
    const currentTask = tasks.getCurrent();
    ui.showCheckin(currentTask, distractionCount);
  } else {
    const breakType = mode === 'shortBreak' ? 'shortBreak' : 'longBreak';
    const mins = mode === 'shortBreak' ? settings.shortBreakDuration : settings.longBreakDuration;
    stats.record(breakType, mins);

    if (settings.soundEnabled) playChime('break', settings.volume);
    showNotification('Break is over!', 'Ready to focus?');

    switchMode('work', settings.autoStartPomodoros);
    refreshStats();
    checkAchievements();
    persist();
  }
});

// ---- Check-in callback ----
ui.onCheckinSubmit(({ note, markDone }) => {
  const currentId = tasks.getCurrentId();
  const taskNameForRecord = tasks.getCurrent()?.name || null;
  if (note && currentId) {
    const current = tasks.getCurrent();
    const existing = current?.notes || '';
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const updated = existing ? `${existing}\n[${time}] ${note}` : `[${time}] ${note}`;
    tasks.update(currentId, { notes: updated });
  }

  if (markDone && currentId) {
    tasks.toggleDone(currentId);
  }
  refreshTasks();

  stats.record('work', settings.workDuration, {
    taskName: taskNameForRecord,
    note: note || null,
    distractionCount,
    taskMarkedDone: !!markDone,
  });

  ui.showEffortReward(pomodorosCompleted, stats.todayPomodoros());
  updateStreak();

  const now = new Date();
  if (stats.todayPomodoros() === 1 && (now.getHours() < 9 || (now.getHours() === 9 && now.getMinutes() < 30))) {
    ui.showEarlyBirdBonus();
  }
  if (stats.todayPomodoros() === settings.dailyGoal) {
    ui.showGoalCelebration();
  }

  // Switch to break but don't auto-start — user starts it themselves
  const nextMode = (pomodorosCompleted % settings.longBreakInterval === 0)
    ? 'longBreak'
    : 'shortBreak';
  switchMode(nextMode);

  refreshStats();
  checkAchievements();
  persist();
});

// ---- UI event handlers ----
ui.onStart(() => {
  requestPermission();
  if (timer.isRunning()) {
    // COMMIT MODE: pausing resets the timer. Finish or lose it.
    timer.reset(getDuration(mode));
    clearTimerState();
    ui.setStartButton(false);
    ui.updateTimer(getDuration(mode));
    ui.resetTabTitle();
    stopAmbient();
    ui.hideDistractionCounter();
    notifyTimerState();
  } else {
    // Require tasks that fill the work duration
    const allTasks = tasks.getAll();
    const undoneTasks = allTasks.filter(t => !t.done);
    const totalEstMinutes = undoneTasks.reduce((sum, t) => sum + (t.estimatedPomodoros || 0), 0);
    if (undoneTasks.length < 2) {
      ui.showMinTaskWarning();
      return;
    }
    if (totalEstMinutes < settings.workDuration) {
      ui.showFillTimeWarning(totalEstMinutes, settings.workDuration);
      return;
    }
    timer.start();
    saveTimerState();
    ui.setStartButton(true);
    if (mode === 'work') {
      startAmbientIfEnabled();
      distractionCount = 0;
      ui.updateDistractionCount(0);
      ui.showDistractionCounter();
    }
    persistNow();
    notifyTimerState();
  }
});

ui.onDistraction(() => {
  if (timer.isRunning() && mode === 'work') {
    distractionCount++;
    ui.updateDistractionCount(distractionCount);
  }
});

ui.onReset(() => {
  timer.reset(getDuration(mode));
  clearTimerState();
  ui.setStartButton(false);
  ui.resetTabTitle();
  stopAmbient();
  ui.hideDistractionCounter();
});

ui.onSkip(() => {
  stopAmbient();
  if (mode === 'work') {
    // Skip work — go to break without counting
    const nextMode = (pomodorosCompleted % settings.longBreakInterval === 0 && pomodorosCompleted > 0)
      ? 'longBreak'
      : 'shortBreak';
    switchMode(nextMode);
  } else {
    switchMode('work');
  }
});

ui.onModeTab((newMode) => {
  // Can't manually switch to break — earn your rest
  if (newMode !== 'work') return;

  if (timer.isRunning()) {
    timer.reset(getDuration(mode));
    clearTimerState();
    ui.setStartButton(false);
    ui.updateTimer(getDuration(mode));
    ui.resetTabTitle();
    stopAmbient();
  }
  switchMode(newMode);
});

ui.onFocus(() => {
  if (ui.isFocusMode()) {
    ui.exitFocusMode();
  } else {
    ui.enterFocusMode();
  }
});

ui.onTaskSubmit((name, est, tags) => {
  const task = tasks.add(name, est, tags);
  // Auto-select if it's the first task
  if (tasks.getAll().length === 1) {
    tasks.select(task.id);
    ui.updateCurrentTask(tasks.getCurrent());
  }
  refreshTasks();
  persist();
});

// ---- Filter change ----
ui.onFilterChange(() => {
  refreshTasks();
});

// ---- Site Blocker ----
function notifyExtension() {
  const currentTask = tasks.getCurrent();
  window.postMessage({
    type: 'pomodoro-blocklist-update',
    blocklist: settings.blocklist,
    blockingEnabled: settings.blockingEnabled,
    blockingMode: settings.blockingMode || 'focus',
    currentTaskName: currentTask ? currentTask.name : null,
  }, '*');
}

function notifyTimerState() {
  window.postMessage({
    type: 'pomodoro-timer-state',
    isWorking: timer.isRunning() && mode === 'work',
    remainingSeconds: timer.isRunning() ? timer.getRemaining() : 0,
    endTime: timer.isRunning() ? timer.getTargetTime() : null,
    mode,
  }, '*');
}

ui.onBlocklistAdd((domain) => {
  if (!settings.blocklist) settings.blocklist = [];
  if (settings.blocklist.includes(domain)) return;
  settings.blocklist.push(domain);
  ui.renderBlocklistItems(settings.blocklist);
  persist();
  notifyExtension();
});

ui.onBlocklistRemove((domain) => {
  settings.blocklist = (settings.blocklist || []).filter(d => d !== domain);
  ui.renderBlocklistItems(settings.blocklist);
  persist();
  notifyExtension();
});

ui.onBlocklistToggle((enabled) => {
  settings.blockingEnabled = enabled;
  persist();
  notifyExtension();
});

ui.onBlockingModeChange((mode) => {
  settings.blockingMode = mode;
  persist();
  notifyExtension();
});

// ---- Theme ----
ui.onThemeToggle(() => {
  settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
  ui.setTheme(settings.theme);
  persist();
});

// ---- History panel ----
ui.onHistoryOpen(() => {
  if (ui.isHistoryOpen()) { ui.closeHistory(); return; }
  ui.closeSettings();
  ui.closeAchievements();
  ui.renderHistory(stats.getSessions());
  ui.openHistory();
});

// ---- Achievements panel ----
ui.onAchievementsOpen(() => {
  if (ui.isAchievementsOpen()) { ui.closeAchievements(); return; }
  ui.closeSettings();
  ui.closeHistory();
  ui.renderAchievements(achievements.getAll());
  ui.openAchievements();
});

// ---- Settings ----
ui.onSettingsOpen(() => {
  if (ui.isSettingsOpen()) { ui.closeSettings(); return; }
  ui.closeAchievements();
  ui.closeHistory();
  ui.openSettings();
});
ui.onSettingsClose(() => ui.closeSettings());
ui.onSettingsChange(() => {
  const newSettings = ui.readSettings();
  const ambientChanged = (
    newSettings.ambientEnabled !== settings.ambientEnabled ||
    newSettings.ambientType !== settings.ambientType ||
    newSettings.ambientVolume !== settings.ambientVolume
  );

  Object.assign(settings, newSettings);

  // If timer is not running, update the displayed duration
  if (!timer.isRunning()) {
    const duration = getDuration(mode);
    timer.reset(duration);
    ui.setTotalDuration(duration);
  }

  ui.updatePomodoroDots(pomodorosCompleted, settings.longBreakInterval);
  refreshStats(); // Updates daily goal ring

  // Update ambient sound live
  if (ambientChanged && timer.isRunning() && mode === 'work') {
    if (settings.ambientEnabled) {
      ambient.setVolume(settings.ambientVolume);
      if (ambient.isPlaying() && ambient.getType() !== settings.ambientType) {
        ambient.play(settings.ambientType);
      } else if (!ambient.isPlaying()) {
        ambient.play(settings.ambientType);
      } else {
        ambient.setVolume(settings.ambientVolume);
      }
    } else {
      stopAmbient();
    }
  }

  persist();
});

// ---- Keyboard shortcuts ----
document.addEventListener('keydown', (e) => {
  // Don't trigger shortcuts when typing in inputs
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  // Don't trigger shortcuts when modifier keys are held (e.g. Ctrl+R should reload, not reset)
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  // Don't trigger shortcuts when check-in is open
  if (ui.isCheckinOpen()) return;

  // Escape closes overlays/panels
  if (e.key === 'Escape') {
    if (ui.isShortcutsOpen()) { ui.closeShortcuts(); return; }
    if (ui.isFocusMode()) { ui.exitFocusMode(); return; }
    if (ui.isAnyPanelOpen()) { ui.closeAllPanels(); return; }
    return;
  }

  switch (e.code) {
    case 'Space':
      e.preventDefault();
      if (timer.isRunning()) {
        // COMMIT MODE: pausing resets the timer
        timer.reset(getDuration(mode));
        clearTimerState();
        ui.setStartButton(false);
        ui.updateTimer(getDuration(mode));
        ui.resetTabTitle();
        stopAmbient();
        ui.hideDistractionCounter();
        notifyTimerState();
      } else {
        const kbTasks = tasks.getAll().filter(t => !t.done);
        const kbTotalEst = kbTasks.reduce((sum, t) => sum + (t.estimatedPomodoros || 0), 0);
        if (kbTasks.length < 2) {
          ui.showMinTaskWarning();
          break;
        }
        if (kbTotalEst < settings.workDuration) {
          ui.showFillTimeWarning(kbTotalEst, settings.workDuration);
          break;
        }
        requestPermission();
        timer.start();
        saveTimerState();
        ui.setStartButton(true);
        if (mode === 'work') {
          startAmbientIfEnabled();
          distractionCount = 0;
          ui.updateDistractionCount(0);
          ui.showDistractionCounter();
        }
        persistNow();
        notifyTimerState();
      }
      break;
    case 'KeyS':
      document.querySelector('#btn-skip').click();
      break;
    case 'KeyF':
      if (ui.isFocusMode()) {
        ui.exitFocusMode();
      } else {
        ui.enterFocusMode();
      }
      break;
  }

  // ? key for shortcuts help
  if (e.key === '?' || (e.shiftKey && e.code === 'Slash')) {
    ui.toggleShortcuts();
  }
});

// ---- Fullscreen exit detection ----
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && ui.isFocusMode()) {
    ui.exitFocusMode();
  }
});

// ---- Visibility change — sync timer when tab returns ----
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    timer.sync();
  } else {
    // Tab hidden — save everything immediately
    if (timer.isRunning()) saveTimerState();
    persistNow();
  }
});

// ---- Beforeunload warning ----
window.addEventListener('beforeunload', (e) => {
  if (timer.isRunning()) {
    saveTimerState();
    e.preventDefault();
    e.returnValue = '';
  }
  stopAmbient();
  persistNow();
});

// ============================================================
// INITIAL RENDER — timer resume happens FIRST, before switchMode
// ============================================================
ui.setTheme(settings.theme);

const savedTimer = loadTimerState();

if (savedTimer) {
  // Resume an active timer — do NOT call switchMode (it would reset the timer)
  mode = savedTimer.mode;
  const totalDuration = getDuration(mode);
  ui.setTotalDuration(totalDuration);
  ui.setMode(mode);
  ui.setStartButton(true);
  ui.updateTimer(savedTimer.remaining);
  ui.updatePomodoroDots(pomodorosCompleted, settings.longBreakInterval);
  timer.reset(savedTimer.remaining);
  timer.start();
  saveTimerState(); // Re-save with fresh targetTime from timer.start()
  if (mode === 'work') {
    startAmbientIfEnabled();
    ui.showDistractionCounter();
  }
} else {
  // No active timer — normal initialization
  const initialDuration = getDuration(mode);
  ui.setTotalDuration(initialDuration);
  switchMode(mode);
}

ui.loadSettings(settings);
ui.updateCurrentTask(tasks.getCurrent());
refreshTasks();
refreshStats();
ui.renderAchievements(achievements.getAll());
notifyExtension();
notifyTimerState();
