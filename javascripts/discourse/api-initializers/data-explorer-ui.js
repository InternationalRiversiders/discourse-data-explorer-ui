/**
 * Data Explorer UI — 主题组件初始化入口
 *
 * 仅在 Data Explorer 的 query 编辑页运行：
 *   /admin/plugins/discourse-data-explorer/queries/<id>
 *
 * 在 .query-action-bar__left 注入功能开关（复选框）。
 */
import { apiInitializer } from "discourse/lib/api";

// ═══════════════════════════════════════
// 常量
// ═══════════════════════════════════════

const TARGET_URL_RE = /^\/admin\/plugins\/discourse-data-explorer\/queries\/\d+/;
const TIMESTAMPZ_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const CELL_SELECTOR = "td.query-result-cell";
const BETTER_TIME_ATTR = "data-better-time";
const VALUE_ATTR = "data-value";
const BREAK_ALL_CLASS = "de-ui-break-all";

// ═══════════════════════════════════════
// 全局状态（页面离开时全部重置）
// ═══════════════════════════════════════

let dateFormatEnabled = false;
let pageObserver = null;
let toggleRefs = {};

// ═══════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════

function waitForElement(selector, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}

function createCheckbox({ id, label, title, onChange }) {
  const wrap = document.createElement("label");
  wrap.className = `de-ui-toggle de-ui-toggle--${id}`;
  wrap.title = title ?? label;

  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = `de-ui-${id}`;

  const text = document.createElement("span");
  text.className = "de-ui-toggle__label";
  text.textContent = label;

  input.addEventListener("change", () => onChange(input.checked));
  wrap.append(input, text);
  return { wrap, input };
}

// ═══════════════════════════════════════
// 开关 1：结果任意断行（body class 切换）
// ═══════════════════════════════════════

function setBreakAll(enabled) {
  document.body.classList.toggle(BREAK_ALL_CLASS, enabled);
}

function isBreakAllEnabled() {
  return document.body.classList.contains(BREAK_ALL_CLASS);
}

// ═══════════════════════════════════════
// 开关 2：时间显示优化
// ═══════════════════════════════════════

function isTimestampz(value) {
  return TIMESTAMPZ_RE.test(value);
}

function formatTimestamp(isoString) {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatCell(td) {
  const text = td.textContent.trim();
  if (isTimestampz(text)) {
    td.setAttribute(VALUE_ATTR, text);
    td.setAttribute(BETTER_TIME_ATTR, "");
    td.textContent = formatTimestamp(text);
  }
}

function restoreCell(td) {
  td.textContent = td.getAttribute(VALUE_ATTR);
  td.removeAttribute(VALUE_ATTR);
  td.removeAttribute(BETTER_TIME_ATTR);
}

function formatAllCells() {
  document
    .querySelectorAll(`${CELL_SELECTOR}:not([${BETTER_TIME_ATTR}])`)
    .forEach(formatCell);
}

function restoreAllCells() {
  document
    .querySelectorAll(`${CELL_SELECTOR}[${BETTER_TIME_ATTR}]`)
    .forEach(restoreCell);
}

function enableDateFormat() {
  dateFormatEnabled = true;
  formatAllCells();
}

function disableDateFormat() {
  dateFormatEnabled = false;
  restoreAllCells();
}

// ═══════════════════════════════════════
// 注入 & Observer
// ═══════════════════════════════════════

function syncCheckboxStates() {
  const b = toggleRefs["break-all"];
  if (b) b.input.checked = isBreakAllEnabled();
  const d = toggleRefs["date-format"];
  if (d) d.input.checked = dateFormatEnabled;
}

function injectToggles() {
  const container = document.querySelector(".query-action-bar__left");
  if (!container) return false;
  if (container.querySelector(".de-ui-toggles")) {
    syncCheckboxStates();
    return true;
  }

  const toggles = document.createElement("div");
  toggles.className = "de-ui-toggles";

  const b = createCheckbox({
    id: "break-all",
    label: "强制断行",
    title: "对 table 单元格启用 overflow-wrap: anywhere\n在结果很长却未自动换行时启用",
    onChange: (enabled) => setBreakAll(enabled),
  });
  toggleRefs["break-all"] = b;

  const d = createCheckbox({
    id: "date-format",
    label: "格式化时间",
    title: "将 PostgreSQL timestamptz 转为本地时间并格式化\n例如 YYYY-MM-DD HH:mm:ss",
    onChange: (enabled) => {
      if (enabled) enableDateFormat();
      else disableDateFormat();
    },
  });
  toggleRefs["date-format"] = d;

  toggles.append(b.wrap, d.wrap);
  container.appendChild(toggles);
  syncCheckboxStates();
  return true;
}

function startPageObserver() {
  if (pageObserver) return;
  const root = document.querySelector(".admin-detail");
  if (!root) return;

  pageObserver = new MutationObserver(() => {
    // 守卫：复选框被 Glimmer 抹掉后重新注入
    if (!document.querySelector(".de-ui-toggles")) {
      injectToggles();
    }
    // 守卫：新渲染的日期单元格自动格式化
    if (dateFormatEnabled) {
      document
        .querySelectorAll(`${CELL_SELECTOR}:not([${BETTER_TIME_ATTR}])`)
        .forEach(formatCell);
    }
  });
  pageObserver.observe(root, { childList: true, subtree: true });
}

/** 离开页面时清理所有状态 */
function teardown() {
  // 断开 observer
  pageObserver?.disconnect();
  pageObserver = null;

  // 恢复日期格式化
  if (dateFormatEnabled) {
    disableDateFormat();
  }

  // 恢复 break-all
  document.body.classList.remove(BREAK_ALL_CLASS);

  // 重置引用
  toggleRefs = {};
}

// ═══════════════════════════════════════
// 入口
// ═══════════════════════════════════════

export default apiInitializer((api) => {
  api.onPageChange(async (url) => {
    if (!TARGET_URL_RE.test(url)) {
      teardown();
      return;
    }

    await waitForElement(".query-action-bar__left");
    injectToggles();
    startPageObserver();
  });
});
