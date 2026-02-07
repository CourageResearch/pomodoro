const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const MODE_LABELS = {
  work: 'Work',
  shortBreak: 'Short Break',
  longBreak: 'Long Break',
};

const TAG_COLORS = {
  Work: '#e74c3c',
  Personal: '#3498db',
  Urgent: '#e67e22',
  Learning: '#9b59b6',
  Health: '#2ecc71',
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
  const btnTheme = $('#btn-theme');
  const btnAchievements = $('#btn-achievements');
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
  const shortcutsOverlay = $('#shortcuts-overlay');
  const shortcutsClose = $('#shortcuts-close');
  const achievementsPanel = $('#achievements-panel');
  const achievementsClose = $('#achievements-close');
  const achievementsGrid = $('#achievements-grid');
  const achievementToast = $('#achievement-toast');
  const goalCelebration = $('#goal-celebration');
  const timerRing = $('#timer-ring');
  const goalRing = $('#goal-ring');
  const tagPicker = $('#tag-picker');
  const tagFilters = $('#task-filters');

  const originalTitle = document.title;
  let focusMode = false;
  let editingTaskId = null;
  let totalDuration = 0;
  let activeFilter = 'all';
  let selectedTags = [];

  // SVG ring constants
  const TIMER_RING_CIRCUMFERENCE = 2 * Math.PI * 110; // ~691.15
  const GOAL_RING_CIRCUMFERENCE = 2 * Math.PI * 98;   // ~615.75

  // Theme icon management
  const iconMoon = btnTheme.querySelector('.icon-moon');
  const iconSun = btnTheme.querySelector('.icon-sun');

  // Tag picker toggle logic
  tagPicker.querySelectorAll('.tag-pill').forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.preventDefault();
      const tag = pill.dataset.tag;
      const idx = selectedTags.indexOf(tag);
      if (idx >= 0) {
        selectedTags.splice(idx, 1);
        pill.classList.remove('selected');
      } else {
        selectedTags.push(tag);
        pill.classList.add('selected');
      }
    });
  });

  // Tag filter logic
  tagFilters.querySelectorAll('.tag-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      tagFilters.querySelectorAll('.tag-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.tag;
      // Trigger a re-render via callback
      if (filterCallback) filterCallback();
    });
  });

  let filterCallback = null;

  // Shortcuts overlay
  shortcutsClose.addEventListener('click', () => { shortcutsOverlay.hidden = true; });
  shortcutsOverlay.addEventListener('click', (e) => {
    if (e.target === shortcutsOverlay) shortcutsOverlay.hidden = true;
  });

  // Achievements panel
  achievementsClose.addEventListener('click', () => { achievementsPanel.hidden = true; });

  let toastTimeout = null;

  return {
    // ---- Timer display ----
    updateTimer(seconds) {
      const m = String(Math.floor(seconds / 60)).padStart(2, '0');
      const s = String(seconds % 60).padStart(2, '0');
      const display = `${m}:${s}`;
      timerText.textContent = display;
      focusTimer.textContent = display;
      this.updateTimerRing(seconds);
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

    // ---- Timer ring ----
    setTotalDuration(seconds) {
      totalDuration = seconds;
    },

    updateTimerRing(secondsLeft) {
      if (totalDuration <= 0) return;
      const fraction = secondsLeft / totalDuration;
      const offset = TIMER_RING_CIRCUMFERENCE * (1 - fraction);
      timerRing.style.strokeDashoffset = offset;
    },

    // ---- Daily goal ring ----
    updateDailyGoal(completed, goal) {
      const fraction = Math.min(completed / goal, 1);
      const offset = GOAL_RING_CIRCUMFERENCE * (1 - fraction);
      goalRing.style.strokeDashoffset = offset;
    },

    showGoalCelebration() {
      goalCelebration.hidden = false;
      setTimeout(() => { goalCelebration.hidden = true; }, 1300);
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

    // ---- Theme ----
    setTheme(theme) {
      document.documentElement.dataset.theme = theme;
      if (theme === 'light') {
        iconMoon.style.display = 'none';
        iconSun.style.display = '';
      } else {
        iconMoon.style.display = '';
        iconSun.style.display = 'none';
      }
    },

    onThemeToggle(fn) {
      btnTheme.addEventListener('click', fn);
    },

    // ---- Shortcuts overlay ----
    toggleShortcuts() {
      shortcutsOverlay.hidden = !shortcutsOverlay.hidden;
    },

    closeShortcuts() {
      shortcutsOverlay.hidden = true;
    },

    isShortcutsOpen() {
      return !shortcutsOverlay.hidden;
    },

    // ---- Task list ----
    renderTasks(tasks, currentTaskId, callbacks) {
      taskList.innerHTML = '';
      editingTaskId = null;

      // Apply tag filter (UI-only filtering)
      const filteredTasks = activeFilter === 'all'
        ? tasks
        : tasks.filter(t => t.tags && t.tags.includes(activeFilter));

      filteredTasks.forEach((task, filteredIndex) => {
        // Find the real index in the original task array for reordering
        const realIndex = tasks.indexOf(task);

        const li = document.createElement('li');
        li.className = `task-item${task.done ? ' completed' : ''}${task.id === currentTaskId ? ' selected' : ''}`;
        li.dataset.taskId = task.id;
        li.dataset.index = realIndex;

        // Drag handle
        const dragHandle = document.createElement('span');
        dragHandle.className = 'task-drag-handle';
        dragHandle.textContent = '⠿';
        dragHandle.draggable = true;

        // Drag events
        dragHandle.addEventListener('dragstart', (e) => {
          li.classList.add('dragging');
          e.dataTransfer.setData('text/plain', realIndex);
          e.dataTransfer.effectAllowed = 'move';
        });

        li.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          li.classList.add('drag-over');
        });

        li.addEventListener('dragleave', () => {
          li.classList.remove('drag-over');
        });

        li.addEventListener('drop', (e) => {
          e.preventDefault();
          li.classList.remove('drag-over');
          const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
          const toIndex = realIndex;
          if (fromIndex !== toIndex && callbacks.onReorder) {
            callbacks.onReorder(fromIndex, toIndex);
          }
        });

        li.addEventListener('dragend', () => {
          li.classList.remove('dragging');
          taskList.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        });

        const check = document.createElement('input');
        check.type = 'checkbox';
        check.className = 'task-check';
        check.checked = task.done;
        check.addEventListener('change', (e) => {
          e.stopPropagation();
          // Completion animation (only on check, not uncheck)
          if (check.checked) {
            li.classList.add('completing');
            setTimeout(() => {
              callbacks.onToggle(task.id);
            }, 600);
          } else {
            callbacks.onToggle(task.id);
          }
        });

        const name = document.createElement('span');
        name.className = 'task-name';
        name.textContent = task.name;

        // Double-click to edit
        name.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          if (editingTaskId === task.id) return;
          editingTaskId = task.id;

          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'task-name-input';
          input.value = task.name;

          const commit = () => {
            const newName = input.value.trim();
            if (newName && newName !== task.name && callbacks.onEdit) {
              callbacks.onEdit(task.id, { name: newName });
            }
            editingTaskId = null;
          };

          const cancel = () => {
            editingTaskId = null;
            // Re-render will restore the span
            if (callbacks.onEditCancel) callbacks.onEditCancel();
          };

          input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') { commit(); }
            if (ev.key === 'Escape') { cancel(); }
          });
          input.addEventListener('blur', commit);

          name.replaceWith(input);
          input.focus();
          input.select();
        });

        // Tags display
        const tagsContainer = document.createElement('span');
        tagsContainer.className = 'task-tags';
        if (task.tags && task.tags.length > 0) {
          task.tags.forEach(tag => {
            const pill = document.createElement('span');
            pill.className = 'task-tag';
            pill.textContent = tag;
            pill.style.setProperty('--tag-color', TAG_COLORS[tag] || 'var(--surface)');
            pill.style.background = TAG_COLORS[tag] || 'var(--surface)';
            tagsContainer.appendChild(pill);
          });
        }

        // Notes toggle
        const notesBtn = document.createElement('button');
        notesBtn.className = `task-notes-toggle${task.notes ? ' has-notes' : ''}`;
        notesBtn.textContent = '📝';
        notesBtn.title = 'Toggle notes';
        notesBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const existing = li.parentElement.querySelector(`.task-notes-area[data-task-id="${task.id}"]`);
          if (existing) {
            existing.remove();
          } else {
            const notesDiv = document.createElement('div');
            notesDiv.className = 'task-notes-area';
            notesDiv.dataset.taskId = task.id;
            const textarea = document.createElement('textarea');
            textarea.value = task.notes || '';
            textarea.placeholder = 'Add notes...';
            textarea.addEventListener('blur', () => {
              if (callbacks.onNoteChange) {
                callbacks.onNoteChange(task.id, textarea.value);
              }
            });
            textarea.addEventListener('click', (ev) => ev.stopPropagation());
            notesDiv.appendChild(textarea);
            // Insert after the li
            li.after(notesDiv);
            textarea.focus();
          }
        });

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

        li.append(dragHandle, check, name, tagsContainer, notesBtn, poms, del);
        taskList.appendChild(li);
      });
    },

    getActiveFilter() { return activeFilter; },

    getSelectedTags() {
      const tags = [...selectedTags];
      // Reset after reading
      selectedTags = [];
      tagPicker.querySelectorAll('.tag-pill').forEach(p => p.classList.remove('selected'));
      return tags;
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
      $('#setting-daily-goal').value = settings.dailyGoal;
      $('#setting-ambient-enabled').checked = settings.ambientEnabled;
      $('#setting-ambient-type').value = settings.ambientType;
      $('#setting-ambient-volume').value = settings.ambientVolume;
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
        dailyGoal: parseInt($('#setting-daily-goal').value, 10) || 8,
        ambientEnabled: $('#setting-ambient-enabled').checked,
        ambientType: $('#setting-ambient-type').value,
        ambientVolume: parseInt($('#setting-ambient-volume').value, 10) || 40,
      };
    },

    // ---- Achievements ----
    renderAchievements(achievements) {
      achievementsGrid.innerHTML = '';
      achievements.forEach(a => {
        const card = document.createElement('div');
        card.className = `achievement-card${a.unlocked ? '' : ' locked'}`;
        card.innerHTML = `
          <div class="achievement-icon">${a.icon}</div>
          <div class="achievement-name">${a.name}</div>
          <div class="achievement-desc">${a.desc}</div>
        `;
        achievementsGrid.appendChild(card);
      });
    },

    openAchievements() { achievementsPanel.hidden = false; },
    closeAchievements() { achievementsPanel.hidden = true; },

    showAchievementUnlock(achievement) {
      clearTimeout(toastTimeout);
      achievementToast.innerHTML = `
        <span class="toast-icon">${achievement.icon}</span>
        <div>
          <div class="toast-label">Achievement Unlocked!</div>
          <div class="toast-text">${achievement.name}</div>
        </div>
      `;
      achievementToast.hidden = false;
      // Force re-trigger animation
      achievementToast.style.animation = 'none';
      achievementToast.offsetHeight; // reflow
      achievementToast.style.animation = '';
      toastTimeout = setTimeout(() => { achievementToast.hidden = true; }, 3000);
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

    // ---- Close all panels helper ----
    closeAllPanels() {
      settingsPanel.hidden = true;
      achievementsPanel.hidden = true;
    },

    isAnyPanelOpen() {
      return !settingsPanel.hidden || !achievementsPanel.hidden;
    },

    // ---- Event binding ----
    onStart(fn) { btnStart.addEventListener('click', fn); focusBtnStart.addEventListener('click', fn); },
    onReset(fn) { btnReset.addEventListener('click', fn); },
    onSkip(fn) { btnSkip.addEventListener('click', fn); },
    onFocus(fn) { btnFocus.addEventListener('click', fn); },
    onSettingsOpen(fn) { btnSettings.addEventListener('click', fn); },
    onSettingsClose(fn) { settingsClose.addEventListener('click', fn); },
    onAchievementsOpen(fn) { btnAchievements.addEventListener('click', fn); },

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
        const tags = [...selectedTags];
        fn(name, est, tags);
        taskInput.value = '';
        taskEst.value = '';
        // Reset tag picker
        selectedTags = [];
        tagPicker.querySelectorAll('.tag-pill').forEach(p => p.classList.remove('selected'));
        taskInput.focus();
      });
    },

    onSettingsChange(fn) {
      settingsPanel.addEventListener('input', fn);
      settingsPanel.addEventListener('change', fn);
    },

    onFilterChange(fn) {
      filterCallback = fn;
    },
  };
}
