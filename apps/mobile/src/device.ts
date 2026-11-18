/** Push registration (Expo) and on-device calendar import (EventKit on iOS, CalendarContract on Android). */
import * as Calendar from 'expo-calendar';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** Asks permission and registers this device's Expo push token. Returns why it didn't, if it didn't. */
export async function registerForPush(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!Device.isDevice) return { ok: false, reason: 'Push notifications need a physical device.' };
  const current = await Notifications.getPermissionsAsync();
  const status = current.granted ? current.status : (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return { ok: false, reason: 'Notifications are turned off for LifeOS in system settings.' };
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Reminders', importance: Notifications.AndroidImportance.DEFAULT });
  }
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  if (!projectId) return { ok: false, reason: 'Push needs an EAS project id (extra.eas.projectId in app.json).' };
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api('/devices', { method: 'POST', body: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' } });
  return { ok: true };
}

export interface DeviceCalendarImport {
  imported: number;
  removed: number;
}

/**
 * Reads the device calendars the user allows (iOS Calendar via EventKit) for
 * the past week and the next 60 days and sends them to LifeOS as fixed,
 * external events. Read-only: nothing is written back to the device.
 */
export async function importDeviceCalendar(): Promise<DeviceCalendarImport | { error: string }> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== 'granted') return { error: 'Calendar access was not granted.' };
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const start = new Date(Date.now() - 7 * 86_400_000);
  const end = new Date(Date.now() + 60 * 86_400_000);
  const events = calendars.length ? await Calendar.getEventsAsync(calendars.map((c) => c.id), start, end) : [];
  const payload = events
    .filter((e) => e.startDate && e.endDate)
    .slice(0, 1000)
    .map((e) => ({
      externalId: `${e.id}@${new Date(e.startDate).toISOString()}`,
      title: (e.title || '(No title)').slice(0, 300),
      location: e.location ? String(e.location).slice(0, 300) : null,
      startAt: new Date(e.startDate).toISOString(),
      endAt: new Date(e.endDate).toISOString(),
      allDay: !!e.allDay,
    }));
  return api<DeviceCalendarImport>('/integrations/apple/import', {
    method: 'POST',
    body: { from: start.toISOString(), to: end.toISOString(), events: payload },
  });
}
