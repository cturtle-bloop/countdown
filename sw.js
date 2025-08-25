chrome.runtime.onInstalled.addListener(async () => {
    try {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    } catch (e) {
      console.error(e);
    }
  });

  chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
    if (msg?.type === "setIconTheme") {
      const dark = msg.theme === "dark";
      const path = dark
        ? {
            "16": "icons/stopwatch-light-16.png",
            "32": "icons/stopwatch-light-32.png",
            "48": "icons/stopwatch-light-64.png",
            "128": "icons/stopwatch-light-128.png"
          }
        : {
            "16": "icons/stopwatch-dark-16.png",
            "32": "icons/stopwatch-dark-32.png",
            "48": "icons/stopwatch-dark-64.png",
            "128": "icons/stopwatch-dark-128.png"
          };
      chrome.action.setIcon({ path }).catch(console.error);
    }
  });
  