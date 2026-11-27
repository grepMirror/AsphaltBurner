// Install-only service worker: no caching, no offline support.
// The fetch listener must exist for browsers to offer installation.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
