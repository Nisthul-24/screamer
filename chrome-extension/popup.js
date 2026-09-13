const enabledEl = document.getElementById('enabled');
const sensitivityEl = document.getElementById('sensitivity');
const sensitivityValEl = document.getElementById('sensitivityVal');
const screamDurationEl = document.getElementById('screamDuration');
const roastEnabledEl = document.getElementById('roastEnabled');
const resetBtn = document.getElementById('resetSettings');

const DEFAULTS = {
  enabled: true,
  sensitivity: 0.6,
  screamDuration: 3500,
  roastEnabled: true
};

function getSensitivityLabel(val) {
  const num = Number(val);
  if (num <= 0.35) return `${num.toFixed(2)}x (Hardcore Scream)`;
  if (num <= 0.55) return `${num.toFixed(2)}x (Firm Scream)`;
  if (num <= 0.8) return `${num.toFixed(2)}x (Balanced)`;
  if (num <= 1.2) return `${num.toFixed(2)}x (Sensitive)`;
  return `${num.toFixed(2)}x (Whisper Mode)`;
}

function updateSensitivityDisplay(val) {
  sensitivityValEl.textContent = getSensitivityLabel(val);
}

function loadSettings() {
  chrome.storage.sync.get(DEFAULTS, (data) => {
    enabledEl.checked = data.enabled !== false;
    sensitivityEl.value = data.sensitivity ?? DEFAULTS.sensitivity;
    updateSensitivityDisplay(sensitivityEl.value);
    screamDurationEl.value = String(data.screamDuration ?? DEFAULTS.screamDuration);
    roastEnabledEl.checked = data.roastEnabled !== false;
  });
}

function saveSettings() {
  const settings = {
    enabled: enabledEl.checked,
    sensitivity: parseFloat(sensitivityEl.value),
    screamDuration: parseInt(screamDurationEl.value, 10),
    roastEnabled: roastEnabledEl.checked
  };
  chrome.storage.sync.set(settings);
}

enabledEl.addEventListener('change', saveSettings);
roastEnabledEl.addEventListener('change', saveSettings);
screamDurationEl.addEventListener('change', saveSettings);

sensitivityEl.addEventListener('input', () => {
  updateSensitivityDisplay(sensitivityEl.value);
  saveSettings();
});

resetBtn.addEventListener('click', () => {
  chrome.storage.sync.set(DEFAULTS, () => {
    loadSettings();
  });
});

document.addEventListener('DOMContentLoaded', loadSettings);
loadSettings();
