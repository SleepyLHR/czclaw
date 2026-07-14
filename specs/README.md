# Spec 文档规范

## 目录结构

```
specs/
├── features/       # 新功能
├── refactors/      # 重构
└── bugfixes/       # Bug 修复
```

每个子目录下按主题创建目录，目录名使用 kebab-case：

```
specs/features/
├── im-conversation-sync/
│   ├── 2026-03-19-im-conversation-sync-design.md
│   ├── 2026-04-08-im-conversation-sync-design.md   ← 迭代版本
│   └── 2026-04-21-im-conversation-sync-design.md
├── skill-upgrade/
│   └── 2026-03-28-skill-upgrade-design.md
└── email-channel/
    ├── 2026-04-09-email-channel-integration-design.md
    ├── 2026-04-15-email-channel-simplify-design.md
    └── 2026-04-16-email-channel-toggle-design.md
```

## 文件命名

```
YYYY-MM-DD-<主题描述>.md
```

- 日期为文档创建日期
- 主题描述使用 kebab-case，简明扼要
- 同一主题的多次迭代，每次新建一个带新日期的文件

## 分类规则

| 类别 | 目录 | 适用场景 |
|------|------|---------|
| 功能 | `features/` | 新增用户可感知的能力 |
| 重构 | `refactors/` | 不改变外部行为的内部改造 |
| Bug 修复 | `bugfixes/` | 修复已有功能的异常行为 |

## 文档语言

中文。

## 内容结构

### 功能文档 (`features/`)

```markdown
# <功能名称>设计文档

## 1. 概述

### 1.1 问题/背景
### 1.2 目标

## 2. 用户场景

### 场景 N: <场景标题>
**Given** ...
**When** ...
**Then** ...

## 3. 功能需求

### FR-N: <需求标题>

## 4. 实现方案

### 4.1 <模块/步骤>

## 5. 边界情况

| 场景 | 处理方式 |
|------|---------|

## 6. 涉及文件

## 7. 验收标准
```

### Bug 修复文档 (`bugfixes/`)

```markdown
# <问题描述>设计文档

## 1. 概述

### 1.1 问题
### 1.2 根因

## 2. 用户场景

## 3. 功能需求

## 4. 实现方案

## 5. 边界情况

## 6. 验收标准
```

### 重构文档 (`refactors/`)

```markdown
# <重构主题>设计文档

## 1. 概述

### 1.1 问题/动机
### 1.2 目标

## 2. 现状分析

## 3. 方案设计

## 4. 实施步骤

## 5. 涉及文件

## 6. 验证计划
```

## 原则

1. **一个文件一个完整文档** — 不拆分为多个文件（spec.md + plan.md），所有内容合并在一个文件中
2. **设计迭代用新文件** — 同一主题的新版本设计，新建带新日期的文件，旧版保留作为历史参考
3. **自包含** — 每个文件应独立可读，不强依赖其他文件才能理解
4. **重实质轻形式** — 上述章节结构为参考，根据实际内容灵活调整，不必每个章节都有
