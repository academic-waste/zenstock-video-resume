(() => {
  "use strict";

  const INSTALL_FLAG = "__zenstockVideoResumeInstalled";
  if (window[INSTALL_FLAG]) return;
  window[INSTALL_FLAG] = true;

  const STORAGE_PREFIX = "zenstockVideoResume:v2:";
  const LEGACY_STORAGE_PREFIX = "zenstockVideoResume:v1:";
  const SAVE_INTERVAL_MS = 3000;
  const RESTORE_MIN_SECONDS = 5;
  const RESTORE_RETRY_LIMIT = 50;
  const RESTORE_RETRY_DELAY_MS = 400;
  const RESTORE_TOLERANCE_SECONDS = 1.25;
  const RESTORE_WINDOW_MS = 20000;
  const RESTORE_GUARD_MS = 6000;
  const SCAN_DEBOUNCE_MS = 500;
  const TOAST_ID = "zenstock-video-resume-toast";

  const trackedVideos = new WeakMap();
  let pageContext = null;
  let scanTimer = 0;

  function isExtensionStorageAvailable() {
    return typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
  }

  function storageGet(key) {
    return new Promise((resolve) => {
      if (!isExtensionStorageAvailable()) {
        resolve(undefined);
        return;
      }

      chrome.storage.local.get(key, (result) => {
        resolve(result ? result[key] : undefined);
      });
    });
  }

  function storageGetAll() {
    return new Promise((resolve) => {
      if (!isExtensionStorageAvailable()) {
        resolve({});
        return;
      }

      chrome.storage.local.get(null, (result) => {
        resolve(result || {});
      });
    });
  }

  function storageRemove(keys) {
    return new Promise((resolve) => {
      if (!isExtensionStorageAvailable() || !keys || keys.length === 0) {
        resolve();
        return;
      }

      chrome.storage.local.remove(keys, resolve);
    });
  }

  function storageSet(key, value) {
    return new Promise((resolve) => {
      if (!isExtensionStorageAvailable()) {
        resolve();
        return;
      }

      chrome.storage.local.set({ [key]: value }, resolve);
    });
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve) => {
      if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
        resolve(null);
        return;
      }

      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }

        resolve(response || null);
      });
    });
  }

  function normalizeUrl(value) {
    try {
      const url = new URL(value, location.href);
      return `${url.origin}${url.pathname}`.replace(/\/+$/, "") || `${url.origin}/`;
    } catch (_error) {
      return String(value || "").split("#")[0].split("?")[0];
    }
  }

  function isZenStockUrl(value) {
    try {
      const url = new URL(value, location.href);
      return url.hostname === "zenstocktrade.com" || url.hostname.endsWith(".zenstocktrade.com");
    } catch (_error) {
      return false;
    }
  }

  function isRelevantContext() {
    return isZenStockUrl(location.href) || Boolean(document.referrer && isZenStockUrl(document.referrer));
  }

  function isTopFrame() {
    try {
      return window.top === window;
    } catch (_error) {
      return false;
    }
  }

  async function waitForTopPageContext() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await sendRuntimeMessage({ type: "zenstock-video-resume:getTopPage" });
      if (response && response.topPage && response.topPage.lessonId) {
        return response.topPage;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return null;
  }

  async function resolvePageContext() {
    if (isTopFrame() && isZenStockUrl(location.href)) {
      const context = {
        lessonId: normalizeUrl(location.href),
        pageTitle: getLocalPageTitle(),
        relevant: true
      };

      await sendRuntimeMessage({
        type: "zenstock-video-resume:setTopPage",
        lessonId: context.lessonId,
        pageTitle: context.pageTitle
      });

      return context;
    }

    const topPage = await waitForTopPageContext();
    if (topPage && topPage.lessonId) {
      return {
        lessonId: topPage.lessonId,
        pageTitle: topPage.pageTitle || getLocalPageTitle(),
        relevant: true
      };
    }

    if (isRelevantContext()) {
      return {
        lessonId: normalizeUrl(document.referrer && isZenStockUrl(document.referrer) ? document.referrer : location.href),
        pageTitle: getLocalPageTitle(),
        relevant: true
      };
    }

    return { relevant: false };
  }

  function getLessonId() {
    if (pageContext && pageContext.lessonId) {
      return pageContext.lessonId;
    }

    const candidates = [];

    try {
      if (window.top === window) {
        candidates.push(location.href);
      }
    } catch (_error) {
      // Cross-origin frame; document.referrer is the reliable parent hint.
    }

    if (document.referrer) {
      candidates.push(document.referrer);
    }

    candidates.push(location.href);

    const zenStockCandidate = candidates.find(isZenStockUrl);
    return normalizeUrl(zenStockCandidate || location.href);
  }

  function stripVolatileUrlParts(value) {
    try {
      const url = new URL(value, location.href);
      return `${url.origin}${url.pathname}`;
    } catch (_error) {
      return String(value || "").split("#")[0].split("?")[0];
    }
  }

  function hashString(value) {
    const text = String(value || "");
    let hash = 2166136261;

    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(36);
  }

  function getVideoSignature(video, index) {
    const sourceCandidates = [
      video.currentSrc,
      video.src,
      video.getAttribute("src"),
      video.poster,
      location.href
    ].filter(Boolean);

    const stableSource = sourceCandidates.map(stripVolatileUrlParts).find(Boolean);
    const frameSource = stripVolatileUrlParts(location.href);
    return `${frameSource}|${stableSource || "video"}|${index}`;
  }

  function getStorageKey(_video, index) {
    const lessonId = getLessonId();
    return `${STORAGE_PREFIX}${hashString(lessonId)}:${index}`;
  }

  function formatTime(seconds) {
    const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const secs = safeSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }

    return `${minutes}:${String(secs).padStart(2, "0")}`;
  }

  function getLocalPageTitle() {
    const title = document.title && document.title.trim();
    if (title) return title;

    try {
      return new URL(getLessonId()).pathname.split("/").filter(Boolean).pop() || "ZenStock lesson";
    } catch (_error) {
      return "ZenStock lesson";
    }
  }

  function getPageTitle() {
    if (pageContext && pageContext.pageTitle) {
      return pageContext.pageTitle;
    }

    return getLocalPageTitle();
  }

  function createToast(message, actions) {
    if (!document.body) return;

    const previousToast = document.getElementById(TOAST_ID);
    if (previousToast) previousToast.remove();

    const toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.textContent = message;

    const actionGroup = document.createElement("div");

    const startHereButton = document.createElement("button");
    startHereButton.type = "button";
    startHereButton.textContent = "Start here";
    startHereButton.addEventListener("click", () => {
      actions.onStartHere();
      toast.remove();
    });

    const startOverButton = document.createElement("button");
    startOverButton.type = "button";
    startOverButton.textContent = "Start over";
    startOverButton.addEventListener("click", () => {
      actions.onStartOver();
      toast.remove();
    });

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Dismiss");
    closeButton.textContent = "x";
    closeButton.addEventListener("click", () => toast.remove());

    actionGroup.append(startHereButton, startOverButton);
    toast.appendChild(actionGroup);
    toast.appendChild(closeButton);

    Object.assign(toast.style, {
      alignItems: "center",
      background: "rgba(20, 24, 33, 0.92)",
      border: "1px solid rgba(255, 255, 255, 0.18)",
      borderRadius: "8px",
      bottom: "16px",
      boxShadow: "0 10px 30px rgba(0, 0, 0, 0.28)",
      color: "#ffffff",
      display: "flex",
      font: "13px/1.35 system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      gap: "7px",
      left: "16px",
      maxWidth: "calc(100vw - 32px)",
      padding: "8px 9px",
      position: "fixed",
      zIndex: "2147483647"
    });

    Object.assign(actionGroup.style, {
      display: "flex",
      flex: "0 0 auto",
      gap: "5px"
    });

    const buttonStyles = {
      background: "#f2b84b",
      border: "0",
      borderRadius: "6px",
      color: "#181818",
      cursor: "pointer",
      font: "650 12px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      lineHeight: "1",
      padding: "7px 8px",
      whiteSpace: "nowrap"
    };

    Object.assign(startHereButton.style, buttonStyles);
    Object.assign(startOverButton.style, buttonStyles);

    Object.assign(closeButton.style, {
      background: "transparent",
      border: "0",
      color: "#ffffff",
      cursor: "pointer",
      flex: "0 0 auto",
      font: "700 14px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      padding: "2px 3px"
    });

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 8000);
  }

  function shouldRestore(saved) {
    return Boolean(
      saved &&
      saved.completed !== true &&
      Number.isFinite(saved.time) &&
      saved.time >= RESTORE_MIN_SECONDS
    );
  }

  function getRestoreTarget(video, saved) {
    const canSeek = Number.isFinite(video.duration) && video.duration > 0;
    return canSeek ? Math.min(saved.time, Math.max(0, video.duration - 1)) : saved.time;
  }

  function markRestoreSeen(video, targetTime, state) {
    const currentTime = Number(video.currentTime || 0);
    if (currentTime < targetTime - RESTORE_TOLERANCE_SECONDS) return false;

    if (!state.restored) {
      state.restoreConfirmedAt = Date.now();
      state.restoreGuardUntil = state.restoreConfirmedAt + RESTORE_GUARD_MS;
    }

    state.restored = true;
    state.lastSavedTime = targetTime;

    if (!state.restoreToastShown) {
      state.restoreToastShown = true;

      createToast(`Resumed at ${formatTime(targetTime)}`, {
        onStartHere: () => {
          state.restoreFinished = true;
          state.restoreTarget = 0;
          saveProgress(video, state, { force: true });
        },
        onStartOver: () => {
          state.restoreCancelled = true;
          state.restoreFinished = true;
          state.restoreTarget = 0;
          video.currentTime = 0;
          state.lastSavedTime = 0;
          saveProgress(video, state, {
            allowZero: true,
            force: true,
            completed: false,
            overrideTime: 0
          });
        }
      });
    }

    return true;
  }

  function tryRestore(video, saved, state, attempt = 0) {
    if (state.restoreCancelled || state.restoreFinished) return;
    if (!shouldRestore(saved)) return;

    if (!state.restoreStartedAt) {
      state.restoreStartedAt = Date.now();
    }

    const targetTime = getRestoreTarget(video, saved);
    state.restoreTarget = targetTime;
    const currentTime = Number(video.currentTime || 0);

    if (Date.now() - state.restoreStartedAt > RESTORE_WINDOW_MS) {
      state.restoreFinished = true;
      return;
    }

    try {
      if (currentTime < targetTime - RESTORE_TOLERANCE_SECONDS) {
        video.currentTime = targetTime;
      }
    } catch (_error) {
      // Some players reject seeking until metadata/canplay. The retry loop covers that.
    }

    if (markRestoreSeen(video, targetTime, state)) {
      if (Date.now() > state.restoreGuardUntil) {
        state.restoreFinished = true;
      }
    }

    if (attempt < RESTORE_RETRY_LIMIT && !state.restoreFinished) {
      setTimeout(() => tryRestore(video, saved, state, attempt + 1), RESTORE_RETRY_DELAY_MS);
    } else {
      state.restoreFinished = true;
    }
  }

  function isProgressRecord(value) {
    return Boolean(value && typeof value === "object" && Number.isFinite(value.time));
  }

  async function findSavedProgress(storageKey, lessonId) {
    const direct = await storageGet(storageKey);
    if (isProgressRecord(direct) && shouldRestore(direct)) {
      return direct;
    }

    const allItems = await storageGetAll();
    const legacyMatches = Object.entries(allItems)
      .filter(([key, value]) => (
        key.startsWith(LEGACY_STORAGE_PREFIX) &&
        isProgressRecord(value) &&
        shouldRestore(value) &&
        normalizeUrl(value.lessonId || "") === lessonId
      ))
      .sort((left, right) => {
        const leftValue = left[1];
        const rightValue = right[1];
        return (rightValue.updatedAt || 0) - (leftValue.updatedAt || 0);
      });

    if (legacyMatches.length === 0) {
      return undefined;
    }

    const latestValue = legacyMatches[0][1];
    return {
      ...latestValue,
      legacyKeys: legacyMatches.map(([key]) => key)
    };
  }

  function buildProgressRecord(video, state, options = {}) {
    const currentTime = Number.isFinite(options.overrideTime)
      ? options.overrideTime
      : Number(video.currentTime || 0);
    const duration = Number.isFinite(video.duration) ? Number(video.duration) : null;
    const lessonId = getLessonId();

    return {
      completed: Boolean(options.completed),
      duration,
      frameUrl: normalizeUrl(location.href),
      lessonId,
      pageTitle: getPageTitle(),
      savedAt: new Date().toISOString(),
      time: Math.max(0, currentTime),
      updatedAt: Date.now(),
      videoKey: state.videoKey
    };
  }

  function saveProgress(video, state, options = {}) {
    const now = Date.now();
    const currentTime = Number.isFinite(options.overrideTime)
      ? options.overrideTime
      : Number(video.currentTime || 0);

    if (!options.force && now - state.lastSavedAt < SAVE_INTERVAL_MS) return;
    if (!options.allowZero && !options.completed && currentTime < 1) return;

    if (
      state.restoreTarget &&
      !state.restoreFinished &&
      currentTime < state.restoreTarget - 3 &&
      !options.allowZero
    ) {
      return;
    }

    state.lastSavedAt = now;
    state.lastSavedTime = currentTime;

    storageSet(state.storageKey, buildProgressRecord(video, state, options));
  }

  function attachVideo(video, index) {
    if (!(video instanceof HTMLVideoElement) || trackedVideos.has(video)) return;

    const state = {
      lastSavedAt: 0,
      lastSavedTime: 0,
      restoreCancelled: false,
      restoreConfirmedAt: 0,
      restoreFinished: false,
      restoreGuardUntil: 0,
      restoreStartedAt: 0,
      restoreTarget: 0,
      restoreToastShown: false,
      restored: false,
      storageKey: getStorageKey(video, index),
      videoKey: hashString(`${getLessonId()}|${index}`)
    };

    trackedVideos.set(video, state);

    findSavedProgress(state.storageKey, getLessonId()).then((saved) => {
      if (!shouldRestore(saved)) return;

      if (saved.legacyKeys && saved.legacyKeys.length > 0) {
        storageSet(state.storageKey, {
          ...saved,
          migratedAt: new Date().toISOString(),
          updatedAt: Date.now()
        }).then(() => storageRemove(saved.legacyKeys));
      }

      const restore = () => tryRestore(video, saved, state);
      restore();

      video.addEventListener("loadedmetadata", restore, { once: true });
      video.addEventListener("canplay", restore, { once: true });
      video.addEventListener("durationchange", restore, { once: true });
      video.addEventListener("play", restore, { once: true });
      video.addEventListener("playing", restore, { once: true });

    });

    video.addEventListener("timeupdate", () => saveProgress(video, state));
    video.addEventListener("pause", () => saveProgress(video, state, { force: true }));
    video.addEventListener("seeking", () => saveProgress(video, state, { force: true }));
    video.addEventListener("ended", () => saveProgress(video, state, { force: true, completed: true }));

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        saveProgress(video, state, { force: true });
      }
    });

    window.addEventListener("pagehide", () => saveProgress(video, state, { force: true }));
  }

  function collectVideos(root, output) {
    if (!root) return output;

    if (root instanceof HTMLVideoElement) {
      output.push(root);
      return output;
    }

    if (root.querySelectorAll) {
      root.querySelectorAll("video").forEach((video) => output.push(video));
      root.querySelectorAll("*").forEach((element) => {
        if (element.shadowRoot) {
          collectVideos(element.shadowRoot, output);
        }
      });
    }

    return output;
  }

  function scanForVideos() {
    const videos = Array.from(new Set(collectVideos(document, [])));
    videos.forEach((video, index) => attachVideo(video, index));
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scanForVideos, SCAN_DEBOUNCE_MS);
  }

  resolvePageContext().then((context) => {
    if (!context.relevant) return;

    pageContext = context;

    scanForVideos();
    window.addEventListener("load", scheduleScan, { once: true });

    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement || document, {
      childList: true,
      subtree: true
    });
  });
})();
