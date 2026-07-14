# Markdown 表格流式结束后渲染失败修复 Spec

## 问题描述

用户在 Cowork 对话中，AI 回复包含 GFM 表格时，**流式输出期间表格渲染正常，但消息结束后表格变为 markdown 原始字符串**（管道符 `|` 以纯文本形式显示）。该问题概率性出现，历史记录中同样显示为损坏状态。

### 现象

- 流式期间：表格正确渲染为 HTML `<table>`
- 消息结束后：表格退化为 `<p>| 维度 | 优点 | 缺点 |...</p>`
- 重新加载会话（历史记录）：表格仍然损坏
- 概率性触发，多并发会话时更易复现

---

## 根因分析

系统中存在两条文本提取路径：

| 路径 | 函数 | 数据源 | 格式保真度 |
|------|------|--------|-----------|
| Agent 流 | `extractOpenClawAssistantStreamText` | agent event 的 `text` 字段（单一完整字符串） | ✅ 完整保留原始格式 |
| Chat 事件 | `extractGatewayMessageText` → `collectTextChunks` | chat message 的 `content` 数组（可能多个 text block） | ❌ 每个 block 做 `.trim()` 后用 `\n` join |

当 OpenClaw gateway 将响应内容拆分为多个 text block，且拆分点恰好落在 GFM 表格对齐行内部时：

```
原始（agent 流）:  |------|------|------|    （3列，有效 GFM）
拆分后（chat 事件）: |------|------\n------|  （对齐行被断行，无效 GFM）
```

`remark-gfm` 解析器因对齐行列数与表头不匹配而拒绝将其识别为表格，回退为段落渲染。

### 破坏路径

1. **`handleChatDelta`**：使用 `extractGatewayMessageText` 提取文本，覆写 `turn.currentAssistantSegmentText`，将 agent 流设置的正确值替换为损坏值
2. **`handleChatFinal`**：`finalSegmentText || previousSegmentText` 优先使用 `finalSegmentText`（同样来自 `extractGatewayMessageText`），将损坏内容写入 SQLite 并发送给渲染器

### 为什么流式期间正常

流式期间渲染器接收的内容来自 `processAgentAssistantText` → `throttledEmitMessageUpdate`，使用的是 agent 流的原始 `text` 字段，格式完好。`handleChatDelta` 虽然在内存中破坏了 segment text，但不执行 IPC emit，因此渲染器不受影响——直到 `handleChatFinal` 读取被破坏的值并发送给渲染器。

---

## 解决方案

### 修复 1：`handleChatDelta` — 防止覆写（升级版）

引入不可逆标记 `hasSeenAgentAssistantStream`。一旦当前 assistant segment 收到过 agent stream 正文，后续 `chat.delta` 不再允许覆写 `turn.currentAssistantSegmentText`（即使 `agentAssistantTextLength` 因 split 流程被重置）：

```typescript
if (turn.assistantMessageId && segmentText !== previousSegmentText) {
  if (!turn.hasSeenAgentAssistantStream) {
    turn.currentAssistantSegmentText = segmentText;
  } else if (!turn.chatDeltaOverwriteSkipLogged) {
    turn.chatDeltaOverwriteSkipLogged = true;
    console.debug('skipping further chat.delta segment overwrite ...');
  }
}
```

- agent 事件存在时：跳过覆写，保留格式正确的值
- 避免了 `agentAssistantTextLength === 0` 的竞态窗口
- split 新 segment 时会显式重置标记，不影响后续新段落写入

### 修复 2：`handleChatFinal` — 带长度保护的最终文本选择

```typescript
const { content: persistedSegmentText, reason } = pickPersistedAssistantSegment(
  previousSegmentText,
  finalSegmentText,
  turn.hasSeenAgentAssistantStream,
);
```

- 当 `hasSeenAgentAssistantStream=true` 且 `previous.length >= final.length`：优先 `previous`
- 当 `hasSeenAgentAssistantStream=true` 但 `previous` 更短：优先 `final`，避免流式尾包丢失造成截断
- 当无 agent stream 权威（纯 chat 路径）：优先 `final`

同时移除冗余的 store 读取和条件 emit：
- `flushPendingStoreUpdate` 后 store 内容即为最新，无需再 `getSession` + `find`
- 无条件 `emit('messageUpdate')` 确保渲染器收到最终版本
- 追加关键诊断日志：记录 `reason/previousLen/finalLen/persistedLen/hadAgentStreamAuthority`

---

## 涉及文件

| 文件 | 变更 |
|------|------|
| `src/main/libs/agentEngine/openclawRuntimeAdapter.ts` | 新增 `hasSeenAgentAssistantStream`、`pickPersistedAssistantSegment`；`handleChatDelta`/`handleChatFinal` 逻辑升级；新增关键 debug 日志 |
| `src/main/libs/agentEngine/openclawRuntimeAdapter.test.ts` | 新增 `pickPersistedAssistantSegment` 分支测试（空值、chat-only、stream 权威、stream 短于 final） |

---

## 验证方法

### 功能验证

1. 启动开发服务，创建 Cowork 会话
2. 发送提示词引导 AI 生成包含表格的回复（如"总结 OpenClaw 优缺点，用表格"）
3. 验证：
   - 流式期间表格正确渲染 ✓
   - 消息结束后表格仍然正确 ✓
   - 退出会话后重新进入，历史记录中表格正确 ✓
4. 并发 6 个会话同时测试，确认高并发下表格不损坏
5. 检查日志关键字段：
   - `persisting assistant segment at chat.final ... reason=...`
   - `skipping further chat.delta segment overwrite ...`（最多一次）

### 回归验证

| 场景 | 预期 |
|------|------|
| 无 tool call 的纯文本表格回复 | 正常渲染 |
| 有 tool call 后生成表格（多 segment） | 正常渲染 |
| 纯 chat 模型（无 agent event） | 仍能正常显示流式内容 |
| 长表格（10+ 行） | 正常渲染，无截断 |
| 包含 emoji/粗体/链接的表格 | 格式正确 |

---

## 已知边界

1. 若模型通过 chat 事件返回的文本与 agent 流文本**语义不同**（非格式差异），当前方案在 `hasSeenAgentAssistantStream=true` 时采用“长度保护优先”：仅当 `previous.length >= final.length` 才优先 agent 流。
2. 对于完全没有 agent 事件的模型，`handleChatDelta` 仍允许更新 segment text，此时若 gateway 拆分 block 导致损坏，该路径无法修复。但当前 OpenClaw 架构下所有模型均同时发送 agent 和 chat 事件。
3. `extractGatewayMessageText` 的 `collectTextChunks` trim+join 行为本身未修改，其他使用该函数的场景（如 `extractGatewayHistoryEntries` 历史摘要）不受影响——这些场景不需要保真 GFM 格式。
