const STORAGE_KEY = "jie_app_state_v1";

const defaultState = {
  profile: null,
  records: {},
  emergencyCount: 0,
  activeTab: "home",
  modal: null,
  emergencyStep: 0,
  toast: null,
  reminder: {
    enabled: false,
    time: "21:30",
    followupEnabled: true,
    followupTime: "23:00",
    permission: "default"
  }
};

const emergencySteps = [
  {
    title: "先别交出去",
    body: "手机先放下。现在不是解决一辈子，只是别把这一下白送出去。",
    cue: "停手",
    quote: "这一把还没输。"
  },
  {
    title: "撑过 6 次呼吸",
    body: "跟着节奏走。先把这一分钟拿下，别让它骑着你走。",
    cue: "硬扛",
    quote: "先赢这一分钟。"
  },
  {
    title: "离开现场",
    body: "去洗脸、喝水、站起来，或者直接离开当前房间。别站在坑边装稳。",
    cue: "撤开",
    quote: "别让它拿走今天。"
  },
  {
    title: "收口",
    body: "现在给这一下定结果。没送就记上；还在拉扯，就先把这把记下来。",
    cue: "记上",
    quote: "今天别输。"
  }
];

const motivationalLines = [
  "先把这一分钟拿下。",
  "别让它拿走今天。",
  "今天别输。",
  "先停手，别把今天送出去。",
  "撑住这一下，今天还在你手里。",
  "你不是想要它，你是在跟它拉扯。",
  "这一把还没输。",
  "别站在坑边装稳，先离开现场。",
  "把这一分钟抢回来。",
  "赢的不是感觉，是这次没交出去。"
];

function baseState() {
  return {
    ...defaultState,
    reminder: { ...defaultState.reminder }
  };
}

let reminderTimers = [];
let state = loadState();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      ...baseState(),
      ...saved,
      reminder: { ...defaultState.reminder, ...(saved.reminder || {}) }
    };
  } catch {
    return baseState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function todayKey() {
  return keyFromDate(new Date());
}

function keyFromDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(date = new Date()) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(date);
}

function daysBetween(start, end) {
  const one = new Date(start + "T00:00:00");
  const two = new Date(end + "T00:00:00");
  return Math.max(0, Math.round((two - one) / 86400000));
}

function sortedRecords() {
  return Object.entries(state.records).sort(([a], [b]) => a.localeCompare(b));
}

function currentStreak() {
  if (!state.profile) return 0;
  let streak = 0;
  const cursor = new Date();
  const start = new Date(state.profile.startDate + "T00:00:00");

  while (cursor >= start) {
    const key = keyFromDate(cursor);
    const record = state.records[key];
    if (record?.status === "lapsed") break;
    if (record?.status === "kept") streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function totalKeptDays() {
  return sortedRecords().filter(([, record]) => record.status === "kept").length;
}

function lapseCount() {
  return sortedRecords().filter(([, record]) => record.status === "lapsed").length;
}

function savedMetric() {
  if (!state.profile) return { label: "省下的钱", value: "0" };
  const kept = totalKeptDays();
  if (state.profile.goal === "smoking") {
    const dailyCost = Number(state.profile.dailyCost || 0);
    return { label: "省下的钱", value: `¥${Math.round(kept * dailyCost)}` };
  }
  return { label: "拿回来的天数", value: `${kept}天` };
}

function motivationalLine() {
  const index = daysBetween(state.profile?.startDate || todayKey(), todayKey()) % motivationalLines.length;
  return motivationalLines[index];
}

function todayRecord() {
  return state.records[todayKey()] || null;
}

function isTodayClosed() {
  const record = todayRecord();
  return record?.status === "kept" || record?.status === "lapsed";
}

function reminderPermission() {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

function effectiveReminderPermission() {
  return state.reminder.permission === "unsupported" ? "unsupported" : reminderPermission();
}

function reminderPermissionLabel() {
  const permission = effectiveReminderPermission();
  if (permission === "granted") return "已允许";
  if (permission === "denied") return "已拒绝";
  if (permission === "unsupported") return "浏览器不支持";
  return "未请求";
}

function reminderSummary() {
  if (!state.reminder.enabled) return "今晚还没设提醒";
  if (isTodayClosed()) return "今天已经记上，不再提醒";
  const permission = effectiveReminderPermission();
  if (permission === "denied") return "提醒开了，要去浏览器设置里放权限";
  if (permission === "unsupported") return `没记上的话，${state.reminder.time} 会在当前页顶你一下`;
  if (permission === "default") return `提醒开了，等你放权限（${state.reminder.time}）`;
  const followup = state.reminder.followupEnabled ? `，${state.reminder.followupTime} 再顶一次` : "";
  return `没记上的话，${state.reminder.time} 提醒你${followup}`;
}

function parseTodayTime(time) {
  const [hours, minutes] = String(time || "").split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);
  return target;
}

function clearReminderTimers() {
  reminderTimers.forEach((timer) => clearTimeout(timer));
  reminderTimers = [];
}

function fireReminder(message) {
  if (isTodayClosed()) return;
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification("戒", {
      body: message,
      tag: `jie-${todayKey()}`
    });
    return;
  }
  showToast(message);
}

function scheduleReminderAt(time, message) {
  const target = parseTodayTime(time);
  if (!target) return;
  const delay = target.getTime() - Date.now();
  if (delay <= 0) return;
  reminderTimers.push(setTimeout(() => fireReminder(message), delay));
}

function syncReminderSchedule() {
  clearReminderTimers();
  if (!state.profile || !state.reminder.enabled || isTodayClosed()) return;
  scheduleReminderAt(state.reminder.time, "你今天还没交成绩，别把今天混过去。");
  if (state.reminder.followupEnabled) {
    scheduleReminderAt(state.reminder.followupTime, "还没记上。现在收一下，别白送。");
  }
}

function setState(patch) {
  state = { ...state, ...patch };
  saveState();
  render();
}

function showToast(message) {
  state.toast = message;
  saveState();
  render();
  setTimeout(() => {
    if (state.toast === message) {
      state.toast = null;
      saveState();
      render();
    }
  }, 1800);
}

function startProfile(goal) {
  const dailyCost = goal === "smoking" ? Number(document.querySelector("#dailyCost")?.value || 25) : 0;
  const privateName = goal === "focus" ? (document.querySelector("#privateName")?.value || "专注恢复") : "";
  const reason = document.querySelector("#reason")?.value || "为了别再把时间和状态送出去。";
  const startDate = document.querySelector("#startDate")?.value || todayKey();
  state.profile = {
    goal,
    startDate,
    dailyCost,
    privateName,
    reason,
    tone: "disciplined_warm"
  };
  state.activeTab = "home";
  state.reminder.permission = effectiveReminderPermission();
  saveState();
  render();
  showToast("这把开始了");
}

function saveRecord(status) {
  const key = todayKey();
  if (status === "lapsed") {
    state.modal = "relapse";
    saveState();
    render();
    return;
  }
  state.records[key] = {
    ...(state.records[key] || {}),
    status: "kept",
    note: "今天我赢了",
    updatedAt: new Date().toISOString()
  };
  state.activeTab = "home";
  saveState();
  render();
  showToast("今天记上了");
}

function saveRelapse() {
  const key = todayKey();
  state.records[key] = {
    ...(state.records[key] || {}),
    status: "lapsed",
    trigger: document.querySelector("#trigger")?.value || "未记录",
    mood: document.querySelector("#mood")?.value || "未记录",
    plan: document.querySelector("#plan")?.value || "下次先卡住第一步，先别交出去",
    updatedAt: new Date().toISOString()
  };
  state.modal = null;
  state.activeTab = "record";
  saveState();
  render();
  showToast("这把记住了");
}

function openEmergency() {
  state.modal = "emergency";
  state.emergencyStep = 0;
  saveState();
  render();
}

function nextEmergencyStep(result) {
  if (result) {
    const key = todayKey();
    state.emergencyCount += 1;
    state.records[key] = {
      ...(state.records[key] || {}),
      emergencyResult: result,
      emergencyAt: new Date().toISOString()
    };
    if (result === "held") {
      state.records[key] = {
        ...state.records[key],
        status: "kept",
        note: "从救急里拉回来了",
        updatedAt: new Date().toISOString()
      };
    }
    state.modal = null;
    state.emergencyStep = 0;
    if (result === "still_hard") {
      state.activeTab = "record";
      state.modal = "relapse";
    }
    showToast(result === "held" ? "这次你赢了" : "先把这把记下来");
  } else {
    state.emergencyStep = Math.min(state.emergencyStep + 1, emergencySteps.length - 1);
  }
  saveState();
  render();
}

async function requestReminderPermission() {
  if (typeof Notification === "undefined") {
    state.reminder.permission = "unsupported";
    saveState();
    render();
    showToast("当前浏览器顶不了通知");
    return;
  }
  const permission = await Notification.requestPermission();
  state.reminder.permission = permission;
  saveState();
  render();
  showToast(permission === "granted" ? "通知开了" : "通知没开");
}

function testReminder() {
  const message = "测试提醒：还没记上，别把今天白送。";
  setTimeout(() => fireReminder(message), 1200);
  showToast("1 秒后顶你一下");
}

function goalLabel() {
  if (!state.profile) return "";
  if (state.profile.goal === "smoking") return "戒烟";
  return state.profile.privateName || "戒色";
}

function todayStatusLabel(record) {
  if (!record) return "今天还没交成绩";
  if (record.status === "kept") return "今天记上了";
  if (record.status === "lapsed") return "今天掉了";
  if (record.emergencyResult === "still_hard") return "还没收口";
  return "还没交成绩";
}

function weekStrip() {
  const today = new Date();
  const items = [];
  for (let index = 6; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    const key = keyFromDate(date);
    const record = state.records[key];
    const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "narrow" }).format(date);
    const stateClass = record?.status === "kept" ? "kept" : record?.status === "lapsed" ? "lapsed" : "none";
    items.push(`<span class="${stateClass} ${index === 0 ? "today" : ""}"><i></i><b>${weekday}</b></span>`);
  }
  return `<div class="week-strip" aria-label="最近七天记录">${items.join("")}</div>`;
}

function onboardingView() {
  return `
    <section class="screen onboarding-screen">
      <div class="topbar">
        <h1 class="brand app-mark">戒</h1>
        <span class="date-pill">${formatDate()}</span>
      </div>
      <div class="hero-panel onboarding-hero ios-panel">
        <span class="section-kicker">硬一点，别输</span>
        <strong>先别把今天交出去。</strong>
        <p class="subtle">在最容易上头的时候拉住自己，把今天记上。</p>
      </div>
      <h2 class="section-title">选择你的目标</h2>
      <div class="choice-grid">
        <button class="choice choice-card" onclick="selectChoice('smoking', this)">
          <b>戒烟</b>
          <span class="subtle">记录少抽、省钱和连胜。</span>
        </button>
        <button class="choice choice-card" onclick="selectChoice('focus', this)">
          <b>戒色</b>
          <span class="subtle">以冲动管理和连胜为核心。</span>
        </button>
      </div>
      <div id="setupFields" class="stack"></div>
    </section>
  `;
}

function selectChoice(goal, element) {
  document.querySelectorAll(".choice").forEach((item) => item.classList.remove("active"));
  element.classList.add("active");
  const label = goal === "smoking" ? "每天会烧掉多少钱" : "目标名字";
  const fields = document.querySelector("#setupFields");
  fields.innerHTML = `
    <div class="setup-card ios-panel">
    <div class="field">
      <label>开始日期</label>
      <input id="startDate" type="date" value="${todayKey()}" />
    </div>
    ${
      goal === "smoking"
        ? `<div class="field"><label>${label}</label><input id="dailyCost" type="number" min="0" value="25" /></div>`
        : `<div class="field"><label>${label}</label><input id="privateName" type="text" value="专注恢复" /></div>`
    }
    <div class="field">
      <label>你为什么不想再输</label>
      <textarea id="reason">为了别再把时间和状态送出去。</textarea>
    </div>
    <button class="primary" onclick="startProfile('${goal}')">开打</button>
    </div>
  `;
}

function homeView() {
  const todayEntry = todayRecord();
  const startedDays = daysBetween(state.profile.startDate, todayKey()) + 1;
  return `
    <section class="screen home-screen">
      <div class="topbar">
        <h1 class="brand compact-brand app-mark">戒</h1>
        <span class="date-pill">${formatDate()}</span>
      </div>
      <main class="today-hero status-stage" aria-label="今日状态">
        <div class="eyebrow-row">
          <span>${goalLabel()}</span>
          <span class="status-dot ${todayEntry ? "done" : ""}">${todayStatusLabel(todayEntry)}</span>
        </div>
        <div class="day-display">
          <span>第</span>
          <strong>${startedDays}</strong>
          <span>天</span>
        </div>
        <p class="daily-line">今天别输。</p>
        <p class="quote-line">${motivationalLine()}</p>
        <p class="reminder-line">${reminderSummary()}</p>
      </main>
      <div class="home-actions action-dock simple-actions" aria-label="今日动作">
        <button class="primary urgent-action" onclick="openEmergency()">
          <span>我又上头了</span>
          <small>先把这一分钟拿下</small>
        </button>
        <button class="quiet calm-action" onclick="saveRecord('kept')">
          <span>我赢了</span>
          <small>${todayEntry?.status === "kept" ? "今天已经记上" : "把今天记上"}</small>
        </button>
      </div>
      ${tabs()}
      ${modalView()}
      ${toastView()}
    </section>
  `;
}

function recordView() {
  const todayRecord = state.records[todayKey()];
  return `
    <section class="screen">
      <div class="topbar">
        <h1 class="brand page-title">战绩</h1>
        <span class="date-pill">${goalLabel()}</span>
      </div>
      <div class="today-record-panel ios-panel">
        <span class="section-kicker">今天这把</span>
        <h2>${todayRecord ? statusText(todayRecord) : "还没交成绩"}</h2>
        <p class="subtle">一屏收口。记事实，别装没发生。</p>
        <div class="split-actions">
          <button class="secondary" onclick="saveRecord('kept')">今天我赢了</button>
          <button class="danger" onclick="saveRecord('lapsed')">哪里松了</button>
        </div>
      </div>
      <div class="record-hint">
        <span>连胜会变</span>
        <span>这把会记住</span>
      </div>
      <h2 class="section-title">最近几把</h2>
      ${recentRecords()}
      ${tabs()}
      ${modalView()}
      ${toastView()}
    </section>
  `;
}

function statsView() {
  const saved = savedMetric();
  return `
    <section class="screen">
      <div class="topbar">
        <h1 class="brand page-title">连胜</h1>
        <span class="date-pill">${goalLabel()}</span>
      </div>
      <div class="stat-hero ios-panel">
        <span>当前连续</span>
        <strong>${currentStreak()}</strong>
        <small>天</small>
      </div>
      <div class="stats-list">
        <div class="stat-line"><span>总赢下来的天数</span><strong>${totalKeptDays()}</strong></div>
        <div class="stat-line"><span>掉回去的次数</span><strong>${lapseCount()}</strong></div>
        <div class="stat-line"><span>硬拉回来的次数</span><strong>${state.emergencyCount}</strong></div>
        <div class="stat-line"><span>${saved.label}</span><strong>${saved.value}</strong></div>
      </div>
      <div class="note-panel ios-panel">
        <h2>掉一次，不等于后面都没了。</h2>
        <p class="subtle">连胜会断，但赢下来的天数、记住的教训和拉回来的次数都还在。</p>
      </div>
      ${tabs()}
      ${toastView()}
    </section>
  `;
}

function settingsView() {
  const isSmoking = state.profile.goal === "smoking";
  return `
    <section class="screen">
      <div class="topbar">
        <h1 class="brand page-title">自控</h1>
        <span class="date-pill">只在本机</span>
      </div>
      <h2 class="section-title first-title">目标</h2>
      <div class="settings-list">
        <div class="status-row"><span>目标</span><strong>${goalLabel()}</strong></div>
        <div class="status-row"><span>开打那天</span><strong>${state.profile.startDate}</strong></div>
        <div class="status-row"><span>数据位置</span><strong>本机浏览器</strong></div>
      </div>
      <h2 class="section-title">底线</h2>
      <div class="record-card stack ios-panel">
        ${
          isSmoking
            ? `<div class="field"><label>每天会烧掉多少钱</label><input id="settingsDailyCost" type="number" min="0" value="${Number(state.profile.dailyCost || 0)}" /></div>`
            : `<div class="field"><label>目标名字</label><input id="settingsPrivateName" value="${escapeHtml(state.profile.privateName || "专注恢复")}" /></div>`
        }
        <div class="field">
          <label>你为什么不想再输</label>
          <textarea id="settingsReason">${escapeHtml(state.profile.reason || "为了别再把时间和状态送出去。")}</textarea>
        </div>
        <button class="primary" onclick="saveSettings()">把这套定住</button>
      </div>
      <h2 class="section-title">晚点顶我</h2>
      <div class="record-card stack ios-panel">
        <label class="toggle-row">
          <span>到点提醒我</span>
          <input id="reminderEnabled" type="checkbox" ${state.reminder.enabled ? "checked" : ""} />
        </label>
        <div class="field">
          <label>第一次提醒时间</label>
          <input id="reminderTime" type="time" value="${state.reminder.time}" />
        </div>
        <label class="toggle-row">
          <span>再补一次</span>
          <input id="followupEnabled" type="checkbox" ${state.reminder.followupEnabled ? "checked" : ""} />
        </label>
        <div class="field">
          <label>第二次提醒时间</label>
          <input id="followupTime" type="time" value="${state.reminder.followupTime}" />
        </div>
        <div class="settings-list compact-settings-list">
          <div class="status-row"><span>提醒权限</span><strong>${reminderPermissionLabel()}</strong></div>
          <div class="status-row"><span>今晚状态</span><strong>${reminderSummary()}</strong></div>
        </div>
        <div class="split-actions">
          <button class="secondary" onclick="requestReminderPermission()">把权限打开</button>
          <button class="quiet" onclick="testReminder()">试一下</button>
        </div>
      </div>
      <h2 class="section-title">边界</h2>
      <div class="settings-list">
        <div class="status-row"><span>账号</span><strong>不需要</strong></div>
        <div class="status-row"><span>同步</span><strong>不上传</strong></div>
        <div class="status-row"><span>隐私锁</span><strong>iOS 版预留</strong></div>
      </div>
      <h2 class="section-title">留底</h2>
      <div class="stack">
        <button class="secondary" onclick="exportData()">导出这份记录</button>
        <button class="quiet" onclick="resetPrototype()">全部重开</button>
      </div>
      <h2 class="section-title">后面要上的东西</h2>
      <div class="settings-list">
        <div class="status-row"><span>Face ID</span><strong>计划中</strong></div>
        <div class="status-row"><span>系统提醒</span><strong>计划中</strong></div>
        <div class="status-row"><span>桌面小组件</span><strong>计划中</strong></div>
      </div>
      ${tabs()}
      ${toastView()}
    </section>
  `;
}

function statusText(record) {
  if (record.status === "kept") return "赢了";
  if (record.status === "lapsed") return "掉了";
  if (record.emergencyResult === "still_hard") return "还没收口";
  return "还没交成绩";
}

function recentRecords() {
  const rows = sortedRecords().slice(-5).reverse();
  if (!rows.length) return `<div class="empty">还没有战绩。</div>`;
  return `<div class="timeline record-timeline">${rows.map(([date, record]) => `
    <div class="timeline-item ${record.status === "lapsed" ? "lapsed" : "kept"}">
      <span>${date}</span>
      <strong>${statusText(record)}</strong>
      ${record.trigger ? `<p class="subtle">起头：${escapeHtml(record.trigger)}</p>` : ""}
      ${record.plan ? `<p class="subtle">下次：${escapeHtml(record.plan)}</p>` : ""}
    </div>
  `).join("")}</div>`;
}

function tabs() {
  const items = [
    ["home", "今天"],
    ["record", "战绩"],
    ["stats", "连胜"],
    ["settings", "自控"]
  ];
  return `<nav class="tabs" aria-label="底部导航">${items.map(([id, label]) => `
    <button class="tab ${state.activeTab === id ? "active" : ""}" data-tab="${id}" onclick="setTab('${id}')">${label}</button>
  `).join("")}</nav>`;
}

function modalView() {
  if (state.modal === "emergency") return emergencyModal();
  if (state.modal === "relapse") return relapseModal();
  return "";
}

function toastView() {
  return state.toast ? `<div class="toast">${escapeHtml(state.toast)}</div>` : "";
}

function emergencyModal() {
  const step = emergencySteps[state.emergencyStep];
  const progress = `${((state.emergencyStep + 1) / emergencySteps.length) * 100}%`;
  const final = state.emergencyStep === emergencySteps.length - 1;
  const breathBars = Array.from({ length: 6 }, (_, index) => `<span style="--delay:${index * 120}ms"></span>`).join("");
  return `
    <div class="overlay emergency-overlay">
      <div class="modal emergency-sheet">
        <div class="emergency-top">
          <span>拉回 ${state.emergencyStep + 1}/${emergencySteps.length}</span>
          <button class="icon-close" aria-label="退出拉回" onclick="setState({ modal: null, emergencyStep: 0 })">退出</button>
        </div>
        <div class="progress hairline-progress" style="--progress:${progress}"><div></div></div>
        <div class="emergency-copy">
          <span class="emergency-cue">${step.cue}</span>
          <h2>${step.title}</h2>
          <p>${step.body}</p>
          <strong class="emergency-quote">${step.quote}</strong>
          <div class="breath-orb" aria-hidden="true"><span></span></div>
          <div class="breath-guide" aria-label="呼吸节奏">${breathBars}</div>
        </div>
        <p class="emergency-reason">${escapeHtml(state.profile.reason || "为了别再把时间和状态送出去。")}</p>
        <div class="stack emergency-actions">
          ${
            final
              ? `<button class="secondary" onclick="nextEmergencyStep('held')">这次我赢了</button>
                 <button class="quiet" onclick="nextEmergencyStep('still_hard')">这次掉了，先记上</button>`
              : `<button class="primary" onclick="nextEmergencyStep()">继续顶住</button>`
          }
        </div>
      </div>
    </div>
  `;
}

function relapseModal() {
  return `
    <div class="overlay">
      <div class="modal review-modal">
        <h2>这把怎么掉的</h2>
        <p class="subtle">别绕。只填三件事：起头、状态、下次卡哪一步。</p>
        <div class="field">
          <label>是哪一下起的头</label>
          <select id="trigger">
            <option>压力</option>
            <option>无聊</option>
            <option>熬夜</option>
            <option>独处</option>
            <option>社交</option>
            <option>情绪低落</option>
          </select>
        </div>
        <div class="field">
          <label>当时你什么状态</label>
          <input id="mood" value="焦虑" />
        </div>
        <div class="field">
          <label>下次先卡哪一步</label>
          <textarea id="plan">先打开拉回流程，离开当前环境。</textarea>
        </div>
        <div class="stack">
          <button class="primary" onclick="saveRelapse()">记住这把</button>
          <button class="quiet" onclick="setState({ modal: null })">先放这</button>
        </div>
      </div>
    </div>
  `;
}

function setTab(tab) {
  setState({ activeTab: tab });
}

function resetPrototype() {
  if (!confirm("确认全部重开？当前本地记录会被清空。")) return;
  state = baseState();
  saveState();
  render();
}

function exportData() {
  const payload = {
    app: "戒",
    exportedAt: new Date().toISOString(),
    data: {
      profile: state.profile,
      records: state.records,
      emergencyCount: state.emergencyCount,
      reminder: state.reminder
    }
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `戒-本地数据-${todayKey()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast("这份记录已准备导出");
}

function saveSettings() {
  if (state.profile.goal === "smoking") {
    state.profile.dailyCost = Number(document.querySelector("#settingsDailyCost")?.value || 0);
  } else {
    state.profile.privateName = document.querySelector("#settingsPrivateName")?.value || "专注恢复";
  }
  state.profile.reason = document.querySelector("#settingsReason")?.value || "为了别再把时间和状态送出去。";
  state.reminder.enabled = document.querySelector("#reminderEnabled")?.checked || false;
  state.reminder.time = document.querySelector("#reminderTime")?.value || "21:30";
  state.reminder.followupEnabled = document.querySelector("#followupEnabled")?.checked || false;
  state.reminder.followupTime = document.querySelector("#followupTime")?.value || "23:00";
  state.reminder.permission = effectiveReminderPermission();
  saveState();
  render();
  showToast("这套定住了");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function render() {
  const app = document.querySelector("#app");
  if (state.reminder.permission !== effectiveReminderPermission()) {
    state.reminder.permission = effectiveReminderPermission();
    saveState();
  }
  if (!state.profile) {
    app.innerHTML = onboardingView();
    syncReminderSchedule();
    return;
  }
  if (state.activeTab === "record" || state.activeTab === "review") app.innerHTML = recordView();
  else if (state.activeTab === "stats") app.innerHTML = statsView();
  else if (state.activeTab === "settings") app.innerHTML = settingsView();
  else app.innerHTML = homeView();
  syncReminderSchedule();
}

render();
