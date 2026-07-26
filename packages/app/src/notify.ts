import notifee, { AndroidCategory, AndroidImportance, EventType, type Event } from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OrbixClient, type ServerProfile } from './api';

export const CHANNEL_STATUS = 'orbix-status';
export const CHANNEL_ALERTS = 'orbix-alerts';
const ONGOING_ID = 'orbix-ongoing';

export async function setupNotifications() {
  await notifee.requestPermission();
  await notifee.createChannel({
    id: CHANNEL_STATUS,
    name: 'Task status',
    importance: AndroidImportance.LOW,
  });
  await notifee.createChannel({
    id: CHANNEL_ALERTS,
    name: 'Alerts',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibration: true,
  });
}

/** persistent low-priority notification that also anchors the foreground service */
export async function showOngoing(title: string, body: string, sessionId?: string) {
  await notifee.displayNotification({
    id: ONGOING_ID,
    title,
    body,
    data: sessionId ? { sessionId } : {},
    android: {
      channelId: CHANNEL_STATUS,
      ongoing: true,
      autoCancel: false,
      asForegroundService: true,
      category: AndroidCategory.SERVICE,
      smallIcon: 'ic_launcher',
      progress: { indeterminate: true },
      pressAction: { id: 'default' },
    },
  });
}

export async function updateOngoing(title: string, body: string, sessionId?: string) {
  await showOngoing(title, body, sessionId);
}

export async function hideOngoing() {
  try { await notifee.cancelNotification(ONGOING_ID); } catch { }
  try { await notifee.stopForegroundService(); } catch { }
}

export async function showAlert(opts: { level: 'approval' | 'done' | 'error' | 'info'; sessionId: string; title: string; body: string; requestId?: string }) {
  const isApproval = opts.level === 'approval';
  await notifee.displayNotification({
    id: `${opts.level}-${opts.sessionId}-${opts.requestId || Date.now()}`,
    title: opts.title,
    body: opts.body,
    data: { sessionId: opts.sessionId, requestId: opts.requestId || '' },
    android: {
      channelId: CHANNEL_ALERTS,
      category: isApproval ? AndroidCategory.CALL : AndroidCategory.STATUS,
      importance: AndroidImportance.HIGH,
      smallIcon: 'ic_launcher',
      pressAction: { id: 'default' },
      actions: isApproval ? [
        { title: 'Approve', pressAction: { id: 'approve' } },
        { title: 'Deny', pressAction: { id: 'deny' } },
      ] : undefined,
    },
  });
}

/** foreground service entry: keeps the RN JS runtime alive in background */
export function registerFgService(onEvent: (type: 'start' | 'stop') => void) {
  notifee.registerForegroundService(() => {
    return new Promise(() => {
      onEvent('start');
      // promise never resolves -> service keeps running until stopForegroundService
    });
  });
}

/** handle approve/deny from notification buttons (works in background) */
export async function handleNotificationEvent({ type, detail }: Event): Promise<void> {
  if (type !== EventType.ACTION_PRESS) return;
  const actionId = detail.pressAction?.id;
  if (actionId !== 'approve' && actionId !== 'deny') return;
  const { sessionId, requestId } = (detail.notification?.data || {}) as { sessionId?: string; requestId?: string };
  if (!sessionId || !requestId) return;
  try {
    const raw = await AsyncStorage.getItem('orbix-profile');
    if (!raw) return;
    const profile = JSON.parse(raw) as ServerProfile;
    const client = new OrbixClient(profile);
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => { client.close(); resolve(); }, 15000);
      client.onStatus = async (s) => {
        if (s === 'online') {
          try {
            await client.call({ cmd: 'permission.respond', sessionId, requestId, decision: actionId === 'approve' ? 'allow' : 'deny' });
            await notifee.cancelNotification(detail.notification?.id || '');
          } catch { }
          clearTimeout(t);
          client.close();
          resolve();
        }
      };
      client.connect();
    });
  } catch { }
}
