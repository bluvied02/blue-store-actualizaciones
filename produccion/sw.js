// Lo minimo para que el celular la deje "agregar a la pantalla de inicio".
// No guarda nada: siempre va a la red (la app ya se las arregla sin señal).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
