import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, test } from 'vitest';

import WindowsAppTitleBar from './WindowsAppTitleBar';

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');

afterEach(() => {
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
    return;
  }
  Reflect.deleteProperty(globalThis, 'window');
});

const renderTitleBar = (
  platform: string,
  props: Partial<React.ComponentProps<typeof WindowsAppTitleBar>> = {},
) => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { electron: { platform } },
  });

  return renderToStaticMarkup(React.createElement(WindowsAppTitleBar, {
    onToggleSidebar: () => undefined,
    ...props,
  }));
};

describe('WindowsAppTitleBar', () => {
  test('keeps the logo at a fixed size and lets collapsed actions use their content width', () => {
    const html = renderTitleBar('win32', {
      isSidebarCollapsed: true,
      onNewChat: () => undefined,
      updateBadge: React.createElement('button', null, 'Restart to update'),
    });

    expect(html).toContain('class="h-4 w-4 max-w-none shrink-0"');
    expect(html).toContain('class="hidden text-sm font-medium text-foreground"');
    expect(html).not.toContain('style="width:220px"');
  });

  test.each([
    { sidebarWidth: 220, titleBarWidth: 196 },
    { sidebarWidth: 244, titleBarWidth: 220 },
    { sidebarWidth: 420, titleBarWidth: 396 },
  ])('keeps the expanded title bar aligned at sidebar width $sidebarWidth', ({ sidebarWidth, titleBarWidth }) => {
    const html = renderTitleBar('win32', { sidebarWidth });

    expect(html).toContain(`style="width:${titleBarWidth}px"`);
    expect(html).toContain('class="truncate text-sm font-medium text-foreground"');
  });

  test('does not render on macOS', () => {
    expect(renderTitleBar('darwin')).toBe('');
  });
});
