export const CoworkUiEvent = {
  OpenShareOptions: 'cowork:open-share-options',
  SelectSubagent: 'cowork:select-subagent',
  FocusInput: 'cowork:focus-input',
  ShortcutSearch: 'cowork:shortcut:search',
  ShortcutNewSession: 'cowork:shortcut:new-session',
  ShortcutStopSession: 'cowork:shortcut:stop-session',
  ShortcutToggleArtifacts: 'cowork:shortcut:toggle-artifacts',
  ShortcutSwitchAgent: 'cowork:shortcut:switch-agent',
  ShortcutShowCurrentAgentTasks: 'cowork:shortcut:show-current-agent-tasks',
  ShortcutOpenAgentTaskSlot: 'cowork:shortcut:open-agent-task-slot',
} as const;

export type CoworkUiEvent = typeof CoworkUiEvent[keyof typeof CoworkUiEvent];

export const CoworkShortcutDirection = {
  Previous: 'previous',
  Next: 'next',
} as const;

export type CoworkShortcutDirection =
  typeof CoworkShortcutDirection[keyof typeof CoworkShortcutDirection];

export interface CoworkOpenShareOptionsEventDetail {
  sessionId: string;
}

export type CoworkSwitchAgentEventDetail = {
  direction: CoworkShortcutDirection;
};

export type CoworkOpenAgentTaskSlotEventDetail = {
  slot: number;
};
