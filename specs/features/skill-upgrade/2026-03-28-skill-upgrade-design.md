# 技能版本升级设计文档

## 1. 概述

### 1.1 问题

用户从技能市场安装技能后（如 youdaonote v1.0.0），当市场发布新版本（v1.0.1）时，没有任何升级入口。技能市场仍显示"已安装"徽章，用户必须手动删除旧版本再重新安装才能获取更新。

根因：`isSkillInstalled()` 仅做 ID 匹配，不比较版本号。

### 1.2 设计目标

1. 三态判断：`not_installed` / `installed` / `update_available`
2. 后端增加 `upgradeSkill()` 方法，复用 `syncBundledSkillsToUserData()` 的升级模式
3. 已安装 tab 顶部增加"一键更新"按钮（无可更新时隐藏），单个技能卡片也有更新按钮
4. 技能市场 tab 对有更新的技能展示更新按钮（替代"已安装"徽章）
5. 更新过程使用全局遮罩层展示进度，防止用户操作冲突

---

## 2. 用户场景

### 场景 1: 技能市场发现有更新

**Given** 用户已安装 youdaonote v1.0.0
**When** 用户打开技能市场，市场中 youdaonote 已更新到 v1.0.1
**Then** 卡片和详情弹窗显示橙色"更新"按钮，版本号显示 `v1.0.0 → v1.0.1`

### 场景 2: 已安装 tab 发现有更新

**Given** 用户已安装多个技能，其中 3 个有新版本
**When** 用户切换到"已安装" tab
**Then** 每个可更新技能卡片右下角显示橙色"更新"按钮
**And** tab 顶部显示"更新全部 (3)"按钮

### 场景 3: 单个技能更新

**Given** 用户在任一 tab 点击某个技能的"更新"按钮
**When** 更新执行中
**Then** 显示全局遮罩层，展示进度和当前技能名
**And** 更新完成后遮罩自动关闭，技能列表刷新

### 场景 4: 一键批量更新

**Given** 用户点击"更新全部"按钮
**When** 多个技能串行更新
**Then** 遮罩层显示 (1/3)、(2/3)、(3/3) 进度
**And** 提供"取消更新"按钮，已完成的不回滚

### 场景 5: 更新过程中 App 退出

**Given** 更新正在执行，旧目录已重命名为 `.upgrading`
**When** 用户强制退出 App
**Then** 下次启动时 `recoverInterruptedUpgrades()` 自动检测并回滚到旧版本

### 场景 6: 无更新可用

**Given** 所有已安装技能版本与市场一致
**When** 用户查看已安装 tab
**Then** 不显示"更新全部"按钮，各卡片无更新标识

---

## 3. 功能需求

### FR-1: 三态安装判断

- `not_installed` → 蓝色"安装"按钮
- `installed` → 绿色"已安装"徽章
- `update_available` → 橙色"更新"按钮

### FR-2: 安全升级流程

1. 备份 `.env` 和 `_meta.json` 到内存
2. 原子重命名旧目录为 `{dir}.upgrading`
3. 拷贝新版本到原路径
4. 还原备份文件
5. 删除 `.upgrading` 备份

### FR-3: 中断恢复

App 启动时扫描 `.upgrading` 后缀目录：
- 对应原目录存在且完整 → 删除备份（升级已完成）
- 对应原目录不存在 → 重命名回原目录（回滚）

### FR-4: 安全审查兼容

升级流程复用安装时的安全扫描机制。风险技能需用户确认后继续。

### FR-5: OpenClaw 兼容

通过已有的 `notifySkillsChanged()` → `syncOpenClawConfig()` 链路 + OpenClaw 原生文件监听自动感知变化，无需额外 RPC。

---

## 4. 非功能需求

- 不支持降级（本地版本 > 市场版本时显示"已安装"）
- 内置技能不参与市场版本对比（由 `syncBundledSkillsToUserData()` 管理）
- 无版本号的技能不参与更新检测
- 批量更新串行执行，避免并发写盘冲突

---

## 5. 实现方案

### 5.1 后端: `src/main/skillManager.ts`

**扩展 pending install 类型**（第 1084 行）支持升级：

```typescript
private pendingInstalls = new Map<string, {
  tempDir: string;
  cleanupPath: string | null;
  root: string;
  skillDirs: string[];
  timer: NodeJS.Timeout;
  isUpgrade?: boolean;
  existingSkillDir?: string;
}>();
```

**新增 `upgradeSkill(skillId, downloadUrl)` 方法**：
1. 通过 `listSkills()` 按 ID 查找已安装技能，获取其 `skillPath`
2. 使用 `downloadSkill()` 相同的下载/解压逻辑下载新版本
3. 安全扫描 — 风险技能存为 pending（`isUpgrade: true`）
4. 安全的直接执行升级流程
5. 调用 `this.startWatching()` 和 `this.notifySkillsChanged()`

**新增 `recoverInterruptedUpgrades()` 方法**（启动时调用）：
- 扫描 `userData/SKILLs/` 下所有 `.upgrading` 后缀目录
- 对应原目录存在且包含 SKILL.md → 更新已完成，删除 `.upgrading`
- 对应原目录不存在 → 重命名回原目录（回滚）

### 5.2 IPC 通道

`src/main/main.ts` 新增：
```typescript
ipcMain.handle('skills:upgrade', async (_event, skillId: string, downloadUrl: string) => {
  return skillManager.upgradeSkill(skillId, downloadUrl);
});
```

`initApp()` 中 `syncBundledSkillsToUserData()` 之后调用 `recoverInterruptedUpgrades()`。

`src/main/preload.ts` 的 `skills` 对象新增 `upgrade` 方法。

### 5.3 前端服务: `src/renderer/services/skill.ts`

- 新增 `upgradeSkill(skillId, downloadUrl)` 方法
- 新增 `compareVersions(a, b)` 版本比较工具函数

### 5.4 UI: `src/renderer/components/skills/SkillsManager.tsx`

**三态判断函数**（两个 tab 共用）：

```typescript
const getSkillInstallStatus = (marketplaceSkill: MarketplaceSkill):
  'not_installed' | 'installed' | 'update_available' => {
  const installed = skills.find(s => s.id === marketplaceSkill.id);
  if (!installed) return 'not_installed';
  if (installed.isBuiltIn) return 'installed';
  if (!installed.version || !marketplaceSkill.version) return 'installed';
  if (compareVersions(marketplaceSkill.version, installed.version) > 0) return 'update_available';
  return 'installed';
};
```

**全局更新遮罩层**：

```
┌─────────────────────────────────┐
│                                 │
│       正在更新技能 (2/3)         │
│       ████████░░░░  66%         │
│       当前：youdaonote v1.0.1   │
│                                 │
│          [ 取消更新 ]            │
│                                 │
└─────────────────────────────────┘
```

**更新执行流程**：

```
用户点击"更新全部"或单个"更新"
→ 显示遮罩层
→ 串行遍历待更新技能列表
  → 每个技能：更新遮罩进度 → 调用 skillService.upgradeSkill()
  → 如果触发安全审查 → 暂停遮罩，弹出安全报告弹窗 → 用户确认后继续
  → 如果用户点击取消 → 停止后续更新
→ 全部完成 → dispatch 更新后的 skills 到 Redux → 关闭遮罩
```

### 5.5 国际化

| Key | 英文 | 中文 |
|-----|------|------|
| `skillUpdate` | Update | 更新 |
| `skillUpdateAll` | Update All ({count}) | 更新全部 ({count}) |
| `skillUpgrading` | Updating skills ({current}/{total}) | 正在更新技能 ({current}/{total}) |
| `skillUpgradingCurrent` | Current: {name} v{version} | 当前：{name} v{version} |
| `skillUpgradeFailed` | Update failed | 更新失败 |
| `skillUpdateAvailable` | Update available | 有新版本 |
| `skillUpgradeCancel` | Cancel Update | 取消更新 |

---

## 6. 边界情况

| 场景 | 处理方式 |
|------|---------|
| 已安装技能无版本号 | 显示"已安装"（无法升级） |
| 市场技能无版本号 | 显示"已安装" |
| 版本相同 | 显示"已安装" |
| 本地版本高于市场 | 显示"已安装"（不支持降级） |
| 内置技能出现在市场 | 显示"已安装"（由 bundled sync 管理） |
| `.env` 不存在 | 跳过备份/还原 |
| `_meta.json` 不存在 | 跳过备份/还原 |
| 升级中途拷贝失败 | 旧版本保留在 `.upgrading`，下次启动自动回滚 |
| App 在升级中退出 | `recoverInterruptedUpgrades()` 自动恢复 |
| 批量更新中触发安全审查 | 暂停遮罩，弹出安全报告弹窗，用户决定后继续 |
| 用户取消批量更新 | 已完成的保留，剩余跳过 |

---

## 7. 涉及文件

1. `src/main/skillManager.ts` — `upgradeSkill()`、`recoverInterruptedUpgrades()`、修改 `confirmPendingInstall()`
2. `src/main/main.ts` — `skills:upgrade` IPC handler、启动恢复调用
3. `src/main/preload.ts` — bridge 暴露 `upgrade`
4. `src/renderer/types/electron.d.ts` — `upgrade` 类型定义
5. `src/renderer/services/skill.ts` — `upgradeSkill()`、`compareVersions()`
6. `src/renderer/services/i18n.ts` — 新增 i18n key
7. `src/renderer/components/skills/SkillsManager.tsx` — 三态 UI、更新遮罩、批量更新逻辑

---

## 8. 验收标准

1. 技能市场和已安装 tab 均正确展示三态
2. 单个更新和批量更新均正常工作
3. 更新后 `.env` 和 `_meta.json` 保留
4. 更新后 enabled/disabled 状态保留（存储在 SQLite，不受影响）
5. 中断后启动能自动恢复
6. 无可更新技能时"更新全部"按钮隐藏
