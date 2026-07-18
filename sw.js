// Service Worker for NOC Admin PWA
const CACHE_NAME = 'noc-admin-v1';
const BASE_PATH = '.';

// Files to cache - all with correct paths for GitHub Pages subdirectory
const urlsToCache = [
    `${BASE_PATH}/`,
    `${BASE_PATH}/index.html`,
    `${BASE_PATH}/manifest.json`,
    `${BASE_PATH}/css/main-style.css`,
    `${BASE_PATH}/js/main-script.js`,
    `${BASE_PATH}/images/favicon.svg`,
    `${BASE_PATH}/images/favicon-192x192.png`,
    `${BASE_PATH}/images/favicon-512x512.png`,
    `${BASE_PATH}/images/apple-touch-icon.png`,
    '${BASE_PATH}/css/bootstrap.min.css',
    '${BASE_PATH}/css/bootstrap-icons.min.css',
    '${BASE_PATH}/js/bootstrap.bundle.min.js'
];

// Install event - cache all static assets
self.addEventListener('install', event => {
    console.log('Service Worker: Installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Caching files');
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                console.log('Service Worker: Installation complete');
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('Service Worker: Cache failed', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    console.log('Service Worker: Activating...');
    
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Deleting old cache', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('Service Worker: Activation complete');
            return self.clients.claim();
        })
    );
});

// Fetch event - serve from cache first, then network
self.addEventListener('fetch', event => {
    // Skip cross-origin requests like Google Sheets API
    if (event.request.url.includes('sheets.googleapis.com') || 
        event.request.url.includes('googleapis.com') ||
        event.request.url.includes('firestore.googleapis.com')) {
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                // Return cached response if found
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                // Otherwise fetch from network
                return fetch(event.request)
                    .then(networkResponse => {
                        // Check if we received a valid response
                        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                            return networkResponse;
                        }
                        
                        // Clone the response (can only be consumed once)
                        const responseToCache = networkResponse.clone();
                        
                        // Cache the new response for future
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });
                        
                        return networkResponse;
                    })
                    .catch(error => {
                        console.log('Service Worker: Fetch failed', error);
                        
                        // Return offline page for HTML requests if needed
                        if (event.request.headers.get('accept').includes('text/html')) {
                            return caches.match(`${BASE_PATH}/index.html`);
                        }
                    });
            })
    );
});

// Handle offline fallback
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
