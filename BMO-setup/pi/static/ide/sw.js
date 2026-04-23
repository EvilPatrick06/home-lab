/**
 * BMO IDE — Service Worker for Push Notifications
 */

const CACHE_NAME = 'bmo-ide-v1';

// Push notification received
self.addEventListener('push', (event) => {
  let data = { title: 'BMO IDE', body: 'Task update', icon: '/static/ide/bmo-icon.png' };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/static/ide/bmo-icon.png',
    badge: '/static/ide/bmo-icon.png',
    tag: data.tag || 'bmo-ide-notification',
    data: {
      url: data.url || '/',
      jobId: data.jobId || null,
    },
    vibrate: [100, 50, 100],
    actions: data.actions || [],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/ide';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing IDE tab if open
      for (const client of windowClients) {
        if (client.url.includes('/ide') && 'focus' in client) {
          // Send job ID to the client so it can open the job chat
          if (event.notification.data?.jobId) {
            client.postMessage({
              type: 'open_job',
              jobId: event.notification.data.jobId,
            });
          }
          return client.focus();
        }
      }
      // Otherwise open a new window
      return clients.openWindow(urlToOpen);
    })
  );
});

// Install — activate immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate — claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
