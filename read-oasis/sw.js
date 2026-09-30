// Author: Huy Tran
// Company: Cadence Design Systems Vietnam
// Email: huytran@cadence.com
// Created: 2026-09-27
//
// Read Oasis service worker: cache app shell + published content for offline use (R07).
// Same-origin only. No analytics, no external requests.
// VERSION is stamped automatically by tools/validate_content.py --index (content hash + shell hash); do not edit by hand.
const VERSION = 'ro-2a6c163583b1-9a4e640e';
const SHELL = ['./', 'index.html', 'parent.html', 'manifest.webmanifest', 'assets/app.css',
  'src/kid-app.mjs', 'src/parent-dashboard.mjs', 'src/progress-store.mjs', 'src/schema.mjs', 'src/ui.mjs', 'src/sync.mjs', 'src/config.mjs', 'src/auth-gate.mjs', 'src/vocab-garden.mjs', 'content/index.json'];

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
    try { // Vocabulary Garden: cache ONLY public-safe approved enrichment (manifest + letter shards +
          // approved book-page mappings + referenced assets). Never the private source lexicon, raw
          // occurrences, review queue, or editorial notes — those never ship in the app directory.
      const vm = await (await fetch('content/vocabulary/manifest.json', { cache: 'no-cache' })).json();
      const vurls = new Set(['content/vocabulary/manifest.json', 'content/vocabulary/mappings/book-page-mappings.json']);
      for (const l of vm.shards || []) vurls.add('content/vocabulary/entries/' + l + '.json');
      await Promise.all([...vurls].map(u => c.add(u).catch(() => null)));
    } catch { /* Vocabulary Garden is optional; reading still works without it */ }
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
    // Network-first for the library index and the SW itself so a new content push shows up on the very next
    // load (falls back to cache offline). Everything else is cache-first for stability.
    if (/\/(content\/index\.json|sw\.js)$/.test(url.pathname)) { const r = await net; return r || cached || new Response('Offline', { status: 503 }); }
    if (cached) { e.waitUntil(net); return cached; }
    const r = await net;
    return r || new Response('Offline and not cached', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  })());
});
