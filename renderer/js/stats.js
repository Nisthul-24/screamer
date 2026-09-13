/**
 * Statistics + history + leaderboard helpers.
 */

const HISTORY_LIMIT = 40;
const LEADERBOARD_LIMIT = 10;

export function recordAttempt(data, entry) {
  data.history.unshift(entry);
  if (data.history.length > HISTORY_LIMIT) {
    data.history = data.history.slice(0, HISTORY_LIMIT);
  }

  data.stats.totalAttempts += 1;
  if (entry.success) data.stats.successful += 1;
  else data.stats.failed += 1;

  data.stats.screamSum += entry.score;
  data.stats.screamCount += 1;
  if (entry.score > data.stats.highestScream) {
    data.stats.highestScream = entry.score;
  }

  const delta = Math.abs(entry.to - entry.from);
  if (delta > data.stats.largestVolumeChange) {
    data.stats.largestVolumeChange = delta;
  }

  if (entry.durationMs) {
    data.stats.timeSpentScreamingMs += entry.durationMs;
  }

  return data;
}

export function averageScream(stats) {
  if (!stats.screamCount) return 0;
  return Math.round(stats.screamSum / stats.screamCount);
}

export function successRate(stats) {
  if (!stats.totalAttempts) return 0;
  return Math.round((stats.successful / stats.totalAttempts) * 100);
}

export function addLeaderboardEntry(data, score) {
  const name = data.nickname || 'YOU';
  data.leaderboard.push({
    name,
    score,
    at: Date.now()
  });
  data.leaderboard.sort((a, b) => b.score - a.score);
  data.leaderboard = data.leaderboard.slice(0, LEADERBOARD_LIMIT);
  return data;
}

export function seedDemoLeaderboard(data) {
  if (data.leaderboard.length) return data;
  data.leaderboard = [
    { name: 'YOU', score: 97, at: Date.now() - 1000 },
    { name: 'YOU EARLIER', score: 84, at: Date.now() - 2000 },
    { name: 'ALSO YOU', score: 71, at: Date.now() - 3000 },
    { name: 'DEMO SCREAMER', score: 66, at: Date.now() - 4000 },
    { name: 'FAKE RAGE', score: 55, at: Date.now() - 5000 }
  ];
  return data;
}

export function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m <= 0) return `${rem}s`;
  return `${m}m ${rem}s`;
}
