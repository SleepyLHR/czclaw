import fs from 'fs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openPath: vi.fn(),
  showItemInFolder: vi.fn(),
  quit: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(),
    quit: mocks.quit,
    relaunch: vi.fn(),
  },
  session: {
    defaultSession: {
      fetch: vi.fn(),
    },
  },
  shell: {
    openPath: mocks.openPath,
    showItemInFolder: mocks.showItemInFolder,
  },
}));

import { installUpdate } from './appUpdateInstaller';

const INSTALLER_PATH = 'C:\\Users\\test\\AppData\\Roaming\\czclaw\\updates\\lobsterai-update-manual-1.exe';

describe('Windows update install', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    mocks.openPath.mockReset();
    mocks.showItemInFolder.mockReset();
    mocks.quit.mockReset();
    Object.defineProperty(process, 'platform', { value: 'win32' });
    vi.spyOn(fs.promises, 'stat').mockResolvedValue({ size: 1024 } as fs.Stats);
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    vi.restoreAllMocks();
  });

  test('launches the installer in the foreground and quits on success', async () => {
    mocks.openPath.mockResolvedValue('');

    await installUpdate(INSTALLER_PATH);

    expect(mocks.openPath).toHaveBeenCalledWith(INSTALLER_PATH);
    expect(mocks.quit).toHaveBeenCalledOnce();
    expect(mocks.showItemInFolder).not.toHaveBeenCalled();
  });

  test('reveals the installer in Explorer and throws when launch fails', async () => {
    mocks.openPath.mockResolvedValue('The operation was canceled by the user.');

    await expect(installUpdate(INSTALLER_PATH)).rejects.toThrow(
      'The operation was canceled by the user.',
    );

    expect(mocks.showItemInFolder).toHaveBeenCalledWith(INSTALLER_PATH);
    expect(mocks.quit).not.toHaveBeenCalled();
  });

  test('rejects when the installer file is missing', async () => {
    const enoent = Object.assign(new Error('not found'), { code: 'ENOENT' });
    vi.spyOn(fs.promises, 'stat').mockRejectedValue(enoent);

    await expect(installUpdate(INSTALLER_PATH)).rejects.toThrow('Update file not found');

    expect(mocks.openPath).not.toHaveBeenCalled();
    expect(mocks.quit).not.toHaveBeenCalled();
  });
});
