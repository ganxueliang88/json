const STORAGE_KEYS = {
  draft: "json_atelier_draft",
  history: "json_atelier_history",
  fontSize: "json_atelier_font_size"
};

const DEFAULT_FONT_SIZE = 14;
const MIN_FONT_SIZE = 11;
const MAX_FONT_SIZE = 22;
const HISTORY_LIMIT = 8;

const SAMPLE_JSON = {
  project: "JSON",
  deployedOn: "GitHub Pages",
  features: [
    "format",
    "compact",
    "save",
    "history",
    "zoom in",
    "zoom out",
    "import",
    "export"
  ],
  metadata: {
    createdAt: "2026-03-13",
    owner: "your-handle",
    purpose: "Personal JSON toolbox"
  }
};

let editor;
let currentMode = "code";
let editorFontSize = readStoredFontSize();
let statusTimer;
let autosaveTimer;
let historyItems = loadHistory();

const editorContainer = document.getElementById("jsoneditor");
const fileInput = document.getElementById("fileInput");
const statusBar = document.querySelector(".statusbar");
const statusText = document.getElementById("statusText");
const modeBadge = document.getElementById("modeBadge");
const rootType = document.getElementById("rootType");
const charCount = document.getElementById("charCount");
const actionButtons = document.querySelectorAll("[data-action]");
const modeButtons = document.querySelectorAll("[data-mode]");
const historyPanel = document.getElementById("historyPanel");
const historyList = document.getElementById("historyList");
const historyEmpty = document.getElementById("historyEmpty");
const historyCount = document.getElementById("historyCount");

initEditor();
bindControls();
updateMeta();
renderHistory();

function initEditor() {
  editor = new JSONEditor(editorContainer, {
    mode: currentMode,
    modes: ["code", "tree"],
    mainMenuBar: false,
    navigationBar: false,
    statusBar: true,
    onChange: () => {
      updateMeta();
      scheduleDraftSave();
      setStatus("Editing in progress.", "idle", { reset: false });
    },
    onModeChange: (newMode) => {
      currentMode = newMode;
      syncModeButtons();
      updateMeta();
      applyEditorFontSize();
      scheduleDraftSave();
      setStatus(`Switched to ${newMode.toUpperCase()} mode.`, "success");
    }
  });

  restoreDraftOrSample();
  syncModeButtons();
  applyEditorFontSize();
  setStatus("Ready. Local draft restore is enabled.", "success");
}

function bindControls() {
  actionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      handleAction(button.dataset.action);
    });
  });

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      switchMode(button.dataset.mode);
    });
  });

  historyList.addEventListener("click", (event) => {
    const target = event.target.closest("[data-history-index]");
    if (!target) return;
    restoreHistoryItem(Number(target.dataset.historyIndex));
  });

  fileInput.addEventListener("change", async (event) => {
    const [file] = event.target.files;
    if (!file) return;

    try {
      const content = await file.text();
      const parsed = JSON.parse(content);
      setSnapshot({
        text: JSON.stringify(parsed, null, 2),
        mode: currentMode === "tree" ? "tree" : "code"
      });
      saveDraft();
      setStatus(`Imported ${file.name}. Click Save to add it to history.`, "success");
    } catch (error) {
      setStatus(`Import failed: ${error.message}`, "error", { persist: true });
    } finally {
      fileInput.value = "";
    }
  });

  document.addEventListener("keydown", (event) => {
    const isModifier = event.metaKey || event.ctrlKey;
    if (!isModifier) return;

    const key = event.key;
    const lowerKey = key.toLowerCase();

    if (lowerKey === "s" && event.shiftKey) {
      event.preventDefault();
      exportJson();
      return;
    }

    if (lowerKey === "s") {
      event.preventDefault();
      saveCurrent();
      return;
    }

    if (key === "=" || key === "+") {
      event.preventDefault();
      adjustFontSize(1);
      return;
    }

    if (key === "-") {
      event.preventDefault();
      adjustFontSize(-1);
    }
  });

  window.addEventListener("beforeunload", () => {
    saveDraft();
  });
}

function handleAction(action) {
  switch (action) {
    case "format":
      formatJson();
      break;
    case "compact":
      compactJson();
      break;
    case "save":
      saveCurrent();
      break;
    case "history":
      toggleHistoryPanel();
      break;
    case "zoom-out":
      adjustFontSize(-1);
      break;
    case "zoom-in":
      adjustFontSize(1);
      break;
    case "clear-history":
      clearHistory();
      break;
    case "close-history":
      toggleHistoryPanel(false);
      break;
    case "clear":
      clearEditor();
      break;
    case "import":
      fileInput.click();
      break;
    case "export":
      exportJson();
      break;
    default:
      break;
  }
}

function formatJson() {
  const json = readJson();
  if (!json.ok) return;

  renderSerializedJson(json.value, 2);
  updateMeta();
  saveDraft();
  setStatus("JSON formatted.", "success");
}

function compactJson() {
  const json = readJson();
  if (!json.ok) return;

  renderSerializedJson(json.value, 0);
  updateMeta();
  saveDraft();
  setStatus("JSON compacted.", "success");
}

function clearEditor() {
  if (currentMode === "code") {
    editor.setText("{}");
  } else {
    editor.set({});
  }

  updateMeta();
  saveDraft();
  setStatus("Editor cleared.", "success");
}

function saveCurrent() {
  const snapshot = createSnapshot();
  saveDraft();

  historyItems = [snapshot, ...historyItems.filter((item) => item.text !== snapshot.text)].slice(
    0,
    HISTORY_LIMIT
  );
  writeStorage(STORAGE_KEYS.history, historyItems);
  renderHistory();
  setStatus(
    snapshot.valid
      ? "Saved locally and added to history."
      : "Draft saved locally. Invalid JSON was not normalized.",
    "success"
  );
}

function exportJson() {
  const json = readJson();
  if (!json.ok) return;

  const payload = `${JSON.stringify(json.value, null, 2)}\n`;
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "data.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  setStatus("Exported to data.json.", "success");
}

function switchMode(mode) {
  if (mode === currentMode) return;

  try {
    const snapshot = readJson();
    if (snapshot.ok) {
      editor.setMode(mode);
      currentMode = mode;
      setEditorContent(snapshot.value);
    } else if (mode === "tree") {
      setStatus("Tree mode requires valid JSON. Fix the syntax first.", "error", {
        persist: true
      });
      return;
    } else {
      editor.setMode(mode);
      currentMode = mode;
    }

    syncModeButtons();
    updateMeta();
    applyEditorFontSize();
    saveDraft();
  } catch (error) {
    setStatus(`Mode switch failed: ${error.message}`, "error", { persist: true });
  }
}

function readJson() {
  try {
    return { ok: true, value: editor.get() };
  } catch (primaryError) {
    try {
      const text = editor.getText();
      if (!text.trim()) {
        return { ok: true, value: {} };
      }
      return { ok: true, value: JSON.parse(text) };
    } catch (fallbackError) {
      setStatus(`Invalid JSON: ${fallbackError.message}`, "error", { persist: true });
      return { ok: false };
    }
  }
}

function setEditorContent(value) {
  if (currentMode === "code") {
    editor.setText(JSON.stringify(value, null, 2));
  } else {
    editor.set(value);
  }
  updateMeta();
  applyEditorFontSize();
}

function setSnapshot(snapshot) {
  const nextMode = snapshot.valid === false ? "code" : snapshot.mode || "code";

  if (currentMode !== nextMode) {
    editor.setMode(nextMode);
    currentMode = nextMode;
    syncModeButtons();
  }

  if (nextMode === "tree" && snapshot.valid !== false) {
    const parsed = parseText(snapshot.text);
    editor.set(parsed.ok ? parsed.value : {});
  } else {
    editor.setText(snapshot.text ?? "");
  }

  updateMeta();
  applyEditorFontSize();
}

function updateMeta() {
  const snapshot = readJsonSilently();
  modeBadge.textContent = currentMode.toUpperCase();

  if (!snapshot.ok) {
    rootType.textContent = "invalid";
    charCount.textContent = `${readRawText().length} chars`;
    return;
  }

  const root = getRootLabel(snapshot.value);
  const serialized = JSON.stringify(snapshot.value);
  rootType.textContent = root;
  charCount.textContent = `${serialized.length} chars`;
}

function readJsonSilently() {
  try {
    return { ok: true, value: editor.get() };
  } catch (primaryError) {
    const parsed = parseText(readRawText());
    return parsed.ok ? parsed : { ok: false };
  }
}

function getRootLabel(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function renderSerializedJson(value, spacing) {
  if (currentMode !== "code") {
    editor.setMode("code");
    currentMode = "code";
    syncModeButtons();
  }

  editor.setText(JSON.stringify(value, null, spacing));
  applyEditorFontSize();
}

function syncModeButtons() {
  modeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === currentMode);
  });
  modeBadge.textContent = currentMode.toUpperCase();
}

function setStatus(message, tone = "idle", options = {}) {
  const { persist = false, reset = true } = options;

  statusText.textContent = message;
  statusBar.classList.remove("is-success", "is-error");

  if (tone === "success") {
    statusBar.classList.add("is-success");
  }

  if (tone === "error") {
    statusBar.classList.add("is-error");
  }

  window.clearTimeout(statusTimer);
  if (!persist && reset) {
    statusTimer = window.setTimeout(() => {
      statusBar.classList.remove("is-success", "is-error");
      statusText.textContent = "Ready. Local draft restore is enabled.";
    }, 2400);
  }
}

function readRawText() {
  try {
    if (currentMode === "code") {
      return editor.getText();
    }
    return JSON.stringify(editor.get(), null, 2);
  } catch (error) {
    try {
      return editor.getText();
    } catch (fallbackError) {
      return "";
    }
  }
}

function parseText(text) {
  if (!text.trim()) {
    return { ok: true, value: {} };
  }

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error };
  }
}

function createSnapshot() {
  const text = readRawText();
  const parsed = parseText(text);
  const safeText = text.trim() ? text : "{}";

  return {
    text: safeText,
    mode: parsed.ok ? currentMode : "code",
    valid: parsed.ok,
    root: parsed.ok ? getRootLabel(parsed.value) : "invalid",
    size: safeText.length,
    timestamp: Date.now()
  };
}

function scheduleDraftSave() {
  window.clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(() => {
    saveDraft();
  }, 400);
}

function saveDraft() {
  const snapshot = createSnapshot();
  writeStorage(STORAGE_KEYS.draft, {
    text: snapshot.text,
    mode: snapshot.mode,
    valid: snapshot.valid,
    timestamp: snapshot.timestamp
  });
}

function restoreDraftOrSample() {
  const draft = readStorage(STORAGE_KEYS.draft, null);
  if (draft && typeof draft.text === "string") {
    setSnapshot(draft);
    return;
  }

  setEditorContent(SAMPLE_JSON);
}

function loadHistory() {
  const stored = readStorage(STORAGE_KEYS.history, []);
  return Array.isArray(stored) ? stored : [];
}

function restoreHistoryItem(index) {
  const item = historyItems[index];
  if (!item) return;

  setSnapshot(item);
  saveDraft();
  toggleHistoryPanel(false);
  setStatus(`Restored snapshot from ${formatTime(item.timestamp)}.`, "success");
}

function renderHistory() {
  historyCount.textContent = `${historyItems.length}`;
  historyList.innerHTML = "";

  if (historyItems.length === 0) {
    historyEmpty.hidden = false;
    return;
  }

  historyEmpty.hidden = true;

  historyItems.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "history-item";
    li.innerHTML = `
      <button type="button" class="history-entry" data-history-index="${index}">
        <span class="history-entry-top">
          <strong>${formatTime(item.timestamp)}</strong>
          <span>${item.root} · ${item.size} chars</span>
        </span>
        <span class="history-entry-preview">${escapeHtml(item.text.slice(0, 120))}</span>
      </button>
    `;
    historyList.appendChild(li);
  });
}

function toggleHistoryPanel(force) {
  const shouldOpen = typeof force === "boolean" ? force : historyPanel.hidden;
  historyPanel.hidden = !shouldOpen;

  if (shouldOpen) {
    renderHistory();
    setStatus("History opened.", "success");
  }
}

function clearHistory() {
  historyItems = [];
  writeStorage(STORAGE_KEYS.history, historyItems);
  renderHistory();
  setStatus("Local history cleared.", "success");
}

function adjustFontSize(step) {
  const next = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, editorFontSize + step));
  if (next === editorFontSize) return;

  editorFontSize = next;
  writeStorage(STORAGE_KEYS.fontSize, editorFontSize);
  applyEditorFontSize();
  setStatus(`Editor font size: ${editorFontSize}px`, "success");
}

function applyEditorFontSize() {
  editorContainer.style.setProperty("--editor-font-size", `${editorFontSize}px`);
  document.documentElement.style.setProperty("--editor-font-size", `${editorFontSize}px`);

  window.requestAnimationFrame(() => {
    document
      .querySelectorAll(".ace_editor, .ace_editor textarea, .ace_editor .ace_gutter")
      .forEach((node) => {
        node.style.fontSize = `${editorFontSize}px`;
      });
  });
}

function readStoredFontSize() {
  const stored = Number(readStorage(STORAGE_KEYS.fontSize, DEFAULT_FONT_SIZE));
  if (Number.isNaN(stored)) return DEFAULT_FONT_SIZE;
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, stored));
}

function readStorage(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // Ignore storage failures in private mode or quota-limited contexts.
  }
}

function formatTime(timestamp) {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(timestamp));
  } catch (error) {
    return new Date(timestamp).toLocaleString();
  }
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
