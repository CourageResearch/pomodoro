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

function formatDateLabel(dateKey) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dateKey === today) return 'Today';
  if (dateKey === yesterday) return 'Yesterday';
  const [y, m, d] = dateKey.split('-');
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

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
  const estPicker = $('#est-picker');
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
  const earlyBirdBonus = $('#early-bird-bonus');
  const timerRing = $('#timer-ring');
  const goalRing = $('#goal-ring');
  const tagPicker = $('#tag-picker');
  const tagFilters = $('#task-filters');
  const distractionCounter = $('#distraction-counter');
  const btnDistraction = $('#btn-distraction');
  const distractionCountEl = $('#distraction-count');
  const checkinDistractions = $('#checkin-distractions');
  const sessionCheckin = $('#session-checkin');
  const checkinTask = $('#checkin-task');
  const checkinNote = $('#checkin-note');
  const checkinMarkDone = $('#checkin-mark-done');
  const checkinMarkDoneLabel = $('#checkin-mark-done-label');
  const checkinSubmitBtn = $('#checkin-submit');
  const historyPanel = $('#history-panel');
  const historyClose = $('#history-close');
  const historyList = $('#history-list');
  const btnHistory = $('#btn-history');

  const originalTitle = document.title;
  let focusMode = false;
  let editingTaskId = null;
  let totalDuration = 0;
  let activeFilter = 'all';
  let selectedTags = [];
  let selectedEst = null;

  // Estimate picker toggle logic
  estPicker.querySelectorAll('.est-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const val = parseInt(btn.dataset.est, 10);
      if (selectedEst === val) {
        selectedEst = null;
        btn.classList.remove('selected');
      } else {
        selectedEst = val;
        estPicker.querySelectorAll('.est-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      }
    });
  });

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

  // History panel
  historyClose.addEventListener('click', () => { historyPanel.hidden = true; });

  // Check-in validation
  function updateCheckinState() {
    const hasNote = checkinNote.value.trim().length >= 3;
    const isDone = checkinMarkDone.checked;
    checkinSubmitBtn.disabled = !(hasNote || isDone);
  }
  checkinNote.addEventListener('input', updateCheckinState);
  checkinMarkDone.addEventListener('change', updateCheckinState);

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

    showMinTaskWarning() {
      // Briefly shake the start button and flash the task input
      btnStart.style.animation = 'none';
      btnStart.offsetHeight;
      btnStart.style.animation = 'shake 0.4s ease';
      taskInput.focus();
      taskInput.placeholder = 'Add at least 2 tasks to start...';
      setTimeout(() => {
        btnStart.style.animation = '';
        taskInput.placeholder = 'Add a task...';
      }, 2000);
    },

    // ---- Effort reward (variable reinforcement) ----
    showEffortReward(totalPoms, todayPoms) {
      const rewards = [
        'You showed up. That\'s the hardest part.',
        'Discipline is choosing between what you want now and what you want most.',
        'One more rep.',
        'The work is the reward.',
        'You\'re building something. Keep going.',
        'Hard things become easy things with repetition.',
        'Earned, not given.',
        'The pain you feel today is the strength you feel tomorrow.',
        'You didn\'t quit. That matters.',
        'Momentum is real. You have it now.',
        'Nobody cares. Work harder.',
        'Comfort is the enemy of progress.',
        'You\'re ahead of everyone who gave up.',
        'The grind is the glory.',
        'Small daily improvements compound into massive results.',
      ];

      // Only show ~60% of the time — intermittent reinforcement
      if (Math.random() > 0.6) return;

      const msg = rewards[Math.floor(Math.random() * rewards.length)];
      const el = document.getElementById('effort-reward');
      if (el) {
        el.textContent = msg;
        el.hidden = false;
        el.style.animation = 'none';
        el.offsetHeight;
        el.style.animation = '';
        setTimeout(() => { el.hidden = true; }, 4000);
      }
    },

    // ---- Early Bird Bonus ----
    showEarlyBirdBonus() {
      earlyBirdBonus.textContent = '\u2600\uFE0F Early Bird — first session before 9:30 AM!';
      earlyBirdBonus.hidden = false;
      earlyBirdBonus.style.animation = 'none';
      earlyBirdBonus.offsetHeight;
      earlyBirdBonus.style.animation = '';
      setTimeout(() => { earlyBirdBonus.hidden = true; }, 5000);
    },

    // ---- Distraction counter ----
    showDistractionCounter() { distractionCounter.hidden = false; },
    hideDistractionCounter() { distractionCounter.hidden = true; },
    updateDistractionCount(count) {
      distractionCountEl.textContent = count;
      distractionCounter.classList.toggle('has-distractions', count > 0);
    },
    onDistraction(fn) { btnDistraction.addEventListener('click', fn); },

    // ---- Session check-in (accountability gate) ----
    showCheckin(task, distractionCount = 0) {
      if (task && !task.done) {
        checkinTask.textContent = task.name;
        checkinTask.hidden = false;
        checkinMarkDoneLabel.hidden = false;
      } else if (task) {
        checkinTask.textContent = task.name;
        checkinTask.hidden = false;
        checkinMarkDoneLabel.hidden = true;
      } else {
        checkinTask.textContent = '';
        checkinTask.hidden = true;
        checkinMarkDoneLabel.hidden = true;
      }
      // Show distraction count
      if (distractionCount === 0) {
        checkinDistractions.textContent = '0 distractions — clean session';
        checkinDistractions.className = 'checkin-distractions clean';
        checkinDistractions.hidden = false;
      } else {
        checkinDistractions.textContent = `${distractionCount} distraction${distractionCount !== 1 ? 's' : ''}`;
        checkinDistractions.className = 'checkin-distractions distracted';
        checkinDistractions.hidden = false;
      }
      checkinNote.value = '';
      checkinMarkDone.checked = false;
      checkinSubmitBtn.disabled = true;
      sessionCheckin.hidden = false;
      setTimeout(() => checkinNote.focus(), 300);
    },

    isCheckinOpen() {
      return !sessionCheckin.hidden;
    },

    onCheckinSubmit(fn) {
      checkinSubmitBtn.addEventListener('click', () => {
        const note = checkinNote.value.trim();
        const markDone = checkinMarkDone.checked;
        sessionCheckin.hidden = true;
        fn({ note, markDone });
      });
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
      btnStart.textContent = isRunning ? 'Quit' : 'Start';
      focusBtnStart.textContent = isRunning ? 'Quit' : 'Start';
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

    // ---- Earned state (dopamine follows effort) ----
    setEarned(earned) {
      app.dataset.earned = earned ? 'true' : 'false';
    },

    // ---- Streak display ----
    updateStreak(count) {
      const el = document.getElementById('streak-count');
      if (el) {
        el.textContent = count > 0 ? `${count} day${count !== 1 ? 's' : ''}` : '0 days';
        // Pulse animation when streak is active
        if (count > 0) {
          el.parentElement.classList.add('streak-active');
        } else {
          el.parentElement.classList.remove('streak-active');
        }
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
        check.addEventListener('click', (e) => {
          e.stopPropagation();
        });
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

        li.append(dragHandle, check, name, tagsContainer, poms, del);
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

    // ---- History panel ----
    openHistory() { historyPanel.hidden = false; },
    closeHistory() { historyPanel.hidden = true; },
    onHistoryOpen(fn) { btnHistory.addEventListener('click', fn); },

    renderHistory(sessions) {
      historyList.innerHTML = '';
      const workSessions = sessions
        .filter(s => s.mode === 'work')
        .sort((a, b) => b.timestamp - a.timestamp);

      if (workSessions.length === 0) {
        historyList.innerHTML = '<p class="history-empty">No sessions yet. Complete a pomodoro to see your history.</p>';
        return;
      }

      // Group by date
      const groups = {};
      workSessions.forEach(s => {
        const key = s.date;
        if (!groups[key]) groups[key] = [];
        groups[key].push(s);
      });

      Object.keys(groups).sort().reverse().forEach(dateKey => {
        const label = document.createElement('div');
        label.className = 'history-date-label';
        label.textContent = formatDateLabel(dateKey);
        historyList.appendChild(label);

        groups[dateKey].forEach(s => {
          const card = document.createElement('div');
          card.className = 'history-card';

          const time = new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          let html = `<div class="history-card-header"><span class="history-time">${escapeHtml(time)}</span><span class="history-duration">${s.durationMinutes} min</span></div>`;

          if (s.taskName) {
            html += `<div class="history-task">${escapeHtml(s.taskName)}`;
            if (s.taskMarkedDone) html += ' <span class="history-done-badge">Done</span>';
            html += '</div>';
          }

          if (s.note) {
            html += `<div class="history-note">${escapeHtml(s.note)}</div>`;
          }

          if (typeof s.distractionCount === 'number') {
            if (s.distractionCount === 0) {
              html += '<div class="history-distractions clean">0 distractions</div>';
            } else {
              html += `<div class="history-distractions distracted">${s.distractionCount} distraction${s.distractionCount !== 1 ? 's' : ''}</div>`;
            }
          }

          card.innerHTML = html;
          historyList.appendChild(card);
        });
      });
    },

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
      historyPanel.hidden = true;
    },

    isAnyPanelOpen() {
      return !settingsPanel.hidden || !achievementsPanel.hidden || !historyPanel.hidden;
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
        const est = selectedEst;
        const tags = [...selectedTags];
        fn(name, est, tags);
        taskInput.value = '';
        // Reset estimate picker
        selectedEst = null;
        estPicker.querySelectorAll('.est-btn').forEach(b => b.classList.remove('selected'));
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
