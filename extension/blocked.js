// Blocked page — show domain, current task reminder, and motivational message

const messages = [
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
  'Comfort is the enemy of progress.',
  'You\'re ahead of everyone who gave up.',
  'The grind is the glory.',
  'Small daily improvements compound into massive results.',
  'Stay focused. Your future self will thank you.',
  'Distractions are the thief of ambition.',
  'Every minute of focus is a brick in your foundation.',
  'You chose discipline over distraction. That\'s power.',
];

const params = new URLSearchParams(window.location.search);
const domain = params.get('domain') || 'this site';
const msg = messages[Math.floor(Math.random() * messages.length)];

document.getElementById('blocked-domain').textContent = domain;
document.getElementById('blocked-message').textContent = msg;

document.getElementById('btn-go-back').addEventListener('click', () => {
  chrome.storage.sync.get({ pomodoroAppUrl: null }, (data) => {
    if (data.pomodoroAppUrl) {
      window.location.href = data.pomodoroAppUrl;
    } else {
      history.back();
    }
  });
});

// Show current task reminder if available
chrome.storage.sync.get({ currentTaskName: null }, (data) => {
  if (data.currentTaskName) {
    document.getElementById('reminder-task-name').textContent = data.currentTaskName;
    document.getElementById('current-task-reminder').hidden = false;
  }
});
