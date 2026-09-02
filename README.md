# Discourse Data Explorer UI

一个 Discourse 主题组件（Theme Component），对 Data Explorer 插件的前端 UI 提供优化选项。

在以下两个页面运行：

- 查询编辑页：`/admin/plugins/discourse-data-explorer/queries/<id>`
- 查询列表页：`/admin/plugins/discourse-data-explorer/queries`

## 功能

所有开关均通过 `body` class 即时生效，不受 Glimmer 组件重渲染影响。每个开关在进入页面时是否默认勾选，可在主题组件设置面板中配置（见下方「主题组件设置」）。

### 查询编辑页

在操作栏（`.query-action-bar__left`）注入两个复选框开关：

| 开关 | 功能 |
| --- | --- |
| **强制断行** | 数据单元格 `td.query-result-cell` 启用 `overflow-wrap: anywhere`；表头 `tr.headers th` 将下划线替换为空格并启用 `overflow-wrap: break-word`，优先在空格处断行，防止长字符串撑破表格 |
| **格式化时间** | 将 PostgreSQL timestamptz 格式（如 `2026-08-05T06:42:18.200Z`）转为浏览器本地时间 `YYYY-MM-DD HH:mm:ss`。格式化后的单元格通过 `[data-better-time]` 选择器应用 `overflow-wrap: break-word`，优先在空格处断行 |

### 查询列表页

在页面副标题 `.d-page-subheader__title-row` 中、标题 `h2.d-page-subheader__title` 之后注入两个复选框开关：

| 开关 | 功能 |
| --- | --- |
| **隐藏默认查询** | 勾选后在 `body` 挂 `de-ui-hide-default`，隐藏带默认徽标（`query-badge`）的查询行；规则随 class 存在而生效，关闭时无任何 CSS 覆盖 |
| **隐藏自动查询** | 勾选后在 `body` 挂 `de-ui-hide-auto`，隐藏描述中含 `#auto#` 标记的自动查询行；同上 |

## 主题组件设置

四个开关的默认值均为布尔设置项，可在「自定义 → 主题 → 此组件的设置」面板中修改：

| 设置项 | 对应开关 | 说明 |
| --- | --- | --- |
| `default_enable_break_all` | 强制断行 | 进入编辑页时默认勾选（默认 `false`） |
| `default_enable_date_format` | 格式化时间 | 进入编辑页时默认勾选（默认 `false`） |
| `default_enable_hide_default` | 隐藏默认查询 | 进入列表页时默认勾选（默认 `false`） |
| `default_enable_hide_auto` | 隐藏自动查询 | 进入列表页时默认勾选（默认 `false`） |

默认值只在**从其他页面进入** Data Explorer 页面时作为开关初始状态生效；进入页面后的手动勾选不会在同页内导航中被重置。

## 文件结构

```text
├── about.json
├── settings.yml                      # 四个开关默认值的设置项
├── common/
│   └── common.scss                    # 复选框样式 + 列表页隐藏规则
└── javascripts/
    └── discourse/
        └── api-initializers/
            └── data-explorer-ui.js    # 入口：URL 分派 + DOM 注入 + 默认值应用
```

## 原理

Data Explorer 没有提供 PluginOutlet 注入点，因此本组件通过 DOM 直接注入：

1. `api.onPageChange(url)` 监听 URL 变化（覆盖首次加载与 SPA 导航）
2. 按 URL 分派页面：编辑页 `/admin/plugins/discourse-data-explorer/queries/<id>`、列表页 `/admin/plugins/discourse-data-explorer/queries`
3. 从其他页面进入时先按主题组件设置（`settings.yml`）决定各开关初始状态，再分别等待 `.query-action-bar__left` / `.d-page-subheader__title-row` 渲染完成后 DOM 注入复选框
4. `body` class 切换控制样式：编辑页直接操作 DOM 文本（格式化时间、表头下划线替换空格），列表页挂 `de-ui-hide-default` / `de-ui-hide-auto` class 触发隐藏规则
5. 统一 MutationObserver 守卫 — Glimmer 重渲染抹除注入元素后自动恢复
6. 切换到其他页面时清理上一页的全部状态（class、observer、引用）

## 安装

在 Discourse 管理面板的「自定义 → 主题」中添加此仓库作为主题组件。
