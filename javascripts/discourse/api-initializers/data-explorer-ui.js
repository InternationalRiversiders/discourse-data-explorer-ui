/**
 * Data Explorer UI — 主题组件初始化入口
 *
 * 在 Data Explorer 的以下页面运行：
 *   编辑页：/admin/plugins/discourse-data-explorer/queries/<id>
 *   列表页：/admin/plugins/discourse-data-explorer/queries
 *
 * 分别向 .query-action-bar__left 与 .d-page-subheader__title-row
 * 注入功能开关（复选框），由 body class 切换生效。
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
const HEADER_SELECTOR = "tr.headers th";
const BETTER_HEADER_ATTR = "data-better-header";

// ── 查询列表页 ──
const LIST_CONTAINER_SELECTOR = ".d-page-subheader__title-row";
const HIDE_DEFAULT_CLASS = "de-ui-hide-default";
const HIDE_AUTO_CLASS = "de-ui-hide-auto";

// ═══════════════════════════════════════
// 全局状态（页面离开时全部重置）
// ═══════════════════════════════════════

let currentPage = null; // "edit"（查询编辑页） | "list"（查询列表页） | null
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
  if (enabled) {
    formatHeaders();
  } else {
    restoreHeaders();
  }
}

function isBreakAllEnabled() {
  return document.body.classList.contains(BREAK_ALL_CLASS);
}

// ── 表头断行优化：下划线 → 空格（存储/恢复参考「格式化时间」）──

function formatHeader(th) {
  const text = th.textContent.trim();
  if (!text.includes("_")) return;
  th.setAttribute(VALUE_ATTR, text);
  th.setAttribute(BETTER_HEADER_ATTR, "");
  th.textContent = text.replace(/_/g, " ");
}

function restoreHeader(th) {
  th.textContent = th.getAttribute(VALUE_ATTR);
  th.removeAttribute(VALUE_ATTR);
  th.removeAttribute(BETTER_HEADER_ATTR);
}

function formatHeaders() {
  document
    .querySelectorAll(`${HEADER_SELECTOR}:not([${BETTER_HEADER_ATTR}])`)
    .forEach(formatHeader);
}

function restoreHeaders() {
  document
    .querySelectorAll(`${HEADER_SELECTOR}[${BETTER_HEADER_ATTR}]`)
    .forEach(restoreHeader);
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
// 查询列表页：隐藏默认 / 自动查询
// （body class 切换 CSS var，见 common.scss）
// ═══════════════════════════════════════

// ── URL 判定 ──

function isEditPage(url) {
  return TARGET_URL_RE.test(url);
}

function isListPage(url) {
  if (isEditPage(url)) return false;
  const path = url.split(/[?#]/)[0].replace(/\/+$/, "");
  return path === "/admin/plugins/discourse-data-explorer/queries";
}

/** 当前页面模式："edit" | "list" | null */
function pageModeFor(url) {
  if (isEditPage(url)) return "edit";
  if (isListPage(url)) return "list";
  return null;
}

// ── 隐藏默认查询 ──

function setHideDefault(enabled) {
  document.body.classList.toggle(HIDE_DEFAULT_CLASS, enabled);
}

function isHideDefaultEnabled() {
  return document.body.classList.contains(HIDE_DEFAULT_CLASS);
}

// ── 隐藏自动查询 ──

function setHideAuto(enabled) {
  document.body.classList.toggle(HIDE_AUTO_CLASS, enabled);
}

function isHideAutoEnabled() {
  return document.body.classList.contains(HIDE_AUTO_CLASS);
}

function injectListToggles() {
  const container = document.querySelector(LIST_CONTAINER_SELECTOR);
  if (!container) return false;
  if (container.querySelector(".de-ui-toggles")) {
    syncCheckboxStates();
    return true;
  }

  const toggles = document.createElement("div");
  toggles.className = "de-ui-toggles";

  const d = createCheckbox({
    id: "hide-default",
    label: "隐藏默认查询",
    title: "隐藏带默认徽标（query-badge）的查询行\n在只想看自己创建的查询时启用",
    onChange: (enabled) => setHideDefault(enabled),
  });
  toggleRefs["hide-default"] = d;

  const a = createCheckbox({
    id: "hide-auto",
    label: "隐藏自动查询",
    title: "隐藏描述中含 #auto# 标记的自动查询行",
    onChange: (enabled) => setHideAuto(enabled),
  });
  toggleRefs["hide-auto"] = a;

  toggles.append(d.wrap, a.wrap);

  // 放在标题 h2 之后
  const heading = container.querySelector("h2.d-page-subheader__title");
  if (heading) {
    heading.insertAdjacentElement("afterend", toggles);
  } else {
    container.appendChild(toggles);
  }
  syncCheckboxStates();
  return true;
}

// ═══════════════════════════════════════
// 注入 & Observer
// ═══════════════════════════════════════

function syncCheckboxStates() {
  const b = toggleRefs["break-all"];
  if (b) b.input.checked = isBreakAllEnabled();
  const d = toggleRefs["date-format"];
  if (d) d.input.checked = dateFormatEnabled;
  const hd = toggleRefs["hide-default"];
  if (hd) hd.input.checked = isHideDefaultEnabled();
  const ha = toggleRefs["hide-auto"];
  if (ha) ha.input.checked = isHideAutoEnabled();
}

function injectEditToggles() {
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
    if (currentPage === "edit") {
      // 守卫：复选框被 Glimmer 抹掉后重新注入
      if (!document.querySelector(".de-ui-toggles")) {
        injectEditToggles();
      }
      // 守卫：新渲染的日期单元格自动格式化
      if (dateFormatEnabled) {
        document
          .querySelectorAll(`${CELL_SELECTOR}:not([${BETTER_TIME_ATTR}])`)
          .forEach(formatCell);
      }
      // 守卫：开启强制断行时，新渲染的表头自动替换下划线
      if (isBreakAllEnabled()) {
        formatHeaders();
      }
    } else if (currentPage === "list") {
      // 守卫：复选框被 Glimmer 抹掉后重新注入
      if (!document.querySelector(".de-ui-toggles")) {
        injectListToggles();
      }
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

  // 恢复表头下划线
  restoreHeaders();

  // 恢复 break-all
  document.body.classList.remove(BREAK_ALL_CLASS);

  // 恢复列表页隐藏开关
  document.body.classList.remove(HIDE_DEFAULT_CLASS, HIDE_AUTO_CLASS);

  // 重置页面模式与引用
  currentPage = null;
  toggleRefs = {};
}

// ═══════════════════════════════════════
// 入口
// ═══════════════════════════════════════

export default apiInitializer((api) => {
  api.onPageChange(async (url) => {
    const mode = pageModeFor(url);

    // 切换到另一页面时先清理上一个页面的全部状态
    if (mode !== currentPage) {
      teardown();
      currentPage = mode;
    }

    if (mode === "edit") {
      await waitForElement(".query-action-bar__left");
      injectEditToggles();
      startPageObserver();
    } else if (mode === "list") {
      await waitForElement(LIST_CONTAINER_SELECTOR);
      injectListToggles();
      startPageObserver();
    }
  });
});
