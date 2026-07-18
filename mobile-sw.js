// Service Worker for NOC Mobile PWA
const CACHE_NAME = 'noc-mobile-v2';
const BASE_PATH = '.';

// Core assets to cache for offline support
const urlsToCache = [
    `${BASE_PATH}/`,
    `${BASE_PATH}/app.html`,
    `${BASE_PATH}/mobile-manifest.json`,
   
    `${BASE_PATH}/css/bootstrap.min.css`,
    `${BASE_PATH}/css/bootstrap-icons.min.css`,
    `https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600;14..32,700&family=Noto+Sans+Malayalam:wght@400;500&display=swap`
];

// Install event - cache essential assets
self.addEventListener('install', event => {
    console.log('[SW] Installing NOC Mobile PWA...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Caching core assets');
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                console.log('[SW] Installation complete');
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('[SW] Cache installation failed:', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    console.log('[SW] Activating...');
    
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME && cacheName.startsWith('noc-mobile-')) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('[SW] Activation complete, claiming clients');
            return self.clients.claim();
        })
    );
});

// Fetch event - network-first strategy for API/data, cache-first for static assets
self.addEventListener('fetch', event => {
    const requestUrl = event.request.url;
    
    // Skip cross-origin API calls (Google Sheets API) - let them go to network
    if (requestUrl.includes('sheets.googleapis.com') || 
        requestUrl.includes('googleapis.com') ||
        requestUrl.includes('firestore.googleapis.com')) {
        event.respondWith(fetch(event.request));
        return;
    }
    
    // For HTML navigation requests - network first with cache fallback
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Cache the fresh HTML
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                    return response;
                })
                .catch(() => {
                    // Fallback to cached index.html
                    return caches.match(`${BASE_PATH}/index.html`);
                })
        );
        return;
    }
    
    // For static assets (CSS, JS, fonts, icons) - cache first
    if (event.request.destination === 'style' || 
        event.request.destination === 'script' || 
        event.request.destination === 'font' ||
        event.request.destination === 'image') {
        event.respondWith(
            caches.match(event.request)
                .then(cachedResponse => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // Fetch and cache for future
                    return fetch(event.request).then(networkResponse => {
                        if (networkResponse && networkResponse.status === 200) {
                            const responseToCache = networkResponse.clone();
                            caches.open(CACHE_NAME).then(cache => {
                                cache.put(event.request, responseToCache);
                            });
                        }
                        return networkResponse;
                    });
                })
                .catch(() => {
                    // Return a simple offline fallback for images
                    if (event.request.destination === 'image') {
                        return new Response(
                            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#64748b"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 8h-4v4h-4v-4H6V9h4V5h4v4h4v2z"/></svg>',
                            { headers: { 'Content-Type': 'image/svg+xml' } }
                        );
                    }
                })
        );
        return;
    }
    
    // Default: network first
    event.respondWith(
        fetch(event.request)
            .catch(() => {
                return caches.match(event.request);
            })
    );
});

// Handle offline fallback messaging
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Background sync for offline actions (optional)
self.addEventListener('sync', event => {
    if (event.tag === 'menu-sync') {
        console.log('[SW] Background sync triggered');
        event.waitUntil(syncMenuData());
    }
});

async function syncMenuData() {
    // Placeholder for future offline menu sync functionality
    const cache = await caches.open(CACHE_NAME);
    const cachedMenu = await cache.match('/menu-data.json');
    if (!cachedMenu) {
        // Attempt to fetch fresh menu data
        try {
            const response = await fetch('/api/menu');
            if (response.ok) {
                await cache.put('/menu-data.json', response);
            }
        } catch (e) {
            console.log('[SW] Menu sync failed:', e);
        }
    }
}

// Push notification handler (for future enhancements)
self.addEventListener('push', event => {
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'NOC Mobile Alert';
    const options = {
        body: data.body || 'New notification from NOC Admin',
        icon: '/icons/favicon-192x192.png',
        badge: '/icons/favicon-96x96.png',
        vibrate: [200, 100, 200],
        data: {
            url: data.url || '/'
        }
    };
    
    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// Notification click handler
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    const urlToOpen = event.notification.data?.url || '/';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(windowClients => {
                // Check if there's already a window/tab open
                for (let client of windowClients) {
                    if (client.url === urlToOpen && 'focus' in client) {
                        return client.focus();
                    }
                }
                // If not, open a new window
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});
