// El que trabaja por detras de la app:
//   - Hace que el celular la deje instalar (algunos piden que abra sin internet).
//   - Guarda las pantallas (no los datos) para que abra aunque no haya señal:
//     primero pide la version nueva y, si no hay conexion, usa la guardada.
// Los datos los maneja la app (la nube, y la cola de lo anotado sin señal).

const VERSION = 'bs-produccion-1.2'
const APP = ['./', 'index.html', 'estilos.css?v=1.2', 'calculo.js?v=1.2', 'comun.js?v=1.2', 'datos.js?v=1.2', 'app.js?v=1.2', 'produccion.js?v=1.2', 'local.js?v=1.2', 'duenio.js?v=1.2', 'manifest.webmanifest', 'icono-192.png', 'icono-512.png']
const LIBRERIAS = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.min.js']

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(VERSION).then((c) => Promise.all(APP.concat(LIBRERIAS).map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (ev) => {
  const req = ev.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // La libreria (con version en la direccion): de lo guardado, y si no, de internet.
  if (url.hostname === 'cdn.jsdelivr.net') {
    ev.respondWith(caches.match(req).then((r) => r || fetch(req).then((resp) => {
      if (resp.ok) { const copia = resp.clone(); caches.open(VERSION).then((c) => c.put(req, copia)) }
      return resp
    })))
    return
  }
  // La nube (datos) nunca se guarda aca.
  if (url.origin !== self.location.origin) return
  // Las pantallas: primero internet (para tener siempre la ultima); sin señal, lo guardado.
  ev.respondWith(fetch(req).then((resp) => {
    if (resp.ok && url.pathname.indexOf('/produccion/') >= 0 && !url.pathname.endsWith('version.json') && !url.pathname.endsWith('proyecto.json')) {
      const copia = resp.clone()
      caches.open(VERSION).then((c) => c.put(req, copia))
    }
    return resp
  }).catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((r) => r || caches.match('./'))))
})
