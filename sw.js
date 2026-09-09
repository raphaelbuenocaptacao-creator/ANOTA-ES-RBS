const CACHE_PREFIX = 'rbs-executive-os-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v3-private-vary-range-safe`;
const OFFLINE = './index.html';
const SHELL = [
  './',
  OFFLINE,
  './manifest.json',
  './manifest.webmanifest',
  './icon-192.svg',
  './icon-512.svg',
  './icon-maskable-512.svg'
];

const SENSITIVE_QUERY_KEYS = new Set([
  'token','access_token','refresh_token','id_token','authorization','auth','password','senha','secret','key','api_key','apikey','session','code','credential','credentials'
]);

function hasSensitiveRequestHeaders(request) {
  return request.headers.has('authorization') ||
    request.headers.has('cookie') ||
    request.headers.has('range') ||
    request.headers.has('if-range');
}

function hasSensitiveQuery(url) {
  for (const key of url.searchParams.keys()) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) return true;
  }
  return false;
}

function responseIsPrivate(response) {
  if (!response || !response.ok || response.status === 206 || response.type === 'opaque' || response.redirected) return true;
  const cacheControl = (response.headers.get('cache-control') || '').toLowerCase();
  const vary = (response.headers.get('vary') || '')
    .toLowerCase()
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);

  return cacheControl.includes('private') ||
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
  if (hasSensitiveRequestHeaders(request) || hasSensitiveQuery(url) || url.search) return false;
  const relative = `.${url.pathname.replace('/ANOTA-ES-RBS', '') || '/'}`;
  return SHELL.includes(relative) || (relative === './' && SHELL.includes('./'));
}

async function precacheShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(SHELL.map(async asset => {
    try {
      const response = await fetch(asset, { cache: 'no-store', credentials: 'omit', redirect: 'error' });
      if (!responseIsPrivate(response)) await cache.put(asset, response.clone());
    } catch (error) {
      console.warn('RBS Executive OS precache skipped:', asset, error);
    }
  }));
}

self.addEventListener('install', event => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || hasSensitiveRequestHeaders(request) || hasSensitiveQuery(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store', credentials: 'same-origin', redirect: 'error' })
        .catch(() => caches.match(OFFLINE))
    );
    return;
  }

  if (!isPublicShellRequest(request, url)) return;

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: false });
    if (cached) return cached;
    const response = await fetch(request, { cache: 'no-store', credentials: 'omit', redirect: 'error' });
    if (!responseIsPrivate(response)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
