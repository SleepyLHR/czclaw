# 设置外观保存触发 OpenClaw Gateway 重启修复 Spec

## 概述

### 问题

用户在「设置 - 外观」中切换主题并保存后，OpenClaw Gateway 会发生重启。外观主题属于纯渲染侧偏好，预期只影响窗口主题、DOM class 和本地配置持久化，不应该中断 OpenClaw Gateway、IM Gateway 或正在运行的会话。

### 结论

主题按钮点击本身不会触发 Gateway 重启。实际重启来自「设置」全局保存链路：

1. `Settings.tsx` 保存 `app_config`，其中包含 `theme`。
2. `store:set app_config` 会触发一次 `syncOpenClawConfig({ reason: 'app-config-change', restartGatewayIfRunning: false })`。
3. 这一次 app config 同步通常不会重启 Gateway。
4. 同一个保存流程随后无条件调用 `imService.saveAndSyncConfig()`。
5. `im:config:sync` 目前固定以 `restartGatewayIfRunning: true` 调用 IM 配置同步。
6. `syncOpenClawConfig()` 目前只要收到 `restartGatewayIfRunning: true` 就会硬重启，不再要求配置内容真的发生变化。

因此，外观主题保存只是触发了全局保存流程；真正导致重启的是无条件 IM sync 和无条件 restart flag 的组合。

### 日志证据

本地日志中同一次保存会出现两段连续同步：

```text
20:00:40 syncOpenClawConfig START reason=app-config-change restartIfRunning=false
20:00:41 needsHardRestart=false (... configChanged=false restartFlag=false)
20:00:41 NO RESTART

20:00:41 syncOpenClawConfig START reason=im-config-change restartIfRunning=true
20:00:42 needsHardRestart=true (... configChanged=false restartFlag=true)
20:00:42 HARD RESTART EXECUTING
```

`configChanged=false` 说明 IM/OpenClaw 配置内容没有实际变化；重启仅由 `restartFlag=true` 推动。

### 引入改动

直接引发最近回归的是：

- `24681eda05c547b970206abbbb91921dbe4b864c`
- 时间：`2026-05-19 16:14:27 +0800`
- 提交信息：`fix: weixin qr gaateway restart`

该提交做了两件相关变更：

1. `im:config:sync` 改为调用 `scheduleImConfigSync({ restartGatewayIfRunning: true })`。
2. `syncOpenClawConfig()` 的硬重启条件从「配置变化且要求重启」变成了「只要要求重启就硬重启」。

更早的潜在设计问题来自：

- `1c32e55b07d82afa61d6105b85e7b8359b7f010c`
- 时间：`2026-03-18 17:38:22 +0800`
- 提交信息：`fix: im配置变更，只有点击保存时，才同步openclaw并重启gateway`

该提交让 `Settings.tsx` 的全局保存无条件调用 `imService.saveAndSyncConfig()`。这个设计是为了支持用户在 IM 页修改配置后切到其他 tab 再点击保存，但它也让外观、模型、快捷键等无关设置保存都走到 IM sync。近期 `24681eda` 把 IM sync 变成强制重启后，这个潜在问题被放大成用户可见回归。

## 用户场景

### 场景 1：只修改外观

用户在「设置 - 外观」切换主题并点击保存。

预期：

- 主题立即生效并持久化。
- 不调用硬重启。
- 不影响 OpenClaw Gateway 连接状态。
- 日志中可以有 `app-config-change` 的 `NO RESTART`，但不应该出现由本次保存引发的 `HARD RESTART EXECUTING`。

### 场景 2：没有任何 IM 变更时反复保存设置

用户打开设置后直接保存，或只修改与 IM/OpenClaw 无关的配置。

预期：

- `im:config:sync` 应该 no-op 或被跳过。
- 不重启 Gateway。
- 不产生误导性的 IM 配置同步日志。

### 场景 3：修改 IM 配置后保存

用户在 IM 设置中修改会影响 OpenClaw Gateway 的配置，例如账号、平台启用状态、平台绑定或 credential。

预期：

- 保存后同步 OpenClaw 配置。
- 如果 Gateway 正在运行，并且该 IM 变更需要重载 Gateway，重启一次。
- 不能因为本次修复导致 IM 配置修改后不生效。

### 场景 4：修改 IM 后切换到其他设置页再保存

用户先在 IM 页修改配置，然后切换到「外观」或其他 tab，再点击设置页底部保存。

预期：

- IM 变更仍然被保存并同步。
- 如果需要重启，仍然重启一次。
- 不能简单依赖 `activeTab === 'im'` 判断是否同步。

### 场景 5：微信扫码登录成功后的显式重启

微信扫码登录、credential 刷新或其他明确要求 Gateway 重载的 IM 流程完成后。

预期：

- 保留 `24681eda` 修复微信扫码后 Gateway 不重启的问题。
- 显式 restart 请求仍然可以在没有文件 diff 的情况下触发一次硬重启。

## 功能需求

### FR-1：外观设置保存不得触发 Gateway 硬重启

保存主题、主题色、语言或其他纯 UI 偏好时，不应触发 `im-config-change` 硬重启。

### FR-2：IM sync 必须有明确原因

`im:config:sync` 不能在没有待同步 IM 变更、没有显式 force 请求时默认要求 `restartGatewayIfRunning: true`。

### FR-3：不能只按当前 tab 判断

由于用户可能先修改 IM 再切换到其他 tab 保存，修复不能只改成「当前 tab 是 IM 时才同步」。需要记录是否存在待同步的 IM/OpenClaw 相关变更，或通过指纹比较判断 IM 输入是否真的发生变化。

### FR-4：显式 Gateway 重启路径仍然有效

微信扫码、credential 更新、平台绑定变化等明确要求 Gateway 重载的场景，仍然可以传入 force/restart 语义并触发硬重启。

### FR-5：重复保存应具备幂等性

同一份 IM 配置已经同步后，再次保存设置不应重复重启 Gateway。

### FR-6：日志应能区分跳过、同步和重启

日志需要清楚区分：

- `app-config-change` 同步且不重启。
- `im-config-change` 因无待同步变更而跳过。
- `im-config-change` 发生配置变化并同步。
- 显式 force restart 触发硬重启。

## 实现方案

### 推荐方案：主进程以 IM 配置指纹作为同步闸门

在主进程为 IM/OpenClaw 相关配置维护一个轻量指纹，`im:config:sync` 先比较当前指纹与上次已同步指纹。只有指纹变化，或调用方明确要求 force restart 时，才调度 `syncOpenClawConfig()`。

建议拆出一个可测试的小模块，例如：

```text
src/main/im/imConfigSyncState.ts
```

该模块负责：

1. 计算 IM/OpenClaw 相关输入的稳定指纹。
2. 记录上次成功同步的指纹。
3. 记录显式 force restart 请求。
4. 判断本次 `im:config:sync` 应该 skip、sync-only 还是 sync-and-restart。

指纹至少应覆盖：

- 各 IM 平台启用状态。
- 平台 credential/config 中会写入 OpenClaw 配置的字段。
- `settings.platformAgentBindings`。
- 微信、企微、钉钉、飞书、QQ、Telegram、Discord、网易 IM、网易 Bee、POPO 等当前已接入平台的 OpenClaw 相关配置。

不应包含：

- 主题、语言、窗口尺寸等纯 UI 设置。
- 与 OpenClaw Gateway 无关的 renderer-only 状态。
- 临时 UI 展开/折叠状态。

### `im:config:sync` 行为

`im:config:sync` 应改成以下语义：

1. 计算当前 IM/OpenClaw 配置指纹。
2. 如果没有显式 force 请求，且指纹与上次成功同步指纹一致：
   - 返回成功。
   - 标记 `skipped: true`。
   - 不调用 `scheduleImConfigSync()`。
   - 不传 `restartGatewayIfRunning: true`。
3. 如果指纹变化：
   - 调用 `scheduleImConfigSync({ restartGatewayIfRunning: true })`。
   - 同步成功后更新上次同步指纹。
4. 如果存在显式 force restart：
   - 即使指纹未变化，也允许调度一次 `restartGatewayIfRunning: true`。
   - 成功后清除 force 状态。

这样可以保留微信扫码等显式重启能力，同时让外观保存这种无关场景自然 no-op。

### Settings 保存链路

`Settings.tsx` 可以继续在底部保存时调用 `imService.saveAndSyncConfig()`，但该调用必须由主进程判断是否真正需要同步或重启。这样能保留「修改 IM 后切换 tab 再保存」的行为。

作为额外优化，可以在 renderer 层维护 `imSettingsDirty`，当本次设置会话从未触碰 IM 配置时不调用 `saveAndSyncConfig()`。但这只能作为减少 IPC 的优化，不能作为唯一保护，因为主进程仍需要防御其他入口调用 `im:config:sync`。

### `syncOpenClawConfig()` 重启条件

不建议直接回滚 `24681eda` 中的全部重启条件，因为微信扫码场景需要支持「配置文件 diff 不明显，但 Gateway 必须重载运行态」的显式重启。

更合理的边界是：

- `syncOpenClawConfig()` 继续支持 `restartGatewayIfRunning: true` 表示显式重启。
- 调用方必须只在确有待同步 IM 变更或显式 force 场景下传入该 flag。
- `im:config:sync` 不能默认无条件传入该 flag。

## 涉及文件

### `src/main/main.ts`

- 调整 `im:config:sync` 的默认行为。
- 在调度 `scheduleImConfigSync()` 前增加指纹/dirty 判断。
- 为显式 force restart 场景保留入口。
- 优化相关日志。

### `src/main/im/imConfigSyncState.ts`（建议新增）

- 封装指纹计算、上次同步状态、force restart 状态。
- 提供纯函数或小状态机，便于 Vitest 覆盖。

### `src/renderer/components/Settings.tsx`

- 可选：增加 `imSettingsDirty`，减少无关设置保存时的 IPC。
- 保留「IM 修改后切换 tab 再保存仍同步」的用户行为。

### `src/renderer/services/im.ts`

- 可选：扩展 `saveAndSyncConfig()` 返回值，支持识别 `skipped`。
- 可选：支持传递显式 force/restart 选项，但普通设置保存不应默认 force。

### `src/main/preload.ts` 与 `src/renderer/types/electron.d.ts`

- 如果扩展 `im.syncConfig()` 参数或返回结构，需要同步更新 preload 和类型定义。

## 边界情况

| 场景 | 预期行为 |
| --- | --- |
| 只切换主题并保存 | 不触发 IM 硬重启 |
| 打开设置后直接保存 | `im:config:sync` skip 或不调用 |
| 修改 IM 配置后保存 | 同步 OpenClaw 配置，必要时重启一次 |
| 修改 IM 后切到外观页再保存 | 仍然同步 IM 变更 |
| 微信扫码登录成功 | 显式 force restart 仍然有效 |
| Gateway 未运行时保存 IM 配置 | 同步配置，不尝试重启运行态 |
| 连续快速点击保存 | 最多合并为一次有效 IM sync/restart |
| 配置同步失败 | 不更新上次同步指纹，下一次保存仍可重试 |

## 验收标准

1. 在「设置 - 外观」切换主题并保存，日志中不出现由本次保存触发的 `HARD RESTART EXECUTING`。
2. 外观保存最多出现 `app-config-change ... NO RESTART`，不会出现无意义的 `im-config-change restartIfRunning=true`。
3. 未修改 IM 配置时反复点击保存，OpenClaw Gateway 进程不重启，连接状态不闪断。
4. 修改 IM 配置后点击保存，OpenClaw 配置能同步，Gateway 正在运行时按需要重启一次。
5. 修改 IM 后切换到其他设置页再保存，IM 变更仍生效。
6. 微信扫码登录成功后 Gateway 仍能按 `weixin-qr-gateway-restart` 设计重启。
7. 不重新引入 token refresh、模型切换等非 Gateway 配置变更导致重启的问题。

## 验证计划

### 自动化验证

如果新增 `src/main/im/imConfigSyncState.ts`，添加同目录 `.test.ts`：

- 指纹未变化时返回 skip。
- 指纹变化时返回 sync-and-restart。
- force restart 时即使指纹未变化也返回 sync-and-restart。
- 同步成功后更新指纹并清除 force 状态。
- 同步失败后保留待同步状态。

### 手动验证

1. 启动应用并确保 OpenClaw Gateway 已运行。
2. 打开设置，进入「外观」，切换主题并保存。
3. 查看主进程日志，确认没有本次操作引发的 `HARD RESTART EXECUTING`。
4. 进入 IM 设置，修改一个会影响 OpenClaw 的配置并保存。
5. 确认 OpenClaw 配置同步，Gateway 按预期重启一次。
6. 复测微信扫码登录成功后的 Gateway 重启行为。

### 代码检查

实现后至少运行：

```bash
./node_modules/.bin/eslint src/main/main.ts src/renderer/components/Settings.tsx src/renderer/services/im.ts
```

如果新增测试模块，运行对应 Vitest 过滤测试。
