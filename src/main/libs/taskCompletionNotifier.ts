import { app, BrowserWindow, nativeImage, Notification } from 'electron';

import {
  normalizeNotificationSettings,
  type NotificationSettings,
} from '../../shared/notifications/constants';
import { APP_ATTENTION_BADGE_COLOR } from '../appConstants';
import { t } from '../i18n';

interface PendingCompletionNotification {
  sessionId: string;
  completedAt: number;
}

interface TaskCompletionNotifierOptions {
  getWindow: () => BrowserWindow | null;
  getNotificationIconPath: () => string | null;
  getNotificationSettings: () => Partial<NotificationSettings> | undefined;
  focusMainWindow: (reason: string) => void;
  openSession: (sessionId: string) => void;
  updateTrayReminder: (count: number, onClick?: () => void) => void;
}

const MAX_ACTIVE_NOTIFICATION_REFERENCES = 50;

export class TaskCompletionNotifier {
  private pendingCompletions = new Map<string, PendingCompletionNotification>();
  private activeNotifications = new Map<string, Notification>();
  private windowsOverlayIcons = new Map<string, Electron.NativeImage>();

  constructor(private readonly options: TaskCompletionNotifierOptions) {}

  handleComplete(sessionId: string): void {
    const settings = normalizeNotificationSettings(this.options.getNotificationSettings());
    if (!settings.taskCompletionNotificationsEnabled) {
      console.debug(`[TaskCompletionNotifier] skipped completed session ${sessionId} because notifications are disabled`);
      return;
    }

    if (this.pendingCompletions.has(sessionId)) {
      console.debug(`[TaskCompletionNotifier] ignored duplicate completed session notification for ${sessionId}`);
      return;
    }

    const win = this.options.getWindow();
    if (this.isWindowForeground(win)) {
      console.debug(`[TaskCompletionNotifier] skipped completed session ${sessionId} because the app is foreground`);
      return;
    }

    this.pendingCompletions.set(sessionId, {
      sessionId,
      completedAt: Date.now(),
    });
    console.log(
      `[TaskCompletionNotifier] recorded completed session notification for ${sessionId}; pending count ${this.pendingCompletions.size}`,
    );

    this.updateAttentionState();
    this.showSystemNotification(sessionId);
  }

  markSessionViewed(sessionId: string): void {
    if (!this.pendingCompletions.delete(sessionId)) return;
    this.closeNotification(sessionId);
    console.log(
      `[TaskCompletionNotifier] cleared completed session notification for ${sessionId}; pending count ${this.pendingCompletions.size}`,
    );
    this.updateAttentionState();
  }

  handleSessionDeleted(sessionId: string): void {
    if (!this.pendingCompletions.delete(sessionId)) return;
    this.closeNotification(sessionId);
    console.log(
      `[TaskCompletionNotifier] removed completed session notification for deleted session ${sessionId}; pending count ${this.pendingCompletions.size}`,
    );
    this.updateAttentionState();
  }

  clearAll(reason: string): void {
    if (this.pendingCompletions.size === 0) return;
    const count = this.pendingCompletions.size;
    this.pendingCompletions.clear();
    this.closeAllNotifications();
    console.log(`[TaskCompletionNotifier] cleared ${count} completed session notifications after ${reason}`);
    this.updateAttentionState();
  }

  private isWindowForeground(win: BrowserWindow | null): boolean {
    return !!win && !win.isDestroyed() && win.isVisible() && !win.isMinimized() && win.isFocused();
  }

  private showSystemNotification(sessionId: string): void {
    if (!Notification.isSupported()) {
      console.warn('[TaskCompletionNotifier] system notifications are not supported on this platform');
      return;
    }

    try {
      const notification = new Notification({
        title: t('taskCompletionNotificationTitle'),
        body: t('taskCompletionNotificationBody'),
        icon: this.getNotificationIcon(),
      });
      notification.on('click', () => {
        console.log(`[TaskCompletionNotifier] system notification clicked for session ${sessionId}`);
        this.activeNotifications.delete(sessionId);
        this.openPendingSession(sessionId);
      });
      this.activeNotifications.set(sessionId, notification);
      this.pruneActiveNotificationReferences();
      notification.show();
    } catch (error) {
      console.warn(`[TaskCompletionNotifier] failed to show system notification for session ${sessionId}:`, error);
    }
  }

  private updateAttentionState(): void {
    const count = this.pendingCompletions.size;
    const hasReminder = count > 0;
    this.updateDockBadge(count);
    this.updateWindowsAttention(count);
    this.options.updateTrayReminder(
      count,
      hasReminder ? () => this.openPendingSession(this.getMostRecentPendingSessionId()) : undefined,
    );
  }

  private updateDockBadge(count: number): void {
    if (process.platform !== 'darwin' || !app.dock) return;
    try {
      app.dock.setBadge(count > 0 ? String(count) : '');
    } catch (error) {
      console.warn('[TaskCompletionNotifier] failed to update Dock badge:', error);
    }
  }

  private updateWindowsAttention(count: number): void {
    if (process.platform !== 'win32') return;
    const win = this.options.getWindow();
    if (!win || win.isDestroyed()) return;
    const hasReminder = count > 0;
    try {
      win.setOverlayIcon(
        hasReminder ? this.getWindowsOverlayIcon(count) : null,
        hasReminder ? t('taskCompletionOverlayDescription') : '',
      );
      win.flashFrame(hasReminder);
    } catch (error) {
      console.warn('[TaskCompletionNotifier] failed to update Windows taskbar attention state:', error);
    }
  }

  private getNotificationIcon(): Electron.NativeImage | undefined {
    const iconPath = this.options.getNotificationIconPath();
    if (!iconPath) return undefined;
    const image = nativeImage.createFromPath(iconPath);
    return image.isEmpty() ? undefined : image;
  }

  private closeNotification(sessionId: string): void {
    const notification = this.activeNotifications.get(sessionId);
    if (!notification) return;
    this.activeNotifications.delete(sessionId);
    try {
      notification.close();
    } catch (error) {
      console.warn(`[TaskCompletionNotifier] failed to close system notification for session ${sessionId}:`, error);
    }
  }

  private closeAllNotifications(): void {
    for (const sessionId of this.activeNotifications.keys()) {
      this.closeNotification(sessionId);
    }
  }

  private pruneActiveNotificationReferences(): void {
    while (this.activeNotifications.size > MAX_ACTIVE_NOTIFICATION_REFERENCES) {
      const oldestSessionId = this.activeNotifications.keys().next().value;
      if (!oldestSessionId) return;
      this.closeNotification(oldestSessionId);
      console.warn(
        `[TaskCompletionNotifier] closed the oldest system notification because more than ${MAX_ACTIVE_NOTIFICATION_REFERENCES} notifications were active`,
      );
    }
  }

  private getWindowsOverlayIcon(count: number): Electron.NativeImage {
    const label = this.formatBadgeCount(count);
    const cachedIcon = this.windowsOverlayIcons.get(label);
    if (cachedIcon && !cachedIcon.isEmpty()) return cachedIcon;

    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">',
      `<circle cx="16" cy="16" r="15" fill="${APP_ATTENTION_BADGE_COLOR}"/>`,
      `<text x="16" y="21" text-anchor="middle" fill="#ffffff" font-size="${label.length > 2 ? 12 : 18}" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-weight="600">${label}</text>`,
      '</svg>',
    ].join('');
    const icon = nativeImage.createFromDataURL(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    );
    this.windowsOverlayIcons.set(label, icon);
    return icon;
  }

  private formatBadgeCount(count: number): string {
    return count > 99 ? '99+' : String(count);
  }

  private getMostRecentPendingSessionId(): string {
    let latest: PendingCompletionNotification | null = null;
    for (const notification of this.pendingCompletions.values()) {
      if (!latest || notification.completedAt > latest.completedAt) {
        latest = notification;
      }
    }
    return latest?.sessionId ?? '';
  }

  private openPendingSession(sessionId: string): void {
    if (!sessionId) return;
    this.options.focusMainWindow('task completion notification');
    this.options.openSession(sessionId);
  }
}
