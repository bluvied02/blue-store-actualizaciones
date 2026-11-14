// El que trabaja por detras de la TIENDA ONLINE (tienda.html), aparte del que
// usa el panel del negocio (sw.js): cada uno con lo suyo.
//   - Guarda la pagina: la segunda vez abre al instante con lo guardado y por
//     detras se baja la version nueva para la proxima.
//   - Guarda las fotos de los productos, asi no se bajan en cada visita.
// Los productos y los precios los guarda la pagina misma (cache 'tienda-datos').

const APP = 'tienda-app-v1'
const FOTOS = 'tienda-fotos-v1'
const TOPE_FOTOS = 600

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => (k.startsWith('tienda-app-') && k !== APP) || (k.startsWith('tienda-fotos-') && k !== FOTOS)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()))
})

// Lo guardado ya; por detras se baja lo nuevo y queda para la proxima.
function guardadoYRenovar (ev, nombre, clave, pedido) {
  ev.respondWith(caches.open(nombre).then((c) => c.match(clave).then((ya) => {
    const nuevo = fetch(pedido).then((resp) => {
      if (resp.ok) c.put(clave, resp.clone())
      return resp
    })
    if (!ya) return nuevo
    ev.waitUntil(nuevo.catch(() => null))
    return ya
  })))
}

// Para no llenar el celular: si hay demasiadas fotos, se van las mas viejas.
async function recortar () {
  const c = await caches.open(FOTOS)
  const ks = await c.keys()
  for (const k of ks.slice(0, Math.max(0, ks.length - TOPE_FOTOS))) await c.delete(k)
}

const renovadas = new Set()

self.addEventListener('fetch', (ev) => {
  const req = ev.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // La pagina y sus archivos (iconos, el local en 3D): sin el ?p=&s= del link.
  if (url.origin === self.location.origin) {
    const clave = req.mode === 'navigate' ? url.origin + url.pathname : req.url
    return guardadoYRenovar(ev, APP, clave, req.mode === 'navigate' ? new Request(req.url, { cache: 'no-cache' }) : req)
  }

  // Las fotos de los productos (publicas, en la nube): de lo guardado. Una
  // vez por visita se vuelve a pedir cada una, por si el local la cambio.
  if (/\.supabase\.co$/.test(url.hostname) && url.pathname.includes('/storage/v1/object/public/fotos/')) {
    ev.respondWith(caches.open(FOTOS).then((c) => c.match(req.url).then((ya) => {
      const bajar = () => fetch(req.url, { mode: 'cors', credentials: 'omit' }).then((resp) => {
        if (resp.ok) { c.put(req.url, resp.clone()); if (Math.random() < 0.02) recortar() }
        return resp
      })
      if (!ya) return bajar().catch(() => fetch(req))
      if (!renovadas.has(req.url)) { renovadas.add(req.url); ev.waitUntil(bajar().catch(() => null)) }
      return ya
    })))
    return
  }

  // La libreria del local en 3D (lleva la version en la direccion): de lo guardado.
  if (url.hostname === 'cdn.jsdelivr.net') {
    ev.respondWith(caches.open(APP).then((c) => c.match(req).then((ya) => ya || fetch(req).then((resp) => {
      if (resp.ok) c.put(req, resp.clone())
      return resp
    }))))
  }
  // Lo demas (los precios, mandar el pedido, el seguimiento) pasa directo.
})
