const checkbox = document.getElementById('enabled');

chrome.storage.sync.get({ enabled: true }, (data) => {
  checkbox.checked = data.enabled !== false;
});

checkbox.addEventListener('change', () => {
  chrome.storage.sync.set({ enabled: checkbox.checked });
});
