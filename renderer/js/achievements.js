/**
 * Local achievement definitions and unlock logic.
 */

export const ACHIEVEMENTS = [
  {
    id: 'first_scream',
    icon: '🏅',
    title: 'FIRST SCREAM',
    description: 'Successfully complete your first scream authorization.'
  },
  {
    id: 'getting_serious',
    icon: '🔥',
    title: 'GETTING SERIOUS',
    description: 'Reach a scream score of 70.'
  },
  {
    id: 'absolutely_unhinged',
    icon: '💀',
    title: 'ABSOLUTELY UNHINGED',
    description: 'Reach a scream score of 90.'
  },
  {
    id: 'neighbor_complaint',
    icon: '📢',
    title: 'NEIGHBOR COMPLAINT',
    description: 'Successfully complete 10 scream authorizations.'
  },
  {
    id: 'why_are_you_like_this',
    icon: '☢️',
    title: 'WHY ARE YOU LIKE THIS?',
    description: 'Reach a scream score of 100.'
  },
  {
    id: 'vocal_athlete',
    icon: '🫁',
    title: 'VOCAL ATHLETE',
    description: 'Complete 25 successful scream authorizations.'
  },
  {
    id: 'scream_machine',
    icon: '🔥',
    title: 'SCREAM MACHINE',
    description: 'Achieve a combo of 5.'
  },
  {
    id: 'no_regrets',
    icon: '💀',
    title: 'NO REGRETS',
    description: 'Attempt a 40%+ volume change.'
  },
  {
    id: 'peak_human',
    icon: '🏆',
    title: 'PEAK HUMAN PERFORMANCE',
    description: 'Reach the highest scream score possible (100).'
  }
];

/**
 * Evaluate unlocks after an attempt. Returns newly unlocked achievements.
 */
export function evaluateAchievements(data, context) {
  const unlocked = [];
  const mark = (id) => {
    if (!data.achievements[id]) {
      data.achievements[id] = { unlockedAt: Date.now() };
      unlocked.push(ACHIEVEMENTS.find((a) => a.id === id));
    }
  };

  const { success, peak, delta, combo } = context;
  const stats = data.stats;

  if (success && stats.successful >= 1) mark('first_scream');
  if (peak >= 70) mark('getting_serious');
  if (peak >= 90) mark('absolutely_unhinged');
  if (stats.successful >= 10) mark('neighbor_complaint');
  if (peak >= 100) {
    mark('why_are_you_like_this');
    mark('peak_human');
  }
  if (stats.successful >= 25) mark('vocal_athlete');
  if (combo >= 5) mark('scream_machine');
  if (Math.abs(delta) >= 40) mark('no_regrets');

  return unlocked.filter(Boolean);
}

export function seedDemoAchievements(data) {
  data.achievements.first_scream = { unlockedAt: Date.now() - 86400000 };
  data.achievements.getting_serious = { unlockedAt: Date.now() - 43200000 };
  return data;
}
