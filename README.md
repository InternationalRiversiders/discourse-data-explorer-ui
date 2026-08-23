# Discourse Data Explorer UI

一个 Discourse 主题组件（Theme Component），对 Data Explorer 插件的前端 UI 提供优化选项。

仅在 Data Explorer 的查询编辑页运行：`/admin/plugins/discourse-data-explorer/queries/<id>`

## 功能

在查询编辑页的操作栏（`.query-action-bar__left`）注入两个复选框开关：

| 开关 | 功能 |
| --- | --- |
| **强制断行** | 数据单元格 `td.query-result-cell` 启用 `overflow-wrap: anywhere`；表头 `tr.headers th` 将下划线替换为空格并启用 `overflow-wrap: break-word`，优先在空格处断行，防止长字符串撑破表格 |
| **格式化时间** | 将 PostgreSQL timestamptz 格式（如 `2026-08-05T06:42:18.200Z`）转为浏览器本地时间 `YYYY-MM-DD HH:mm:ss`。格式化后的单元格通过 `[data-better-time]` 选择器应用 `overflow-wrap: break-word`，优先在空格处断行 |

通过 `body` class 切换 CSS、`[data-better-time]` / `[data-better-header]` 属性选择器覆盖断行策略以及 MutationObserver 持久化守卫，两个开关均为即时生效，不受 Glimmer 组件重渲染影响。

## 文件结构

```text
├── about.json
├── common/
│   └── common.scss                    # 复选框样式
└── javascripts/
    └── discourse/
        └── api-initializers/
            └── data-explorer-ui.js    # 入口：URL 检测 + DOM 注入
```

## 原理

Data Explorer 没有提供 PluginOutlet 注入点，因此本组件通过 DOM 直接注入：

1. `api.onPageChange(url)` 监听 URL 变化（覆盖首次加载与 SPA 导航）
2. 匹配 `/admin/plugins/discourse-data-explorer/queries/<id>` 编辑页
3. 等待 `.query-action-bar__left` 渲染完成后 DOM 注入复选框
4. `body` class 切换控制 CSS 样式，直接操作 DOM 文本替换格式化时间、将表头下划线替换为空格
5. 统一 MutationObserver 守卫 — Glimmer 重渲染抹除注入元素后自动恢复
6. 离开页面时清理所有状态（class、observer、引用）

## 安装

在 Discourse 管理面板的「自定义 → 主题」中添加此仓库作为主题组件。
