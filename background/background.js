'use strict';

// Open the side panel when the user clicks the extension icon.
// chrome.action.onClicked only fires when there is no default_popup in the manifest.
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (e) {
    // Restricted pages (chrome://, chrome-extension://, etc.) — ignore silently
  }
});
