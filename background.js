"use strict";

const topPageByTab = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;

  const tabId = sender.tab && sender.tab.id;
  if (typeof tabId !== "number") return false;

  if (message.type === "zenstock-video-resume:setTopPage") {
    topPageByTab.set(tabId, {
      lessonId: message.lessonId,
      pageTitle: message.pageTitle,
      updatedAt: Date.now()
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "zenstock-video-resume:getTopPage") {
    sendResponse({ ok: true, topPage: topPageByTab.get(tabId) || null });
    return true;
  }

  return false;
});
