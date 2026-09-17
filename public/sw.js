const CACHE_NAME = 'lastmile-v1'
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (event) => {
  if (event.request.method === 'GET') {
    event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request)
      const response = await fetch(event.request).catch(() => cached)
      if (response) cache.put(event.request, response.clone())
      return response || cached
    }))
  }
})
