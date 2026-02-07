import { createTimer } from './timer.js';
import { createUI } from './ui.js';
import { createTaskManager } from './tasks.js';
import { createStats } from './stats.js';
import { load, save, saveImmediate } from './storage.js';
import { playChime, showNotification, requestPermission } from './notifications.js';
import { createAmbient } from './ambient.js';
import { createAchievements } from './achievements.js';

// ---- Load persisted state ----
const state = load();
const settings = state.settings;
const timer = createTimer();
const ui = createUI();
const tasks = createTaskManager(state.tasks, state.currentTaskId);
const stats = createStats(state.sessions);
const ambient = createAmbient();
const achievements = createAchievements(state.achievements || []);

let mode = 'work';             // 'work' | 'shortBreak' | 'longBreak'
let pomodorosCompleted = state.pomodorosCompleted || 0;
let streakData = state.streakData || { lastDate: null, count: 0 };

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

function persist() {
  save({
    settings,
    tasks: tasks.getAll(),
    sessions: stats.getSessions(),
    pomodorosCompleted,
    currentTaskId: tasks.getCurrentId(),
    achievements: achievements.getUnlockedIds(),
    streakData,
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
  ui.setTotalDuration(duration);
  ui.setMode(mode);
  ui.setStartButton(false);
  ui.updateTimer(duration);
  ui.resetTabTitle();
  ui.updatePomodoroDots(pomodorosCompleted, settings.longBreakInterval);

  if (autoStart) {
    timer.start();
    ui.setStartButton(true);
    // Start ambient on auto-start work
    if (mode === 'work') startAmbientIfEnabled();
  }
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
timer.onTick((seconds) => {
  ui.updateTimer(seconds);
  const currentTask = tasks.getCurrent();
  ui.updateTabTitle(seconds, mode, currentTask?.name || null);
});

timer.onComplete(() => {
  ui.setStartButton(false);
  stopAmbient();

  if (mode === 'work') {
    pomodorosCompleted++;
    stats.record('work', settings.workDuration);
    tasks.incrementCurrent();
    refreshTasks();

    if (settings.soundEnabled) playChime('work', settings.volume);
    showNotification('Work session complete!', 'Time for a break.');

    // Update streak
    updateStreak();

    // Check daily goal celebration
    const todayPoms = stats.todayPomodoros();
    if (todayPoms === settings.dailyGoal) {
      ui.showGoalCelebration();
    }

    // Decide next break type
    const nextMode = (pomodorosCompleted % settings.longBreakInterval === 0)
      ? 'longBreak'
      : 'shortBreak';
    switchMode(nextMode, settings.autoStartBreaks);
  } else {
    const breakType = mode === 'shortBreak' ? 'shortBreak' : 'longBreak';
    const mins = mode === 'shortBreak' ? settings.shortBreakDuration : settings.longBreakDuration;
    stats.record(breakType, mins);

    if (settings.soundEnabled) playChime('break', settings.volume);
    showNotification('Break is over!', 'Ready to focus?');

    switchMode('work', settings.autoStartPomodoros);
  }

  refreshStats();
  checkAchievements();
  persist();
});

// ---- UI event handlers ----
ui.onStart(() => {
  requestPermission();
  if (timer.isRunning()) {
    timer.pause();
    ui.setStartButton(false);
    ui.resetTabTitle();
    stopAmbient();
  } else {
    timer.start();
    ui.setStartButton(true);
    if (mode === 'work') startAmbientIfEnabled();
  }
});

ui.onReset(() => {
  timer.reset(getDuration(mode));
  ui.setStartButton(false);
  ui.resetTabTitle();
  stopAmbient();
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
  if (timer.isRunning()) {
    // Switching modes while running — reset
    timer.pause();
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

// ---- Theme ----
ui.onThemeToggle(() => {
  settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
  ui.setTheme(settings.theme);
  persist();
});

// ---- Achievements panel ----
ui.onAchievementsOpen(() => {
  ui.renderAchievements(achievements.getAll());
  ui.openAchievements();
});

// ---- Settings ----
ui.onSettingsOpen(() => ui.openSettings());
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
        timer.pause();
        ui.setStartButton(false);
        ui.resetTabTitle();
        stopAmbient();
      } else {
        requestPermission();
        timer.start();
        ui.setStartButton(true);
        if (mode === 'work') startAmbientIfEnabled();
      }
      break;
    case 'KeyS':
      document.querySelector('#btn-skip').click();
      break;
    case 'KeyR':
      document.querySelector('#btn-reset').click();
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
  }
});

// ---- Beforeunload warning ----
window.addEventListener('beforeunload', (e) => {
  if (timer.isRunning()) {
    e.preventDefault();
    // Most modern browsers ignore custom messages, but setting returnValue is required
    e.returnValue = '';
  }
  stopAmbient();
  // Save state immediately on page unload
  persistNow();
});

// ---- Initial render ----
ui.setTheme(settings.theme);
const initialDuration = getDuration('work');
ui.setTotalDuration(initialDuration);
switchMode('work');
ui.loadSettings(settings);
ui.updateCurrentTask(tasks.getCurrent());
refreshTasks();
refreshStats();
ui.renderAchievements(achievements.getAll());
