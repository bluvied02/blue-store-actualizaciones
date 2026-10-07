'use strict'
// BLUE STORE PRODUCCION: arranque, entrar y la cola sin señal.
//
// Tres maneras de usarla, segun quien entra:
//   - La chica de produccion (PIN): empieza el dia, anota lo que hace, lo que
//     llega, las mermas y lo que manda a cada local, y cierra contando a ciegas.
//   - El que recibe en un local (PIN): cuenta a ciegas lo que le llego.
//   - El dueño (email y contraseña del panel): ve todo y lo arma.
//
// Archivos: comun.js (piezas de pantalla), calculo.js (faltantes y costos),
// datos.js (la nube o la prueba), produccion.js, local.js y duenio.js.

const VERSION_APP = '1.1'
const S = {
  negocio: 'Blue Store',
  sesion: null, // { token, persona } de la chica o el que recibe
  estado: null, // lo que devuelve prod_estado
  cola: leerLocal('prod.cola', []),
  vaciando: false
}

// --- la cola: lo anotado sin señal se manda solo cuando vuelve ------------------------------
function guardarCola () { guardarLocal('prod.cola', S.cola) }
async function vaciarCola () {
  if (S.vaciando || !S.cola.length || !S.sesion) return
  S.vaciando = true
  try {
    while (S.cola.length) {
      const x = S.cola[0]
      let r
      try {
        r = x.foto ? await API.foto(S.sesion.token, x.id, x.datos) : await API.registrar(S.sesion.token, x.mov)
      } catch (e) {
        if (esDeRed(e)) break
        r = { error: e.message }
      }
      if (r && r.error === 'sesion') break
      if (r && r.error) toast('No se pudo mandar algo que quedó guardado: ' + textoError(r), 'mal', 6)
      S.cola.shift()
      guardarCola()
    }
  } finally {
    S.vaciando = false
    pintarCola()
  }
}
function pintarCola () {
  const n = document.getElementById('cola')
  if (!n) return
  n.hidden = !S.cola.length
  n.textContent = S.cola.length === 1 ? '1 cosa sin mandar (sin señal)' : S.cola.length + ' cosas sin mandar (sin señal)'
}
window.addEventListener('online', vaciarCola)
setInterval(vaciarCola, 30000)

// Anotar algo (la chica o el que recibe). Si no hay señal y se puede esperar,
// queda en la cola. Lo que necesita respuesta (numeros de piezas, abrir el dia)
// pide señal.
async function anotar (tipo, datos, opciones) {
  opciones = opciones || {}
  const mov = { id: opciones.id || uuid(), tipo, datos }
  const foto = opciones.foto
  try {
    if (foto) {
      const rf = await API.foto(S.sesion.token, foto.id, foto.datos)
      if (rf && rf.error) throw rf
    }
    const r = await API.registrar(S.sesion.token, mov)
    if (r && r.error) throw r
    return r
  } catch (e) {
    if (esDeRed(e) && opciones.puedeEsperar) {
      if (foto) S.cola.push({ foto: true, id: foto.id, datos: foto.datos })
      S.cola.push({ mov })
      guardarCola()
      pintarCola()
      return { ok: true, encolado: true }
    }
    if (e && e.error === 'sesion') { salirPersona(); throw e }
    throw e
  }
}

async function cargarEstado () {
  const r = await API.estado(S.sesion.token)
  if (r && r.error === 'sesion') { salirPersona(); throw r }
  if (r && r.error) throw r
  S.estado = r
  guardarLocal('prod.estado', r)
  return r
}

// --- arranque -------------------------------------------------------------------------------
async function arrancar () {
  aplicarTema()
  if ('serviceWorker' in navigator && !PRUEBA) navigator.serviceWorker.register('sw.js').catch(() => {})
  try {
    const r = await API.iniciar()
    S.negocio = r.negocio
  } catch (e) {
    if (e.message === 'falta_link') return pantallaMensaje('Falta el link', 'Abrí el link completo que te pasó el dueño.')
    return pantallaMensaje('Sin conexión', 'Para entrar la primera vez hace falta internet.', el('button', { clase: 'btn primario ancho grande', onclick: () => location.reload() }, 'Probar de nuevo'))
  }
  document.title = 'Producción · ' + S.negocio
  if (/type=recovery/.test(location.hash)) return pantallaNuevaClave()
  S.sesion = leerLocal('prod.sesion', null)
  if (S.sesion && S.sesion.token) return entrarPersona()
  if (leerLocal('prod.modo', 'pin') === 'duenio') {
    let email = null
    try { email = await API.sesionDuenio() } catch (e) { if (esDeRed(e)) return pantallaMensaje('Sin conexión', 'Revisá internet y probá de nuevo.', el('button', { clase: 'btn primario ancho grande', onclick: () => location.reload() }, 'Probar de nuevo')) }
    if (email) return Duenio.arrancar(email)
    if (email === false) return pantallaEntrarDuenio('Ese usuario no es el dueño.')
    return pantallaEntrarDuenio()
  }
  pantallaPin()
}

// --- entrar con PIN (teclado grande) ----------------------------------------------------------
function pantallaPin (mensaje) {
  let pin = ''
  const puntos = el('div', { clase: 'pin-puntos', 'aria-live': 'polite' })
  const error = el('div', { clase: 'error centro' }, mensaje || '')
  const pintar = () => poner(puntos, Array.from({ length: Math.max(4, pin.length) }, (_, i) => el('i', { clase: i < pin.length ? 'lleno' : '' })))
  const entrar = async () => {
    if (pin.length < 4) { error.textContent = 'El PIN tiene 4 números o más.'; return }
    error.textContent = 'Entrando…'
    try {
      const r = await API.entrarPin(pin)
      if (r && r.error) throw r
      S.sesion = { token: r.token, persona: { id: r.id, nombre: r.nombre, rol: r.rol, sucursal: r.sucursal } }
      guardarLocal('prod.sesion', S.sesion)
      entrarPersona()
    } catch (e) {
      pin = ''
      pintar()
      vibrar(120)
      error.textContent = textoError(e)
    }
  }
  const tecla = (t) => {
    vibrar(15)
    error.textContent = ''
    if (t === 'borrar') pin = pin.slice(0, -1)
    else if (t === 'ok') return entrar()
    else if (pin.length < 8) pin += t
    pintar()
  }
  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'borrar', '0', 'ok']
  poner($app, el('div', { clase: 'entrar' },
    el('img', { clase: 'logo', src: 'icono-192.png', alt: '' }),
    el('h1', {}, 'Producción'),
    el('p', {}, S.negocio + '. Entrá con tu PIN.'),
    puntos, error,
    el('div', { clase: 'teclado-pin' }, teclas.map((t) => el('button', {
      clase: 'tecla' + (t === 'ok' ? ' ok' : ''), type: 'button', 'aria-label': t === 'borrar' ? 'Borrar' : t === 'ok' ? 'Entrar' : t, onclick: () => tecla(t)
    }, t === 'borrar' ? '⌫' : t === 'ok' ? 'Entrar' : t))),
    el('button', { clase: 'btn ancho', estilo: { marginTop: '22px' }, onclick: () => { guardarLocal('prod.modo', 'duenio'); pantallaEntrarDuenio() } }, 'Soy el dueño: entrar con mail'),
    el('div', { estilo: { marginTop: '10px' } }, botonInstalar('suave')),
    PRUEBA ? el('p', { clase: 'sub centro', estilo: { marginTop: '14px' } }, 'Prueba: Mica 1234 · Duffy 2222 · Alberdi 3333') : null))
  pintar()
  const teclado = (ev) => {
    if (!document.querySelector('.teclado-pin')) return document.removeEventListener('keydown', teclado)
    if (/^[0-9]$/.test(ev.key)) tecla(ev.key)
    else if (ev.key === 'Backspace') tecla('borrar')
    else if (ev.key === 'Enter') tecla('ok')
  }
  document.addEventListener('keydown', teclado)
}

function entrarPersona () {
  const p = S.sesion.persona
  guardarLocal('prod.modo', 'pin')
  if (p.rol === 'local') return Local.arrancar()
  return Prod.arrancar()
}
function salirPersona () {
  S.sesion = null
  S.estado = null
  guardarLocal('prod.sesion', null)
  cerrarHojas()
  pantallaPin()
}

// --- entrar el dueño ----------------------------------------------------------------------------
function pantallaEntrarDuenio (mensaje) {
  const email = el('input', { type: 'email', autocomplete: 'username', placeholder: 'tu@email.com', inputmode: 'email' })
  const clave = el('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Contraseña' })
  const error = el('div', { clase: 'error' }, mensaje || '')
  email.value = leerLocal('prod.email', '') || ''
  const boton = el('button', { clase: 'btn primario ancho grande' }, 'Entrar')
  const entrar = async () => {
    error.textContent = ''
    boton.disabled = true
    boton.textContent = 'Entrando…'
    try {
      await API.entrarEmail(email.value.trim(), clave.value)
      guardarLocal('prod.email', email.value.trim())
      const quien = await API.sesionDuenio()
      if (!quien) { await API.salir(); throw new Error('Ese usuario no es el dueño.') }
      Duenio.arrancar(quien)
    } catch (e) {
      error.textContent = /invalid/i.test(e.message || '') ? 'Email o contraseña incorrectos.' : textoError(e)
    } finally {
      boton.disabled = false
      boton.textContent = 'Entrar'
    }
  }
  boton.addEventListener('click', entrar)
  clave.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') entrar() })
  const olvide = async () => {
    if (!email.value.trim()) { error.textContent = 'Escribí tu email y tocá de nuevo.'; return }
    const r = await API.recuperarClave(email.value.trim())
    error.textContent = r && r.error ? r.error.message : 'Te mandamos un mail para crear una contraseña nueva.'
  }
  poner($app, el('div', { clase: 'entrar' },
    el('img', { clase: 'logo', src: 'icono-192.png', alt: '' }),
    el('h1', {}, 'Producción'),
    el('p', {}, 'Entrá con el mismo email y contraseña del panel de ' + S.negocio + '.'),
    el('label', { clase: 'campo' }, 'Email', email),
    el('label', { clase: 'campo' }, 'Contraseña', clave),
    error, boton,
    el('p', { estilo: { marginTop: '16px', textAlign: 'center' } }, el('a', { href: '#', onclick: (ev) => { ev.preventDefault(); olvide() } }, 'Me olvidé la contraseña')),
    el('button', { clase: 'btn ancho', estilo: { marginTop: '18px' }, onclick: () => { guardarLocal('prod.modo', 'pin'); pantallaPin() } }, 'Entrar con PIN'),
    el('div', { estilo: { marginTop: '10px' } }, botonInstalar('suave'))))
  ;(email.value ? clave : email).focus()
}

function pantallaNuevaClave () {
  const clave = el('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Contraseña nueva (8 o más)' })
  const error = el('div', { clase: 'error' })
  const guardar = async () => {
    if (clave.value.length < 8) { error.textContent = 'Tiene que tener 8 o más caracteres.'; return }
    const { error: err } = await API.sb.auth.updateUser({ password: clave.value })
    if (err) { error.textContent = err.message; return }
    history.replaceState(null, '', location.pathname)
    location.reload()
  }
  poner($app, el('div', { clase: 'entrar' }, el('h1', {}, 'Contraseña nueva'), el('p', {}, 'Elegí la contraseña con la que vas a entrar.'),
    el('label', { clase: 'campo' }, 'Contraseña nueva', clave), error, el('button', { clase: 'btn primario ancho grande', onclick: guardar }, 'Guardar')))
}

// La barra de arriba de la chica y del que recibe: quien es y salir.
function barraPersona (titulo) {
  return el('div', { clase: 'arriba' },
    el('div', { clase: 'quien' }, el('div', { clase: 'negocio' }, titulo), el('div', { clase: 'sub' }, S.sesion.persona.nombre + (PRUEBA ? ' · prueba' : ''))),
    el('span', { id: 'cola', clase: 'chip alerta', hidden: true }),
    el('button', { clase: 'btn-ico', 'aria-label': 'Actualizar', onclick: () => entrarPersona() }, icono('refrescar')),
    el('button', { clase: 'btn-ico', 'aria-label': 'Salir', onclick: async () => { if (await confirmar('Salir', '¿Cerrar tu sesión en este celular? Para volver a entrar vas a necesitar tu PIN.', 'Salir')) salirPersona() } }, icono('salir')))
}

document.addEventListener('DOMContentLoaded', arrancar)
