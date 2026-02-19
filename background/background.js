'use strict';

// Open side panel on icon click (setPanelBehavior is the recommended approach;
// it does not require a manual onClicked listener).
chrome.runtime.onInstalled.addListener((details) => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

  // On first install, prompt the user to pin the extension so the badge is visible.
  if (details.reason === 'install') {
    chrome.notifications.create('pin-prompt', {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Pin Climate Risk to your toolbar',
      message: 'Click the 🧩 puzzle piece in Chrome → find Climate Risk → click the 📌 pin. The icon will show a badge whenever you view a property listing.',
      priority: 1
    });
  }
});

function isPropertyUrl(url) {
  return url ? /zillow\.com\/homedetails\/[^/]+\/\d+_zpid/.test(url) : false;
}

// Show a badge on the extension icon when the user is on a property page,
// prompting them to click and open the side panel.
function updateBadge(tab) {
  if (!tab || !tab.id || tab.id < 0) return;
  if (isPropertyUrl(tab.url)) {
    chrome.action.setBadgeText({ text: '●', tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: '#546e7a', tabId: tab.id });
    chrome.action.setTitle({ title: 'Climate Risk — Click to view', tabId: tab.id });
  } else {
    chrome.action.setBadgeText({ text: '', tabId: tab.id });
    chrome.action.setTitle({ title: 'Climate Risk', tabId: tab.id });
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    updateBadge(tab);
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (!chrome.runtime.lastError) updateBadge(tab);
  });
});
