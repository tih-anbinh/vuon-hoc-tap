// Author: Huy Tran
// Company: Cadence Design Systems Vietnam
// Email: huytran@cadence.com
// Created: 2026-09-27
//
// Read Oasis service worker: cache app shell + published content for offline use (R07).
// Same-origin only. No analytics, no external requests. Bump VERSION when content/index.json changes.
const VERSION = 'ro-v2';
const SHELL = ['./', 'index.html', 'parent.html', 'manifest.webmanifest', 'assets/app.css',
  'src/kid-app.mjs', 'src/parent-dashboard.mjs', 'src/progress-store.mjs', 'src/schema.mjs', 'src/ui.mjs', 'src/sync.mjs', 'src/config.mjs', 'content/index.json'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(SHELL);
    try { // precache published books + their assets
      const idx = await (await fetch('content/index.json', { cache: 'no-cache' })).json();
      const urls = new Set();
      for (const b of idx.books || []) { urls.add('content/' + b.file); for (const a of b.assets || []) urls.add('content/' + a); }
      await Promise.all([...urls].map(u => c.add(u).catch(() => null)));
    } catch { /* offline install: shell only */ }
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => { for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k); await self.clients.claim(); })());
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin || e.request.method !== 'GET') return;
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    const cached = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => null);
    if (cached) { e.waitUntil(net); return cached; }       // cache-first for stability; refresh in background
    const r = await net;
    return r || new Response('Offline and not cached', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  })());
});
