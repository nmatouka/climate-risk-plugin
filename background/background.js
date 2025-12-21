chrome.runtime.onInstalled.addListener(() => {
  console.log('Climate Risk Extension installed');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchClimateData') {
    sendResponse({ success: true });
  }
  return true;
});