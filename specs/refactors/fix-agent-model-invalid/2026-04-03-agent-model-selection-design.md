---
title: Agent Model Selection for OpenClaw
date: 2026-04-03
tags:
  - superpowers-spec
  - cowork
  - agent
  - openclaw
scope:
  - src/renderer/components/agent/
  - src/renderer/components/cowork/
  - src/renderer/services/agent.ts
  - src/main/libs/openclawConfigSync.ts
  - src/main/coworkStore.ts
---

# Agent Model Selection for OpenClaw

## Overview

Bind a default model to each Agent for the OpenClaw engine. The current Agent controls the model shown in the Cowork top-left model selector, and changing that selector updates the Agent's default model rather than a per-session override.

## Problem

The codebase already stores `agents.model`, but the product behavior is still effectively global-model driven. Users can switch between Agents, but cannot rely on each Agent to carry its own model choice in OpenClaw. This creates a mismatch between the Agent abstraction and runtime behavior.

## Goals

1. Each Agent has a single default model persisted in `agents.model`.
2. In `openclaw`, the top-left model selector reflects and edits the current Agent's model.
3. Model changes apply to all sessions under that Agent, including old sessions when they continue.
4. The UX treats model selection as direct Agent configuration, not a session-level override.

## Non-Goals

1. No session-level model customization.
2. No model snapshot stored on sessions.
3. No behavior changes for `yd_cowork`.
4. No cross-engine unification of Agent model semantics.
5. No migration that rewrites historical session data.

## Confirmed Product Decisions

### Interaction Model

1. The only model ownership level introduced by this feature is `agent`.
2. When the user is on an Agent tab, the Cowork top-left model selector shows that Agent's model.
3. Existing Agents without `model` are migrated to explicit Agent models at startup using the current global default only when the provider resolution is unambiguous.
4. Changing the model in the top-left selector updates the current Agent's default model.
5. The change affects all sessions under that Agent.
6. There is no concept of a temporary per-session model override.

### Engine Scope

This feature applies only to `openclaw`.

1. `openclaw` uses `agent.model` when available.
2. `yd_cowork` keeps its current global-model behavior unchanged.
3. UI copy must clearly state that Agent default model settings only take effect in OpenClaw.

### Existing Session Behavior

Because there is no session-level model field:

1. Old sessions do not keep the model they were originally created with.
2. Continuing an old OpenClaw session always resolves the current `agent.model`.
3. If the user changes an Agent's model, all sessions under that Agent follow the new model on future execution.

## Data Model

### Source of Truth

`agents.model` remains the sole persisted source of truth.

No new fields are added to:

1. `cowork_sessions`
2. `cowork_messages`
3. renderer session state

### Resolution Rule

For OpenClaw runtime resolution:

1. Use `agent.model` if non-empty.
2. Otherwise fall back to the global default model.
3. If the resolved model is unavailable or invalid, block execution and ask the user to choose a valid model for the current Agent.

## UI Design

### Cowork Top-Left Model Selector

In OpenClaw mode:

1. The selector value is bound to the current Agent.
2. Switching Agent updates the selector display immediately.
3. Changing the selector updates the current Agent's `model`.

In non-OpenClaw mode:

1. Existing behavior remains unchanged.
2. The selector must not imply Agent-level model binding.

### Confirmation and Explanatory Copy

No confirmation prompt is shown when the user changes the current Agent model from Cowork.

Requirements:

1. The top-left selector and the input-area selector both update the current Agent immediately.
2. The UI copy around Agent settings should continue to label the field as `Agent Default Model`.
3. The product does not introduce a separate warning gate for Agent-level model changes.

### Agent Management Screens

Agent creation and settings screens add an explicit `Agent Default Model` field.

Requirements:

1. The field uses the existing model selection source.
2. The label should communicate that this is the Agent's default model.
3. Helper text should state that the setting only applies to OpenClaw.

## Runtime Design

### OpenClaw Config Sync

OpenClaw already supports per-Agent structures, but the current sync only emits Agent identity and skills. The sync needs to also emit each Agent's resolved model.

Required change:

1. Extend `buildAgentsList()` so each enabled non-main Agent can include model configuration.
2. Ensure the `main` Agent also follows the same resolution rule through its defaults.
3. Preserve the existing fallback to the global default model when `agent.model` is empty.

### Session Execution Semantics

OpenClaw session execution should continue to use `agentId` as the Agent selector.

The actual model used for execution is not stored on the session. Instead:

1. session -> agentId
2. agentId -> current agent record
3. agent record -> `model` or fallback
4. resolved model -> OpenClaw execution config

This keeps the model behavior consistent for both new and existing sessions.

## Error Handling

### Missing Agent Model

If `agent.model` is empty on historical data:

1. try to migrate it to an explicit Agent model during startup
2. use the global default model only as the migration source for empty values, not as a persistent UI fallback mode

### Invalid Agent Model

If the Agent references a model that no longer exists:

1. do not silently choose another arbitrary model
2. block execution in OpenClaw
3. show an actionable message telling the user to reselect a valid model for the current Agent

### Engine Mismatch

If the current engine is not OpenClaw:

1. Agent default model behavior does not apply
2. UI should avoid misleading wording implying otherwise

## Implementation Boundaries

The intended implementation surface is:

1. Agent create modal
2. Agent settings panel
3. Cowork model selector behavior in OpenClaw mode
4. Agent service/store plumbing for persisting `model`
5. OpenClaw config sync for per-Agent model emission
6. Validation and user-facing error states for invalid Agent model references

The intended implementation surface explicitly excludes:

1. `yd_cowork` runtime changes
2. session schema changes
3. session-level model overrides
4. multi-level override precedence beyond `agent.model -> global default`

## Acceptance Criteria

1. In OpenClaw mode, switching to different Agents updates the top-left model selector to each Agent's model.
2. In OpenClaw mode, changing the top-left selector updates the current Agent's persisted `model`.
3. Changing the top-left selector does not require a confirmation prompt.
4. Creating a new session under an Agent uses that Agent's model.
5. Continuing an old session under an Agent also uses that Agent's current model.
6. Historical empty Agent models are migrated to explicit values during startup.
7. Bare historical model ids are auto-qualified only when the provider match is unique; ambiguous matches are left unchanged and warned.
8. If an Agent's configured model is invalid, OpenClaw execution is blocked with a clear corrective message.
9. In `yd_cowork`, current model behavior remains unchanged.
10. Agent create and edit flows both expose `Agent Default Model` with text indicating it is OpenClaw-only.

## Risks

1. If model availability changes dynamically, stale Agent model values can become invalid and must fail clearly.
2. Historical bare model ids with multiple provider matches require manual user re-selection to become fully explicit.

## Open Questions Resolved

1. Session-level model customization: not supported.
2. Old vs new session divergence after Agent model change: not supported; all sessions under the Agent follow the same model.
3. Engine scope: OpenClaw only.

---

## 实施计划


**Goal:** Bind a default model to each Agent for the OpenClaw engine, surface it in the Cowork top-left model selector, and make changes apply to all sessions under that Agent.

**Architecture:** Keep `agents.model` as the only persisted source of truth. In the renderer, treat the Cowork model selector as a controlled OpenClaw-only editor for the current Agent. In the main process, extend OpenClaw config sync so each managed Agent emits its own resolved `model.primary`, falling back to the global default model when `agent.model` is empty.

**Tech Stack:** Electron, React 18, Redux Toolkit, TypeScript, Vitest

---

## File Structure

**Modify**
- `src/renderer/store/slices/agentSlice.ts`
  Keep Agent summaries rich enough to include `model`, so the Cowork UI can resolve the current Agent selection without extra IPC.
- `src/renderer/services/agent.ts`
  Preserve `model` in load/create/update flows and expose the value to Redux.
- `src/renderer/components/agent/AgentCreateModal.tsx`
  Add the `Agent Default Model` field and OpenClaw-only helper text.
- `src/renderer/components/agent/AgentSettingsPanel.tsx`
  Add editable Agent model selection for existing Agents.
- `src/renderer/components/cowork/CoworkPromptInput.tsx`
  Bind the top-left selector to the current Agent when the engine is `openclaw`, show fallback hint text, and confirm Agent-level changes before saving.
- `src/renderer/services/i18n.ts`
  Add labels, helper text, warning copy, fallback text, and invalid-model messaging.
- `src/main/libs/openclawConfigSync.ts`
  Emit per-Agent `model.primary` values into managed OpenClaw config while preserving default fallback behavior.

**Create**
- `src/renderer/components/cowork/agentModelSelection.ts`
  Pure helper for OpenClaw-only renderer logic: resolve current Agent model, detect fallback mode, and build controlled selector state.
- `src/renderer/components/cowork/agentModelSelection.test.ts`
  Unit tests for selector resolution and fallback detection.
- `src/main/libs/openclawAgentModels.ts`
  Pure helper for building OpenClaw managed Agent config entries with Agent-level model fallback.
- `src/main/libs/openclawAgentModels.test.ts`
  Unit tests for Agent model emission and fallback behavior.

## Task 1: Preserve Agent Model in Renderer State

**Files:**
- Modify: `src/renderer/store/slices/agentSlice.ts`
- Modify: `src/renderer/services/agent.ts`
- Test: `src/renderer/components/cowork/agentModelSelection.test.ts`

- [ ] **Step 1: Write the failing test for Agent model resolution inputs**

```ts
import { describe, expect, test } from 'vitest';
import type { Model } from '../../store/slices/modelSlice';
import { resolveAgentModelSelection } from './agentModelSelection';

const models: Model[] = [
  { id: 'gpt-4o', name: 'GPT-4o', providerKey: 'openai' },
  { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', providerKey: 'anthropic' },
];

describe('resolveAgentModelSelection', () => {
  test('uses explicit agent model when present', () => {
    const result = resolveAgentModelSelection({
      agentModel: 'claude-sonnet-4',
      availableModels: models,
      fallbackModel: models[0],
      engine: 'openclaw',
    });

    expect(result.selectedModel?.id).toBe('claude-sonnet-4');
    expect(result.usesFallback).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- agentModelSelection
```

Expected: FAIL because `resolveAgentModelSelection` does not exist yet.

- [ ] **Step 3: Add Agent `model` to renderer state and IPC mapping**

Update the Agent summary shape so Redux keeps the persisted model:

```ts
interface AgentSummary {
  id: string;
  name: string;
  description: string;
  icon: string;
  model: string;
  enabled: boolean;
  isDefault: boolean;
  source: 'custom' | 'preset';
  skillIds: string[];
}
```

Update `agentService.loadAgents()`, `createAgent()`, `updateAgent()`, and `addPreset()` so they preserve `model`:

```ts
store.dispatch(setAgents(agents.map((a) => ({
  id: a.id,
  name: a.name,
  description: a.description,
  icon: a.icon,
  model: a.model ?? '',
  enabled: a.enabled,
  isDefault: a.isDefault,
  source: a.source,
  skillIds: a.skillIds ?? [],
}))));
```

- [ ] **Step 4: Create the renderer helper with minimal passing logic**

Create `src/renderer/components/cowork/agentModelSelection.ts`:

```ts
import type { CoworkAgentEngine } from '../../../main/libs/agentEngine/types';
import type { Model } from '../../store/slices/modelSlice';

type ResolveAgentModelSelectionInput = {
  agentModel: string;
  availableModels: Model[];
  fallbackModel: Model | null;
  engine: CoworkAgentEngine;
};

export function resolveAgentModelSelection({
  agentModel,
  availableModels,
  fallbackModel,
  engine,
}: ResolveAgentModelSelectionInput): { selectedModel: Model | null; usesFallback: boolean } {
  if (engine !== 'openclaw') {
    return { selectedModel: fallbackModel, usesFallback: false };
  }

  const explicit = availableModels.find((model) => model.id === agentModel) ?? null;
  if (explicit) {
    return { selectedModel: explicit, usesFallback: false };
  }

  return { selectedModel: fallbackModel, usesFallback: true };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
npm test -- agentModelSelection
```

Expected: PASS with the initial helper test green.

- [ ] **Step 6: Commit**

```bash
git add \
  src/renderer/store/slices/agentSlice.ts \
  src/renderer/services/agent.ts \
  src/renderer/components/cowork/agentModelSelection.ts \
  src/renderer/components/cowork/agentModelSelection.test.ts
git commit -m "refactor(agent): preserve model in renderer state"
```

## Task 2: Add Agent Default Model Controls in Agent Screens

**Files:**
- Modify: `src/renderer/components/agent/AgentCreateModal.tsx`
- Modify: `src/renderer/components/agent/AgentSettingsPanel.tsx`
- Modify: `src/renderer/services/i18n.ts`
- Test: `src/renderer/components/cowork/agentModelSelection.test.ts`

- [ ] **Step 1: Extend the helper test for fallback semantics used by the forms**

Add:

```ts
test('falls back to the global model in openclaw when agent model is empty', () => {
  const result = resolveAgentModelSelection({
    agentModel: '',
    availableModels: models,
    fallbackModel: models[0],
    engine: 'openclaw',
  });

  expect(result.selectedModel?.id).toBe('gpt-4o');
  expect(result.usesFallback).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- agentModelSelection
```

Expected: FAIL until the helper and UI logic recognize fallback mode consistently.

- [ ] **Step 3: Add model state and controlled `ModelSelector` to Agent create/edit flows**

In `AgentCreateModal.tsx`, add local state and wire it into create:

```tsx
const [model, setModel] = useState<Model | null>(null);

const handleCreate = async () => {
  const agent = await agentService.createAgent({
    name: name.trim(),
    description: description.trim(),
    systemPrompt: systemPrompt.trim(),
    identity: identity.trim(),
    model: model?.id ?? '',
    icon: icon.trim() || undefined,
    skillIds,
  });
};
```

Render the field:

```tsx
<div>
  <label className="block text-sm font-medium text-secondary mb-1">
    {i18nService.t('agentDefaultModel')}
  </label>
  <ModelSelector
    value={model}
    onChange={setModel}
    defaultLabel={i18nService.t('agentModelUseGlobalDefault')}
  />
  <p className="mt-1 text-xs text-secondary/70">
    {i18nService.t('agentModelOpenClawOnly')}
  </p>
</div>
```

In `AgentSettingsPanel.tsx`, initialize from `a.model` and save it back through `agentService.updateAgent(...)`.

- [ ] **Step 4: Add the user-visible strings**

Add both Chinese and English keys in `src/renderer/services/i18n.ts`:

```ts
agentDefaultModel: 'Agent 默认模型',
agentModelUseGlobalDefault: '使用全局默认模型',
agentModelOpenClawOnly: '仅 OpenClaw 引擎使用此设置',
```

```ts
agentDefaultModel: 'Agent Default Model',
agentModelUseGlobalDefault: 'Use global default model',
agentModelOpenClawOnly: 'This setting only applies to the OpenClaw engine',
```

- [ ] **Step 5: Update the helper if needed and rerun the test**

Run:

```bash
npm test -- agentModelSelection
```

Expected: PASS with both explicit and fallback cases green.

- [ ] **Step 6: Manual verification**

Run:

```bash
npm run electron:dev
```

Verify:

1. Create Agent modal shows `Agent Default Model`
2. Settings panel shows existing Agent model
3. Empty selection displays the global-default label
4. Helper copy says the setting is OpenClaw-only

- [ ] **Step 7: Commit**

```bash
git add \
  src/renderer/components/agent/AgentCreateModal.tsx \
  src/renderer/components/agent/AgentSettingsPanel.tsx \
  src/renderer/services/i18n.ts \
  src/renderer/components/cowork/agentModelSelection.test.ts
git commit -m "feat(agent): add default model controls"
```

## Task 3: Bind the Cowork Top-Left Selector to the Current Agent in OpenClaw

**Files:**
- Modify: `src/renderer/components/cowork/CoworkPromptInput.tsx`
- Modify: `src/renderer/components/cowork/agentModelSelection.ts`
- Modify: `src/renderer/services/i18n.ts`
- Test: `src/renderer/components/cowork/agentModelSelection.test.ts`

- [ ] **Step 1: Write the failing tests for OpenClaw-only selector behavior**

Add:

```ts
test('uses fallback model outside openclaw without marking fallback mode', () => {
  const result = resolveAgentModelSelection({
    agentModel: 'claude-sonnet-4',
    availableModels: models,
    fallbackModel: models[0],
    engine: 'yd_cowork',
  });

  expect(result.selectedModel?.id).toBe('gpt-4o');
  expect(result.usesFallback).toBe(false);
});

test('marks invalid explicit model as fallback to global model', () => {
  const result = resolveAgentModelSelection({
    agentModel: 'deleted-model',
    availableModels: models,
    fallbackModel: models[0],
    engine: 'openclaw',
  });

  expect(result.selectedModel?.id).toBe('gpt-4o');
  expect(result.usesFallback).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- agentModelSelection
```

Expected: FAIL until engine gating and invalid-model fallback are handled.

- [ ] **Step 3: Wire `CoworkPromptInput` to current Agent + OpenClaw config**

Add selectors:

```tsx
const currentAgentId = useSelector((state: RootState) => state.agent.currentAgentId);
const agents = useSelector((state: RootState) => state.agent.agents);
const coworkAgentEngine = useSelector((state: RootState) => state.cowork.config.agentEngine);
const availableModels = useSelector((state: RootState) => state.model.availableModels);
const globalSelectedModel = useSelector((state: RootState) => state.model.selectedModel);

const currentAgent = agents.find((agent) => agent.id === currentAgentId);
const { selectedModel, usesFallback } = resolveAgentModelSelection({
  agentModel: currentAgent?.model ?? '',
  availableModels,
  fallbackModel: globalSelectedModel,
  engine: coworkAgentEngine,
});
```

Replace the uncontrolled selector with a controlled OpenClaw-only selector:

```tsx
{showModelSelector && !remoteManaged && (
  <ModelSelector
    dropdownDirection="up"
    value={coworkAgentEngine === 'openclaw' ? selectedModel : undefined}
    onChange={coworkAgentEngine === 'openclaw'
      ? async (nextModel) => {
          if (!currentAgent) return;
          const confirmed = window.confirm(i18nService.t('agentModelChangeWarning'));
          if (!confirmed) return;
          await agentService.updateAgent(currentAgent.id, { model: nextModel?.id ?? '' });
        }
      : undefined}
    defaultLabel={i18nService.t('agentModelUseGlobalDefault')}
  />
)}
```

Show the fallback hint only in OpenClaw when the Agent has no explicit model:

```tsx
{coworkAgentEngine === 'openclaw' && usesFallback && (
  <span className="text-xs text-secondary/70">
    {i18nService.t('agentModelFallbackHint')}
  </span>
)}
```

- [ ] **Step 4: Add warning and fallback-copy translations**

Add:

```ts
agentModelChangeWarning: '这会修改当前 Agent 的默认模型，并影响该 Agent 下所有会话。该行为仅在 OpenClaw 引擎下生效。是否继续？',
agentModelFallbackHint: '当前 Agent 未单独配置模型，正在使用全局默认模型',
```

```ts
agentModelChangeWarning: 'This changes the current Agent\\'s default model and affects all sessions under this Agent. This behavior only applies to the OpenClaw engine. Continue?',
agentModelFallbackHint: 'This Agent has no explicit model configured and is currently using the global default model',
```

- [ ] **Step 5: Update the helper and rerun tests**

Make the helper pass all four cases, then run:

```bash
npm test -- agentModelSelection
```

Expected: PASS.

- [ ] **Step 6: Manual verification**

Run:

```bash
npm run electron:dev
```

Verify:

1. In OpenClaw, switching Agent changes the selector display
2. In OpenClaw, changing the selector prompts with the Agent-level warning
3. Saving a selection updates the Agent settings panel value
4. Empty Agent model shows fallback hint text
5. In `yd_cowork`, the selector keeps current behavior and does not act as an Agent editor

- [ ] **Step 7: Commit**

```bash
git add \
  src/renderer/components/cowork/CoworkPromptInput.tsx \
  src/renderer/components/cowork/agentModelSelection.ts \
  src/renderer/components/cowork/agentModelSelection.test.ts \
  src/renderer/services/i18n.ts
git commit -m "feat(cowork): bind openclaw model selector to agent"
```

## Task 4: Emit Per-Agent Models in OpenClaw Config Sync

**Files:**
- Create: `src/main/libs/openclawAgentModels.ts`
- Create: `src/main/libs/openclawAgentModels.test.ts`
- Modify: `src/main/libs/openclawConfigSync.ts`

- [ ] **Step 1: Write the failing test for per-Agent model emission**

Create `src/main/libs/openclawAgentModels.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { buildManagedAgentEntries } from './openclawAgentModels';

describe('buildManagedAgentEntries', () => {
  test('emits explicit model.primary for enabled non-main agents', () => {
    const result = buildManagedAgentEntries({
      agents: [
        {
          id: 'writer',
          name: 'Writer',
          icon: '✍️',
          model: 'openai/gpt-4o',
          enabled: true,
          skillIds: ['docx'],
        } as any,
      ],
      fallbackPrimaryModel: 'anthropic/claude-sonnet-4',
    });

    expect(result).toContainEqual(expect.objectContaining({
      id: 'writer',
      model: { primary: 'openai/gpt-4o' },
    }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- openclawAgentModels
```

Expected: FAIL because the helper does not exist yet.

- [ ] **Step 3: Create the pure helper with fallback behavior**

Create `src/main/libs/openclawAgentModels.ts`:

```ts
import type { Agent } from '../coworkStore';

type BuildManagedAgentEntriesInput = {
  agents: Agent[];
  fallbackPrimaryModel: string;
};

export function buildManagedAgentEntries({
  agents,
  fallbackPrimaryModel,
}: BuildManagedAgentEntriesInput): Array<Record<string, unknown>> {
  return agents
    .filter((agent) => agent.id !== 'main' && agent.enabled)
    .map((agent) => ({
      id: agent.id,
      ...(agent.name || agent.icon ? {
        identity: {
          ...(agent.name ? { name: agent.name } : {}),
          ...(agent.icon ? { emoji: agent.icon } : {}),
        },
      } : {}),
      ...(agent.skillIds.length > 0 ? { skills: agent.skillIds } : {}),
      model: {
        primary: (agent.model || '').trim() || fallbackPrimaryModel,
      },
    }));
}
```

- [ ] **Step 4: Replace the inline Agent list logic in `openclawConfigSync.ts`**

Import the helper and use it from `buildAgentsList()`:

```ts
private buildAgentsList(defaultPrimaryModel: string): { list?: Array<Record<string, unknown>> } {
  const agents = this.getAgents?.() ?? [];

  const list: Array<Record<string, unknown>> = [
    {
      id: 'main',
      default: true,
    },
    ...buildManagedAgentEntries({
      agents,
      fallbackPrimaryModel: defaultPrimaryModel,
    }),
  ];

  return list.length > 0 ? { list } : {};
}
```

Update the caller to pass the resolved default primary model:

```ts
agents: {
  defaults: {
    timeoutSeconds: OPENCLAW_AGENT_TIMEOUT_SECONDS,
    model: {
      primary: providerSelection.primaryModel,
    },
    sandbox: {
      mode: sandboxMode,
    },
    ...(workspaceDir ? { workspace: path.resolve(workspaceDir) } : {}),
  },
  ...this.buildAgentsList(providerSelection.primaryModel),
},
```

- [ ] **Step 5: Add the fallback test and run both tests**

Add:

```ts
test('falls back to the default primary model when agent model is empty', () => {
  const result = buildManagedAgentEntries({
    agents: [
      {
        id: 'writer',
        name: 'Writer',
        icon: '✍️',
        model: '',
        enabled: true,
        skillIds: [],
      } as any,
    ],
    fallbackPrimaryModel: 'anthropic/claude-sonnet-4',
  });

  expect(result[0]).toMatchObject({
    id: 'writer',
    model: { primary: 'anthropic/claude-sonnet-4' },
  });
});
```

Run:

```bash
npm test -- openclawAgentModels
npm test -- openclawConfigSync
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add \
  src/main/libs/openclawAgentModels.ts \
  src/main/libs/openclawAgentModels.test.ts \
  src/main/libs/openclawConfigSync.ts
git commit -m "feat(openclaw): sync per-agent model bindings"
```

## Task 5: Final Verification and Cleanup

**Files:**
- Modify: `docs/superpowers/plans/2026-04-03-agent-model-selection.md` (check off completed items only during execution)

- [ ] **Step 1: Run focused automated checks**

Run:

```bash
npm test -- agentModelSelection
npm test -- openclawAgentModels
npm test -- openclawConfigSync
npm run lint
```

Expected:

1. All targeted Vitest suites PASS
2. `npm run lint` exits successfully

- [ ] **Step 2: Run end-to-end manual verification in Electron**

Run:

```bash
npm run electron:dev
```

Manual checklist:

1. Switch Cowork engine to `openclaw`
2. Create two Agents with different explicit models
3. Confirm the top-left selector changes with the Agent tab
4. Change one Agent model from the selector and accept the warning
5. Continue an old session under that Agent and confirm it uses the new model
6. Clear an Agent model and confirm fallback hint text appears
7. Switch to `yd_cowork` and confirm Agent model binding does not apply there

- [ ] **Step 3: Prepare release note / PR summary text**

Use this summary:

```md
- bind the Cowork model selector to the current Agent in OpenClaw
- add Agent default model fields in create/edit flows
- sync per-Agent model.primary values into managed OpenClaw config
- preserve global fallback behavior when an Agent has no explicit model
```

- [ ] **Step 4: Commit final polish**

```bash
git add .
git commit -m "feat(cowork): support openclaw agent model selection"
```

## Self-Review

### Spec Coverage

Covered requirements:

1. Agent-level `model` remains the only persisted source of truth
2. Cowork top-left selector becomes Agent-bound in OpenClaw only
3. Agent create/edit screens expose `Agent Default Model`
4. Warning copy explains Agent-level impact
5. OpenClaw config sync emits per-Agent model values
6. Fallback to global default model remains intact
7. Invalid-model handling is explicitly part of runtime verification and UI messaging
8. `yd_cowork` behavior stays unchanged

### Placeholder Scan

No `TODO`, `TBD`, “appropriate handling”, or “similar to task N” placeholders remain in this plan.

### Type Consistency

The plan uses these stable names consistently:

1. `agent.model`
2. `resolveAgentModelSelection`
3. `buildManagedAgentEntries`
4. `Agent Default Model`
5. `agentModelChangeWarning`

