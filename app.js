(function () {
  "use strict";

  const STORAGE_KEY = "voice-task-reminder.tasks.v2";
  const { parseReminder } = window.VoiceTaskParser;

  const form = document.querySelector("#task-form");
  const input = document.querySelector("#task-input");
  const voiceButton = document.querySelector("#voice-button");
  const voiceButtonLabel = voiceButton.querySelector("span");
  const speechMessage = document.querySelector("#speech-message");
  const parsePreview = document.querySelector("#parse-preview");
  const taskTemplate = document.querySelector("#task-template");
  const toast = document.querySelector("#toast");

  const sectionConfig = {
    overdue: { list: "#overdue-list", count: "#overdue-count", empty: "沒有已到期的任務" },
    today: { list: "#today-list", count: "#today-count", empty: "今天沒有其他任務" },
    todo: { list: "#todo-list", count: "#todo-count", empty: "目前沒有待辦任務" },
    completed: { list: "#completed-list", count: "#completed-count", empty: "完成的任務會出現在這裡" },
  };

  let tasks = loadTasks();
  let recognition = null;
  let toastTimer = null;

  function loadTasks() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return Array.isArray(saved) ? saved : [];
    } catch (error) {
      console.warn("無法讀取已儲存的任務", error);
      return [];
    }
  }

  function saveTasks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }

  function createId() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function addTask(rawInput) {
    const parsed = parseReminder(rawInput);
    const task = {
      id: createId(),
      name: parsed.taskName,
      original: parsed.original,
      reminderAt: parsed.reminderAt ? parsed.reminderAt.toISOString() : null,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    tasks.unshift(task);
    saveTasks();
    renderTasks();
    return task;
  }

  function startOfToday() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function endOfToday() {
    const date = startOfToday();
    date.setDate(date.getDate() + 1);
    return date;
  }

  function categoryFor(task) {
    if (task.completed) return "completed";
    if (!task.reminderAt) return "todo";
    const reminder = new Date(task.reminderAt);
    const now = new Date();
    if (reminder < now) return "overdue";
    if (reminder >= startOfToday() && reminder < endOfToday()) return "today";
    return "todo";
  }

  function formatReminder(isoString) {
    if (!isoString) return "提醒時間未設定";
    const date = new Date(isoString);
    const today = startOfToday();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const targetDay = new Date(date);
    targetDay.setHours(0, 0, 0, 0);
    let prefix = date.toLocaleDateString("zh-TW", { month: "numeric", day: "numeric", weekday: "short" });
    if (targetDay.getTime() === today.getTime()) prefix = "今天";
    if (targetDay.getTime() === tomorrow.getTime()) prefix = "明天";
    const time = date.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
    return `${prefix} ${time}`;
  }

  function renderTasks() {
    const grouped = { overdue: [], today: [], todo: [], completed: [] };
    tasks.forEach((task) => grouped[categoryFor(task)].push(task));

    ["overdue", "today", "todo"].forEach((category) => {
      grouped[category].sort((a, b) => {
        if (!a.reminderAt) return 1;
        if (!b.reminderAt) return -1;
        return new Date(a.reminderAt) - new Date(b.reminderAt);
      });
    });

    grouped.completed.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    Object.entries(sectionConfig).forEach(([category, config]) => {
      const list = document.querySelector(config.list);
      const count = document.querySelector(config.count);
      list.replaceChildren();
      count.textContent = grouped[category].length;

      if (!grouped[category].length) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = config.empty;
        list.append(empty);
        return;
      }

      grouped[category].forEach((task) => list.append(createTaskCard(task)));
    });

    const pending = tasks.filter((task) => !task.completed).length;
    const completed = tasks.length - pending;
    document.querySelector("#task-summary").textContent = tasks.length
      ? `共 ${tasks.length} 項任務 · ${pending} 項待處理 · ${completed} 項已完成`
      : "新增第一項任務，開始安排你的行程";
  }

  function createTaskCard(task) {
    const card = taskTemplate.content.firstElementChild.cloneNode(true);
    card.dataset.id = task.id;
    card.classList.toggle("is-completed", task.completed);

    card.querySelector(".task-name").textContent = task.name;
    card.querySelector(".task-original").textContent = task.original;
    const time = card.querySelector(".task-time");
    time.textContent = formatReminder(task.reminderAt);
    time.classList.toggle("no-time", !task.reminderAt);

    const completeButton = card.querySelector(".complete-button");
    completeButton.setAttribute("aria-label", task.completed ? "標記為未完成" : "標記為完成");
    completeButton.addEventListener("click", () => toggleTask(task.id));
    card.querySelector(".delete-button").addEventListener("click", () => deleteTask(task.id));

    const calendarActions = card.querySelector(".calendar-actions");
    if (!task.reminderAt) {
      calendarActions.hidden = true;
    } else {
      card.querySelector(".google-button").href = createGoogleCalendarUrl(task);
      card.querySelector(".apple-button").addEventListener("click", () => downloadIcs(task));
    }

    return card;
  }

  function toggleTask(id) {
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    task.completed = !task.completed;
    saveTasks();
    renderTasks();
    showToast(task.completed ? "任務已完成" : "任務已恢復為未完成");
  }

  function deleteTask(id) {
    tasks = tasks.filter((item) => item.id !== id);
    saveTasks();
    renderTasks();
    showToast("任務已刪除");
  }

  function toCalendarUtc(date) {
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  }

  function createGoogleCalendarUrl(task) {
    const start = new Date(task.reminderAt);
    const end = new Date(start.getTime() + 30 * 60_000);
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: task.name,
      dates: `${toCalendarUtc(start)}/${toCalendarUtc(end)}`,
      details: `原始輸入：${task.original}`,
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  function escapeIcs(value) {
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  function downloadIcs(task) {
    const start = new Date(task.reminderAt);
    const end = new Date(start.getTime() + 30 * 60_000);
    const now = new Date();
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Voice Task Reminder//ZH-TW",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:${task.id}@voice-task-reminder.local`,
      `DTSTAMP:${toCalendarUtc(now)}`,
      `DTSTART:${toCalendarUtc(start)}`,
      `DTEND:${toCalendarUtc(end)}`,
      `SUMMARY:${escapeIcs(task.name)}`,
      `DESCRIPTION:${escapeIcs(`原始輸入：${task.original}`)}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${task.name.replace(/[\\/:*?\"<>|]/g, "-").slice(0, 40) || "提醒"}.ics`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("已產生 Apple 行事曆檔案");
  }

  function updateParsePreview() {
    const value = input.value.trim();
    if (!value) {
      parsePreview.hidden = true;
      return;
    }
    const parsed = parseReminder(value);
    parsePreview.hidden = false;
    parsePreview.classList.toggle("no-time", !parsed.reminderAt);
    parsePreview.textContent = parsed.reminderAt
      ? `辨識結果：${parsed.taskName} · ${formatReminder(parsed.reminderAt.toISOString())}`
      : `辨識結果：${parsed.taskName} · 提醒時間未設定`;
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      voiceButton.disabled = true;
      speechMessage.textContent = "此瀏覽器不支援語音輸入，請改用打字";
      return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = "zh-TW";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.addEventListener("start", () => {
      voiceButton.classList.add("is-listening");
      voiceButtonLabel.textContent = "聆聽中...";
      speechMessage.textContent = "";
    });

    recognition.addEventListener("result", (event) => {
      input.value = event.results[0][0].transcript;
      input.dispatchEvent(new Event("input"));
      input.focus();
    });

    recognition.addEventListener("error", (event) => {
      if (event.error !== "no-speech" && event.error !== "aborted") {
        speechMessage.textContent = "語音辨識失敗，請再試一次或改用打字";
      }
    });

    recognition.addEventListener("end", () => {
      voiceButton.classList.remove("is-listening");
      voiceButtonLabel.textContent = "語音輸入";
    });

    voiceButton.addEventListener("click", () => {
      if (voiceButton.classList.contains("is-listening")) {
        recognition.stop();
      } else {
        recognition.start();
      }
    });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) {
      input.focus();
      showToast("請先輸入待辦事項");
      return;
    }
    addTask(value);
    input.value = "";
    parsePreview.hidden = true;
    input.focus();
    showToast("任務已新增");
  });

  input.addEventListener("input", updateParsePreview);

  document.querySelectorAll("[data-example]").forEach((button) => {
    button.addEventListener("click", () => {
      input.value = button.dataset.example;
      input.dispatchEvent(new Event("input"));
      input.focus();
    });
  });

  setupSpeechRecognition();
  renderTasks();
  setInterval(renderTasks, 60_000);
})();
