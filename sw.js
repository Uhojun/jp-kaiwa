// 오프라인 캐시: 파일을 바꾸면 VERSION과 index.html의 ?v= 숫자를 함께 올려 주세요
const VERSION = 'jp-kaiwa-v6';
const FILES = ['./', './index.html', './data.js?v=5', './data2.js?v=5', './app.js?v=5', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// 네트워크 우선, 실패 시 캐시 (수정 사항이 바로 반영되도록)
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
