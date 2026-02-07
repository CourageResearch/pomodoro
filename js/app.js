import { createTimer } from './timer.js';
import { createUI } from './ui.js';
import { createTaskManager } from './tasks.js';
import { createStats } from './stats.js';
import { load, save, saveImmediate } from './storage.js';
import { playChime, showNotification, requestPermission } from './notifications.js';

// ---- Load persisted state ----
const state = load();
const settings = state.settings;
const timer = createTimer();
const ui = createUI();
const tasks = createTaskManager(state.tasks, state.currentTaskId);
const stats = createStats(state.sessions);

let mode = 'work';             // 'work' | 'shortBreak' | 'longBreak'
let pomodorosCompleted = state.pomodorosCompleted || 0;

// ---- Helpers ----
function getDuration(m) {
  switch (m) {
    case 'work': return settings.workDuration * 60;
    case 'shortBreak': return settings.shortBreakDuration * 60;
    case 'longBreak': return settings.longBreakDuration * 60;
  }
}

function persist() {
  save({
    settings,
    tasks: tasks.getAll(),
    sessions: stats.getSessions(),
    pomodorosCompleted,
    currentTaskId: tasks.getCurrentId(),
  });
}

function persistNow() {
  saveImmediate({
    settings,
    tasks: tasks.getAll(),
    sessions: stats.getSessions(),
    pomodorosCompleted,
    currentTaskId: tasks.getCurrentId(),
  });
}

function refreshStats() {
  ui.updateStats(
    stats.todayPomodoros(),
    stats.todayFocusMinutes(),
    tasks.getCompletedCount()
  );
}

function refreshTasks() {
  ui.renderTasks(tasks.getAll(), tasks.getCurrentId(), {
    onToggle(id) {
      tasks.toggleDone(id);
      refreshTasks();
      refreshStats();
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
  });
}

function switchMode(newMode, autoStart = false) {
  mode = newMode;
  timer.reset(getDuration(mode));
  ui.setMode(mode);
  ui.setStartButton(false);
  ui.updateTimer(getDuration(mode));
  ui.resetTabTitle();
  ui.updatePomodoroDots(pomodorosCompleted, settings.longBreakInterval);

  if (autoStart) {
    timer.start();
    ui.setStartButton(true);
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

  if (mode === 'work') {
    pomodorosCompleted++;
    stats.record('work', settings.workDuration);
    tasks.incrementCurrent();
    refreshTasks();

    if (settings.soundEnabled) playChime('work', settings.volume);
    showNotification('Work session complete!', 'Time for a break.');

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
  persist();
});

// ---- UI event handlers ----
ui.onStart(() => {
  requestPermission();
  if (timer.isRunning()) {
    timer.pause();
    ui.setStartButton(false);
    ui.resetTabTitle();
  } else {
    timer.start();
    ui.setStartButton(true);
  }
});

ui.onReset(() => {
  timer.reset(getDuration(mode));
  ui.setStartButton(false);
  ui.resetTabTitle();
});

ui.onSkip(() => {
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

ui.onTaskSubmit((name, est) => {
  const task = tasks.add(name, est);
  // Auto-select if it's the first task
  if (tasks.getAll().length === 1) {
    tasks.select(task.id);
    ui.updateCurrentTask(tasks.getCurrent());
  }
  refreshTasks();
  persist();
});

// ---- Settings ----
ui.onSettingsOpen(() => ui.openSettings());
ui.onSettingsClose(() => ui.closeSettings());
ui.onSettingsChange(() => {
  const newSettings = ui.readSettings();
  Object.assign(settings, newSettings);

  // If timer is not running, update the displayed duration
  if (!timer.isRunning()) {
    timer.reset(getDuration(mode));
  }

  ui.updatePomodoroDots(pomodorosCompleted, settings.longBreakInterval);
  persist();
});

// ---- Keyboard shortcuts ----
document.addEventListener('keydown', (e) => {
  // Don't trigger shortcuts when typing in inputs
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  switch (e.code) {
    case 'Space':
      e.preventDefault();
      if (timer.isRunning()) {
        timer.pause();
        ui.setStartButton(false);
        ui.resetTabTitle();
      } else {
        requestPermission();
        timer.start();
        ui.setStartButton(true);
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
  // Save state immediately on page unload
  persistNow();
});

// ---- Initial render ----
switchMode('work');
ui.loadSettings(settings);
ui.updateCurrentTask(tasks.getCurrent());
refreshTasks();
refreshStats();
