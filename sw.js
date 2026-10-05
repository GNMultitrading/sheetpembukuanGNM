/**
 * Service Worker — GNM Pembukuan PWA
 * ============================================================================
 * Strategi cache:
 * 1. "App shell" (5 file HTML, manifest, ikon) -- network-first: selalu coba
 *    ambil versi terbaru dulu kalau online (supaya update kode langsung
 *    kepakai begitu kamu upload ulang), fallback ke cache kalau offline.
 * 2. Library dari CDN (html2canvas, jsPDF, pdf.js, tesseract.js,
 *    qrcode-generator) -- cache-first: begitu pernah berhasil dimuat sekali,
 *    dipakai dari cache terus (jadi generator tetap jalan walau lagi offline
 *    atau CDN-nya down), TIDAK perlu internet tiap buka halaman.
 * 3. Panggilan ke Google Apps Script (CloudSync, data pembukuan) -- TIDAK
 *    PERNAH di-cache, selalu network. Ini data live, cache di sini bisa
 *    bikin kamu lihat data basi tanpa sadar.
 * ============================================================================
 */

const CACHE_VERSION = 'gnm-pwa-v1';
const APP_SHELL = [
  './',
  './Sheet_Pembukuan_GNM_CloudSync.html',
  './DO_Generator_GNM.html',
  './PO_Generator_GNM.html',
  './INV_Generator_GNM__Final_.html',
  './INV_Generator_GNM__Signed_.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './favicon-32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

function isGoogleAppsScript(url){
  return url.includes('script.google.com');
}

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Jangan pernah cache panggilan ke Apps Script -- data pembukuan harus
  // selalu live, bukan dari cache.
  if (isGoogleAppsScript(url)) {
    return; // biarkan browser handle langsung, service worker tidak ikut campur
  }

  const isNavigation = event.request.mode === 'navigate' ||
    (event.request.method === 'GET' && event.request.headers.get('accept')?.includes('text/html'));

  if (isNavigation) {
    // App shell HTML: network-first, fallback ke cache kalau offline.
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Semua request lain (termasuk library CDN cross-origin): cache-first.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        // Hanya cache response yang berhasil (termasuk opaque response dari CDN cross-origin).
        if (res && (res.status === 200 || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
