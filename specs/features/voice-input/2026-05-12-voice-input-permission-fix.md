# 语音输入：macOS 听写菜单触发 & 权限处理 & 定时任务语音输入

## 1. 概述

### 1.1 问题/背景

语音输入功能（PR #1947）在 macOS 上通过 AppleScript 模拟 `Fn+Fn` 触发系统听写，存在两个问题：

1. **触发方式不可靠**：`Fn+Fn` 快捷键在部分 macOS 版本/键盘配置下无法触发听写，因为该快捷键行为取决于用户的系统设置（Globe key 行为可被自定义）。
2. **权限失败无反馈**：macOS 上 `System Events` 需要辅助功能（Accessibility）权限。如果用户拒绝，`osascript` 静默失败，用户无任何可见反馈。

此外，定时任务表单（`TaskForm`）中没有语音输入入口，用户只能在主对话输入框使用语音。

Windows 使用 `keybd_event` 模拟 Win+H，不需要额外权限，不存在上述问题。

### 1.2 目标

- macOS 优先通过系统菜单 `Edit > Start Dictation` 触发听写，提高兼容性
- macOS 上权限缺失时，主动检测并提示用户开启，附带重启提示
- 非权限原因导致的失败也向用户展示通用错误 toast
- 在定时任务表单中增加语音输入按钮
- 全链路增加诊断日志，便于排查问题

## 2. 用户场景

### 场景 1: macOS 首次使用，无辅助功能权限
**Given** 用户在 macOS 上首次点击语音输入按钮，且未授予辅助功能权限
**When** 用户点击语音按钮
**Then** 系统弹出辅助功能授权弹窗（由 `isTrustedAccessibilityClient(true)` 触发），同时应用显示 toast 提示引导用户前往 系统设置 → 隐私与安全性 → 辅助功能 中开启权限，并提示开启后需重启应用

### 场景 2: macOS 权限已拒，再次点击
**Given** 用户之前已拒绝辅助功能权限
**When** 用户再次点击语音输入按钮
**Then** 显示同样的 toast 提示（系统不会再次弹窗，但 toast 始终引导用户）

### 场景 3: macOS 权限已授予
**Given** 用户已在系统设置中授予辅助功能权限
**When** 用户点击语音输入按钮
**Then** 优先通过 Edit > Start Dictation 菜单项触发听写；若菜单项不存在则依次降级到 key code 96、Fn+Fn

### 场景 4: macOS 听写触发失败（非权限原因）
**Given** 用户已授予权限，但三种触发方式均失败（如系统听写未开启）
**When** 用户点击语音输入按钮
**Then** 显示通用失败 toast：「语音输入启动失败，请检查系统听写是否已开启后重试」

### 场景 5: Windows 不受影响
**Given** 用户在 Windows 上使用
**When** 用户点击语音输入按钮
**Then** 行为与之前完全相同，Win+H 正常触发

### 场景 6: 定时任务表单语音输入
**Given** 用户在定时任务编辑表单中
**When** 用户点击 prompt 输入区域旁的麦克风按钮
**Then** 触发系统听写，行为与主对话输入框一致（包括权限检测和错误提示）

## 3. 功能需求

### FR-1: macOS 权限主动检测
- 使用 Electron `systemPreferences.isTrustedAccessibilityClient(false)` 在触发听写前主动检查权限
- 权限缺失时调用 `isTrustedAccessibilityClient(true)` 弹出系统授权对话框
- 立即返回 `{ success: false, error: 'permission_denied' }`，无需等待 osascript 失败

### FR-2: macOS 三级降级触发
1. **Edit > Start Dictation 菜单**：通过 AppleScript 遍历前台进程的菜单栏，查找 Edit/编辑 菜单下的 Dictation/听写 菜单项并点击
2. **Key code 96**（dictation key）：模拟专用听写键
3. **Key code 63 × 2**（Fn+Fn）：原有方式作为最终降级

每级失败后自动尝试下一级，最后一级仍失败则解析 stderr 判断是否为权限问题。

### FR-3: 用户提示
- 前端收到 `permission_denied` 后，弹 toast 引导去系统设置，并提示重启应用
- 前端收到其他失败（`success: false` 且非 `permission_denied`），弹通用失败 toast

### FR-4: 定时任务表单语音输入
- 在 `TaskForm` 的 prompt 输入区域底栏添加麦克风按钮
- 复用 `triggerSystemDictation()` 和相同的错误处理逻辑

### FR-5: i18n
- 新增 `voiceInputPermissionDenied` 翻译键（含重启提示），支持中英文
- 新增 `voiceInputFailed` 翻译键，支持中英文

### FR-6: 诊断日志
- 全链路增加 `console.log` / `console.warn` / `console.debug` 日志，标记 `[Voice]` 前缀
- 涵盖：请求触发、平台分支、每级尝试结果、最终成功/失败

## 4. 实现方案

### 4.1 主进程 — 权限检测 & 三级降级触发

修改 `src/main/main.ts` 中 `voice:triggerDictation` handler。新增 `systemPreferences` 导入。macOS 分支逻辑：

```typescript
} else if (process.platform === 'darwin') {
  // 1. 主动检测辅助功能权限
  if (!systemPreferences.isTrustedAccessibilityClient(false)) {
    systemPreferences.isTrustedAccessibilityClient(true); // 弹出系统授权对话框
    return { success: false, error: 'permission_denied' };
  }

  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  // 2. 第一级：通过 Edit > Start Dictation 菜单触发
  try {
    await execAsync(`osascript -e 'tell application "System Events"
      set frontProcess to first application process whose frontmost is true
      tell frontProcess
        -- 查找 Edit/编辑 菜单
        set editMenu to missing value
        repeat with menuBarItem in menu bar items of menu bar 1
          set itemName to name of menuBarItem
          if itemName is "Edit" or itemName is "编辑" then
            set editMenu to menu 1 of menuBarItem
            exit repeat
          end if
        end repeat
        if editMenu is missing value then error "Edit menu not found"
        -- 查找 Dictation/听写 菜单项
        set dictationItem to missing value
        repeat with menuItem in menu items of editMenu
          set itemName to name of menuItem
          if itemName contains "Dictation" or itemName contains "听写" then
            set dictationItem to menuItem
            exit repeat
          end if
        end repeat
        if dictationItem is missing value then error "Dictation menu item not found"
        click dictationItem
      end tell
    end tell'`, { timeout: 5000 });
    return { success: true };
  } catch (menuError) {
    console.warn('[Voice] menu item failed, falling back to keyboard shortcut:', menuError);
  }

  // 3. 第二级：key code 96（dictation key）
  try {
    await execAsync(`osascript -e 'tell application "System Events" to key code 96'`,
      { timeout: 5000 });
    return { success: true };
  } catch (dictationKeyError) {
    console.warn('[Voice] dictation key failed, falling back to Fn shortcut:', dictationKeyError);
  }

  // 4. 第三级：Fn+Fn（key code 63 × 2）
  try {
    await execAsync(`osascript -e 'tell application "System Events" to key code 63' \
      -e 'delay 0.05' -e 'tell application "System Events" to key code 63'`,
      { timeout: 5000 });
    return { success: true };
  } catch (darwinError) {
    // 解析 stderr 判断是否为权限问题（理论上不应走到这里，因为前面已检测）
    const stderr = ...;
    if (lowerErrorText.includes('not allowed assistive access') || ...) {
      return { success: false, error: 'permission_denied' };
    }
    return { success: false, error: message || 'Unknown error' };
  }
}
```

所有 `execAsync` 调用均设置 `{ timeout: 5000 }` 防止挂起。Windows 分支同样添加超时。

### 4.2 前端 hook — 返回结果 & 日志

修改 `src/renderer/hooks/useSpeechToText.ts`：
- 返回类型从 `void` 改为 `{ success: boolean; error?: string }`
- 添加 `console.debug` 日志记录请求和返回结果

### 4.3 UI — CoworkPromptInput toast 提示

修改 `src/renderer/components/cowork/CoworkPromptInput.tsx` 中 `handleVoiceInput`：
- 改为 async 函数
- `permission_denied` → 弹 `voiceInputPermissionDenied` toast
- 其他失败 → 弹 `voiceInputFailed` toast

### 4.4 UI — TaskForm 语音输入按钮

修改 `src/renderer/components/scheduledTasks/TaskForm.tsx`：
- 为 prompt textarea 添加 ref
- 在输入区域底栏（ModelSelector 右侧）添加麦克风按钮（复用 `MicrophoneIcon`）
- 点击处理逻辑与 CoworkPromptInput 一致：focus textarea → triggerSystemDictation → 错误 toast

### 4.5 i18n

在 `src/renderer/services/i18n.ts` 中新增翻译键：

| Key | 中文 | English |
|-----|------|---------|
| `voiceInputPermissionDenied` | 语音输入需要辅助功能权限，请前往 系统设置 → 隐私与安全性 → 辅助功能 中开启，开启后需重启应用 | Voice input requires Accessibility permission. Please enable it in System Settings → Privacy & Security → Accessibility, then restart the app |
| `voiceInputFailed` | 语音输入启动失败，请检查系统听写是否已开启后重试 | Failed to start voice input. Please check that system dictation is enabled, then try again |

## 5. 边界情况

| 场景 | 处理方式 |
|------|---------|
| macOS 权限缺失 | `isTrustedAccessibilityClient(true)` 弹系统授权框 + toast 提示含重启提示 |
| macOS 权限已授予 | 三级降级触发听写 |
| macOS 菜单项不存在（非标准应用前台） | 自动降级到 key code 96 → Fn+Fn |
| macOS 系统听写未开启 | 三级均失败，弹通用失败 toast |
| Windows | 不受影响，行为不变 |
| exec 命令挂起 | 5 秒超时自动终止 |

## 6. 涉及文件

| 操作 | 文件 |
|------|------|
| 修改 | `src/main/main.ts` — 权限检测 + 三级降级触发 + 诊断日志 + exec 超时 |
| 修改 | `src/renderer/hooks/useSpeechToText.ts` — 返回类型 + 日志 |
| 修改 | `src/renderer/components/cowork/CoworkPromptInput.tsx` — 双 toast（权限/通用失败） |
| 新增逻辑 | `src/renderer/components/scheduledTasks/TaskForm.tsx` — 麦克风按钮 + 语音输入处理 |
| 修改 | `src/renderer/services/i18n.ts` — 新增 2 个翻译键 |

## 7. 验收标准

- [ ] macOS 无辅助功能权限时，点击语音按钮弹出系统授权对话框 + toast 提示（含重启提示）
- [ ] macOS 授权后，优先通过 Edit > Start Dictation 菜单触发听写
- [ ] macOS 菜单触发失败时，自动降级到 key code 96，再降级到 Fn+Fn
- [ ] macOS 三种方式均失败时，弹通用失败 toast
- [ ] Windows 行为不受影响
- [ ] 定时任务表单中麦克风按钮可见且功能正常
- [ ] 全链路 `[Voice]` 日志可在 DevTools 中查看
- [ ] lint 检查通过
