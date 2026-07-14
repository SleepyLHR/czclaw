# Windows 首次启动性能优化设计文档

## 1. 概述

### 1.1 问题

用户在 Windows 上首次安装并启动应用时，遇到两个显著延迟：

1. **应用启动延迟**：点击图标后，用户等待很长时间才能看到主窗口。应用卡在内部运行时准备步骤（解压文件、扫描网络端口）。
2. **引擎连接延迟**：主窗口出现后，用户面临第二次长时间等待，后台引擎正在启动。健康检查持续失败，因为引擎尚未开始接受连接。

这些延迟严重影响用户第一印象，可能导致用户误以为应用卡死或崩溃。

### 1.2 目标

| 指标 | 目标值 | 测量方式 |
|------|--------|---------|
| 首次启动：点击到窗口可见 | 8 秒内 | 从进程启动到 `ready-to-show` 事件 |
| 首次启动：窗口可见到引擎就绪 | 15 秒内 | 从窗口显示到健康检查成功 |
| 后续启动：点击到引擎就绪 | 10 秒内 | 端到端计时 |
| 进度反馈准确性 | 进度条在实际启动时间前半段达到 50% | 观察 + 日志关联 |
| macOS/Linux 无回归 | 启动时间不增加 | 前后对比计时 |

---

## 2. 用户场景

### 场景 1: Windows 用户首次启动

**Given** 用户在 Windows 上刚完成安装
**When** 首次点击应用图标
**Then** 主窗口应在合理时间内出现
**And** 加载期间应显示清晰的进度反馈

### 场景 2: 等待引擎就绪

**Given** 主窗口已显示
**When** 后台引擎首次启动（无缓存）
**Then** 引擎应在合理时间内就绪
**And** 进度指示器应准确反映实际进度

### 场景 3: 再次启动（非首次）

**Given** 用户此前已使用过应用
**When** 再次启动
**Then** 启动速度应明显快于首次（得益于缓存）

### 场景 4: 恶劣条件下启动

**Given** 应用在慢速磁盘或杀毒软件扫描繁忙时启动
**When** 文件解压或模块加载耗时更长
**Then** 用户仍应看到进度反馈
**And** 应用不应出现无响应

---

## 3. 功能需求

### FR-1: 减少窗口前文件准备时间

- FR-1.1: 阻塞窗口显示的大文件解压操作必须移到不阻塞窗口的阶段，或在安装时完成
- FR-1.2: 窗口显示前的所有文件系统操作尽可能非阻塞
- FR-1.3: 端口扫描不能逐个串行测试，应并行测试多个候选端口

### FR-2: 减少引擎启动时间

- FR-2.1: 引擎必须从预打包的单文件产物加载（避免解析数百个模块）
- FR-2.2: 构建/安装时必须验证单文件 bundle 存在且完整
- FR-2.3: 无效或过期的插件配置不应导致额外延迟
- FR-2.4: 运行时热修复必须在构建时应用（烘焙到 bundle 中），而非运行时扫描 asar 文件导致 250+ 秒延迟

### FR-3: 提供有意义的启动进度反馈

- FR-3.1: 进度指示器必须反映实际初始化里程碑
- FR-3.2: 引擎就绪超过 10 秒时，应显示描述性状态消息

### FR-4: 优化后续启动性能

- FR-4.1: 利用编译缓存，后续启动跳过首次模块编译
- FR-4.2: 文件解压步骤应检测已解压文件并跳过

---

## 4. 根因分析

| 慢点 | 根因 | 影响 | 状态 |
|------|------|------|------|
| `ensureBareEntryFiles` → UI 出现 | 从 asar 解压 3000+ 文件（同步 I/O + Defender 扫描） | 高 | 已修复 |
| `applyRuntimeHotfixes` | 扫描 gateway.asar 内 ~1100 个 JS 文件（Electron 透明读取） | 严重（251秒） | 已修复 |
| `waitForGatewayReady` 健康检查失败 | gateway-bundle.mjs 首次 `import()` 无有效编译缓存（150秒） | 高 | 调查中 |
| 端口扫描 | 串行测试，通常首个端口即可用 | 低 | 已修复 |
| 插件警告 | 纯日志输出，无延迟 | 无 | 已修复 |

### 关键发现

1. **NSIS 安装器已预热编译缓存**：安装器运行 `warmup-compile-cache.cjs` 预编译 `gateway-bundle.mjs`，但需验证预热是否实际生效。
2. **构建脚本删除裸文件后首次启动重新解压**：`build-openclaw-runtime.sh` 打包 asar 后删除原文件，首次启动 `ensureBareEntryFiles()` 重新解压 3000+ 文件（55MB 同步 I/O）。当 `gateway-bundle.mjs` 存在时完全不必要。
3. **`resolveOpenClawEntry` 在 bundle 存在时仍需裸文件**：搜索 `openclaw.mjs` 或 `dist/entry.js`，不存在则返回 null。
4. **运行时热修复扫描 asar 耗时 251 秒**：`applyBundledOpenClawRuntimeHotfixes()` 遍历 `dist/` 应用 6 个正则补丁，Windows Defender 逐文件扫描。
5. **`dist/control-ui/` 运行时必须为裸文件**：OpenClaw 管理 UI 需从真实文件系统提供静态文件。
6. **`gateway-bundle.mjs` 不完全独立**：排除原生 addon，运行时最小集：`gateway-bundle.mjs` + `node_modules/` + `extensions/` + `dist/control-ui/`。

---

## 5. 实现方案

### 阶段 1: 消除不必要的首次启动文件解压 [已完成]

**任务 1.1: bundle 存在时跳过 `ensureBareEntryFiles`**

在 `ensureBareEntryFiles()` 开头检测 `gateway-bundle.mjs`，存在则仅解压 `dist/control-ui/`（~15 文件）。结果：3ms 替代 10-30+ 秒。

**任务 1.2: `resolveOpenClawEntry` 识别 bundle 为有效入口**

Windows 上优先检测 `gateway-bundle.mjs`，生成简化的 `gateway-launcher.cjs` 直接加载 bundle。

**任务 1.3: 构建时保留 `control-ui` 为裸文件**

`build-openclaw-runtime.sh` 清理步骤选择性删除 `dist/` 内容，保留 `control-ui/`。

**任务 1.4: 并行端口扫描**

`resolveGatewayPort()` 改为批量并行扫描（每批 10 个端口 `Promise.all()`）。

### 阶段 2: 热修复从运行时移至构建时 [已完成]

**任务 2.1: bundle 存在时跳过运行时热修复**

`doStartGateway()` 中检测 bundle 存在则跳过 `applyRuntimeHotfixes()`。

**任务 2.2: 构建时应用热修复**

新增 `scripts/apply-openclaw-runtime-hotfixes.cjs` 脚本，复用已有热修复函数。添加 `openclaw:hotfix` npm script，插入所有 6 个平台构建链中 `openclaw:bundle` 之前。

### 阶段 3: 构建时验证 [已完成]

在 `electron-builder-hooks.cjs` 中验证 `gateway-bundle.mjs` 存在且 >1MB。

### 阶段 4: 清理插件配置警告 [已完成]

`openclawConfigSync.ts` 中通过 `isBundledPluginAvailable()` 过滤不可用插件。

### 阶段 5: 诊断与检测 [已完成]

`doStartGateway()` 中记录每步耗时、编译缓存目录和冷/热状态。

### 阶段 6: 调查编译缓存有效性 [待完成]

**问题**：日志显示 `compile cache: warm=true` 但 `import(gateway-bundle.mjs)` 仍需 150 秒。NSIS 预热成功执行但首次启动未受益。

**可能原因**：
1. 预热和运行时缓存路径不匹配
2. V8 缓存被不同 Electron 版本或标志失效
3. 预热在不同进程上下文运行（ELECTRON_RUN_AS_NODE vs utilityProcess.fork()）
4. 缓存目录有条目但不匹配 bundle

**待办**：
- 检查 `install-timing.log` 预热时间
- 对比安装后和首次启动后的缓存目录内容
- 验证 NSIS 预热和 utilityProcess 之间的 NODE_COMPILE_CACHE 路径一致性

---

## 6. 涉及文件

| 文件 | 变更 |
|------|------|
| `src/main/libs/openclawEngineManager.ts` | bundle 存在时跳过解压和热修复；bundle 入口路径；并行端口扫描；诊断日志 |
| `src/main/libs/openclawConfigSync.ts` | 过滤不可用插件 |
| `scripts/build-openclaw-runtime.sh` | 保留 dist/control-ui/；更新验证 |
| `scripts/electron-builder-hooks.cjs` | gateway-bundle.mjs 验证 |
| `scripts/apply-openclaw-runtime-hotfixes.cjs` | 新增 — 构建时热修复应用 |
| `package.json` | openclaw:hotfix script；插入所有构建链 |

---

## 7. 任务进度

| 指标 | 值 |
|------|---|
| 总任务数 | 25 |
| 已完成 | 20 |
| 待验证（Windows） | 2 |
| 待调查（编译缓存） | 3 |

---

## 8. 范围

### 范围内

- 优化 Windows 首次启动的文件解压时机
- 确保单文件 bundle 包含在分发包中
- 并行端口扫描
- 清理过期插件配置
- 改进引擎启动进度指示器准确性
- 确保编译缓存有效
- 热修复移至构建时

### 范围外

- 修改引擎本身（第三方运行时）
- macOS/Linux 特定优化（除非 Windows 修复附带）
- 加载/启动画面 UI 重设计
- 减少应用安装时间
- 网络相关延迟（代理解析、外部 API 调用）

---

## 9. 验证计划

1. **Windows 首次启动测试**：全新安装，测量点击到窗口（<8s）和窗口到引擎就绪（<15s）
2. **后续启动测试**：重新启动，总时间 <10s
3. **macOS/Linux 回归测试**：`npm run electron:dev:openclaw`，无错误
4. **降级路径测试**：删除 `gateway-bundle.mjs`，验证 asar 解压降级正常工作
5. **构建验证测试**：不含 bundle 构建，验证构建失败
6. **热修复验证**：确认 bundle 包含已修补的 cron/wecom 代码
