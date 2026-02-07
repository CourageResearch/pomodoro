const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const MODE_LABELS = {
  work: 'Work',
  shortBreak: 'Short Break',
  longBreak: 'Long Break',
};

export function createUI() {
  // Cache DOM references
  const app = $('#app');
  const timerText = $('#timer-text');
  const btnStart = $('#btn-start');
  const btnReset = $('#btn-reset');
  const btnSkip = $('#btn-skip');
  const btnFocus = $('#btn-focus');
  const btnSettings = $('#btn-settings');
  const settingsPanel = $('#settings-panel');
  const settingsClose = $('#settings-close');
  const modeTabs = $$('.mode-tab');
  const currentTaskEl = $('#current-task');
  const currentTaskName = $('#current-task-name');
  const taskForm = $('#task-form');
  const taskInput = $('#task-input');
  const taskEst = $('#task-est');
  const taskList = $('#task-list');
  const pomDots = $('#pomodoro-dots');
  const statPomodoros = $('#stat-pomodoros');
  const statMinutes = $('#stat-minutes');
  const statTasks = $('#stat-tasks');
  const focusOverlay = $('#focus-overlay');
  const focusTimer = $('#focus-timer');
  const focusModeLabel = $('#focus-mode-label');
  const focusCurrentTask = $('#focus-current-task');
  const focusTaskName = $('#focus-task-name');
  const focusBtnStart = $('#focus-btn-start');

  const originalTitle = document.title;
  let focusMode = false;

  return {
    // ---- Timer display ----
    updateTimer(seconds) {
      const m = String(Math.floor(seconds / 60)).padStart(2, '0');
      const s = String(seconds % 60).padStart(2, '0');
      const display = `${m}:${s}`;
      timerText.textContent = display;
      focusTimer.textContent = display;
    },

    updateTabTitle(seconds, mode, taskName) {
      const m = String(Math.floor(seconds / 60)).padStart(2, '0');
      const s = String(seconds % 60).padStart(2, '0');
      const label = MODE_LABELS[mode] || 'Work';
      const suffix = taskName ? ` — ${taskName}` : '';
      document.title = `[${m}:${s}] ${label}${suffix}`;
    },

    resetTabTitle() {
      document.title = originalTitle;
    },

    // ---- Mode ----
    setMode(mode) {
      app.dataset.mode = mode;
      document.body.style.background = `var(--bg)`;
      modeTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.mode === mode);
      });
      focusModeLabel.textContent = MODE_LABELS[mode] || 'Work';
    },

    // ---- Start/Pause button ----
    setStartButton(isRunning) {
      btnStart.textContent = isRunning ? 'Pause' : 'Start';
      focusBtnStart.textContent = isRunning ? 'Pause' : 'Start';
    },

    // ---- Pomodoro dots ----
    updatePomodoroDots(completed, interval) {
      let html = '';
      for (let i = 0; i < interval; i++) {
        html += `<span class="pom-dot${i < (completed % interval) ? ' filled' : ''}"></span>`;
      }
      pomDots.innerHTML = html;
    },

    // ---- Current task ----
    updateCurrentTask(task) {
      if (task) {
        currentTaskEl.hidden = false;
        currentTaskName.textContent = task.name;
        focusCurrentTask.hidden = false;
        focusTaskName.textContent = task.name;
      } else {
        currentTaskEl.hidden = true;
        focusCurrentTask.hidden = true;
      }
    },

    // ---- Task list ----
    renderTasks(tasks, currentTaskId, callbacks) {
      taskList.innerHTML = '';
      tasks.forEach(task => {
        const li = document.createElement('li');
        li.className = `task-item${task.done ? ' completed' : ''}${task.id === currentTaskId ? ' selected' : ''}`;

        const check = document.createElement('input');
        check.type = 'checkbox';
        check.className = 'task-check';
        check.checked = task.done;
        check.addEventListener('change', (e) => {
          e.stopPropagation();
          callbacks.onToggle(task.id);
        });

        const name = document.createElement('span');
        name.className = 'task-name';
        name.textContent = task.name;

        const poms = document.createElement('span');
        poms.className = 'task-pomodoros';
        if (task.estimatedPomodoros) {
          poms.textContent = `${task.completedPomodoros}/${task.estimatedPomodoros} 🍅`;
        } else if (task.completedPomodoros > 0) {
          poms.textContent = `${task.completedPomodoros} 🍅`;
        }

        const del = document.createElement('button');
        del.className = 'task-delete';
        del.textContent = '\u00d7';
        del.title = 'Delete task';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          callbacks.onDelete(task.id);
        });

        li.addEventListener('click', () => callbacks.onSelect(task.id));

        li.append(check, name, poms, del);
        taskList.appendChild(li);
      });
    },

    // ---- Stats ----
    updateStats(pomodoros, minutes, tasksCompleted) {
      statPomodoros.textContent = pomodoros;
      statMinutes.textContent = minutes;
      statTasks.textContent = tasksCompleted;
    },

    // ---- Settings ----
    openSettings() { settingsPanel.hidden = false; },
    closeSettings() { settingsPanel.hidden = true; },

    loadSettings(settings) {
      $('#setting-work').value = settings.workDuration;
      $('#setting-short-break').value = settings.shortBreakDuration;
      $('#setting-long-break').value = settings.longBreakDuration;
      $('#setting-long-break-interval').value = settings.longBreakInterval;
      $('#setting-auto-start-breaks').checked = settings.autoStartBreaks;
      $('#setting-auto-start-pomodoros').checked = settings.autoStartPomodoros;
      $('#setting-sound-enabled').checked = settings.soundEnabled;
      $('#setting-volume').value = settings.volume;
    },

    readSettings() {
      return {
        workDuration: parseInt($('#setting-work').value, 10) || 25,
        shortBreakDuration: parseInt($('#setting-short-break').value, 10) || 5,
        longBreakDuration: parseInt($('#setting-long-break').value, 10) || 15,
        longBreakInterval: parseInt($('#setting-long-break-interval').value, 10) || 4,
        autoStartBreaks: $('#setting-auto-start-breaks').checked,
        autoStartPomodoros: $('#setting-auto-start-pomodoros').checked,
        soundEnabled: $('#setting-sound-enabled').checked,
        volume: parseInt($('#setting-volume').value, 10) || 70,
      };
    },

    // ---- Focus mode ----
    isFocusMode() { return focusMode; },

    async enterFocusMode() {
      focusOverlay.hidden = false;
      focusMode = true;
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        // Fullscreen may be blocked — overlay still works
      }
    },

    exitFocusMode() {
      focusOverlay.hidden = true;
      focusMode = false;
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    },

    // ---- Event binding ----
    onStart(fn) { btnStart.addEventListener('click', fn); focusBtnStart.addEventListener('click', fn); },
    onReset(fn) { btnReset.addEventListener('click', fn); },
    onSkip(fn) { btnSkip.addEventListener('click', fn); },
    onFocus(fn) { btnFocus.addEventListener('click', fn); },
    onSettingsOpen(fn) { btnSettings.addEventListener('click', fn); },
    onSettingsClose(fn) { settingsClose.addEventListener('click', fn); },

    onModeTab(fn) {
      modeTabs.forEach(tab => {
        tab.addEventListener('click', () => fn(tab.dataset.mode));
      });
    },

    onTaskSubmit(fn) {
      taskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = taskInput.value.trim();
        if (!name) return;
        const est = taskEst.value ? parseInt(taskEst.value, 10) : null;
        fn(name, est);
        taskInput.value = '';
        taskEst.value = '';
        taskInput.focus();
      });
    },

    onSettingsChange(fn) {
      settingsPanel.addEventListener('input', fn);
    },
  };
}
