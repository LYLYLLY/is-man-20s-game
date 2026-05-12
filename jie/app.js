const STORAGE_KEY = "jie_app_state_v1";

const defaultState = {
  profile: null,
  records: {},
  emergencyCount: 0,
  activeTab: "home",
  modal: null,
  emergencyStep: 0,
  toast: null
};

const emergencySteps = [
  {
    title: "先停 10 秒",
    body: "把手机放低，双脚踩稳。现在不用解决全部，只要先不行动。",
    cue: "停住"
  },
  {
    title: "慢呼吸 6 次",
    body: "吸气，停一下，呼气。跟着节奏走，把这一分钟拿回来。",
    cue: "呼吸"
  },
  {
    title: "换一个动作",
    body: "站起来喝水、洗脸、走到门口，或者离开当前房间。",
    cue: "离开"
  },
  {
    title: "做选择",
    body: "现在记录结果。撑过去就是一次胜利；还很难受，也先留下记录。",
    cue: "记录"
  }
];

let state = loadState();

function loadState() {
  try {
    return { ...defaultState, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return { ...defaultState };
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
  const todayRecord = state.records[todayKey()];
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
          <span class="status-dot ${todayRecord ? "done" : ""}">${todayStatusLabel(todayRecord)}</span>
        </div>
        <div class="day-display">
          <span>第</span>
          <strong>${startedDays}</strong>
          <span>天</span>
        </div>
        <p class="daily-line">今天先守住。</p>
        <p class="reason-line">${escapeHtml(state.profile.reason || "为了重新拿回生活的主动权。")}</p>
        ${weekStrip()}
      </main>
      <div class="home-actions action-dock" aria-label="今日动作">
        <button class="primary calm-action" onclick="saveRecord('kept')">
          <span>我守住了</span>
          <small>${todayRecord?.status === "kept" ? "今日已完成" : "记录今天"}</small>
        </button>
        <button class="secondary urgent-action" onclick="openEmergency()">
          <span>我有冲动</span>
          <small>进入救急</small>
        </button>
      </div>
      <div class="quiet-summary compact-metrics">
        <span>当前连续 ${currentStreak()} 天</span>
        <span>救急 ${state.emergencyCount} 次</span>
        <span>${todayRecord ? statusText(todayRecord) : "等待记录"}</span>
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
  state = { ...defaultState };
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
      emergencyCount: state.emergencyCount
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
  if (!state.profile) {
    app.innerHTML = onboardingView();
    return;
  }
  if (state.activeTab === "record" || state.activeTab === "review") app.innerHTML = recordView();
  else if (state.activeTab === "stats") app.innerHTML = statsView();
  else if (state.activeTab === "settings") app.innerHTML = settingsView();
  else app.innerHTML = homeView();
}

render();
