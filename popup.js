"use strict";

const STORAGE_PREFIXES = [
  "zenstockVideoResume:v2:",
  "zenstockVideoResume:v1:"
];
const summaryElement = document.getElementById("summary");
const listElement = document.getElementById("list");
const clearButton = document.getElementById("clear");

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

function formatDate(timestamp) {
  if (!timestamp) return "unknown";
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short"
  }).format(new Date(timestamp));
}

function getSavedPositions() {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (items) => {
      const allEntries = Object.entries(items || {})
        .filter(([key, value]) => (
          STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix)) &&
          value &&
          typeof value === "object"
        ))
        .map(([key, value]) => ({ key, ...value }));

      const dedupedEntries = Array.from(
        allEntries.reduce((map, entry) => {
          const groupKey = entry.lessonId || entry.key;
          const existing = map.get(groupKey);
          if (!existing || (entry.updatedAt || 0) > (existing.updatedAt || 0)) {
            map.set(groupKey, entry);
          }

          return map;
        }, new Map()).values()
      );

      const entries = dedupedEntries
        .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));

      resolve({ allEntries, entries });
    });
  });
}

function render(entries) {
  listElement.textContent = "";
  clearButton.disabled = entries.entries.length === 0;

  if (entries.entries.length === 0) {
    summaryElement.textContent = "No saved positions yet.";
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Open a ZenStock lesson and play a video.";
    listElement.appendChild(empty);
    return;
  }

  summaryElement.textContent = `${entries.entries.length} saved position${entries.entries.length === 1 ? "" : "s"}.`;

  entries.entries.slice(0, 8).forEach((entry) => {
    const item = document.createElement("div");
    item.className = "item";

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = entry.pageTitle || "ZenStock lesson";

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${entry.completed ? "Completed" : `At ${formatTime(entry.time)}`} - saved ${formatDate(entry.updatedAt)}`;

    item.append(title, meta);
    listElement.appendChild(item);
  });
}

async function clearSavedPositions() {
  const entries = await getSavedPositions();
  const keys = entries.allEntries.map((entry) => entry.key);
  if (keys.length === 0) return;

  chrome.storage.local.remove(keys, async () => {
    render(await getSavedPositions());
  });
}

clearButton.addEventListener("click", clearSavedPositions);
getSavedPositions().then(render);
