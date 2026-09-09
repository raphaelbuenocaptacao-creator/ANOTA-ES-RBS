const CACHE_NAME = 'rbs-executive-os-v2-safe-shell';
const SHELL = ['./', './index.html', './manifest.json'];

const SENSITIVE_QUERY_KEYS = [
  'token','access_token','refresh_token','id_token','authorization','auth','password','senha','secret','key','api_key','apikey','session','code'
];

function hasSensitiveRequestHeaders(request) {
  return request.headers.has('authorization') ||
    request.headers.has('cookie') ||
    request.headers.has('range') ||
    request.headers.has('if-range');
}

function hasSensitiveQuery(url) {
  for (const key of url.searchParams.keys()) {
    if (SENSITIVE_QUERY_KEYS.includes(key.toLowerCase())) return true;
  }
  return false;
}

function responseIsPrivate(response) {
  const cacheControl = (response.headers.get('cache-control') || '').toLowerCase();
  const vary = (response.headers.get('vary') || '')
    .toLowerCase()
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);

  return !response.ok ||
    response.type !== 'basic' ||
    cacheControl.includes('private') ||
    cacheControl.includes('no-store') ||
    response.headers.has('set-cookie') ||
    response.headers.has('content-range') ||
    vary.includes('*') ||
    vary.includes('cookie') ||
    vary.includes('authorization') ||
    vary.includes('range');
}

function isPublicShellRequest(request, url) {
  if (request.method !== 'GET' || url.origin !== self.location.origin) return false;
  if (hasSensitiveRequestHeaders(request) || hasSensitiveQuery(url)) return false;
  if (url.search) return false;
  const path = url.pathname.replace(/\/+$/, '/');
  return path.endsWith('/ANOTA-ES-RBS/') ||
    path.endsWith('/ANOTA-ES-RBS/index.html') ||
    path.endsWith('/ANOTA-ES-RBS/manifest.json');
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin || hasSensitiveRequestHeaders(request) || hasSensitiveQuery(url)) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (!isPublicShellRequest(request, url)) return;

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: false });
    if (cached) return cached;
    const response = await fetch(request);
    if (!responseIsPrivate(response)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
