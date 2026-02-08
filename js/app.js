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
    timerEndTime: timer.isRunning() ? Date.now() + timer.getRemaining() * 1000 : null,
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
    timerEndTime: timer.isRunning() ? Date.now() + timer.getRemaining() * 1000 : null,
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

  // Hide distraction counter during breaks
  if (mode !== 'work') ui.hideDistractionCounter();

  if (autoStart) {
    timer.start();
    ui.setStartButton(true);
    if (mode === 'work') {
      startAmbientIfEnabled();
      distractionCount = 0;
      ui.updateDistractionCount(0);
      ui.showDistractionCounter();
    }
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
    tasks.incrementCurrent();
    refreshTasks();

    if (settings.soundEnabled) playChime('work', settings.volume);
    showNotification('Work session complete!', 'Time for a break.');

    // Persist session immediately so it survives a refresh during check-in
    persistNow();

    ui.hideDistractionCounter();

    // Show check-in — break is granted only after reflection
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

// ---- Check-in callback — rewards granted only after reflection ----
ui.onCheckinSubmit(({ note, markDone }) => {
  // Capture task name before any mutations
  const currentId = tasks.getCurrentId();
  const taskNameForRecord = tasks.getCurrent()?.name || null;
  if (note && currentId) {
    const current = tasks.getCurrent();
    const existing = current?.notes || '';
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const updated = existing ? `${existing}\n[${time}] ${note}` : `[${time}] ${note}`;
    tasks.update(currentId, { notes: updated });
  }

  // Mark task done if requested
  if (markDone && currentId) {
    tasks.toggleDone(currentId);
  }
  refreshTasks();

  // Record enriched session — credit granted after reflection
  stats.record('work', settings.workDuration, {
    taskName: taskNameForRecord,
    note: note || null,
    distractionCount,
    taskMarkedDone: !!markDone,
  });

  // Now grant the rewards
  ui.showEffortReward(pomodorosCompleted, stats.todayPomodoros());
  updateStreak();

  const todayPoms = stats.todayPomodoros();
  if (todayPoms === settings.dailyGoal) {
    ui.showGoalCelebration();
  }

  // Transition to break
  const nextMode = (pomodorosCompleted % settings.longBreakInterval === 0)
    ? 'longBreak'
    : 'shortBreak';
  switchMode(nextMode, settings.autoStartBreaks);

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
    ui.setStartButton(false);
    ui.updateTimer(getDuration(mode));
    ui.resetTabTitle();
    stopAmbient();
    ui.hideDistractionCounter();
  } else {
    // Require at least 2 tasks before starting
    const allTasks = tasks.getAll();
    if (allTasks.length < 2) {
      ui.showMinTaskWarning();
      return;
    }
    timer.start();
    ui.setStartButton(true);
    if (mode === 'work') {
      startAmbientIfEnabled();
      distractionCount = 0;
      ui.updateDistractionCount(0);
      ui.showDistractionCounter();
    }
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

// ---- Theme ----
ui.onThemeToggle(() => {
  settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
  ui.setTheme(settings.theme);
  persist();
});

// ---- History panel ----
ui.onHistoryOpen(() => {
  ui.closeSettings();
  ui.closeAchievements();
  ui.renderHistory(stats.getSessions());
  ui.openHistory();
});

// ---- Achievements panel ----
ui.onAchievementsOpen(() => {
  ui.closeSettings();
  ui.closeHistory();
  ui.renderAchievements(achievements.getAll());
  ui.openAchievements();
});

// ---- Settings ----
ui.onSettingsOpen(() => {
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
        ui.setStartButton(false);
        ui.updateTimer(getDuration(mode));
        ui.resetTabTitle();
        stopAmbient();
        ui.hideDistractionCounter();
      } else {
        if (tasks.getAll().length < 2) {
          ui.showMinTaskWarning();
          break;
        }
        requestPermission();
        timer.start();
        ui.setStartButton(true);
        if (mode === 'work') {
          startAmbientIfEnabled();
          distractionCount = 0;
          ui.updateDistractionCount(0);
          ui.showDistractionCounter();
        }
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
const initialDuration = getDuration(mode);
ui.setTotalDuration(initialDuration);
switchMode(mode);
ui.loadSettings(settings);
ui.updateCurrentTask(tasks.getCurrent());
refreshTasks();
refreshStats();
ui.renderAchievements(achievements.getAll());

// ---- Resume timer if it was running before page refresh ----
if (state.timerEndTime) {
  const remaining = Math.max(0, Math.ceil((state.timerEndTime - Date.now()) / 1000));
  if (remaining > 0) {
    timer.reset(remaining);
    timer.start();
    ui.setStartButton(true);
    ui.updateTimer(remaining);
    if (mode === 'work') {
      startAmbientIfEnabled();
      ui.showDistractionCounter();
    }
  }
  // If remaining <= 0: session elapsed while away. Commit mode — you weren't there.
}
