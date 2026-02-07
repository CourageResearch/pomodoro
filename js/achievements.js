const ACHIEVEMENTS = [
  { id: 'first_step', name: 'First Step', desc: 'Complete your first pomodoro', icon: '🌱', check: ctx => ctx.totalPomodoros >= 1 },
  { id: 'on_a_roll', name: 'On a Roll', desc: 'Complete 10 pomodoros in one day', icon: '🔥', check: ctx => ctx.todayPomodoros >= 10 },
  { id: 'week_warrior', name: 'Week Warrior', desc: 'Maintain a 7-day streak', icon: '⚔️', check: ctx => ctx.streak >= 7 },
  { id: 'half_century', name: 'Half Century', desc: 'Complete 50 total pomodoros', icon: '🏅', check: ctx => ctx.totalPomodoros >= 50 },
  { id: 'centurion', name: 'Centurion', desc: 'Complete 100 total pomodoros', icon: '🏆', check: ctx => ctx.totalPomodoros >= 100 },
  { id: 'clean_slate', name: 'Clean Slate', desc: 'Complete all tasks in your list', icon: '✨', check: ctx => ctx.allTasksDone && ctx.taskCount > 0 },
  { id: 'goal_getter', name: 'Goal Getter', desc: 'Hit your daily pomodoro goal', icon: '🎯', check: ctx => ctx.todayPomodoros >= ctx.dailyGoal },
];

export function createAchievements(unlockedIds = []) {
  const unlocked = new Set(unlockedIds);

  return {
    getAll() {
      return ACHIEVEMENTS.map(a => ({
        ...a,
        unlocked: unlocked.has(a.id),
      }));
    },

    getUnlockedIds() {
      return [...unlocked];
    },

    /**
     * Check context for newly unlocked achievements.
     * Returns array of newly unlocked achievement objects.
     */
    check(ctx) {
      const newlyUnlocked = [];
      for (const a of ACHIEVEMENTS) {
        if (!unlocked.has(a.id) && a.check(ctx)) {
          unlocked.add(a.id);
          newlyUnlocked.push(a);
        }
      }
      return newlyUnlocked;
    },
  };
}
