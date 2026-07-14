export const ArtifactPreviewIpc = {
  CreateSession: 'artifact:createPreviewSession',
  CreateOfficeSession: 'artifact:createOfficePreviewSession',
  DestroySession: 'artifact:destroyPreviewSession',
  ClearBrowserCookies: 'artifact:browser:clearCookies',
  ClearBrowserCache: 'artifact:browser:clearCache',
} as const;

export type ArtifactPreviewIpc = typeof ArtifactPreviewIpc[keyof typeof ArtifactPreviewIpc];

export const ArtifactPreviewProtocol = {
  LocalFile: 'localfile',
} as const;

export type ArtifactPreviewProtocol = typeof ArtifactPreviewProtocol[keyof typeof ArtifactPreviewProtocol];

export const ArtifactBrowserPartition = {
  Default: 'persist:lobster-artifact-browser',
} as const;

export type ArtifactBrowserPartition = typeof ArtifactBrowserPartition[keyof typeof ArtifactBrowserPartition];
