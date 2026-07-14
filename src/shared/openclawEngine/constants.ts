export const OpenClawEngineIpc = {
  GetStatus: 'openclaw:engine:getStatus',
  Install: 'openclaw:engine:install',
  RetryInstall: 'openclaw:engine:retryInstall',
  RestartGateway: 'openclaw:engine:restartGateway',
  RepairGatewayState: 'openclaw:engine:repairGatewayState',
  OnProgress: 'openclaw:engine:onProgress',
} as const;

export type OpenClawEngineIpc =
  typeof OpenClawEngineIpc[keyof typeof OpenClawEngineIpc];

export const OpenClawEnginePhase = {
  NotInstalled: 'not_installed',
  Installing: 'installing',
  Ready: 'ready',
  Starting: 'starting',
  Running: 'running',
  Error: 'error',
} as const;

export type OpenClawEnginePhase =
  typeof OpenClawEnginePhase[keyof typeof OpenClawEnginePhase];

export const OpenClawGatewayRepairErrorCode = {
  Busy: 'busy',
  ConfigApplyPending: 'config_apply_pending',
} as const;

export type OpenClawGatewayRepairErrorCode =
  typeof OpenClawGatewayRepairErrorCode[keyof typeof OpenClawGatewayRepairErrorCode];
