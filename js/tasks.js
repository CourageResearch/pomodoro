let nextId = 1;

export function createTaskManager(initialTasks = [], initialCurrentId = null) {
  let tasks = initialTasks.map(t => ({ ...t }));
  let currentTaskId = initialCurrentId;

  // Ensure nextId is higher than any existing task id
  if (tasks.length > 0) {
    nextId = Math.max(...tasks.map(t => t.id)) + 1;
  }

  return {
    getAll() { return tasks; },
    getCurrent() { return tasks.find(t => t.id === currentTaskId) || null; },
    getCurrentId() { return currentTaskId; },

    add(name, estimatedPomodoros = null) {
      const task = {
        id: nextId++,
        name,
        estimatedPomodoros,
        completedPomodoros: 0,
        done: false,
      };
      tasks.push(task);
      return task;
    },

    remove(id) {
      tasks = tasks.filter(t => t.id !== id);
      if (currentTaskId === id) currentTaskId = null;
    },

    toggleDone(id) {
      const task = tasks.find(t => t.id === id);
      if (task) task.done = !task.done;
      return task;
    },

    select(id) {
      currentTaskId = id;
    },

    /** Increment pomodoro count on the current task */
    incrementCurrent() {
      const task = this.getCurrent();
      if (task && !task.done) {
        task.completedPomodoros++;
      }
    },

    getCompletedCount() {
      return tasks.filter(t => t.done).length;
    },
  };
}
