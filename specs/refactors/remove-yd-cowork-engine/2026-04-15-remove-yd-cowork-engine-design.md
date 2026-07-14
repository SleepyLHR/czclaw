# 移除废弃 yd_cowork 引擎设计文档

## 1. 概述

清理 `yd_cowork` 引擎的最后残留：记忆系统模块、preload 类型声明、废弃函数、文档引用。

### 当前状态

大部分清理工作已在之前的提交中完成：
- `PermissionResult` 类型已本地定义，SDK import 全部移除
- `CoworkAgentEngine` 类型已缩窄为 `'openclaw'`
- `CoworkEngineRouter` 已简化为单引擎路由
- `coworkRunner.ts`、`claudeSdk.ts`、`claudeRuntimeAdapter.ts` 已删除
- `@anthropic-ai/claude-agent-sdk` 已从 `package.json` 和 `electron-builder.json` 移除
- `patches/` 目录已删除
- 渲染进程中无 `yd_cowork` 引用
- `scheduledTask/enginePrompt.ts` 和测试已清理
- `legacyEngineCleanup.test.ts` 已添加

---

## 2. 剩余残留项

### 2.1 `src/main/preload.ts:231` — 最后一处 `yd_cowork` 字符串

```typescript
agentEngine?: 'openclaw' | 'yd_cowork';  // ← 需改为 'openclaw'
```

### 2.2 `src/main/coworkStore.ts:13-14` — 仍导入已废弃的记忆模块

- `isQuestionLikeMemoryText` — **仍在用**，启动时 `autoDeleteNonPersonalMemories()` 调用
- `extractTurnMemoryChanges` — 已无调用方（coworkRunner 已删除）
- `judgeMemoryCandidate` — 已无调用方

**活跃调用链：**
```
main.ts:848 getCoworkStore()
  → coworkStore.autoDeleteNonPersonalMemories()
    → shouldAutoDeleteMemoryText()
      → isQuestionLikeMemoryText()  ← 从 coworkMemoryExtractor.ts 导入
```

### 2.3 待删除的文件

| 文件 | 说明 |
|------|------|
| `src/main/libs/coworkMemoryExtractor.ts` | 需先内联 `isQuestionLikeMemoryText` |
| `src/main/libs/coworkMemoryJudge.ts` | 无活跃调用方 |
| `src/main/libs/coworkMemoryExtractor.test.ts` | 对应测试 |
| `src/main/libs/coworkMemoryJudge.test.ts` | 对应测试 |
| `tests/coworkMemoryJudge.test.mjs` | 对应测试 |

### 2.4 `src/main/libs/claudeSettings.ts:84-102` — `getClaudeCodePath()` 函数

仍引用 `@anthropic-ai/claude-agent-sdk/cli.js`，已无调用方。

### 2.5 `AGENTS.md` — 文档引用

仍提到 `yd_cowork` 引擎描述和 `@anthropic-ai/claude-agent-sdk` 依赖。

---

## 3. 实施计划

### Step 1：内联 `isQuestionLikeMemoryText` 到 `coworkStore.ts`

移除 import，在本地定义类型和函数：

```typescript
export type CoworkMemoryGuardLevel = 'strict' | 'standard' | 'relaxed';

const CHINESE_QUESTION_PREFIX_RE = /^(?:请问|问下|问一下|是否|能否|可否|为什么|为何|怎么|如何|谁|什么|哪(?:里|儿|个)?|几|多少|要不要|会不会|是不是|能不能|可不可以|行不行|对不对|好不好)/u;
const ENGLISH_QUESTION_PREFIX_RE = /^(?:what|who|why|how|when|where|which|is|are|am|do|does|did|can|could|would|will|should)\b/i;
const QUESTION_INLINE_RE = /(是不是|能不能|可不可以|要不要|会不会|有没有|对不对|好不好)/i;
const QUESTION_SUFFIX_RE = /(吗|么|呢|嘛)\s*$/u;

function isQuestionLikeMemoryText(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim().replace(/[。！!]+$/g, '').trim();
  if (!normalized) return false;
  if (/[？?]\s*$/.test(normalized)) return true;
  if (CHINESE_QUESTION_PREFIX_RE.test(normalized)) return true;
  if (ENGLISH_QUESTION_PREFIX_RE.test(normalized)) return true;
  if (QUESTION_INLINE_RE.test(normalized)) return true;
  if (QUESTION_SUFFIX_RE.test(normalized)) return true;
  return false;
}
```

同时删除 `applyTurnMemoryUpdates()` 方法及其接口（已无调用方）。

### Step 2：修复 `preload.ts` 类型

```diff
- agentEngine?: 'openclaw' | 'yd_cowork';
+ agentEngine?: 'openclaw';
```

### Step 3：删除废弃文件

删除上述 5 个文件。

### Step 4：删除 `getClaudeCodePath()`

删除 `claudeSettings.ts` 中已无调用方的函数。

### Step 5：更新 `AGENTS.md`

移除 `yd_cowork` 引擎描述和 SDK 依赖引用。

---

## 4. 覆盖安装兼容性

| 用户场景 | 保障机制 | 状态 |
|----------|----------|------|
| SQLite 中存有 `agentEngine = 'yd_cowork'` | `normalizeCoworkAgentEngineValue()` 硬编码返回 `'openclaw'` | 已有 |
| 旧版 IPC 发送 `setConfig({ agentEngine: 'yd_cowork' })` | `main.ts:3318` 归一化只接受 `'openclaw'` | 已有 |
| `preload.ts` 类型兼容 | Step 2 修复后仅允许 `'openclaw'` | Step 2 修复 |

---

## 5. 终态要求

### 代码层面

1. `src/` 中不存在 `yd_cowork` 字符串
2. 上述 5 个文件已删除
3. `src/` 中不存在 `claude-agent-sdk` 引用
4. `isQuestionLikeMemoryText` 已内联到 `coworkStore.ts`

### 功能验证

| 验收项 | 验证方法 |
|--------|----------|
| OpenClaw 引擎正常运行 | `npm run electron:dev` → 新建会话 → 发送消息 → 收到响应 |
| 启动时内存自动清理正常 | 无报错 |
| 老配置兼容 | `agentEngine = 'yd_cowork'` 自动归一化为 `'openclaw'` |

### 构建验证

| 验收项 | 命令 |
|--------|------|
| TypeScript 编译通过 | `npx tsc --noEmit` |
| 测试通过 | `npm test` |
| 生产构建成功 | `npm run build` |
| 无残留引用 | `grep -r 'yd_cowork' src/` 和 `grep -r 'claude-agent-sdk' src/` 无输出 |

---

## 6. 不在范围内

- `docs/` 目录中历史文档对 `yd_cowork` 的引用（归档性质）
- `agentEngine` 字段从 config/DB schema 中完全移除（保留字段、值固定为 `'openclaw'`，避免 DB 迁移）
