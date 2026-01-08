document.addEventListener('DOMContentLoaded', () => {
  const enabledCheckbox = document.getElementById('enabled');
  const thresholdInput = document.getElementById('threshold');
  const saveBtn = document.getElementById('save');
  const status = document.getElementById('status');

  const defaults = { enabled: true, threshold: 10 };

  function loadSettings() {
    chrome.storage.sync.get(defaults, (items) => {
      enabledCheckbox.checked = items.enabled;
      thresholdInput.value = items.threshold;
    });
  }

  function saveSettings() {
    const items = { enabled: enabledCheckbox.checked, threshold: parseInt(thresholdInput.value, 10) || defaults.threshold };
    chrome.storage.sync.set(items, () => {
      status.textContent = '저장되었습니다.';
      setTimeout(() => status.textContent = '', 1500);

      // Notify all DCInside tabs to re-run filter immediately
      chrome.tabs.query({ url: '*://*.dcinside.com/*' }, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { action: 'update_settings' });
        });
      });
    });
  }

  saveBtn.addEventListener('click', saveSettings);
  loadSettings();
});