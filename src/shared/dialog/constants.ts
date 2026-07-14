export const DialogIpc = {
  StatFile: 'dialog:statFile',
  ReadTextFile: 'dialog:readTextFile',
} as const;

export type DialogIpc = typeof DialogIpc[keyof typeof DialogIpc];
