export interface NotificationSettings {
  taskCompletionNotificationsEnabled: boolean;
}

export const defaultNotificationSettings: NotificationSettings = {
  taskCompletionNotificationsEnabled: true,
};

export const normalizeNotificationSettings = (
  value?: Partial<NotificationSettings> | null,
): NotificationSettings => ({
  taskCompletionNotificationsEnabled:
    typeof value?.taskCompletionNotificationsEnabled === 'boolean'
      ? value.taskCompletionNotificationsEnabled
      : defaultNotificationSettings.taskCompletionNotificationsEnabled,
});
