// El que recibe los avisos aunque la pagina este cerrada. No guarda datos:
// el panel siempre muestra lo ultimo que subieron las cajas.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (ev) => ev.waitUntil(self.clients.claim()))

self.addEventListener('push', (ev) => {
  let d = {}
  try { d = ev.data ? ev.data.json() : {} } catch (e) { d = { title: 'Aviso', body: ev.data ? ev.data.text() : '' } }
  ev.waitUntil(self.registration.showNotification(d.title || 'Aviso del negocio', {
    body: d.body || '',
    icon: 'icono-192.png',
    badge: 'icono-192.png',
    tag: d.tag || undefined,
    data: { url: './#s=avisos' }
  }))
})

self.addEventListener('notificationclick', (ev) => {
  ev.notification.close()
  ev.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
    for (const v of ventanas) if ('focus' in v) return v.focus()
    return self.clients.openWindow((ev.notification.data && ev.notification.data.url) || './')
  }))
})
