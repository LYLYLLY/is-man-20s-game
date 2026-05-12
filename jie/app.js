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
    title: "先停 10 秒",
    body: "把手机放低，双脚踩稳。现在不用解决全部，只要先不行动。",
    cue: "停住",
    quote: "冲动会过去，你不用跟它走。"
  },
  {
    title: "慢呼吸 6 次",
    body: "吸气，停一下，呼气。跟着节奏走，把这一分钟拿回来。",
    cue: "呼吸",
    quote: "先赢这一分钟。"
  },
  {
    title: "换一个动作",
    body: "站起来喝水、洗脸、走到门口，或者离开当前房间。",
    cue: "离开",
    quote: "不要和冲动辩论，先离开现场。"
  },
  {
    title: "做选择",
    body: "现在记录结果。撑过去就是一次胜利；还很难受，也先留下记录。",
    cue: "记录",
    quote: "你不需要完美，只需要现在停下。"
  }
];

const motivationalLines = [
  "先赢这一分钟。",
  "冲动会过去，你不用跟它走。",
  "今天不是证明自己，只是守住下一步。",
  "把手机放下，生活会回来一点。",
  "你正在重新拿回主动权。",
  "难受不是命令，它只是信号。",
  "撑过这一阵，明天会轻一点。",
  "不要和冲动辩论，先离开现场。",
  "一次选择，会把你带回自己。",
  "你不需要完美，只需要现在停下。"
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
  if (!state.profile) return { label: "累计收益", value: "0" };
  const kept = totalKeptDays();
  if (state.profile.goal === "smoking") {
    const dailyCost = Number(state.profile.dailyCost || 0);
    return { label: "估算省下", value: `¥${Math.round(kept * dailyCost)}` };
  }
  return { label: "专注恢复", value: `${kept}天` };
}

function motivationalLine() {
  const index = daysBetween(state.profile?.startDate || todayKey(), todayKey()) % motivationalLines.length;
  return motivationalLines[index];
}

function todayRecord() {
  return state.records[todayKey()] || null;
}

function isTodayClosed() {
  return Boolean(todayRecord());
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
  if (!state.reminder.enabled) return "提醒未开启";
  if (isTodayClosed()) return "今天已完成，不再提醒";
  const permission = effectiveReminderPermission();
  if (permission === "denied") return "提醒已开启，但通知权限被拒绝";
  if (permission === "unsupported") return `未完成会在 ${state.reminder.time} 于当前页面内提示`;
  if (permission === "default") return `提醒已开启，待允许通知权限（${state.reminder.time}）`;
  const followup = state.reminder.followupEnabled ? `，补提醒 ${state.reminder.followupTime}` : "";
  return `未完成会在 ${state.reminder.time} 提醒${followup}`;
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
  scheduleReminderAt(state.reminder.time, "今天还没记录，先守住。");
  if (state.reminder.followupEnabled) {
    scheduleReminderAt(state.reminder.followupTime, "如果今天还没完成，现在补上。");
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
  const reason = document.querySelector("#reason")?.value || "为了重新拿回生活的主动权。";
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
  showToast("目标已开始");
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
    status: "kept",
    note: "今天守住了",
    updatedAt: new Date().toISOString()
  };
  state.activeTab = "home";
  saveState();
  render();
  showToast("今日已记录");
}

function saveRelapse() {
  const key = todayKey();
  state.records[key] = {
    status: "lapsed",
    trigger: document.querySelector("#trigger")?.value || "未记录",
    mood: document.querySelector("#mood")?.value || "未记录",
    plan: document.querySelector("#plan")?.value || "下次先打开救急流程",
    updatedAt: new Date().toISOString()
  };
  state.modal = null;
  state.activeTab = "record";
  saveState();
  render();
  showToast("复盘已保存");
}

function openEmergency() {
  state.modal = "emergency";
  state.emergencyStep = 0;
  saveState();
  render();
}

function nextEmergencyStep(result) {
  if (result) {
    state.emergencyCount += 1;
    state.records[todayKey()] = {
      ...(state.records[todayKey()] || {}),
      emergencyResult: result,
      emergencyAt: new Date().toISOString()
    };
    state.modal = null;
    state.emergencyStep = 0;
    if (result === "still_hard") state.activeTab = "record";
    showToast(result === "held" ? "这次撑过去了" : "先记录下来");
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
    showToast("当前浏览器不支持通知");
    return;
  }
  const permission = await Notification.requestPermission();
  state.reminder.permission = permission;
  saveState();
  render();
  showToast(permission === "granted" ? "通知已允许" : "通知未开启");
}

function testReminder() {
  const message = "测试提醒：如果今天还没完成，现在补上。";
  setTimeout(() => fireReminder(message), 1200);
  showToast("1 秒后触发测试提醒");
}

function goalLabel() {
  if (!state.profile) return "";
  if (state.profile.goal === "smoking") return "戒烟";
  return state.profile.privateName || "戒色";
}

function todayStatusLabel(record) {
  if (!record) return "今日未记录";
  if (record.status === "kept") return "今天已守住";
  if (record.status === "lapsed") return "今天已复盘";
  return "今天已记录";
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
        <span class="section-kicker">自律，但不羞辱</span>
        <strong>先把这一刻稳住。</strong>
        <p class="subtle">在关键时刻停下来、记录下来，然后继续往前走。</p>
      </div>
      <h2 class="section-title">选择你的目标</h2>
      <div class="choice-grid">
        <button class="choice choice-card" onclick="selectChoice('smoking', this)">
          <b>戒烟</b>
          <span class="subtle">记录少抽、省钱和连续天数。</span>
        </button>
        <button class="choice choice-card" onclick="selectChoice('focus', this)">
          <b>戒色</b>
          <span class="subtle">以冲动管理和专注恢复为核心。</span>
        </button>
      </div>
      <div id="setupFields" class="stack"></div>
    </section>
  `;
}

function selectChoice(goal, element) {
  document.querySelectorAll(".choice").forEach((item) => item.classList.remove("active"));
  element.classList.add("active");
  const label = goal === "smoking" ? "每日烟钱估算" : "隐私目标名称";
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
      <label>为什么开始</label>
      <textarea id="reason">为了重新拿回生活的主动权。</textarea>
    </div>
    <button class="primary" onclick="startProfile('${goal}')">开始</button>
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
        <p class="daily-line">今天先守住。</p>
        <p class="quote-line">${motivationalLine()}</p>
        <p class="reminder-line">${reminderSummary()}</p>
      </main>
      <div class="home-actions action-dock simple-actions" aria-label="今日动作">
        <button class="primary urgent-action" onclick="openEmergency()">
          <span>我有冲动</span>
          <small>先撑过 1 分钟</small>
        </button>
        <button class="quiet calm-action" onclick="saveRecord('kept')">
          <span>我守住了</span>
          <small>${todayEntry?.status === "kept" ? "今日已完成" : "记录今天"}</small>
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
        <h1 class="brand page-title">今日记录</h1>
        <span class="date-pill">${goalLabel()}</span>
      </div>
      <div class="today-record-panel ios-panel">
        <span class="section-kicker">今天</span>
        <h2>${todayRecord ? statusText(todayRecord) : "还没有记录"}</h2>
        <p class="subtle">一屏完成。只记录事实，不评价自己。</p>
        <div class="split-actions">
          <button class="secondary" onclick="saveRecord('kept')">守住了</button>
          <button class="danger" onclick="saveRecord('lapsed')">做复盘</button>
        </div>
      </div>
      <div class="record-hint">
        <span>连续天数会变化</span>
        <span>复盘经验会保留</span>
      </div>
      <h2 class="section-title">最近记录</h2>
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
        <h1 class="brand page-title">统计</h1>
        <span class="date-pill">${goalLabel()}</span>
      </div>
      <div class="stat-hero ios-panel">
        <span>当前连续</span>
        <strong>${currentStreak()}</strong>
        <small>天</small>
      </div>
      <div class="stats-list">
        <div class="stat-line"><span>累计成功天数</span><strong>${totalKeptDays()}</strong></div>
        <div class="stat-line"><span>失败复盘次数</span><strong>${lapseCount()}</strong></div>
        <div class="stat-line"><span>救急次数</span><strong>${state.emergencyCount}</strong></div>
        <div class="stat-line"><span>${saved.label}</span><strong>${saved.value}</strong></div>
      </div>
      <div class="note-panel ios-panel">
        <h2>一次失败不等于归零。</h2>
        <p class="subtle">连续天数会重置，但累计成功、复盘经验和救急次数都会保留。</p>
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
        <h1 class="brand page-title">设置</h1>
        <span class="date-pill">本地原型</span>
      </div>
      <h2 class="section-title first-title">目标</h2>
      <div class="settings-list">
        <div class="status-row"><span>目标</span><strong>${goalLabel()}</strong></div>
        <div class="status-row"><span>开始日期</span><strong>${state.profile.startDate}</strong></div>
        <div class="status-row"><span>数据位置</span><strong>本机浏览器</strong></div>
      </div>
      <h2 class="section-title">基础设置</h2>
      <div class="record-card stack ios-panel">
        ${
          isSmoking
            ? `<div class="field"><label>每日烟钱估算</label><input id="settingsDailyCost" type="number" min="0" value="${Number(state.profile.dailyCost || 0)}" /></div>`
            : `<div class="field"><label>隐私目标名称</label><input id="settingsPrivateName" value="${escapeHtml(state.profile.privateName || "专注恢复")}" /></div>`
        }
        <div class="field">
          <label>为什么开始</label>
          <textarea id="settingsReason">${escapeHtml(state.profile.reason || "为了重新拿回生活的主动权。")}</textarea>
        </div>
        <button class="primary" onclick="saveSettings()">保存设置</button>
      </div>
      <h2 class="section-title">主动提醒</h2>
      <div class="record-card stack ios-panel">
        <label class="toggle-row">
          <span>开启每日提醒</span>
          <input id="reminderEnabled" type="checkbox" ${state.reminder.enabled ? "checked" : ""} />
        </label>
        <div class="field">
          <label>首次提醒时间</label>
          <input id="reminderTime" type="time" value="${state.reminder.time}" />
        </div>
        <label class="toggle-row">
          <span>开启二次提醒</span>
          <input id="followupEnabled" type="checkbox" ${state.reminder.followupEnabled ? "checked" : ""} />
        </label>
        <div class="field">
          <label>二次提醒时间</label>
          <input id="followupTime" type="time" value="${state.reminder.followupTime}" />
        </div>
        <div class="settings-list compact-settings-list">
          <div class="status-row"><span>通知权限</span><strong>${reminderPermissionLabel()}</strong></div>
          <div class="status-row"><span>今日提醒状态</span><strong>${reminderSummary()}</strong></div>
        </div>
        <div class="split-actions">
          <button class="secondary" onclick="requestReminderPermission()">请求权限</button>
          <button class="quiet" onclick="testReminder()">测试提醒</button>
        </div>
      </div>
      <h2 class="section-title">隐私原则</h2>
      <div class="settings-list">
        <div class="status-row"><span>登录</span><strong>不需要</strong></div>
        <div class="status-row"><span>联网</span><strong>不上传</strong></div>
        <div class="status-row"><span>隐私锁</span><strong>iOS 版预留</strong></div>
      </div>
      <h2 class="section-title">数据</h2>
      <div class="stack">
        <button class="secondary" onclick="exportData()">导出本地数据</button>
        <button class="quiet" onclick="resetPrototype()">重新开始原型</button>
      </div>
      <h2 class="section-title">后续 iOS 能力</h2>
      <div class="settings-list">
        <div class="status-row"><span>Face ID</span><strong>计划中</strong></div>
        <div class="status-row"><span>通知提醒</span><strong>计划中</strong></div>
        <div class="status-row"><span>桌面小组件</span><strong>计划中</strong></div>
      </div>
      ${tabs()}
      ${toastView()}
    </section>
  `;
}

function statusText(record) {
  if (record.status === "kept") return "守住了";
  if (record.status === "lapsed") return "已复盘";
  return "已记录";
}

function recentRecords() {
  const rows = sortedRecords().slice(-5).reverse();
  if (!rows.length) return `<div class="empty">还没有记录。</div>`;
  return `<div class="timeline record-timeline">${rows.map(([date, record]) => `
    <div class="timeline-item ${record.status === "lapsed" ? "lapsed" : "kept"}">
      <span>${date}</span>
      <strong>${statusText(record)}</strong>
      ${record.trigger ? `<p class="subtle">触发：${escapeHtml(record.trigger)}</p>` : ""}
      ${record.plan ? `<p class="subtle">下次：${escapeHtml(record.plan)}</p>` : ""}
    </div>
  `).join("")}</div>`;
}

function tabs() {
  const items = [
    ["home", "首页"],
    ["record", "记录"],
    ["stats", "统计"],
    ["settings", "设置"]
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
          <span>救急 ${state.emergencyStep + 1}/${emergencySteps.length}</span>
          <button class="icon-close" aria-label="关闭救急" onclick="setState({ modal: null, emergencyStep: 0 })">关闭</button>
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
        <p class="emergency-reason">${escapeHtml(state.profile.reason || "为了重新拿回生活的主动权。")}</p>
        <div class="stack emergency-actions">
          ${
            final
              ? `<button class="secondary" onclick="nextEmergencyStep('held')">我撑过去了</button>
                 <button class="quiet" onclick="nextEmergencyStep('still_hard')">还很难受，先记录</button>`
              : `<button class="primary" onclick="nextEmergencyStep()">继续</button>`
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
        <h2>做一次复盘</h2>
        <p class="subtle">只填三件事：触发、情绪、下次动作。</p>
        <div class="field">
          <label>触发原因</label>
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
          <label>当时情绪</label>
          <input id="mood" value="焦虑" />
        </div>
        <div class="field">
          <label>下次策略</label>
          <textarea id="plan">先打开救急流程，离开当前环境。</textarea>
        </div>
        <div class="stack">
          <button class="primary" onclick="saveRelapse()">保存复盘</button>
          <button class="quiet" onclick="setState({ modal: null })">稍后再说</button>
        </div>
      </div>
    </div>
  `;
}

function setTab(tab) {
  setState({ activeTab: tab });
}

function resetPrototype() {
  if (!confirm("确认重新开始？当前本地原型数据会被清空。")) return;
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
  showToast("数据已准备导出");
}

function saveSettings() {
  if (state.profile.goal === "smoking") {
    state.profile.dailyCost = Number(document.querySelector("#settingsDailyCost")?.value || 0);
  } else {
    state.profile.privateName = document.querySelector("#settingsPrivateName")?.value || "专注恢复";
  }
  state.profile.reason = document.querySelector("#settingsReason")?.value || "为了重新拿回生活的主动权。";
  state.reminder.enabled = document.querySelector("#reminderEnabled")?.checked || false;
  state.reminder.time = document.querySelector("#reminderTime")?.value || "21:30";
  state.reminder.followupEnabled = document.querySelector("#followupEnabled")?.checked || false;
  state.reminder.followupTime = document.querySelector("#followupTime")?.value || "23:00";
  state.reminder.permission = effectiveReminderPermission();
  saveState();
  render();
  showToast("设置已保存");
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
