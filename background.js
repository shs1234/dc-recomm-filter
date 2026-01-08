chrome.runtime.onInstalled.addListener(() => {
  // ensure there are defaults
  chrome.storage.sync.get({ enabled: true, threshold: 10 }, (items) => {
    chrome.storage.sync.set(items);
  });
});

// Optional: respond to messages if needed later
chrome.runtime.onMessage.addListener((msg, sender, resp) => {
  // placeholder
});