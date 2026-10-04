(function (global) {
  "use strict";

  const CHINESE_DIGITS = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    兩: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };

  const WEEKDAY_INDEX = {
    一: 0,
    1: 0,
    二: 1,
    2: 1,
    三: 2,
    3: 2,
    四: 3,
    4: 3,
    五: 4,
    5: 4,
    六: 5,
    6: 5,
    日: 6,
    天: 6,
  };

  function chineseNumberToArabic(value) {
    if (!value) return value;
    if (!value.includes("十")) {
      return value
        .split("")
        .map((character) => CHINESE_DIGITS[character])
        .join("");
    }

    const [tensText, onesText] = value.split("十");
    const tens = tensText ? CHINESE_DIGITS[tensText] : 1;
    const ones = onesText ? CHINESE_DIGITS[onesText] : 0;
    return String(tens * 10 + ones);
  }

  function normalizeText(input) {
    return String(input || "")
      .trim()
      .replace(/等一下/g, "待會")
      .replace(/晚一點/g, "稍晚")
      .replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xff10))
      .replace(/[零〇一二兩两三四五六七八九十]+/g, chineseNumberToArabic)
      .replace(/鐘頭/g, "小時")
      .replace(/個小時/g, "小時")
      .replace(/點鐘|点鐘|点钟|點钟|点/g, "點")
      .replace(/(^|[^小])時/g, "$1點")
      .replace(/分(?!鐘)/g, "分鐘")
      .replace(/[\s，。！？、,.!?；;：:「」『』（）()]/g, "");
  }

  function atStartOfDay(date) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  function applyClock(date, hour, minute, period) {
    let resolvedHour = Number(hour);
    const resolvedMinute = Number(minute || 0);

    if (/下午|晚上|晚間|今晚|明晚/.test(period) && resolvedHour < 12) {
      resolvedHour += 12;
    }
    if (/凌晨/.test(period) && resolvedHour === 12) resolvedHour = 0;
    if (/中午/.test(period) && resolvedHour < 11) resolvedHour += 12;

    date.setHours(resolvedHour, resolvedMinute, 0, 0);
    return date;
  }

  function parseReminder(input, referenceDate) {
    const original = String(input || "").trim();
    const normalized = normalizeText(original);
    const now = referenceDate ? new Date(referenceDate) : new Date();
    let reminderAt = null;
    let matchedTimeText = "";
    let match;

    match = normalized.match(/(\d+)個半小時後/);
    if (match) {
      reminderAt = new Date(now.getTime() + (Number(match[1]) * 60 + 30) * 60_000);
      matchedTimeText = match[0];
    }

    if (!reminderAt) {
      match = normalized.match(/半小時後/);
      if (match) {
        reminderAt = new Date(now.getTime() + 30 * 60_000);
        matchedTimeText = match[0];
      }
    }

    if (!reminderAt) {
      match = normalized.match(/(\d+)小時後/);
      if (match) {
        reminderAt = new Date(now.getTime() + Number(match[1]) * 60 * 60_000);
        matchedTimeText = match[0];
      }
    }

    if (!reminderAt) {
      match = normalized.match(/(\d+)分鐘後/);
      if (match) {
        reminderAt = new Date(now.getTime() + Number(match[1]) * 60_000);
        matchedTimeText = match[0];
      }
    }

    if (!reminderAt && /(等一下|待會)/.test(normalized)) {
      match = normalized.match(/等一下|待會/);
      reminderAt = new Date(now.getTime() + 10 * 60_000);
      matchedTimeText = match[0];
    }

    if (!reminderAt && /(晚一點|稍晚)/.test(normalized)) {
      reminderAt = new Date(now.getTime() + 60 * 60_000);
      matchedTimeText = normalized.match(/晚一點|稍晚/)[0];
    }

    if (!reminderAt) {
      match = normalized.match(/(下週|下禮拜)([1-6日天])(?:(早上|上午|下午|晚上|晚間|中午|凌晨))?(\d+)?點?(半|\d+分鐘)?/);
      if (match) {
        const day = atStartOfDay(now);
        const currentIndex = (now.getDay() + 6) % 7;
        const monday = addDays(day, -currentIndex);
        const targetDate = addDays(monday, 7 + WEEKDAY_INDEX[match[2]]);
        const hour = match[4] || (/晚上|晚間/.test(match[3] || "") ? 19 : 8);
        const minute = match[5] === "半" ? 30 : Number((match[5] || "").replace("分鐘", "")) || 0;
        reminderAt = applyClock(targetDate, hour, minute, match[3] || "早上");
        matchedTimeText = match[0];
      }
    }

    if (!reminderAt) {
      match = normalized.match(/(這週|這禮拜|本週|本禮拜)([1-6日天])(?:(早上|上午|下午|晚上|晚間|中午|凌晨))?(\d+)?點?(半|\d+分鐘)?/);
      if (match) {
        const day = atStartOfDay(now);
        const currentIndex = (now.getDay() + 6) % 7;
        const monday = addDays(day, -currentIndex);
        const targetDate = addDays(monday, WEEKDAY_INDEX[match[2]]);
        const hour = match[4] || (/晚上|晚間/.test(match[3] || "") ? 19 : 8);
        const minute = match[5] === "半" ? 30 : Number((match[5] || "").replace("分鐘", "")) || 0;
        reminderAt = applyClock(targetDate, hour, minute, match[3] || "早上");
        matchedTimeText = match[0];
      }
    }

    if (!reminderAt) {
      match = normalized.match(/(今天|今日|明天|明日|明早|明晚)(?:(早上|上午|下午|晚上|晚間|中午|凌晨))?(\d+)?點?(半|\d+分鐘)?/);
      if (match) {
        const dateToken = match[1];
        const targetDate = atStartOfDay(now);
        if (/明天|明日|明早|明晚/.test(dateToken)) targetDate.setDate(targetDate.getDate() + 1);

        const period = dateToken === "明早" ? "早上" : dateToken === "明晚" ? "晚上" : match[2] || "";
        let defaultHour = 9;
        if (/早上|上午/.test(period)) defaultHour = 8;
        if (/下午/.test(period)) defaultHour = 15;
        if (/晚上|晚間/.test(period)) defaultHour = 19;
        if (/中午/.test(period)) defaultHour = 12;
        const hour = match[3] || defaultHour;
        const minute = match[4] === "半" ? 30 : Number((match[4] || "").replace("分鐘", "")) || 0;
        reminderAt = applyClock(targetDate, hour, minute, period);
        matchedTimeText = match[0];
      }
    }

    if (!reminderAt && normalized.includes("睡前")) {
      matchedTimeText = "睡前";
    }

    const taskName = normalized
      .replace(matchedTimeText, "")
      .replace(/提醒我/g, "")
      .replace(/^請/, "")
      .trim() || original;

    return {
      original,
      normalized,
      taskName,
      reminderAt,
      matchedTimeText,
    };
  }

  const api = { normalizeText, parseReminder };
  global.VoiceTaskParser = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
