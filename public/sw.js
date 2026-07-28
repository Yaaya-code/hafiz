/* Hafiz PWA — offline shell + runtime cache for static assets */
const CACHE = "hafiz-v3";
const PRECACHE = [
  "/",
  "/dashboard",
  "/manifest.json",
  "/icon.svg",
  "/quran",
  "/plans/journey",
  "/login",
  "/settings",
  "/mutashabihat",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Never cache API — network only; graceful offline JSON for sync/auth
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request).catch(
        () =>
          new Response(
            JSON.stringify({
              ok: false,
              mode: "local_only",
              synced: false,
              error: "offline",
              message: "offline",
            }),
            {
              headers: { "Content-Type": "application/json" },
              status: 503,
            }
          )
      )
    );
    return;
  }

  // Network-first for navigations; cache fallback to dashboard shell
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) {
            caches.open(CACHE).then((c) => c.put(event.request, copy));
          }
          return res;
        })
        .catch(() =>
          caches
            .match(event.request)
            .then(
              (c) =>
                c ||
                caches.match("/dashboard") ||
                caches.match("/") ||
                new Response("حافظ — غير متصل. افتح لوحة التحكم عند عودة الشبكة.", {
                  status: 503,
                  headers: { "Content-Type": "text/plain; charset=utf-8" },
                })
            )
        )
    );
    return;
  }

  // Stale-while-revalidate for same-origin static
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetched = fetch(event.request)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(event.request, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || fetched;
      })
    );
  }
});
