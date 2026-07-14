# czclaw Code Wiki

> 项目版本: 2026.7.10 | 许可证: MIT | 组织: czclaw

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术栈与依赖](#2-技术栈与依赖)
3. [项目架构总览](#3-项目架构总览)
4. [目录结构与职责](#4-目录结构与职责)
5. [Electron 主进程](#5-electron-主进程)
6. [Renderer 渲染进程](#6-renderer-渲染进程)
7. [OpenClaw 运行时集成](#7-openclaw-运行时集成)
8. [IM 即时通讯网关](#8-im-即时通讯网关)
9. [MCP (Model Context Protocol)](#9-mcp-model-context-protocol)
10. [Skills 技能系统](#10-skills-技能系统)
11. [ScheduledTask 定时任务](#11-scheduledtask-定时任务)
12. [Shared 共享层与 IPC 契约](#12-shared-共享层与-ipc-契约)
13. [数据模型 (SQLite)](#13-数据模型-sqlite)
14. [项目构建与运行](#14-项目构建与运行)
15. [架构决策记录](#15-架构决策记录)
16. [关键协作流程图](#16-关键协作流程图)

---

## 1. 项目概述

czclaw 是一个 **Electron + React 桌面应用**，核心产品是**桌面 Agent 体验**，可以操作用户的真实工作环境：本地文件、终端命令、浏览器工作流、文档（Word/Excel/PPT/PDF）、IM 即时通讯频道、定时任务和项目工作区。

**核心概念：**
- **Cowork** — czclaw 的产品/会话层，管理会话(Session)、消息、权限、UI 状态、本地持久化、上下文、工件(Artifact)和 IPC。
- **OpenClaw** — 唯一的 Agent 运行时/网关(Gateway)。CoworkAgentEngine 当前只能设为 `'openclaw'`。

**关键特征：**
- 多 Agent 工作流（自定义身份/模型/技能/工作目录）
- 28+ 内置技能（Skills）
- 多平台 IM 集成（钉钉/飞书/QQ/Telegram/Discord/企业微信/微信/NIM/POPO/邮件）
- MCP 服务器管理
- 定时任务
- 工件预览（HTML/SVG/Mermaid/PDF/DOCX/XLSX/Code 等）

---

## 2. 技术栈与依赖

| 层级 | 技术 | 版本 |
|------|------|------|
| 桌面框架 | Electron | 40.x |
| UI 框架 | React | 18.x |
| 状态管理 | Redux Toolkit | ^2.2.1 |
| 样式 | Tailwind CSS | v3 |
| 构建工具 | Vite | ^6.x |
| 数据库 | better-sqlite3 | ^12.8.0 |
| IPC 桥接 | contextBridge (Electron) | - |
| Agent 运行时 | OpenClaw | v2026.6.1 |
| 包管理 | npm / pnpm | - |
| 测试 | Vitest | 默认 |
| 代码检查 | ESLint / Prettier | - |

**主要 npm 依赖亮点：**
- `@codemirror/*` — 代码编辑器/语法高亮
- `@dnd-kit/*` — 拖拽交互
- `@fortune-sheet/*` — 在线电子表格预览
- `@reduxjs/toolkit` — Redux 标准化
- `@modelcontextprotocol/sdk` — MCP 协议
- `better-sqlite3` — SQLite 绑定
- `docx-preview`, `pdfjs-dist`, `pptx-preview`, `xlsx` — 文档预览
- `cheerio`, `dompurify` — HTML 清洗与解析
- `js-yaml`, `jszip`, `mermaid`, `katex` — 工件渲染


## 3. 项目架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron Shell                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                 Renderer Process                      │   │
│  │  ┌───────────┐  ┌──────────┐  ┌───────────────────┐  │   │
│  │  │ App.tsx   │  │ Redux    │  │ Components        │  │   │
│  │  │ (Routing) │──│ Store    │──│ (Cowork/Artifact/ │  │   │
│  │  │           │  │ (12      │  │  Agent/Skills/IM/ │  │   │
│  │  │           │  │  slices) │  │  MCP/Scheduled)   │  │   │
│  │  └───────────┘  └──────────┘  └───────────────────┘  │   │
│  │                       │          │                    │   │
│  │  ┌────────────────────────────────────────────────┐   │   │
│  │  │           Services Layer                       │   │   │
│  │  │  cowork.ts · auth.ts · skill.ts · mcp.ts ·   │   │   │
│  │  │  im.ts · config.ts · theme.ts · i18n.ts      │   │   │
│  │  └──────────────────┬─────────────────────────────┘   │   │
│  └─────────────────────┼─────────────────────────────────┘   │
│                        │ contextBridge                       │
│  ┌─────────────────────┼─────────────────────────────────┐   │
│  │              Main Process (main.ts)                    │   │
│  │                                                       │   │
│  │  ┌──────────────┐  ┌──────────────────────────────┐   │   │
│  │  │ CoworkStore  │  │ OpenClawEngineManager         │   │   │
│  │  │ (SQLite CRUD)│  │ (Gateway进程生命周期)         │   │   │
│  │  └──────────────┘  └──────────────┬───────────────┘   │   │
│  │                                   │                    │   │
│  │  ┌────────────────────────────────▼────────────────┐   │   │
│  │  │           OpenClaw 集成层                       │   │   │
│  │  │  openclawConfigSync.ts (配置同步)               │   │   │
│  │  │  openclawRuntimeAdapter.ts (事件转换)           │   │   │
│  │  │  coworkEngineRouter.ts (运行时路由)              │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │                                                       │   │
│  │  ┌─────────┐ ┌─────────┐ ┌────────────┐ ┌─────────┐   │   │
│  │  │ IM网关  │ │ MCP     │ │ Skills     │ │ 定时    │   │   │
│  │  │ 管理器  │ │ 运行时  │ │ 管理器     │ │ 任务    │   │   │
│  │  └─────────┘ └─────────┘ └────────────┘ └─────────┘   │   │
│  │                                                       │   │
│  │  ┌──────────────────────────────────────────────┐     │   │
│  │  │           SQLite (lobsterai.sqlite)          │     │   │
│  │  │   Sessions · Messages · Agents · MCP · IM   │     │   │
│  │  └──────────────────────────────────────────────┘     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              OpenClaw Gateway Process                │   │
│  │  (子进程: 管理 AI 模型调用, Agent 执行, 会话引擎)    │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**关键分层说明：**

1. **Renderer（渲染进程）** — React 18 + Redux Toolkit + Tailwind。负责 UI 呈现和用户交互。通过 `preload.ts` 暴露的 `window.electron.*` 桥接与主进程通信。
2. **Main Process（主进程）** — Electron 主进程，`main.ts` 是应用入口（11194 行），初始化所有子系统并将 IPC 处理注册到 `ipcMain.handle/on`。
3. **OpenClaw Gateway（OpenClaw 网关）** — 独立子进程，负责 AI 模型调用、Agent 执行逻辑、会话引擎。主进程通过 HTTP + WebSocket 与其通信。
4. **SQLite** — 本地持久化存储，位于 `app.getPath('userData')/lobsterai.sqlite`。

---

## 4. 目录结构与职责

### 顶层目录

| 目录/文件 | 职责 |
|-----------|------|
| `src/main/` | Electron 主进程代码 |
| `src/renderer/` | React 渲染进程代码 |
| `src/shared/` | 跨进程共享常量与类型 |
| `src/scheduledTask/` | 定时任务领域模块 |
| `src/common/` | 主进程内部通用辅助 |
| `scripts/` | 构建/打包/OpenClaw 同步脚本 |
| `SKILLs/` | 内置技能包 (28+) |
| `openclaw-extensions/` | OpenClaw 本地扩展 |
| `vendor/openclaw-runtime/` | OpenClaw 运行时二进制 |
| `docs/` | 架构文档 |
| `specs/` | 功能/修复/重构说明 |
| `tests/` | 遗留测试（Node test runner） |
| `resources/` | 应用资源（图标等） |

### src/main/ 关键模块

| 文件/目录 | 行数 | 职责 |
|-----------|------|------|
| `main.ts` | 11194 | 应用入口、生命周期、IPC 注册、窗口管理 |
| `preload.ts` | 1180 | contextBridge IPC 表面暴露 |
| `coworkStore.ts` | 3280 | Cowork 会话/消息/SQLite CRUD |
| `sqliteStore.ts` | 843 | DB 初始化、表创建、迁移 |
| `agentManager.ts` | 82 | Agent CRUD 薄封装 |
| `trayManager.ts` | 185 | 系统托盘图标与菜单 |
| `windowState.ts` | 209 | 窗口几何位置工具函数 |
| `windowStatePersist.ts` | 154 | 窗口状态持久化 |
| `logger.ts` | - | electron-log 封装 |
| `libs/` | - | 核心库（见下方） |
| `im/` | - | IM 网关子系统 |
| `mcp/` | - | MCP 子系统 |
| `skills/` | - | 技能管理子系统 |
| `ipcHandlers/` | - | 域隔离的 IPC Handler 模块 |

### src/main/libs/ 核心库

| 文件 | 行数 | 职责 |
|------|------|------|
| `openclawEngineManager.ts` | 1635 | OpenClaw Gateway 进程生命周期管理 |
| `openclawConfigSync.ts` | 3513 | czclaw 状态→OpenClaw 配置的同步 |
| `agentEngine/coworkEngineRouter.ts` | - | Cowork 运行时路由（当前仅 OpenClaw） |
| `agentEngine/openclawRuntimeAdapter.ts` | 2076+ | Gateway 事件→Cowork Stream 事件转换 |
| `coworkConfigStore.ts` | - | Cowork 配置读写 |
| `coworkModelApi.ts` | - | 模型 API 调用封装 |
| `coworkFormatTransform.ts` | - | 会话格式转换 |
| `htmlPreviewServer.ts` | - | HTML 工件本地预览服务器 |
| `mediaAssetPersistence.ts` | - | 媒体资产持久化 |
| `mcpBridgeServer.ts` | - | MCP Bridge 服务器（Ask-User/Media） |
| `nodeRuntime.ts` | - | Node.js 运行时检测 |
| `pythonRuntime.ts` | - | Python 运行时检测 |
| `skillSecurity/` | - | 技能安全检查 |
| `gatewayLogRotation.ts` | - | Gateway 日志轮转 |
| `openclawHistory.ts` | - | OpenClaw 历史会话同步 |
| `openclawMemoryFile.ts` | - | MEMORY.md 文件管理 |
| `appUpdateCoordinator.ts` | - | 应用更新协调 |
| `dataMigration/` | - | 数据迁移 |
| `shareDeployment/` | - | 部署共享 |
| `htmlShare/` | - | HTML 分享 |
| `sqliteBackup/` | - | SQLite 备份管理 |


### src/renderer/ 关键模块

| 目录/文件 | 职责 |
|-----------|------|
| `App.tsx` | 顶层状态、试图路由（Cowork/Skills/ScheduledTasks/Kits/MCP） |
| `main.tsx` | React 入口 (mount) |
| `services/cowork.ts` | Cowork IPC 封装、流式编排、Redux 集成 |
| `services/i18n.ts` | 国际化字典 (zh/en) + t() 辅助 |
| `services/artifactParser.ts` | 工件解析与去重 |
| `services/agent.ts` | Agent API 封装 |
| `services/auth.ts` | 认证服务 |
| `services/skill.ts` | 技能服务 |
| `services/mcp.ts` | MCP 服务 |
| `store/slices/` | 12 个 Redux Slice |
| `components/cowork/` | 核心聊天 UI (会话列表/输入/消息渲染/权限) |
| `components/artifacts/` | 工件面板与渲染器 |
| `components/agent/` | Agent 创建与管理 |
| `components/agentSidebar/` | "我的 Agent" 侧边栏树 |
| `components/im/` | IM 配置 UI |
| `components/skills/` | 技能管理 UI |
| `components/mcp/` | MCP 管理 UI |
| `components/scheduledTasks/` | 定时任务 UI |
| `components/settings/` | 设置面板 |
| `theme/` | Tailwind 主题引擎 (CSS 变量驱动) |

### src/shared/ 共享目录

```
shared/
├── agent/         — AgentId, AgentIpcChannel, LegacyAgentName, DefaultAgentProfile
├── app/           — AppIpcChannel
├── appSettings/   — AppSettingsIpc, AppSettingsAutoLaunchErrorCode
├── appUpdate/     — AppUpdateIpc
├── artifactPreview/ — ArtifactPreviewIpc, ArtifactPreviewProtocol, ArtifactBrowserPartition
├── asr/           — ASR IPC 通道
├── auth/          — AuthIpcChannel
├── browserWebAccess/ — BrowserIpc, BrowserRuntimeProfile
├── clipboard/     — ClipboardIpc
├── computerUse/   — Computer Use 常量
├── cowork/        — CoworkIpcChannel, CoworkForkMode, COWORK_SESSION_PAGE_SIZE ...
├── dataMigration/ — DataMigrationIpc
├── dialog/        — DialogIpc
├── featureFlags.ts — 特性标志
├── htmlShare/     — HtmlShareIpc, HtmlShareAccessMode
├── im/            — IM IPC 通道
├── keyfrom/       — Keyfrom (设备指纹)
├── kit/           — Kit IPC
├── localWebServices/ — LocalWebServicesIpc
├── mcp/           — MCP IPC 通道
├── mediaModelAliases.ts — 媒体模型别名
├── notifications/ — 通知设置
├── openclawEngine/ — OpenClawEngineIpc, GatewayRepairErrorCode
├── permissions/   — 权限 IPC
├── platform/      — PlatformRegistry
├── providers/     — ProviderName, OpenClawProviderId 枚举
├── shareDeployment/ — ShareDeploymentIpc
├── shell/         — ShellIpc
```

---

## 5. Electron 主进程

### 5.1 应用生命周期 (`src/main/main.ts`)

启动流程 (`initApp()`, `main.ts:10620`)：

```
app.whenReady()
  │
  ├── 初始化默认项目目录 (~/lobsterai/project)
  ├── 注册 localfile:// 自定义协议
  ├── 初始化 SQLite (openSqliteDatabaseWithRecovery)
  │   └── 可选: SqliteBackupManager 自动备份
  ├── 重置卡住会话 (resetRunningSessions)
  ├── 注入依赖: setStoreGetter, setAuthTokensGetter, setServerBaseUrlGetter
  ├── 启动 OpenClaw Token Proxy
  ├── 同步企业配置 (若存在企业配置包)
  ├── 绑定运行时转发器 (bindCoworkRuntimeForwarder)
  ├── 偏好代理 & OpenAI 兼容代理
  ├── 启动缓存预热 (runStartupCacheWarmup)
  ├── Agent Model 迁移
  ├── 同步 OpenClaw 配置 (syncOpenClawConfig({reason:'startup'}))
  ├── 启动 Gateway (ensureOpenClawRunningForCowork)
  ├── 创建窗口 (createWindow) ── 尽早创建以显示加载 UI
  ├── 启动 Skills (同步内置技能/恢复中断升级/文件监控)
  └── 创建托盘 (createTray)
```

**关闭流程** (`runAppCleanup()`, `main.ts:10514`)：
```
app.on('before-quit') / SIGINT / SIGTERM
  ├── 销毁托盘
  ├── 停止文件监控/媒体/IM 定时器
  ├── 停止所有会话 (coworkEngineRouter.stopAllSessions())
  ├── 断开 Gateway 连接
  ├── 停止 OpenAI 兼容代理/HTML 预览服务器/Token Proxy
  ├── 停止 Skill 服务/IM 网关/OpenClaw Gateway/Cron 轮询/SQLite 备份
  └── 关闭数据库 (getStore().close())
```

### 5.2 窗口管理 (`createWindow()`, `main.ts:10062`)

- 单窗口应用：`window-all-closed` 重新创建窗口（不退出）
- 平台适配：macOS `hiddenInset` + traffic-light; Windows `frame:false` + `titleBarStyle:'hidden'`; Linux `titleBarOverlay`
- 安全配置：`nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`, `webSecurity:true`, `webviewTag:true`, `disableDialogs:true`
- 窗口打开控制器：只允许 WeCom 认证 URL 在子窗口打开
- 窗口状态持久化：300ms 防抖 + 500ms 最大化/取消最大化过渡锁

### 5.3 Preload 桥接 (`src/main/preload.ts`)

单一 `contextBridge.exposeInMainWorld('electron', {...})` 调用，暴露以下顶层 API 表面：

| 表面 | 功能 |
|------|------|
| `platform` / `arch` | 平台/架构信息 |
| `store` | KV 存储 (get/set/remove) |
| `ipcRenderer` | 通用 on/send/invoke/removeListener |
| `window` | 窗口控制 (minimize/maximize/close) |
| `api` | HTTP fetch/stream 辅助 |
| `cowork` | **最大表面**: 会话/消息/权限/记忆/媒体/配置/Bootstrap |
| `agents` | Agent CRUD |
| `openclaw` | OpenClaw 引擎状态/配置 |
| `skills` / `mcp` / `kits` | 域特定操作 |
| `dialog` / `shell` / `clipboard` | 原生对话框/Shell/剪贴板 |
| `auth` / `asr` / `media` | 认证/语音识别/媒体模型 |
| `im` / `scheduledTasks` | IM 和定时任务 |
| `appUpdate` / `autoLaunch` | 更新/自启动 |
| `log` / `networkStatus` | 日志/网络状态 |

### 5.4 IPC 注册模式

两种模式共存：

**A. 域模块模式 (`src/main/ipcHandlers/*/handlers.ts`)：**
```typescript
// 示例: ipcHandlers/agents/handlers.ts:72
export function registerAgentHandlers(deps: AgentHandlerDeps) {
  ipcMain.handle(AgentIpcChannel.List, () => deps.getAgentManager().listAgents());
  // ...
}
```
依赖通过 `AgentHandlerDeps` 接口注入（`getAgentManager`, `getCoworkStore`, `getCoworkEngineRouter`, `getIMGatewayManager`, `syncOpenClawConfig` 等）。

域模块列表：
- `agents/`, `asr/`, `coworkSubagent/`, `kits/`, `mcp/`, `nimQrLogin/`, `permissions/`, `plugins/`, `scheduledTask/`, `sessionDiagnostics/`, `skills/`

**B. 内联模式 (main.ts)：**
约 200+ 个 `ipcMain.handle` 调用直接写在 `main.ts` 中，引用模块级单例。

### 5.5 关键主进程类/模块

#### CoworkStore (`src/main/coworkStore.ts:735`)

构造参数：`better-sqlite3 Database`

主要方法分组：

**会话管理：**
- `createSession(id, title, cwd, system_prompt?)` → 创建新会话
- `getSession(id)` → 获取会话详情
- `updateSession(id, updates)` → 更新会话
- `forkSession(sourceId, options)` → Fork 会话（对话/worktree 模式）
- `deleteSession(id)` / `deleteSessions(ids)` → 删除会话
- `setSessionPinned(id, pinned, pinOrder?)` → 置顶会话
- `listSessions(agentId?, limit?, offset?)` → 列举会话（分页）
- `countSessions(agentId?)` → 统计会话数
- `searchSessions(query)` → 搜索会话
- `resetRunningSessions()` → 启动时重置卡住的 running 状态会话
- `listRecentCwds()` → 最近使用的工作目录

**消息管理：**
- `addMessage(sessionId, type, content, metadata?)` → 添加消息
- `insertMessageBeforeId(sessionId, message)` → 在指定 ID 前插入
- `deleteMessage(sessionId, messageId)` → 删除消息
- `replaceConversationMessages(sessionId, messages)` → 替换完整对话
- `replaceSessionMessages(sessionId, messages)` → 替换会话消息
- `getPagedSessionMessages(sessionId, limit, before?)` → 分页获取消息
- `getSessionMessageRailIndex(sessionId)` → 消息轨道索引
- `countSessionMessages(sessionId)` → 消息计数

**延续胶囊 (Continuity Capsule)：**
- `getContinuityCapsule(sessionId)` → 获取上下文胶囊
- `upsertContinuityCapsule(sessionId, capsule)` → 更新胶囊
- `deleteContinuityCapsules(sessionId)` → 删除胶囊

**其他：**
- `getConfig(key)` → 读取配置
- `setConfig(key, value)` → 写入配置
- 记忆 CRUD (listUserMemories, createUserMemory, ...)
- Agent CRUD
- 插件管理 (listUserPlugins, addUserPlugin, ...)
- 子 Agent 管理 (upsertSubagentChildSession, ...)

#### SqliteStore (`src/main/sqliteStore.ts:24`)

- `static async create(userDataPath?)` → 创建并初始化数据库
- `getDatabase()` → 返回原始 Database 对象供 CoworkStore 使用
- `close()` → 关闭连接
- KV 方法: `get(key)`, `set(key, value)`, `delete(key)`

#### AgentManager (`src/main/agentManager.ts:8`)
薄封装，委托给 CoworkStore 的 Agent 方法。
- `listAgents()`, `getAgent(id)`, `getDefaultAgent()`
- `createAgent(input)`, `updateAgent(id, input)`, `deleteAgent(id)`
- `getPresetAgents()`, `addPresetAgent(id)`

#### TrayManager (`src/main/trayManager.ts`)
模块级函数（非类）：
- `createTray(getWindow)` → 创建托盘图标和菜单
- `updateTrayMenu(getWindow)` → 更新菜单
- `updateTrayReminder(getWindow, reminder)` → 更新提醒徽章
- `destroyTray()` → 销毁托盘


## 6. Renderer 渲染进程

### 6.1 入口与引导 (`src/renderer/main.tsx`)

```tsx
// main.tsx - 简化的入口
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
);
```

### 6.2 顶层试图路由 (`src/renderer/App.tsx`)

没有使用路由库，通过 `mainView` 本地状态切换视图：
```typescript
const [mainView, setMainView] = useState<'cowork' | 'skills' | 'scheduledTasks' | 'kits' | 'mcp'>('cowork');
```

初始化流程 (`initializeApp()`, `App.tsx:159-272`)：
1. `configService.init()` → 读取配置
2. `window.electron.enterprise.getConfig()` → 企业配置
3. `themeService.initialize()` → 主题初始化
4. `i18nService.initialize()` → 国际化初始化
5. `authService.init()` → 认证初始化
6. 解析模型列表 → dispatch `setAvailableModels`
7. 隐私检查 → `PrivacyDialog` 或 `WelcomeDialog`
8. 异步启动 `scheduledTaskService.init()`

### 6.3 Redux Store 结构 (`src/renderer/store/`)

| Slice 文件 | 键名 | 职责 |
|-----------|------|------|
| `modelSlice.ts` | `model` | 模型目录、默认/按 Agent 模型选择 |
| `coworkSlice.ts` | `cowork` | 核心聊天状态：会话、消息、草稿、流式、权限、上下文、规划模式 |
| `skillSlice.ts` | `skill` | 技能列表、活跃技能 ID |
| `mcpSlice.ts` | `mcp` | MCP 服务器配置 |
| `imSlice.ts` | `im` | IM 网关配置与状态 |
| `agentSlice.ts` | `agent` | Agent 列表、当前 Agent ID |
| `artifactSlice.ts` | `artifact` | 工件列表、预览标签、面板状态 |
| `authSlice.ts` | `auth` | 用户认证（yid, 昵称, 头像, 套餐, 积分） |
| `scheduledTaskSlice.ts` | `scheduledTask` | 定时任务列表、运行历史、视图模式 |
| `kitSlice.ts` | `kit` | 已安装/市场 Kit |
| `quickActionSlice.ts` | `quickAction` | 快速操作 |
| `asrQuotaSlice.ts` | `asrQuota` | 语音识别配额 |

### 6.4 Cowork 服务 (`src/renderer/services/cowork.ts`)

单例 `coworkService = new CoworkService()`，是渲染进程与主进程 Cowork IPC 之间的唯一桥梁。

**关键模式：** 方法调用 `window.electron.cowork.*` 后直接 `store.dispatch()` 更新 Redux 状态。

**流式编排 (`setupStreamListeners()`, co-work.ts:207)：**
```
onStreamMessage       → addMessage (增量消息)
onStreamMessageUpdate → updateMessageContent (增量内容更新)
onStreamSessionStatus → updateSessionStatus + setStreaming
onStreamContextUsage  → 上下文使用率刷新
onStreamGoal          → updateSessionGoal
onStreamPermission    → enqueuePendingPermission
onStreamPermissionDismiss → dequeuePendingPermission
onStreamComplete      → updateSessionStatus('completed')
onStreamError         → 区分"运行中"错误和致命错误
```

### 6.5 国际化 (`src/renderer/services/i18n.ts`)

- 两个平铺字典（`zh` 和 `en`，共约 5830 行）
- `I18nService` 类：`t(key)` 先查当前语言，再回退到另一语言，最后返回原始 key
- `subscribe(listener)` 支持语言变更通知（`App.tsx:274-281` 订阅后强制重新渲染）

### 6.6 组件架构

**核心聊天 UI (`components/cowork/`)：**
- `CoworkView.tsx` — 主聊天表面容器
- `CoworkPromptInput.tsx` — 编辑器（草稿、附件、媒体提及选择器）
- `CoworkSessionList.tsx` / `CoworkSessionItem.tsx` / `CoworkSessionDetail.tsx` — 会话列表、项、详情
- `ConversationTurnsView.tsx` + `LazyRenderTurn.tsx` — 虚拟化消息渲染
- `AssistantTurnBlock.tsx`, `AssistantMessageItem.tsx`, `UserMessageItem.tsx` — 消息块
- `ThinkingBlock.tsx`, `ToolCallGroup.tsx`, `ProposedPlanBlock.tsx` — 思维/工具调用/规划
- `CoworkPermissionModal.tsx`, `CoworkQuestionWizard.tsx` — 权限/问答模态框
- `EngineStartupOverlay.tsx`, `EngineFailureOverlay.tsx` — 引擎状态覆盖层

**工件系统 (`components/artifacts/`)：**
- `ArtifactPanel.tsx` — 标签式预览面板
- `ArtifactRenderer.tsx` — 工厂分发器（根据 type 选择渲染器）
- `renderers/` 目录包含：`HtmlRenderer`, `SvgRenderer`, `ImageRenderer`, `VideoRenderer`, `MermaidRenderer`, `MarkdownRenderer`, `TextRenderer`, `DocumentRenderer`, `CodeRenderer`, `SheetRenderer`

**支持组件：**
- `agent/` — Agent 创建/管理/设置
- `agentSidebar/` — "我的 Agent" 任务树侧边栏
- `scheduledTasks/` — 定时任务 CRUD UI
- `im/` — IM 配置（各平台特有设置面板）
- `skills/` — 技能管理 UI
- `mcp/` — MCP 服务器管理 UI
- `kits/` — 专家 Kit 管理
- `settings/` — 设置面板标签页
- `common/`, `ui/` — 通用 UI 组件

### 6.7 样式系统

- **Tailwind v3** + 自定义主题插件 (`src/renderer/theme/tailwind/plugin.cjs`)
- 语义化 CSS 变量 (`--lobster-*`) 驱动颜色/圆角
- 明暗主题通过 CSS 变量切换，而非 Tailwind 的 `dark:` 变体
- 主题引擎：`theme/engine/theme-manager.ts`, `css-generator.ts`, `style-injector.ts`
- `services/theme.ts` → `themeService.initialize()`

---

## 7. OpenClaw 运行时集成

### 7.1 架构定位

OpenClaw 是**唯一的 Agent 运行时/网关**。czclaw 通过子进程管理 OpenClaw Gateway，通过 HTTP+WebSocket 与其通信。

```
czclaw Main Process
  │
  ├── OpenClawEngineManager  (进程生命周期)
  ├── OpenClawConfigSync     (配置同步: czclaw → OpenClaw)
  ├── CoworkEngineRouter     (运行时路由: CoworkRuntime interface)
  └── OpenClawRuntimeAdapter (事件转换: Gateway Events → Cowork Stream Events)
  │
  ▼
OpenClaw Gateway Process (子进程)
  ├── Agent 执行引擎
  ├── 模型调用路由
  ├── 会话管理
  ├── 技能执行
  ├── MCP 客户端
  └── Cron 定时任务引擎
```

### 7.2 OpenClawEngineManager (`src/main/libs/openclawEngineManager.ts:192`)

`class OpenClawEngineManager extends EventEmitter` — 管理 Gateway 子进程生命周期。

**关键方法：**

| 方法 | 描述 |
|------|------|
| `ensureReady(options?)` | 确保运行时已安装，验证版本，可强制重装 |
| `startGateway(reason)` | 启动 Gateway 子进程（构建入口脚本、设置环境变量、生成配置、等待就绪） |
| `stopGateway()` | 停止 Gateway 进程 |
| `restartGateway(reason)` | 重启 Gateway |
| `getStatus()` | 返回当前引擎状态（phase, version, port, message） |
| `getGatewayConnectionInfo()` | 返回连接信息（port, token, url, clientEntryPath） |
| `getGatewayToken()` | 获取 Gateway 认证令牌 |
| `getConfigPath()` | 获取 OpenClaw 配置 JSON 路径 |
| `getGatewayLogPath()` | 获取 Gateway 日志路径 |
| `getRecentGatewayLogEntries()` | 获取最近日志条目 |

**状态机：**
```
OpenClawEnginePhase: Unknown → Installing → Starting → Running → Failed → Stopped
```

**私有辅助方法：**
- `ensureBareEntryFiles()`, `ensureControlUiFiles()`, `ensureGatewayLauncherCjs()`, `ensureConfigFile()`
- `resolveRuntimeMetadata()`, `resolveOpenClawEntry()`, `resolveGatewayClientEntry()`
- `waitForGatewayReady(port, timeoutMs)` → 轮询 HTTP 健康检查直到就绪
- `stopGatewayProcess(child)`, `attachGatewayProcessLogs(child)`, `attachGatewayExitHandlers(child)`
- `scheduleGatewayRestart()` → 失败后自动重启

### 7.3 OpenClawConfigSync (`src/main/libs/openclawConfigSync.ts:1400`)

`class OpenClawConfigSync` — 将 czclaw 状态同步渲染为 OpenClaw 配置。

**同步内容 (`sync(reason)`, 第 1548 行)：**

| 配置域 | 说明 |
|--------|------|
| Providers/Models | 模型提供商、模型列表、OAuth 令牌、代理设置 |
| Agents | 自定义 Agent 定义（身份、系统提示词、模型、技能 ID） |
| IM Bindings | IM 实例配置 → OpenClaw 通道配置 |
| Plugins | 已安装的 OpenClaw 插件 |
| MCP Servers | 启用的 MCP 服务器配置 |
| Skills | 技能额外目录、routing prompt |
| Workspace AGENTS.md | 管理的工作区指令段 |
| Agent Timeout | 超时设置（默认 3600s） |
| Heartbeat | 心跳间隔（启用 1h，禁用 0m） |
| Sandbox Mode | 沙箱模式标志 |
| Cron Tasks | 定时任务配置 |

**同步触发时机：**
- 应用启动 (`{reason:'startout'}`)
- Agent 创建/更新/删除
- IM 配置变更
- MCP 服务器变更
- Skills 变更
- 模型/提供商变更
- 插件变更

### 7.4 CoworkRuntime 接口 (`src/main/libs/agentEngine/types.ts:135`)

```typescript
interface CoworkRuntime {
  startSession(sessionId, prompt, options?): Promise<void>;
  continueSession(sessionId, prompt, options?): Promise<void>;
  submitSteer?(sessionId, text, clientSteerId): Promise<CoworkSteerResponse>;
  runGoalCommand?(sessionId, command): Promise<CoworkGoal | null>;
  patchSession?(sessionId, patch): Promise<...>;
  getContextUsage?(sessionId): Promise<CoworkContextUsage | null>;
  compactContext?(sessionId): Promise<...>;
  stopSession(sessionId): void;
  stopAllSessions(): void;
  respondToPermission(requestId, result): void;
  isSessionActive(sessionId): boolean;
  // ...
}
```

### 7.5 CoworkEngineRouter (`src/main/libs/agentEngine/coworkEngineRouter.ts:24`)

`CoworkEngineRouter extends EventEmitter implements CoworkRuntime`

虽然当前只有 OpenClaw 一个运行时，路由层提供了：
- 运行时切换能力（`handleEngineConfigChanged()`）
- 多引擎兼容（通过 `CoworkRuntime` 接口）
- 权限请求与会话 ID 映射
- 子 Agent 会话管理

### 7.6 OpenClawRuntimeAdapter (`src/main/libs/agentEngine/openclawRuntimeAdapter.ts:2076`)

`OpenClawRuntimeAdapter extends EventEmitter implements CoworkRuntime`

**事件转换映射：**
| Gateway 事件 | Cowork 流事件 |
|-------------|---------------|
| message | stream:message |
| message_update | stream:message_update |
| session_status | stream:session_status |
| context_usage | stream:context_usage |
| goal | stream:goal |
| permission | stream:permission |
| permission_dismiss | stream:permission_dismiss |
| complete | stream:complete |
| error | stream:error |
| context_maintenance | stream:context_maintenance |

### 7.7 运行时构建管线

1. `ensure-openclaw-version.cjs` — 克隆/拉取/检出指定版本
2. `apply-openclaw-patches.cjs` — 应用版本补丁
3. `run-build-openclaw-runtime.cjs` — 构建平台运行时
4. `sync-openclaw-runtime-current.cjs` — 指向构建好的运行时
5. `bundle-openclaw-gateway.cjs` — 创建 Gateway 捆绑包
6. `ensure-openclaw-plugins.cjs` — 安装第三方插件
7. `sync-local-openclaw-extensions.cjs` — 同步本地扩展
8. `precompile-openclaw-extensions.cjs` — 预编译扩展
9. `install-openclaw-channel-deps.cjs` — 安装通道依赖
10. `prune-openclaw-runtime.cjs` — 清理无用内容

**性能优化原理：**
- `bundle-openclaw-gateway.cjs`（第 5 步）用 esbuild 把 gateway 入口打成单文件 `gateway-bundle.mjs`。原 ESM 解析 1100+ 文件使 Electron `utilityProcess.fork()` 启动需 80-100s，单文件 bundle 降至 2-12s。
- `precompile-openclaw-extensions.cjs`（第 8 步）把 TypeScript 插件预编译为 JS，消除首次 gateway 启动时 jiti/Babel 约 135s 的转译开销。jiti 发现 `.js` 文件后跳过 Babel 但仍走自身别名解析，故 `openclaw/plugin-sdk` 等 SDK 导入保持 external。
- Windows 上 `utilityProcess.fork()` 无法从 asar 内加载 ESM，故 `sync-openclaw-runtime-current.cjs` 在 `gateway.asar` 存在但 bare entry（`openclaw.mjs` 与 `dist/*`）缺失时用 `@electron/asar` 解包。

---

## 8. IM 即时通讯网关

### 8.1 架构概述

czclaw 支持多平台 IM 集成，配置存储在 SQLite 中并同步到 OpenClaw 配置。

**支持平台：**

| 平台 | 实例类型 | 最大实例数 | 说明 |
|------|---------|-----------|------|
| 钉钉 (DingTalk) | 多实例 | 20 | 机器人 Webhook |
| 飞书/Feishu/Lark | 多实例 | 20 | 机器人 |
| QQ | 多实例 | 5 | 机器人 |
| Telegram | 多实例 | 20 | 机器人 |
| Discord | 多实例 | 20 | 机器人 |
| 企业微信 (WeCom) | 多实例 | - | 机器人 |
| 微信 (Weixin) | 单实例 | 1 | 公众号 |
| NIM (网易云信) | 多实例 | 3 | IM SDK |
| POPO | 多实例 | - | 网易内部 |
| Email | 多实例 | - | IMAP/SMTP |
| 网易蜂巢 (Netease Bee) | 单实例 | 1 | 机器人 |

### 8.2 关键类

#### IMGatewayManager (`src/main/im/imGatewayManager.ts`)

| 方法 | 说明 |
|------|------|
| `constructor(db, options?)` | 初始化，可选传入 coworkRuntime 和 coworkStore |
| `initialize(options)` | 加载配置并启动网关 |
| `setConfig(config, options?)` | 设置 IM 配置，可选同步网关 |
| `getConfig()` / `getStatus()` | 获取配置/状态 |
| `getStatusWithOpenClawRuntime()` | 获取含 OpenClaw 运行时状态的实时状态 |
| `testGateway(platform, config)` | 测试网关连接 |
| `reconnectAllDisconnected()` | 重连所有断开连接 |

#### IMStore (`src/main/im/imStore.ts:116`)
管理 IM 配置的 SQLite 存储。

#### IMCoworkHandler (`src/main/im/imCoworkHandler.ts:76`)
IM 消息 ↔ Cowork 会话映射，处理 IM 消息在 Cowork 中的投递。

#### imSessionMappings (SQLite 表)
- 维护 IM 会话到 Cowork/OpenClaw 会话的映射
- 关联 Agent ID 和 OpenClaw Session Key

### 8.3 消息路由

`src/main/im/imDeliveryRoute.ts` 处理消息投递路由：
- `extractOpenClawDeliveryRoute(entry)` → 从 IM 配置提取路由
- `findOpenClawDeliveryRouteForSession(sessionKey)` → 查找会话的路由
- `resolveOpenClawDeliveryRouteForSessionKeys(sessionKeys)` → 批量解析路由

### 8.4 配对流程

`src/main/im/imPairingStore.ts` 处理 IM 配对：

| 函数 | 说明 |
|------|------|
| `listPairingRequests(channel, stateDir)` | 列出配对请求 |
| `readAllowFromStore(channel, stateDir)` | 读取已允许列表 |
| `approvePairingCode(channel, stateDir, pairingCode)` | 批准配对 |
| `rejectPairingRequest(channel, stateDir, pairingCode)` | 拒绝配对 |

### 8.5 平台特定实现

| 文件 | 职责 |
|------|------|
| `dingtalkMediaParser.ts` | 钉钉媒体解析 |
| `nimGateway.ts` | NIM 网关实现 |
| `nimMedia.ts` | NIM 媒体处理 |
| `nimQChatClient.ts` | NIM QChat 客户端 |
| `nimQrLoginService.ts` | NIM 二维码登录服务 |
| `qqMediaDownload.ts` | QQ 媒体下载 |
| `http.ts` | HTTP 传输基础 |

---

## 9. MCP (Model Context Protocol)

### 9.1 架构概述

czclaw 提供完整的 MCP 服务器管理：配置、启动、解析、运行时和集市。

**组件结构：**
```
src/main/mcp/
├── mcpStore.ts                — SQLite 存储 (CRUD)
├── mcpRuntime.ts              — 运行时管理 (启动桥接服务器等)
├── mcpLaunchResolution.ts     — 启动解析记录常量与工具函数
├── mcpLaunchResolverManager.ts— NPX/PIP 启动解析器
├── qichachaMcpAuth.ts         — 企查查 MCP 认证处理

src/renderer/components/mcp/   — MCP 管理 UI
src/renderer/services/mcp.ts   — MCP 服务 (IPC 封装)
src/shared/mcp/                — MCP IPC 通道常量
src/main/libs/mcpBridgeServer.ts — MCP Bridge Server
```

### 9.2 关键类

#### McpStore (`src/main/mcp/mcpStore.ts:81`)
MCP 服务器的 SQLite CRUD：
- `listServers()` / `getServer(id)`
- `addServer(input)` / `updateServer(id, input)` / `deleteServer(id)`
- `setServerEnabled(id, enabled)`
- `getLaunchResolution(serverId)` / `saveLaunchResolution(resolution)`

**数据模型 (`McpServerRecord`, mcpStore.ts:6)：**
```typescript
interface McpServerRecord {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  transportType: 'stdio';     // 目前仅 stdio
  configJson: string;          // { command, args, env }
  createdAt: number;
  updatedAt: number;
}
```

#### McpRuntime (`src/main/mcp/mcpRuntime.ts:38`)
运行时管理：
- `ensureLaunchResolution(serverId, reason)` → 确保服务器启动解析
- `startAskUserServer()` → 启动桥接服务器 (Ask-User 和 Media Generation)
- `askUserInternal(sessionId, question)` → 通过桥接服务器向用户提问
- `resolveAskUser(requestId, response)` → 响应用户
- `broadcastServersChanged()` → 通知所有窗口服务器变更
- `refreshResolvedServersCache()` → 刷新解析缓存

#### McpLaunchResolverManager (`src/main/mcp/mcpLaunchResolverManager.ts:252`)
- `resolve(server)` → 解析服务器启动命令/参数
- `canOptimize(server)` → 检查是否可优化（跳过重复解析）
- 支持 NPX 和 PIP 包管理器解析

### 9.3 MCP Bridge Server (`src/main/libs/mcpBridgeServer.ts`)

本地 HTTP 服务器，为 OpenClaw 运行时提供两个桥接功能：
1. **Ask-User** — OpenClaw 可通过此桥按需询问用户问题
2. **Media Generation** — 处理媒体生成回调

### 9.4 配置同步

启用的 MCP 服务器通过 `openclawConfigSync.ts` 写入 OpenClaw 配置的 `mcp.servers` 节。

### 9.5 启动解析 (`mcpLaunchResolution.ts`)

```typescript
export const McpLaunchResolverKind = {
  Npx: 'npx',
  Pip: 'pip',
} as const;

export const McpLaunchResolutionStatus = {
  Ready: 'ready',
  Resolving: 'resolving',
  ResolveError: 'resolve_error',
  InstallError: 'install_error',
} as const;
```

解析记录保存在 `mcp_launch_resolutions` 表中，包含包名、版本、安装目录、命令、参数和环境变量。

### 9.6 MCP Bridge 插件 (`openclaw-extensions/mcp-bridge/index.ts`)

运行在 OpenClaw gateway 进程内的桥接插件，把 czclaw 主进程管理的 MCP server/tool 暴露为原生 OpenClaw tool。

**工作原理：**
- `register(api)` 时遍历 `config.tools`（由 `openclawConfigSync.ts` 写入，来自 `mcp_servers` 表中启用的 server/tool 列表）
- 为每个 `{server, name}` 生成规范化工具名 `mcp_<server>_<tool>` 并注册 execute 函数
- 执行时通过 HTTP POST（带 `x-mcp-bridge-secret` 头、`AbortController` 超时默认 120s）调用 czclaw 主进程的 `callbackUrl`
- 结果统一封装为 `{content, isError, details}` 形态

**插件配置 schema：** `McpBridgePluginConfig`（callbackUrl / secret / requestTimeoutMs / tools[]）

**分发链路：** 源码经 `sync-local-openclaw-extensions.cjs` 拷贝到 runtime `third-party-extensions/` → `precompile-openclaw-extensions.cjs` 预编译 TS→JS → 随 runtime 分发。

---

## 10. Skills 技能系统

### 10.1 架构概述

czclaw 内置 28+ 技能，以 OpenClaw 插件形式运行。

**技能来源：**
1. **Bundled Skills** (`SKILLs/` 目录) — 随应用分发
2. **User Skills** — 用户从技能市场安装或本地创建
3. **Plugin Skills** — OpenClaw 插件带来的技能

### 10.2 内置技能列表 (`SKILLs/`)

| 技能目录 | 功能 |
|----------|------|
| `article-writer` | 文章写作 |
| `canvas-design` | 画布设计 |
| `content-planner` | 内容规划 |
| `create-plan` | 创建计划 |
| `daily-trending` | 每日趋势 |
| `develop-web-game` | 网页游戏开发 |
| `docx` | Word 文档处理 |
| `films-search` | 电影搜索 |
| `frontend-design` | 前端设计 |
| `imap-smtp-email` | 邮件 (IMAP/SMTP) |
| `local-tools` | 本地工具 |
| `music-search` | 音乐搜索 |
| `pdf` | PDF 处理 |
| `playwright` | 浏览器自动化 |
| `pptx` | PPT 处理 |
| `remotion` | Remotion 视频生成 |
| `seedance` | Seedance 视频生成 |
| `seedream` | Seedream 图像生成 |
| `skill-creator` | 技能创建 |
| `skill-vetter` | 技能审查 |
| `stock-analyzer` | 股票分析 |
| `stock-announcements` | 股票公告 |
| `stock-explorer` | 股票探索 |
| `technology-news-search` | 科技新闻搜索 |
| `weather` | 天气 |
| `web-search` | 网页搜索 |
| `xlsx` | 电子表格处理 |
| `youdaonote` | 有道笔记 |

### 10.3 关键类

#### SkillManager (`src/main/skills/skillManager.ts:1396`)
- 技能同步（内置/用户）
- 安装/升级/卸载
- 安全扫描
- 启用/禁用状态管理
- Routing prompt 生成

**主要方法：**
- `syncBundledSkills()` → 同步内置技能
- `installSkill(source)` → 安装技能
- `uninstallSkill(skillId)` → 卸载
- `getSkillRoutingPrompt()` → 生成 routing prompt
- `scanSkillSecurity(skillPath)` → 安全检查
- `getEnabledSkillIds()` → 获取启用技能 ID

#### SkillServiceManager (`src/main/skills/skillServices.ts:89`)
- 管理技能服务（如 web-search bridge）
- `startServices()` / `stopServices()`

### 10.4 安全检查 (`src/main/libs/skillSecurity/`)

使用 `@nodesecure/js-x-ray` 扫描技能代码，检测：
- 危险 API 调用
- 文件系统访问
- 网络请求
- eval/动态执行

### 10.5 OpenClaw 同步 (`src/main/skills/openClawSync.ts`)

- `updatePluginSkillIdsFromReport(report)` → 从 OpenClaw 插件报告更新技能 ID
- 技能启用状态同步到 OpenClaw 配置

---

## 11. ScheduledTask 定时任务

### 11.1 架构概述

定时任务系统通过 OpenClaw Cron API 执行。UI 和本地策略代码在 `src/scheduledTask/` 中。

```
czclaw (定时任务 UI + 本地元数据)
  │
  ├── CronJobService    — 与 OpenClaw Gateway cron API 交互
  ├── ScheduledTaskMetaStore — 本地元数据 (SQLite)
  ├── Migrate           — 从本地存储迁移到 OpenClaw
  └── Policies          — 安全策略
  │
  ▼
OpenClaw Gateway (Cron 表达式解析 + 定时触发 + 任务执行)
```

### 11.2 数据模型 (`src/scheduledTask/types.ts`)

```typescript
interface ScheduledTask {
  id: string;
  name: string;
  enabled: boolean;
  schedule: ScheduleAt | ScheduleEvery | ScheduleCron;
  payload: AgentTurnPayload | SystemEventPayload;
  delivery?: ScheduledTaskDelivery;
  agentId?: string;
  sessionKey?: string;
  modelOverride?: string;
  // ...
}

interface TaskState {
  status: 'active' | 'paused';
  nextRunAt: number | null;
  lastRunAt: number | null;
  lastRunStatus: 'success' | 'error' | 'skipped' | null;
  runCount: number;
}
```

### 11.3 进度类型 (`src/scheduledTask/constants.ts`)

| 常量 | 说明 |
|------|------|
| `ScheduleKind` | `At`, `Every`, `Cron` |
| `PayloadKind` | `AgentTurn`, `SystemEvent` |
| `DeliveryMode` | `None`, `Announce`, `Webhook` |
| `DeliveryChannel` | `Last` 等 |
| `SessionTarget` | `Main`, `Isolated` |
| `SessionWakeMode` | `Wake`, `Skip` |
| `TaskStatus` | `Success`, `Error`, `Skipped` |
| `TaskRunTrigger` | `Scheduled`, `Manual`, `Retry` |
| `ScheduledTaskIpc` | IPC 通道常量 |

### 11.4 关键类/函数

#### CronJobService (`src/scheduledTask/cronJobService.ts:490`)
与 OpenClaw Gateway cron API 交互的核心服务：

| 方法 | 说明 |
|------|------|
| `addJob(input)` | 创建定时任务 |
| `updateJob(id, input)` | 更新任务 |
| `removeJob(id)` | 删除任务 |
| `listJobs()` | 列举所有任务 |
| `getJob(id)` | 获取单个任务 |
| `toggleJob(id, enabled)` | 启停任务 |
| `runJob(id)` | 手动立即执行 |
| `listRuns(jobId, filter?)` | 列举运行历史 |
| `countRuns(jobId)` | 统计运行次数 |
| `listAllRuns(filter?)` | 全局运行历史 |
| `startPolling()` | 开始轮询 (每 30s) |
| `stopPolling()` | 停止轮询 |
| `notifyGatewayReady()` | 通知 Gateway 就绪 |

#### ScheduledTaskMetaStore (`src/scheduledTask/metaStore.ts:14`)
管理 SQLite `scheduled_task_meta` 表，存储 OpenClaw cron job 不支持的本地元数据。

#### 迁移 (`src/scheduledTask/migrate.ts`)
- `migrateScheduledTasksToOpenclaw()` — 将旧版本地任务迁移到 OpenClaw
- `migrateScheduledTaskRunsToOpenclaw()` — 迁移运行历史

### 11.5 引擎提示词

`src/scheduledTask/enginePrompt.ts` 构建定时任务引擎提示词，注入到 Agent 会话上下文中，使 Agent 知道如何与定时任务系统交互。

### 11.6 来源策略化 (`src/scheduledTask/policies/`)

定时任务按 `OriginKind`（Legacy/IM/Cowork/Manual）路由到不同 `TaskPolicy` 实现，避免在 UI 与 service 中散落条件分支。

**`TaskPolicy` 接口 (`policies/types.ts`)：**
- `getCreateDefaults()` — 该来源任务的创建默认值
- `normalizeDraft(draft)` — 草稿规范化
- `onDeliveryChanged(draft, delivery)` — 投递变更联动 binding
- `toWireBinding(binding)` — Binding→wire 转换
- `describeRunBehavior(task)` — 运行行为描述
- `getReadonlyFields(task)` — 只读字段

**四个策略实现：**

| 策略类 | OriginKind | 特点 |
|--------|-----------|------|
| `LegacyTaskPolicy` | Legacy | 旧版本地任务迁移而来 |
| `IMTaskPolicy` | IM | 必须投递回原 IM 会话，绑定到 IMSession |
| `CoworkTaskPolicy` | Cowork | 绑定到 UISession，sessionTarget 由投递配置决定 |
| `ManualTaskPolicy` | Manual | 用户在 UI 手动创建，默认 fallback |

`taskPolicyRegistry` singleton（`policies/registry.ts`）按 `origin.kind` 路由，未匹配时 fallback 到 `ManualTaskPolicy`。被 `src/main/ipcHandlers/scheduledTask/handlers.ts` 与 `helpers.ts` 调用以生成/校验任务草稿。

---

## 12. Shared 共享层与 IPC 契约

### 12.1 设计哲学

`src/shared/` 中的常量是跨进程通信的唯一真相来源（Single Source of Truth）。每条 IPC 通道名、状态值、区分符都定义为 `as const` 对象并导出派生类型。

**模式：**
```typescript
// src/shared/cowork/constants.ts
export const SessionTarget = {
  Main: 'main',
  Isolated: 'isolated',
} as const;
export type SessionTarget = typeof SessionTarget[keyof typeof SessionTarget];
```

### 12.2 IPC 通道命名规范

通道名使用冒号分隔的层级结构：`<domain>:<subdomain>:<action>`

**示例：**

| 通道枚举 | 通道值示例 |
|----------|-----------|
| `CoworkIpcChannel.ForkSession` | `'cowork:session:fork'` |
| `CoworkIpcChannel.SubmitSteer` | `'cowork:session:submitSteer'` |
| `CoworkIpcChannel.StreamGoal` | `'cowork:stream:goal'` |
| `CoworkIpcChannel.MemoryReadRaw` | `'cowork:memory:readRaw'` |
| `AgentIpcChannel.List` | `'agents:list'` |
| `AgentIpcChannel.GetPresetAgents` | `'agents:getPresetAgents'` |
| `AppIpcChannel.*` | `'app:*'` |
| `AuthIpcChannel.*` | `'auth:*'` |
| `McpIpcChannel.*` | `'mcp:*'` |
| `OpenClawEngineIpc.*` | `'openclaw-engine:*'` |
| `ScheduledTaskIpc.*` | `'scheduled-task:*'` |

### 12.3 关键常量模块

| 模块 | 关键导出 |
|------|----------|
| `shared/agent/constants.ts` | `AgentId.Main='main'`, `AgentIpcChannel` (10 通道), `LegacyAgentName`, `DefaultAgentProfile`, `AgentLegacyIdentityCleanupResult` |
| `shared/app/constants.ts` | `AppIpcChannel` |
| `shared/appSettings/constants.ts` | `AppSettingsIpc`, `AppSettingsAutoLaunchErrorCode` |
| `shared/artifactPreview/constants.ts` | `ArtifactPreviewIpc`, `ArtifactPreviewProtocol`, `ArtifactBrowserPartition` |
| `shared/auth/constants.ts` | `AuthIpcChannel` (Callback/GetPricingCatalog/GetPendingCallback), `AuthSubscriptionStatus` (Active/Free) |
| `shared/browserWebAccess/constants.ts` | `BrowserIpc`, `BrowserRuntimeProfile`, `BrowserDiagnosticStatus/Step` |
| `shared/clipboard/constants.ts` | `ClipboardIpc` |
| `shared/cowork/constants.ts` | `CoworkIpcChannel` (18+ 通道), `CoworkForkMode`, `CoworkContextUsageSource`, `CoworkContextUsageRefreshMode`, `COWORK_SESSION_PAGE_SIZE=50`, `COWORK_MESSAGE_PAGE_SIZE=30`, `SESSION_AGNOSTIC_PERMISSION_SESSION_ID` |
| `shared/dialog/constants.ts` | `DialogIpc` |
| `shared/featureFlags.ts` | `ENABLE_OPENCLAW_SKILL_SYNC` 等实验性特性开关 |
| `shared/htmlShare/constants.ts` | `HtmlShareIpc`, `HtmlShareAccessMode`, `HtmlShareStatus`, `HtmlShareSourceType` |
| `shared/keyfrom/constants.ts` | 设备指纹 keyfrom 相关常量与类型 |
| `shared/kit/constants.ts` | Kit IPC 通道与 `KitReference`/`ResolvedKitCapabilities` 类型 |
| `shared/mediaModelAliases.ts` | `GPT_IMAGE_2_MODEL_ID`/`CANVAS20_LEGACY_MODEL_ID`/`HAPPYHORSE_1_1_MODEL_ID`, `canonicalizeMediaModelId`, `mediaModelDisplayName` |
| `shared/mcp/constants.ts` | `McpIpcChannel` (List/Create/Update/Delete/SetEnabled/RetryLaunchResolution/FetchMarketplace/ConnectQichacha/Changed) |
| `shared/notifications/constants.ts` | `NotificationSettings`, `normalizeNotificationSettings` |
| `shared/openclawEngine/constants.ts` | `OpenClawEngineIpc`, `OpenClawEnginePhase` (NotInstalled/Installing/Ready/Starting/Running/Error), `OpenClawGatewayRepairErrorCode` |
| `shared/platform/constants.ts` | `Platform` (11 个 IM 平台), `ChannelName`, `PlatformRegistry` singleton, `platformOfChannel`/`channelOfPlatform` 双向解析 |
| `shared/providers/constants.ts` | `ProviderName` (19 个 LLM 提供商), `OpenClawProviderId` (24 个), `ApiFormat`, `ProviderRegistry` singleton — LLM 提供商单一事实源 |
| `shared/shareDeployment/constants.ts` | `ShareDeploymentIpc`, `ShareDeploymentKind`, `ShareDeploymentPackageManager`, `ShareDeploymentCandidateSource` |
| `shared/shell/constants.ts` | `ShellIpc`, `ShellOpenFailureReason` |
| `scheduledTask/constants.ts` | `ScheduleKind`/`PayloadKind`/`DeliveryMode`/`SessionTarget`/`WakeMode`/`OriginKind`/`BindingKind`/`TaskStatus`/`ScheduledTaskDataStatus`/`IpcChannel`/`MigrationKey`/`InternalTaskMarker` — 定时任务模块全部判别值单一事实源 |

### 12.4 Registry 模式

`ProviderRegistry` 与 `PlatformRegistry` 共享同一"注册表 + 派生查询方法"模式，互为借鉴样板：

```typescript
// 模式示意（以 PlatformRegistry 为例）
const DEFINITIONS: PlatformDef[] = [/* ... */];
class PlatformRegistryImpl {
  platforms() { return DEFINITIONS; }
  platformsByRegion(region) { /* filter */ }
  get(id) { /* find */ }
  channelOfChannel(channel) { /* resolve alias */ }
  // ...
}
export const PlatformRegistry = new PlatformRegistryImpl(DEFINITIONS);
```

二者均被 main / renderer 双进程消费，确保 provider/platform 元数据（id、label、logo、region、baseUrl、apiFormat、openClawProviderId 等）在两端一致。

---

## 13. 数据模型 (SQLite)

### 13.1 数据库位置

```
Windows: %APPDATA%/czclaw/lobsterai.sqlite
macOS:   ~/Library/Application Support/czclaw/lobsterai.sqlite
Linux:   ~/.config/czclaw/lobsterai.sqlite
```

### 13.2 表结构总览

所有表在 `src/main/sqliteStore.ts:66-294` 中通过 `CREATE TABLE IF NOT EXISTS` 创建。

#### kv — 通用 Key-Value 存储

| 列 | 类型 | 说明 |
|-----|------|------|
| key | TEXT PK | 键 |
| value | TEXT NOT NULL | JSON 值 |
| updated_at | INTEGER | 更新时间戳 |

用途：全局标志、窗口状态、认证标志、配置片段。

#### cowork_sessions — Cowork 会话

| 列 | 类型 | 说明 |
|-----|------|------|
| id | TEXT PK | UUID |
| title | TEXT NOT NULL | 会话标题 |
| claude_session_id | TEXT | (历史遗留) OpenClaw session ID |
| status | TEXT | 'idle' / 'running' / 'completed' / 'error' |
| pinned | INTEGER | 是否置顶 |
| pin_order | INTEGER | 置顶顺序 |
| cwd | TEXT NOT NULL | 工作目录 |
| system_prompt | TEXT | 系统提示词 |
| model_override | TEXT | 模型覆盖 |
| execution_mode | TEXT | 执行模式 |
| parent_session_id | TEXT | 父会话（Fork 用） |
| forked_from_message_id | TEXT | Fork 来源消息 |
| forked_at | INTEGER | Fork 时间 |
| fork_mode | TEXT | 'none' / 'conversation' / 'worktree' |
| fork_workspace_path | TEXT | Fork 工作区路径 |
| fork_git_branch | TEXT | Fork Git 分支 |
| fork_git_base_ref | TEXT | Fork Git 基础引用 |
| goal_json | TEXT | 目标 JSON |
| active_skill_ids | TEXT | 活跃技能 ID (JSON array) |
| agent_id | TEXT | 关联 Agent ID |
| created_at | INTEGER | 创建时间 |
| updated_at | INTEGER | 更新时间 |

#### cowork_messages — 会话消息

| 列 | 类型 | 说明 |
|-----|------|------|
| id | TEXT PK | UUID |
| session_id | TEXT FK | 所属会话 |
| type | TEXT | 'user' / 'assistant' / 'system' / 'tool_use' |
| content | TEXT NOT NULL | 消息内容 (JSON) |
| metadata | TEXT | 元数据 (JSON) |
| sequence | INTEGER | 消息顺序 |
| created_at | INTEGER | 创建时间 |

索引：`idx_cowork_messages_session_id`

#### cowork_session_capsules — 延续胶囊

| 列 | 类型 | 说明 |
|-----|------|------|
| session_id | TEXT PK FK | 会话 ID |
| version | INTEGER | 胶囊版本 |
| revision | INTEGER | 修订号 |
| capsule_json | TEXT | 胶囊数据 (JSON) |
| updated_at | INTEGER | 更新时间 |
| last_source | TEXT | 最后一次来源 |
| last_compacted_at | INTEGER | 最后压缩时间 |

#### cowork_config — Cowork 配置

| 列 | 类型 | 说明 |
|-----|------|------|
| key | TEXT PK | 配置键 |
| value | TEXT NOT NULL | 配置值 (JSON) |
| updated_at | INTEGER | 更新时间 |

#### agents — Agent 定义

| 列 | 类型 | 说明 |
|-----|------|------|
| id | TEXT PK | Agent ID ('main' 为主 Agent) |
| name | TEXT NOT NULL | 名称 |
| description | TEXT | 描述 |
| system_prompt | TEXT | 系统提示词 |
| identity | TEXT | 身份标识 |
| model | TEXT | 模型 ID |
| working_directory | TEXT | 工作目录 |
| icon | TEXT | 图标 |
| skill_ids | TEXT | 技能 ID 列表 (JSON array) |
| subagent_allow_agent_ids | TEXT | 允许的子 Agent ID |
| enabled | INTEGER | 是否启用 |
| pinned | INTEGER | 是否置顶 |
| pin_order | INTEGER | 置顶顺序 |
| sort_order | INTEGER | 排序 |
| is_default | INTEGER | 是否默认 |
| source | TEXT | 'custom' / 'preset' |
| preset_id | TEXT | 预设 ID |
| created_at | INTEGER | 创建时间 |
| updated_at | INTEGER | 更新时间 |

#### user_memories — 用户记忆

| 列 | 类型 | 说明 |
|-----|------|------|
| id | TEXT PK | UUID |
| text | TEXT NOT NULL | 记忆内容 |
| fingerprint | TEXT | 去重指纹 |
| confidence | REAL | 置信度 |
| is_explicit | INTEGER | 是否显式 |
| status | TEXT | 'created' / 'active' / 'stale' |
| created_at | INTEGER | 创建时间 |
| updated_at | INTEGER | 更新时间 |
| last_used_at | INTEGER | 最后使用时间 |

#### user_memory_sources — 记忆来源

| 列 | 类型 | 说明 |
|-----|------|------|
| id | TEXT PK | UUID |
| memory_id | TEXT FK | 关联记忆 |
| session_id | TEXT | 来源会话 |
| message_id | TEXT | 来源消息 |
| role | TEXT | 角色 |
| is_active | INTEGER | 是否活跃 |
| created_at | INTEGER | 创建时间 |

#### mcp_servers — MCP 服务器

| 列 | 类型 | 说明 |
|-----|------|------|
| id | TEXT PK | UUID |
| name | TEXT UNIQUE | 服务器名称 |
| description | TEXT | 描述 |
| enabled | INTEGER | 是否启用 |
| transport_type | TEXT | 'stdio' |
| config_json | TEXT | 配置 JSON |
| created_at | INTEGER | 创建时间 |
| updated_at | INTEGER | 更新时间 |

#### mcp_launch_resolutions — MCP 启动解析记录

| 列 | 类型 | 说明 |
|-----|------|------|
| server_id | TEXT PK FK | 服务器 ID |
| resolver_kind | TEXT | 'npx' / 'pip' |
| source_fingerprint | TEXT | 源指纹 |
| status | TEXT | 'ready' / 'resolving' / 'resolve_error' / 'install_error' |
| package_name | TEXT | 包名 |
| requested_version | TEXT | 请求版本 |
| resolved_version | TEXT | 解析版本 |
| install_dir | TEXT | 安装目录 |
| command | TEXT | 命令 |
| args_json | TEXT | 参数 (JSON array) |
| env_json | TEXT | 环境变量 (JSON) |
| error | TEXT | 错误信息 |
| installed_at | INTEGER | 安装时间 |
| resolved_at | INTEGER | 解析时间 |
| last_probe_at | INTEGER | 最后探测时间 |
| last_probe_status | TEXT | 最后探测状态 |
| updated_at | INTEGER | 更新时间 |

#### user_plugins — 用户插件

| 列 | 类型 | 说明 |
|-----|------|------|
| plugin_id | TEXT PK | 插件 ID |
| source | TEXT | 来源 |
| spec | TEXT | npm 包规范 |
| registry | TEXT | 注册表 URL |
| version | TEXT | 版本 |
| enabled | INTEGER | 是否启用 |
| config | TEXT | 配置 (JSON) |
| installed_at | INTEGER | 安装时间 |

#### subagent_runs — 子 Agent 运行

| 列 | 类型 | 说明 |
|-----|------|------|
| id | TEXT PK | UUID |
| parent_session_id | TEXT NOT NULL | 父会话 ID |
| session_key | TEXT | OpenClaw session key |
| child_cowork_session_id | TEXT | 子 Cowork 会话 ID |
| agent_id | TEXT | Agent ID |
| task | TEXT | 任务描述 |
| label | TEXT | 标签 |
| status | TEXT | 'running' / 'completed' / 'error' |
| messages_persisted | INTEGER | 是否持久化消息 |
| created_at | INTEGER | 创建时间 |
| ended_at | INTEGER | 结束时间 |

#### subagent_messages — 子 Agent 消息

| 列 | 类型 | 说明 |
|-----|------|------|
| id | TEXT PK | UUID |
| run_id | TEXT NOT NULL FK | 运行 ID |
| type | TEXT | 消息类型 |
| content | TEXT | 内容 |
| metadata | TEXT | 元数据 |
| sequence | INTEGER | 顺序号 |
| created_at | INTEGER | 创建时间 |

### 13.3 迁移策略

迁移采用**内联、加列**模式（无版本化迁移工具）：
1. 启动时 `PRAGMA table_info(table)` 检查列是否存在
2. 不存在的列 → `ALTER TABLE ... ADD COLUMN`
3. `didRunMigration = true` 跟踪是否需要迁移
4. 一次性数据回迁通过 KV 标志门控（如 `USER_MEMORIES_MIGRATION_KEY`）

---

## 14. 项目构建与运行

### 14.1 环境要求

- **Node.js**: `>=24.15.0 <25`
- **npm**: bundled with Node.js
- **Windows**: MinGit (`npm run setup:mingit`) + Python (`npm run setup:python-runtime`)

### 14.2 开发命令

| 命令 | 说明 |
|------|------|
| `npm run electron:dev:openclaw` | **首次开发**: 构建 OpenClaw 运行时 + 启动 Vite + Electron |
| `npm run electron:dev` | **日常开发**: Vite (port 5175) + Electron |
| `npm run compile:electron` | 编译主进程 TypeScript |
| `npm test` | Vitest 运行所有测试 |
| `npm test -- <filter>` | 过滤 Vitest 测试（如 `npm test -- cowork`） |
| `npm run lint` | 全量 ESLint 检查 |
| `npm run build` | 生产渲染器构建 |

### 14.3 打包命令

| 命令 | 输出 |
|------|------|
| `npm run dist:mac` | macOS (当前架构) |
| `npm run dist:win` | Windows x64 |
| `npm run dist:linux` | Linux x64 |
| `npm run pack` | 打包到目录（不创建安装包） |

### 14.4 OpenClaw 运行时命令

| 命令 | 说明 |
|------|------|
| `npm run openclaw:ensure` | 克隆/拉取/检出 OpenClaw 指定版本 |
| `npm run openclaw:patch` | 应用版本补丁 |
| `npm run openclaw:plugins` | 安装插件依赖 |
| `npm run openclaw:runtime:host` | 构建当前平台运行时 |
| `npm run openclaw:runtime:win-x64` | 完整构建 Windows x64 运行时 |

### 14.5 环境变量

| 变量 | 说明 |
|------|------|
| `OPENCLAW_SRC` | 覆盖 OpenClaw 源码路径 (默认 `../openclaw`) |
| `OPENCLAW_SKIP_ENSURE=1` | 跳过自动版本检出 |
| `OPENCLAW_FORCE_BUILD=1` | 强制运行时重建 |

### 14.6 OpenClaw 状态路径

```
Windows: %APPDATA%/czclaw/openclaw/state/
├── openclaw.json       — 生成的 OpenClaw 配置
├── workspace-main/     — 主 Agent 工作区
│   ├── AGENTS.md       — 工作区指令 (含 czclaw 管理段)
│   ├── MEMORY.md       — 持久记忆
│   ├── USER.md         — 用户资料
│   ├── SOUL.md         — Agent 系统提示词
│   ├── IDENTITY.md     — Agent 身份
│   └── memory/         — 每日笔记 (YYYY-MM-DD.md)
└── workspace-{agentId}/— 非主 Agent 工作区
```

### 14.7 日志

| 日志类型 | 路径 (Windows) | 说明 |
|---------|---------------|------|
| 主进程日志 | `%APPDATA%/czclaw/logs/main-YYYY-MM-DD.log` | 保留 7 天，最大 80 MB |
| Gateway 日志 | `%APPDATA%/czclaw/openclaw/logs/gateway-YYYY-MM-DD.log` | 保留 3 天 |

**日志级别规范：**
- `console.error` — 需要调查的失败（最后一个参数传错误对象）
- `console.warn` — 意外但可恢复
- `console.log` — 有意义生命周期事件
- `console.debug` — 高频/调试细节

---

## 15. 架构决策记录

### ADR-1: Cowork 与 OpenClaw 分离

**决策**: Cowork 是会话/产品层，OpenClaw 是唯一的 Agent 运行时。两者通过 HTTP + WebSocket 通信，czclaw 保留本地持久化、权限、UI 状态、工件、Agent、记忆与 IM 绑定，OpenClaw 负责 Agent 执行。

**理由**: 将"产品体验"与"运行时"解耦，使桌面端可独立迭代 UI/权限/本地数据，而 Agent 执行能力随 OpenClaw 版本演进。`CoworkAgentEngine` 当前仅 `'openclaw'`，历史名 `yd_cowork` 已移除，`claude_session_id` 等 legacy 列名仅作兼容。

**后果**: `CoworkEngineRouter` 作为路由抽象层保留扩展点，但实质透传至 `OpenClawRuntimeAdapter`。

### ADR-2: 单一 SQLite 数据库 + 内联加列迁移

**决策**: 所有本地数据集中在 `lobsterai.sqlite`，迁移采用 `PRAGMA table_info()` 探测 + `ALTER TABLE ADD COLUMN` 的内联模式，无版本化迁移工具。

**理由**: Electron 桌面应用单用户场景，schema 变更频率低；内联迁移避免引入额外迁移框架的复杂度。一次性数据回迁通过 `kv` 表的标志位（如 `USER_MEMORIES_MIGRATION_KEY`、`MigrationKey.TasksToOpenclaw`）门控，保证幂等。

**后果**: `SqliteStore` 是表 schema 唯一创建者；启动期通过 `SqliteBackupManager` 做健康检查与备份恢复，避免迁移中途崩溃导致数据库损坏。

### ADR-3: 共享常量 `as const` + 派生类型模式

**决策**: 所有 IPC 通道名、状态码、判别值在 `src/shared/*/constants.ts` 集中定义为 `as const` 对象并导出派生类型，main / renderer 双进程共享。

**理由**: 避免裸字符串字面量在多处重复导致拼写漂移；编译期类型检查覆盖判别值；测试与生产共用同一真相源。

**后果**: 新增 IPC 通道必须先在 `shared/*/constants.ts` 声明；`ProviderRegistry` 与 `PlatformRegistry` 共享同一注册表模式（互为借鉴样板），作为 provider/platform 元数据的单一事实源。

### ADR-4: OpenClaw 运行时构建流水线性能优化

**决策**: OpenClaw 运行时构建经过 `bundle` + `precompile` 两步优化：① 用 esbuild 把 gateway 入口打成单文件 `gateway-bundle.mjs`；② 把 `third-party-extensions/` 下的 TypeScript 插件预编译为 JS。

**理由**: 原 ESM 解析 1100+ 文件使 Electron `utilityProcess.fork()` 启动需 80-100s；单文件 bundle 降至 2-12s。jiti 首次转译 TypeScript 扩展约 135s，预编译为 JS 后跳过 Babel 转译（jiti 发现 `.js` 即跳过 Babel，但仍走自身别名解析，故 `openclaw/plugin-sdk` 等 SDK 导入保持 external）。

**后果**: `openclawEngineManager` 启动时直接加载 `gateway-bundle.mjs`；Windows 上 `utilityProcess.fork()` 无法从 asar 内加载 ESM，故 `sync-openclaw-runtime-current.cjs` 在 `gateway.asar` 存在但 bare entry 缺失时用 `@electron/asar` 解包。

### ADR-5: 定时任务的来源策略化（Policies）

**决策**: 定时任务按 `OriginKind`（Legacy/IM/Cowork/Manual）路由到不同 `TaskPolicy` 实现，每个策略定义"创建默认值 / 草稿规范化 / 投递变更联动 binding / Binding→wire 转换 / 运行行为描述 / 只读字段"。

**理由**: 不同来源的任务对投递目标、binding、默认值有差异化要求（如 IM 来的任务必须投递回原 IM 会话，Cowork 来的绑定到 UISession），策略化避免在 UI 与 service 中散落条件分支。

**后果**: `taskPolicyRegistry` singleton 注册 4 个策略实例，未匹配 origin 时 fallback 到 `ManualTaskPolicy`；`enginePrompt.ts` 注入 AGENTS.md 指导模型使用原生 `cron` 工具而非 channel helper / `sessions_spawn` / Bash sleep。

### ADR-6: MCP 桥接插件架构（mcp-bridge）

**决策**: 通过运行在 OpenClaw gateway 进程内的 `mcp-bridge` 插件，把 czclaw 主进程管理的 MCP server/tool 暴露为原生 OpenClaw tool。

**理由**: czclaw 主进程已实现完整的 MCP server 配置/启动/解析/安全扫描，重新在 gateway 内实现一遍成本高且割裂；桥接方式让 gateway 内 Agent 调用 `mcp_<server>_<tool>` 时通过 HTTP POST（带 `x-mcp-bridge-secret` 头、`AbortController` 超时默认 120s）回调 czclaw 主进程的 `callbackUrl`。

**后果**: `openclawConfigSync.ts` 把启用的 MCP server/tool 写入插件 `config.tools`；插件源码在 `openclaw-extensions/mcp-bridge/index.ts`，经 `sync-local-openclaw-extensions.cjs` + `precompile-openclaw-extensions.cjs` 流水线随 runtime 分发。

### ADR-7: 安全模型 — contextIsolation + preload IPC

**决策**: 渲染进程窗口强制 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、`webSecurity: true`；渲染进程对主进程的访问全部通过 `preload.ts` 的 `contextBridge.exposeInMainWorld('electron', {...})` 暴露的 IPC API。

**理由**: 防止渲染进程直接访问 Node API 与文件系统，限制攻击面；敏感工具操作（文件、终端、网络）经权限门控并记录日志。

**后果**: 所有渲染进程能力必须显式在 preload 暴露；`SESSION_AGNOSTIC_PERMISSION_SESSION_ID` sentinel 处理无 sessionKey 的 AskUserQuestion 回调；HTML/SVG/file 预览必须保持 sanitized/isolated（iframe sandbox 或独立 partition）。

### ADR-8: OpenClaw 补丁策略

**决策**: 优先在 czclaw 侧集成点（adapter / config sync / plugin 配置 / 运行时打包 / UI / 本地数据层）表达产品特定行为；仅当所需行为在 OpenClaw 内部且无 czclaw 侧干净 hook 时，才新增版本作用域补丁（位于 `scripts/patches/<openclaw.version>/`，由 `npm run openclaw:patch` 应用）。

**理由**: 避免在 czclaw 侧堆砌脆弱的变通方案，同时控制补丁数量便于版本升级。补丁幂等（已应用自动跳过），引入"强补丁"概念供打包期 `assertStrongPatchApplied` 校验。

**后果**: 不在 OpenClaw 源码树遗留手工编辑作为最终状态；每次 OpenClaw 版本升级需审视补丁是否仍适用。

---

## 16. 关键协作流程图

### 16.1 一次 Cowork 会话启动的数据流

```
用户在 CoworkPromptInput 提交 prompt
  │
  ▼
coworkService.startSession()            (renderer)
  │  store.dispatch(setStreaming(true))
  ▼
window.electron.cowork.startSession()   (IPC: CoworkIpcChannel)
  │
  ▼
CoworkEngineRouter.startSession()       (main)
  │  转发至 OpenClawRuntimeAdapter
  ▼
OpenClawRuntimeAdapter.startSession()   (main)
  │  connectGatewayIfNeeded() → WS 连接 OpenClaw gateway
  │  CoworkStore.createSession() 落库
  ▼
OpenClaw Gateway (子进程)               (agent 执行)
  │  WS 事件: message / message_update / permission / complete ...
  ▼
OpenClawRuntimeAdapter (事件翻译)
  │  stream:message / stream:permission / stream:complete ...
  ▼
coworkService.setupStreamListeners()    (renderer)
  │  store.dispatch(addMessage / enqueuePendingPermission / ...)
  ▼
React 组件 useSelector 重渲染
```

### 16.2 OpenClaw 配置同步触发链

```
Agent / IM / MCP / Skill / Provider 变更
  │
  ▼
syncOpenClawConfig({ reason })          (main.ts 调用)
  │
  ▼
OpenClawConfigSync.sync(reason)
  │  读取 coworkConfig / agents / IM instances / MCP / skills / plugins
  │  stampConfigMeta() 注入指纹
  ▼
写入 openclaw.json + 各 workspace AGENTS.md
  │
  ▼
OpenClawEngineManager.restartGateway()  (按需)
  │  gateway 启动读取 openclaw.json
  ▼
OpenClawRuntimeAdapter.connectGatewayIfNeeded()
```

### 16.3 IM 消息触发 Cowork 会话

```
IM 平台消息到达 (DingTalk/Feishu/NIM 本地网关 或 OpenClaw channel)
  │
  ▼
IMGatewayManager → IMChatHandler
  │  imDeliveryRoute 解析投递路由
  │  imSessionMappings 查找/建立 IM 会话 ↔ Cowork session 映射
  ▼
IMCoworkHandler → coworkRuntime.continueSession() / startSession()
  │
  ▼
(同 16.1 后续流程)
  │
  ▼
Agent 回复 → IMGatewayManager.sendConversationReply(platform, conversationId, text)
```

---

> 本文档基于仓库 `c:\czclaw\czclaw` 当前源码状态生成，版本 `2026.7.10`。源码与 `package.json` 是权威来源；当本文与源码冲突时以源码为准。
