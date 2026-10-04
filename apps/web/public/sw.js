// Haushalt service worker (ADR-0009): Web Push only. No fetch handler and no
// caching on purpose; the app is never served from here.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Haushalt', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Haushalt', {
      body: data.body || '',
      tag: data.tag,
      icon: '/icon-192.png',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => 'focus' in w);
      if (open) return open.focus().then((w) => ('navigate' in w ? w.navigate(url) : w));
      return self.clients.openWindow(url);
    }),
  );
});
