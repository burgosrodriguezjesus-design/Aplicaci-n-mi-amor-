/**
 * Service worker de alicIA.
 *
 * Estrategias:
 *  - Navegaciones: red primero con respaldo en caché (para que la aplicación
 *    abra aunque no haya conexión).
 *  - Estáticos de Next, tipografías y el lector de escaneados: caché primero.
 *  - API: siempre red. Nunca se cachean datos privados del usuario.
 *  - Audio (`/api/audio/.../stream`): preparado para descarga offline. Solo se
 *    guarda en caché cuando la propia aplicación lo pide explícitamente con el
 *    mensaje `CACHE_AUDIO`, nunca de forma automática.
 */

const VERSION = "v4";
const SHELL_CACHE = `estudia-shell-${VERSION}`;
const STATIC_CACHE = `estudia-static-${VERSION}`;
const AUDIO_CACHE = `estudia-audio-${VERSION}`;

const SHELL_ASSETS = ["/inicio", "/biblioteca", "/subir", "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.endsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isStatic(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    // Motor y modelos de lectura de escaneados: unos MB que no cambian.
    url.pathname.startsWith("/ocr/") ||
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Audio ya descargado: se sirve desde la caché si está disponible.
  if (url.pathname.startsWith("/api/audio/")) {
    event.respondWith(
      caches.open(AUDIO_CACHE).then(async (cache) => {
        const cached = await cache.match(request, { ignoreVary: true });
        return cached ?? fetch(request);
      }),
    );
    return;
  }

  // El resto de la API siempre va a la red: son datos privados y cambiantes.
  if (url.pathname.startsWith("/api/")) return;

  if (isStatic(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return (
            cached ??
            (await caches.match("/inicio")) ??
            new Response(
              "<h1>Sin conexión</h1><p>Vuelve a intentarlo cuando recuperes la red.</p>",
              { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 },
            )
          );
        }),
    );
  }
});

/** Descarga explícita de audio para escuchar sin conexión. */
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "CACHE_AUDIO" || !Array.isArray(data.urls)) return;

  event.waitUntil(
    caches.open(AUDIO_CACHE).then(async (cache) => {
      for (const url of data.urls) {
        try {
          const response = await fetch(url);
          if (response.ok) await cache.put(url, response);
        } catch {
          /* si falla una pista, seguimos con las demás */
        }
      }
      const clients = await self.clients.matchAll();
      for (const client of clients) {
        client.postMessage({ type: "AUDIO_CACHED", count: data.urls.length });
      }
    }),
  );
});
