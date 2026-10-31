// 離線快取：先用網路取得最新版，失敗時（沒網路）改用快取。
// 每次連網打開都會把拿到的新內容存回快取，所以更新網頁時不需要改版本號；
// 只有快取的結構要整個換掉時，才需要改下面的名稱。
const CACHE = "courage";
const FILES = [
  "./",
  "index.html",
  "sleep.html",
  "books.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png"
];

self.addEventListener("install", e => {
  // cache: "reload" 略過瀏覽器的 HTTP 快取，確保預先存的是伺服器上的最新檔案
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const sameOrigin = new URL(e.request.url).origin === location.origin;
  e.respondWith(
    // 同網站的檔案向伺服器確認是否有新版，避免拿到瀏覽器 HTTP 快取裡的舊檔
    fetch(sameOrigin ? e.request.url : e.request, sameOrigin ? { cache: "no-cache" } : undefined)
      .then(res => {
        if (res.ok && sameOrigin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
