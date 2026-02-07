export function createStats(initialSessions = []) {
  const sessions = [...initialSessions];

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  return {
    getSessions() { return sessions; },

    record(mode, durationMinutes) {
      sessions.push({
        mode,
        durationMinutes,
        date: todayKey(),
        timestamp: Date.now(),
      });
    },

    todayPomodoros() {
      const key = todayKey();
      return sessions.filter(s => s.date === key && s.mode === 'work').length;
    },

    todayFocusMinutes() {
      const key = todayKey();
      return sessions
        .filter(s => s.date === key && s.mode === 'work')
        .reduce((sum, s) => sum + s.durationMinutes, 0);
    },

    totalPomodoros() {
      return sessions.filter(s => s.mode === 'work').length;
    },
  };
}
