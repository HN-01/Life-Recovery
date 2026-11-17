/* Project Rebuild Me Service Worker — Web Push & Interactive Notification Actions */

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {
    title: 'Project Rebuild Me',
    body: 'You have an upcoming scheduled activity.',
    tag: 'rebuild-me-push',
    url: '/',
    taskId: '',
    notificationId: '',
    dateStr: '',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    } catch {
      payload.body = event.data.text() || payload.body;
    }
  }

  const options = {
    body: payload.body,
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: payload.tag || 'rebuild-me-push',
    renotify: true,
    data: {
      url: payload.url || '/',
      taskId: payload.taskId || '',
      notificationId: payload.notificationId || '',
      dateStr: payload.dateStr || '',
    },
    ...(payload.taskId
      ? {
          actions: [
            { action: 'start', title: 'Start' },
            { action: 'complete', title: 'Mark Done' },
          ],
        }
      : {}),
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = event.action || 'view';
  const params = new URLSearchParams();
  if (action) params.set('notifAction', action);
  if (data.taskId) params.set('taskId', data.taskId);
  if (data.dateStr) params.set('date', data.dateStr);
  if (data.notificationId) params.set('notifId', data.notificationId);

  const baseUrl = data.url || '/';
  const targetUrl = params.toString()
    ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${params.toString()}`
    : baseUrl;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({
            type: 'NOTIFICATION_ACTION',
            action,
            taskId: data.taskId || '',
            dateStr: data.dateStr || '',
            notificationId: data.notificationId || '',
          });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
