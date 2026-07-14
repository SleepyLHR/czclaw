# Agent 与定时任务模型选择出现“默认模型”选项修复设计文档

## 1. 概述

### 1.1 问题

Agent 创建/编辑弹窗和定时任务创建/编辑表单复用了 `ModelSelector` 的 `defaultLabel` 能力，因此模型下拉列表顶部会出现“默认模型”或“使用默认模型”。

这个选项不是一个真实模型，而是把当前表单里的模型值清空：

- Agent 表单中选择“默认模型”后，保存为 `agents.model = ''`
- 定时任务表单中选择“使用默认模型”后，保存时省略 `payload.model`

对用户来说，这个选项出现在“套餐模型/自定义模型”的模型列表里，看起来像一个可用模型，实际却是“清空模型并让后续链路兜底”。这会造成两个问题：

1. **语义误导**：用户无法从 UI 判断“默认模型”具体是哪一个模型。
2. **执行不确定**：定时任务是长期存在的，缺失 `payload.model` 会让未来执行依赖 OpenClaw 或应用当时的默认模型，可能随全局默认模型变化而漂移。

### 1.2 根因

根因是“可选模型”状态被直接暴露成模型列表项。

当前链路：

1. `ModelSelector` 在 controlled 模式下，如果传入 `defaultLabel`，就渲染一个伪选项。
2. 点击伪选项时，`ModelSelector` 调用 `onChange(null)`。
3. `AgentDetailToolbar` 固定传入 `defaultLabel={agentUseDefaultModel}`。
4. `AgentSettingsPanel` 保存时把 `model === null` 转成空字符串。
5. `TaskForm` 固定传入 `defaultLabel={scheduledTasksFormModelDefault}`。
6. `TaskForm` 保存时只有 `form.modelId` 非空才写入 `payload.model`。
7. `CronJobService` 只在 `payload.model` 非空时转发给 OpenClaw cron。

这里混用了三种不同语义：

| 状态 | 当前表示 | 实际语义 |
|---|---|---|
| 历史数据缺失 | 空字符串/字段缺失 | 老版本没有写模型 |
| 用户主动选择默认 | 空字符串/字段缺失 | 跟随未来默认模型 |
| 表单尚未初始化 | `null`/空字符串 | UI 还没有解析出模型 |

这些语义需要在 UI 层和保存层拆开。

## 2. 用户场景

### 场景 A: Agent 编辑页只展示真实模型

**Given** 用户打开 Agent 编辑弹窗  
**When** 展开底部模型选择列表  
**Then** 列表中只出现真实可用模型，不出现“默认模型”伪选项

### 场景 B: Agent 历史空模型仍能正常显示

**Given** 某个历史 Agent 的 `model` 为空  
**When** 用户打开 Agent 编辑弹窗  
**Then** 表单显示当前有效的全局模型作为具体模型名，例如 `GPT-5.5`  
**And** 用户保存后，该 Agent 写入明确的 `provider/modelId`

### 场景 C: 新建定时任务默认选中明确模型

**Given** 当前全局模型是 `GPT-5.5`  
**When** 用户创建新的定时任务  
**Then** 模型选择器默认显示 `GPT-5.5`  
**And** 保存后的任务 `payload.model` 写入明确的模型引用

### 场景 D: 旧定时任务缺少模型字段

**Given** 历史定时任务没有 `payload.model`  
**When** 用户打开编辑页  
**Then** 表单用当前全局模型作为可编辑默认值  
**And** 用户保存后，任务补写明确的 `payload.model`

### 场景 E: 定时任务引用的模型已不可用

**Given** 定时任务保存过一个明确模型，但该模型现在不在可用模型列表中  
**When** 用户打开编辑页  
**Then** UI 应提示模型已不可用，并要求用户选择一个真实可用模型后再保存

## 3. 功能需求

### FR-1: Agent 和定时任务不再传入 `defaultLabel`

Agent 创建/编辑和定时任务创建/编辑页面不再把“默认模型”作为模型列表项展示。

`ModelSelector` 组件本身可以保留 `defaultLabel` 能力，作为未来真正需要“可不指定模型”的通用能力；但本次涉及的两个入口不再使用它。

### FR-2: Agent 表单使用具体模型作为编辑值

Agent 表单加载时按以下顺序解析模型：

1. `agent.model` 能解析到可用模型，则使用该模型
2. `agent.model` 为空，则使用当前 `defaultSelectedModel`
3. `agent.model` 非空但已不可用，则显示当前 `defaultSelectedModel`，同时不在列表里显示伪默认项
4. 如果没有任何可用模型，则沿用 `ModelSelector` 的“请先在设置中配置模型”提示

保存时：

1. 如果存在可用模型，写入 `toOpenClawModelRef(model)`
2. 不再通过 Agent 编辑页写入空字符串
3. 历史空模型不需要单独迁移；用户保存 Agent 时自然补写明确模型

脏状态判断应以“表单初始化后的有效模型引用”为基准，避免用户只打开历史空模型 Agent 就立即触发未保存提示。

### FR-3: 定时任务表单必须持有明确模型

定时任务表单加载时按以下顺序生成 `form.modelId`：

1. `task.payload.model` 存在且可解析，则使用该模型引用
2. `task.payload.model` 缺失，则使用当前 `defaultSelectedModel`
3. 新建任务时使用当前 `defaultSelectedModel`
4. `task.payload.model` 存在但不可解析，则保留原始引用用于错误提示，并要求用户重新选择

保存时：

1. `agentTurn` 任务必须写入 `payload.model`
2. 不再用 `...(form.modelId ? { model: form.modelId } : {})` 表示默认模型
3. 如果没有可用模型，提交前给出表单错误，不创建不完整任务

### FR-4: 保留运行时兼容，不做破坏性迁移

旧任务缺少 `payload.model` 时，运行时仍按当前 OpenClaw 行为执行，避免已有任务突然失效。

本次不要求批量迁移历史任务。迁移方式采用“打开编辑并保存后补写明确模型”。

### FR-5: 简单提醒类任务不受影响

IM 简单提醒或系统事件类任务可能使用 `systemEvent`，这类 payload 本身不需要模型字段。

本次要求只约束 UI 手动创建/编辑的 `agentTurn` 定时任务；不要给 `systemEvent` 强行增加模型。

## 4. 实现方案

### 4.1 Agent 创建/编辑页

涉及文件：

| 文件 | 变更 |
|---|---|
| `src/renderer/components/agent/AgentDetailToolbar.tsx` | 移除传给 `ModelSelector` 的 `defaultLabel` |
| `src/renderer/components/agent/AgentSettingsPanel.tsx` | 加载 Agent 时把空模型解析为当前 `defaultSelectedModel` |
| `src/renderer/components/agent/AgentCreateModal.tsx` | 保持新建默认选中当前 `defaultSelectedModel`，并移除默认伪选项 |
| `src/renderer/services/i18n.ts` | 如果不再有引用，删除 `agentUseDefaultModel` 文案 |

推荐做法：

1. `AgentDetailToolbar` 仍接收 `model: Model | null`，但不再展示 `null` 伪选项。
2. `AgentSettingsPanel` 增加 `defaultSelectedModel` 选择器。
3. 加载 Agent 时：

```typescript
const resolvedModel = resolveOpenClawModelRef(a.model, availableModels)
  ?? defaultSelectedModel
  ?? null;
setModel(resolvedModel);
```

4. `initialValuesRef.current.model` 使用 `resolvedModel ? toOpenClawModelRef(resolvedModel) : ''`，避免历史空模型打开后立即变脏。
5. 保存时继续用 `model ? toOpenClawModelRef(model) : ''`，但正常 UI 不再能主动选择 `null`。

### 4.2 定时任务表单

涉及文件：

| 文件 | 变更 |
|---|---|
| `src/renderer/components/scheduledTasks/TaskForm.tsx` | 默认模型从 `defaultSelectedModel` 派生；移除 `defaultLabel`；保存时强制写 `payload.model` |
| `src/renderer/components/scheduledTasks/TaskDetail.tsx` | 可选：历史缺失模型时显示当前解析结果或保持不显示 |
| `src/renderer/services/i18n.ts` | 删除 `scheduledTasksFormModelDefault`；新增模型必选/不可用错误文案 |

推荐做法：

1. 在 `TaskForm` 中读取 `defaultSelectedModel`。
2. 将 `createFormState(task)` 改为接收 `fallbackModelRef`：

```typescript
function createFormState(task: ScheduledTask | undefined, fallbackModelRef: string): FormState
```

3. 新建任务或历史任务缺少 `payload.model` 时，使用 `fallbackModelRef` 作为 `modelId`。
4. `selectedModelValue` 只接受可解析的真实模型；不可解析时显示错误提示。
5. `validate()` 增加模型校验：

```typescript
if (!form.modelId.trim() || !selectedModelValue) {
  nextErrors.modelId = i18nService.t('scheduledTasksFormValidationModelRequired');
}
```

6. 保存时始终写：

```typescript
payload: {
  kind: PayloadKind.AgentTurn,
  message: form.payloadText.trim(),
  model: form.modelId,
}
```

如果实现时触碰 `kind`、`sessionTarget`、`wakeMode` 等 discriminant/status 字符串，应顺手改用 `src/scheduledTask/constants.ts` 中已有常量，避免新增裸字符串。

### 4.3 `ModelSelector`

`ModelSelector` 本次不需要大改。

可选增强：

1. 在没有 `defaultLabel` 且 `value === null` 时，trigger 显示一个非可选占位，例如“请选择模型”。
2. 保持 `availableModels.length === 0` 时显示 `modelSelectorNoModels`。
3. 不改变非 controlled 模式的全局模型选择行为。

## 5. 边界情况

| 场景 | 处理方式 |
|---|---|
| Agent 历史 `model = ''` | 编辑页显示当前全局模型；保存后写明确模型 |
| Agent 历史 `model` 指向已删除 provider | 编辑页显示当前全局模型；聊天侧仍沿用现有静默 fallback 规则 |
| 新建 Agent 时全局模型存在 | 默认选中全局模型，列表无“默认模型” |
| 新建 Agent 时没有可用模型 | 显示“请先在设置中配置模型”，保存应避免写空模型 |
| 新建定时任务 | 默认写当前全局模型 |
| 旧定时任务无 `payload.model` | 编辑页用当前全局模型补齐；未编辑前运行时继续兼容 |
| 旧定时任务模型已不可用 | 编辑页提示重新选择；保存前不自动猜测 |
| `systemEvent` 提醒任务 | 不要求模型字段 |
| 用户修改全局默认模型 | 已保存的定时任务不跟随变化 |

## 6. 涉及文件

| 文件 | 变更 |
|---|---|
| `src/renderer/components/ModelSelector.tsx` | 可选：补充无选中占位显示；不作为核心改动 |
| `src/renderer/components/agent/AgentDetailToolbar.tsx` | 移除 Agent 场景的默认伪选项 |
| `src/renderer/components/agent/AgentSettingsPanel.tsx` | 历史空模型加载为具体有效模型 |
| `src/renderer/components/agent/AgentCreateModal.tsx` | 新建 Agent 只展示真实模型 |
| `src/renderer/components/scheduledTasks/TaskForm.tsx` | 默认选中并保存明确模型 |
| `src/renderer/components/scheduledTasks/TaskDetail.tsx` | 可选：明确显示任务模型 |
| `src/renderer/services/i18n.ts` | 删除旧默认模型文案；新增校验文案 |
| `src/scheduledTask/constants.ts` | 如触碰相关 discriminant，复用已有常量，无需新增 |

## 7. 验收标准

1. Agent 创建/编辑页的模型下拉列表不再出现“默认模型”。
2. 定时任务创建/编辑页的模型下拉列表不再出现“使用默认模型”。
3. 新建定时任务保存后，OpenClaw cron payload 中包含明确的 `model`。
4. 旧定时任务缺少 `payload.model` 时，打开编辑页能显示一个具体可用模型，保存后补写明确模型。
5. 已保存明确模型的定时任务，在全局默认模型变化后不改变执行模型。
6. 没有可用模型时，表单不能创建一个缺少模型的 `agentTurn` 定时任务。
7. `systemEvent` 类提醒任务仍可不带模型字段。

## 8. 验证计划

### 8.1 自动化验证

| 验证项 | 建议命令 |
|---|---|
| Agent/模型选择相关单测 | `npm test -- agentModelSelection` |
| 定时任务映射相关单测 | `npm test -- scheduledTask` |
| 触碰文件 ESLint | `npx eslint <touched files>` |
| 构建验证 | `npm run build` |

如果新增了表单纯函数，例如 `createFormState(task, fallbackModelRef)` 或模型解析 helper，应补充同文件 `.test.ts`。

### 8.2 手动验证

1. 打开 Agent 编辑页，确认下拉列表只有真实模型。
2. 打开新建 Agent 弹窗，确认默认显示当前全局模型。
3. 新建定时任务，展开模型列表，确认没有“使用默认模型”。
4. 保存定时任务后重新打开详情，确认能看到明确模型。
5. 修改全局默认模型后重新打开该任务，确认任务仍保留原模型。
6. 构造一个历史无模型任务，打开编辑页并保存，确认保存后 `payload.model` 被补齐。
