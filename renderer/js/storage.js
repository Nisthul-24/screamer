/**
 * Local persistence — settings, stats, achievements, leaderboard, history.
 */

const STORAGE_KEY = 'screaming-volume-slider-v1';

const DEFAULT_DATA = {
  onboardingComplete: false,
  nickname: 'YOU',
  settings: {
    micDeviceId: '',
    sensitivity: 1.0,
    screamThreshold: 30,
    cooldownSeconds: 5,
    soundEffects: true,
    funnyMessages: true,
    animations: true,
    demoMode: false
  },
  stats: {
    totalAttempts: 0,
    successful: 0,
    failed: 0,
    highestScream: 0,
    screamSum: 0,
    screamCount: 0,
    bestCombo: 0,
    largestVolumeChange: 0,
    timeSpentScreamingMs: 0,
    consecutiveFails: 0,
    totalSuccessfulLifetime: 0
  },
  combo: 0,
  comboBonusActive: false,
  achievements: {},
  leaderboard: [],
  history: []
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_DATA);
    const parsed = JSON.parse(raw);
    return deepMerge(structuredClone(DEFAULT_DATA), parsed);
  } catch {
    return structuredClone(DEFAULT_DATA);
  }
}

function save(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function deepMerge(base, overlay) {
  for (const key of Object.keys(overlay || {})) {
    if (
      overlay[key] &&
      typeof overlay[key] === 'object' &&
      !Array.isArray(overlay[key]) &&
      base[key] &&
      typeof base[key] === 'object' &&
      !Array.isArray(base[key])
    ) {
      deepMerge(base[key], overlay[key]);
    } else {
      base[key] = overlay[key];
    }
  }
  return base;
}

function resetSection(section) {
  const data = load();
  if (section === 'stats') data.stats = structuredClone(DEFAULT_DATA.stats);
  if (section === 'achievements') data.achievements = {};
  if (section === 'leaderboard') data.leaderboard = [];
  if (section === 'history') data.history = [];
  if (section === 'all') {
    const nick = data.nickname;
    const settings = data.settings;
    Object.assign(data, structuredClone(DEFAULT_DATA));
    data.nickname = nick;
    data.settings = settings;
    data.onboardingComplete = true;
  }
  save(data);
  return data;
}

export { load, save, resetSection, DEFAULT_DATA, STORAGE_KEY };
