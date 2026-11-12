const CACHE = 'butceapp-shell-v19';
const SHELL = ['./', './index.html', './manifest.json?v=19', './icon.svg?v=17', './icon-192.png?v=17', './icon-512.png?v=17', './cashflow-model.js?v=17', './cashflow-forecast-ui.js?v=17', './overview-dashboard.js?v=18', './liquid-glass.css?v=19', './appearance-config.js?v=19', './budget-bridge.js', './statement-import.js', './statement-ui.js', './statement-file-reader.js', './statement-plan.js'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('butceapp-shell-') && key !== CACHE).map(key => caches.delete(key))))); self.clients.claim(); });
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => { if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put('./index.html', copy)); } return response; }).catch(() => caches.match('./index.html')));
  } else {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
  }
});
