import { PushSubscriptionRecord } from '../types';

export type BrowserPermissionState = NotificationPermission | 'unsupported';

export function getBrowserNotificationPermission(): BrowserPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return window.Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<BrowserPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    return await window.Notification.requestPermission();
  } catch {
    return window.Notification.permission;
  }
}

export function isServiceWorkerSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window.isSecureContext !== 'undefined' &&
    window.isSecureContext
  );
}

export function isPushSupported(): boolean {
  return isServiceWorkerSupported() && 'PushManager' in window;
}

let swRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export async function registerAppServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) return null;
  if (!swRegistrationPromise) {
    swRegistrationPromise = navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(async (reg) => {
        try {
          await navigator.serviceWorker.ready;
        } catch {
          // Ignore readiness errors
        }
        return reg;
      })
      .catch(() => null);
  }
  return swRegistrationPromise;
}

export async function showBrowserNotification(options: {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  taskId?: string;
  notificationId?: string;
  dateStr?: string;
}): Promise<boolean> {
  if (getBrowserNotificationPermission() !== 'granted') {
    return false;
  }

  const reg = await registerAppServiceWorker();
  if (reg && typeof reg.showNotification === 'function') {
    try {
      const notifOptions: NotificationOptions & {
        actions?: Array<{ action: string; title: string }>;
        renotify?: boolean;
      } = {
        body: options.body,
        icon: '/icon.svg',
        badge: '/icon.svg',
        tag: options.tag || `rebuild-me-${Date.now()}`,
        renotify: true,
        data: {
          url: options.url || '/',
          taskId: options.taskId,
          notificationId: options.notificationId,
          dateStr: options.dateStr,
        },
        ...(options.taskId
          ? {
              actions: [
                { action: 'start', title: 'Start' },
                { action: 'complete', title: 'Mark Done' },
              ],
            }
          : {}),
      };
      await reg.showNotification(options.title, notifOptions);
      return true;
    } catch {
      // Fall through to standard Notification constructor
    }
  }

  try {
    const n = new window.Notification(options.title, {
      body: options.body,
      icon: '/icon.svg',
      tag: options.tag,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function fetchServerVapidConfig(): Promise<{
  configured: boolean;
  publicKey: string | null;
  cronConfigured: boolean;
  message?: string;
}> {
  try {
    const resp = await fetch('/api/push/vapid-public-key', {
      headers: { Accept: 'application/json' },
    });
    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('application/json')) {
      return {
        configured: false,
        publicKey: null,
        cronConfigured: false,
        message: 'Push API endpoint did not return JSON.',
      };
    }
    return await resp.json();
  } catch {
    return {
      configured: false,
      publicKey: null,
      cronConfigured: false,
      message: 'Unable to reach Web Push configuration endpoint.',
    };
  }
}

export async function subscribeDeviceWebPush(
  publicKey: string,
  timezone: string
): Promise<PushSubscriptionRecord> {
  if (!isPushSupported()) {
    throw new Error('Web Push is not supported in this browser or non-HTTPS context.');
  }
  const perm = await requestBrowserNotificationPermission();
  if (perm !== 'granted') {
    throw new Error('Browser notification permission was denied.');
  }

  const reg = await registerAppServiceWorker();
  if (!reg) {
    throw new Error('Service Worker failed to register.');
  }

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh || '';
  const auth = json.keys?.auth || '';
  if (!json.endpoint || !p256dh || !auth) {
    throw new Error('Browser returned an incomplete PushSubscription payload.');
  }

  // Deterministic safe Firestore document ID hashed from endpoint
  const rawHash = Array.from(json.endpoint)
    .reduce((h, ch) => ((h << 5) - h + ch.charCodeAt(0)) | 0, 0)
    .toString(36)
    .replace('-', 'm');
  const now = new Date().toISOString();

  return {
    id: `push_${rawHash}`,
    endpoint: json.endpoint,
    keys: { p256dh, auth },
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 180) : undefined,
    timezone,
    createdAt: now,
    updatedAt: now,
  };
}

export async function unsubscribeDeviceWebPush(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await registerAppServiceWorker();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await sub.unsubscribe();
  }
}

export async function triggerServerTestPush(
  record: PushSubscriptionRecord,
  payload: { title: string; body: string; taskId?: string; url?: string }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const resp = await fetch('/api/push/send-test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        subscription: {
          endpoint: record.endpoint,
          keys: record.keys,
        },
        ...payload,
      }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.success) {
      return { ok: false, error: data.error || 'Failed to send test push.' };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Network error sending test push.',
    };
  }
}
