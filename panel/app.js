'use strict'
// EL PANEL DEL NEGOCIO
//
// Una sola pagina para el celular y para la compu de la casa. Se entra con
// email y contraseña; solo los emails autorizados (pos_admins) ven algo.
//
// Lee lo que suben las cajas cada minuto (pos_resumen, pos_datos,
// pos_catalogo, pos_avisos) y, para cambiar algo, deja una ORDEN en
// pos_ordenes: la caja de esa sucursal la toma en menos de un minuto, la
// aplica con sus propias reglas y dice como le fue. Nada se escribe directo en
// los datos de la caja.
//
// El proyecto de la nube va en el link (#p=abcd) o en proyecto.json; la clave
// publica se baja del proyecto (panel/config.json, la sube la caja).

const S = {
  sb: null,
  email: '',
  proyecto: '',
  negocio: '',
  seccion: 'hoy',
  sucursal: '',
  sucursales: [],
  cache: {},
  reloj: null,
  ordenesVivas: {}
}
const $app = document.getElementById('app')
const $tooltip = document.getElementById('tooltip')

// --- utilidades -----------------------------------------------------------------

function el (tag, props, ...hijos) {
  const n = document.createElement(tag)
  for (const k in (props || {})) {
    const v = props[k]
    if (v == null || v === false) continue
    if (k === 'clase') n.className = v
    else if (k === 'texto') n.textContent = v
    else if (k === 'estilo') Object.assign(n.style, v)
    else if (k === 'valor') n.value = v
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v)
    else n.setAttribute(k, v === true ? '' : v)
  }
  for (const h of hijos.flat(4)) if (h != null && h !== false) n.append(h instanceof Node ? h : document.createTextNode(String(h)))
  return n
}
const limpiar = (n) => { while (n.firstChild) n.removeChild(n.firstChild); return n }
// Vacia y llena, salteando lo que no va (append nativo escribe 'null' como texto).
const poner = (n, ...hijos) => { limpiar(n); for (const h of hijos.flat(4)) if (h != null && h !== false) n.append(h); return n }
const plata = (c) => '$ ' + Math.round((c || 0) / 100).toLocaleString('es-AR')
const plataExacta = (c) => (c / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const unidades = (m) => (Math.round((m || 0) / 10) / 100).toLocaleString('es-AR', { maximumFractionDigits: 2 })
const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '—')
const pct = (basis) => (basis == null ? '—' : (Math.round(basis) / 100).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + '%')
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
function fechaCorta (dia) {
  const [a, m, d] = dia.split('-').map(Number)
  return DIAS[new Date(a, m - 1, d).getDay()] + ' ' + String(d).padStart(2, '0') + '/' + String(m).padStart(2, '0')
}
function hace (iso) {
  if (!iso) return ''
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return min < 1 ? 'ahora' : min === 1 ? 'hace 1 minuto' : min < 60 ? 'hace ' + min + ' minutos' : min < 1440 ? 'hace ' + Math.round(min / 60) + ' h' : 'hace ' + Math.round(min / 1440) + ' días'
}
const hoyISO = () => { const f = new Date(); return f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') + '-' + String(f.getDate()).padStart(2, '0') }
function sumarDias (dia, n) {
  const [a, m, d] = dia.split('-').map(Number)
  const f = new Date(a, m - 1, d + n)
  return f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') + '-' + String(f.getDate()).padStart(2, '0')
}
const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const coincide = (texto, q) => { const w = sinTildes(q).split(/\s+/).filter(Boolean); const t = sinTildes(texto); return w.every((x) => t.indexOf(x) >= 0) }
const aCentavos = (txt) => { const n = Number(String(txt || '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? Math.round(n * 100) : NaN }
const aMilesimas = (txt) => { const n = Number(String(txt || '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 1000) : NaN }

function toast (texto, segundos = 3.5) {
  const t = el('div', { clase: 'aviso-toast', role: 'status' }, texto)
  document.body.append(t)
  setTimeout(() => t.remove(), segundos * 1000)
}

// Cuanto cambio contra antes: flecha, porcentaje y palabra (nunca solo color).
function delta (actual, antes, alReves) {
  if (antes == null || actual == null) return null
  if (!antes) return actual ? el('span', { clase: 'delta igual' }, 'antes 0') : null
  const dif = actual - antes
  if (!dif) return el('span', { clase: 'delta igual' }, '= igual')
  const p = Math.round(dif * 1000 / Math.abs(antes)) / 10
  const bueno = alReves ? dif < 0 : dif > 0
  return el('span', { clase: 'delta ' + (bueno ? 'sube' : 'baja') }, (dif > 0 ? '▲ +' : '▼ ') + p.toLocaleString('es-AR') + '% vs antes')
}

function tile (rotulo, valor, detalle, extra, grande) {
  return el('div', { clase: 'tile' + (grande ? ' grande' : '') },
    el('div', { clase: 'r' }, rotulo), el('div', { clase: 'v num' }, valor),
    detalle ? el('div', { clase: 'd' }, detalle) : null, extra || null)
}

// Barras de una sola serie, con su dato al pasar el dedo o el mouse.
function barras (items, textoDe, rotuloEje) {
  const max = Math.max(1, ...items.map((x) => x.v))
  const cont = el('div', { clase: 'barras' })
  const eje = el('div', { clase: 'eje' })
  items.forEach((x, i) => {
    const mostrar = (ev) => {
      $tooltip.textContent = textoDe(x)
      $tooltip.style.display = 'block'
      const pt = ev.touches ? ev.touches[0] : ev
      $tooltip.style.left = Math.min(window.innerWidth - $tooltip.offsetWidth - 8, Math.max(8, pt.clientX - $tooltip.offsetWidth / 2)) + 'px'
      $tooltip.style.top = Math.max(8, pt.clientY - 42) + 'px'
    }
    cont.append(el('div', {
      clase: 'b' + (x.v ? '' : ' vacia'),
      estilo: { height: (x.v ? Math.max(2, x.v / max * 100) : 0) + '%' },
      title: textoDe(x),
      onmousemove: mostrar,
      ontouchstart: mostrar,
      onmouseleave: () => { $tooltip.style.display = 'none' },
      ontouchend: () => setTimeout(() => { $tooltip.style.display = 'none' }, 1200)
    }))
    eje.append(el('span', {}, rotuloEje(x, i)))
  })
  return el('div', {}, cont, eje)
}

// --- la nube ------------------------------------------------------------------

async function leerDatos (clave) {
  const k = 'datos:' + clave
  const c = S.cache[k]
  if (c && Date.now() - c.t < 45000) return c.v
  const { data, error } = await S.sb.from('pos_datos').select('sucursal_id,nombre,actualizado,datos').eq('clave', clave)
  if (error) throw error
  const v = {}
  for (const f of data || []) v[f.sucursal_id] = f
  S.cache[k] = { t: Date.now(), v }
  return v
}

async function leerCatalogo (sucursalId, forzar) {
  const k = 'catalogo:' + sucursalId
  const c = S.cache[k]
  if (!forzar && c && Date.now() - c.t < 60000) return c.v
  const filas = []
  for (let desde = 0; desde < 20000; desde += 1000) {
    const { data, error } = await S.sb.from('pos_catalogo').select('producto_id,datos').eq('sucursal_id', sucursalId).range(desde, desde + 999)
    if (error) throw error
    filas.push(...data)
    if (data.length < 1000) break
  }
  const v = filas.map((f) => Object.assign({ id: f.producto_id }, f.datos))
  S.cache[k] = { t: Date.now(), v }
  return v
}

// Deja una orden para la caja y sigue su estado hasta que la aplique.
async function mandarOrden (sucursalId, tipo, datos, alTerminar) {
  const { data, error } = await S.sb.from('pos_ordenes').insert({ sucursal_id: sucursalId, tipo, datos }).select('id').single()
  if (error) { toast('No se pudo mandar: ' + error.message, 6); return null }
  toast('Enviado. La caja lo aplica en menos de un minuto.')
  seguirOrden(data.id, alTerminar)
  return data.id
}

function seguirOrden (id, alTerminar) {
  let vueltas = 0
  const mirar = async () => {
    vueltas++
    const { data } = await S.sb.from('pos_ordenes').select('estado,resultado').eq('id', id).single()
    if (data && data.estado !== 'pendiente') {
      if (data.estado === 'aplicada') toast('✓ La caja lo aplicó' + (data.resultado && data.resultado.mensaje ? ': ' + data.resultado.mensaje : ''), 5)
      else toast('✗ La caja no lo pudo hacer: ' + ((data.resultado && data.resultado.error) || 'error'), 8)
      S.cache = {}
      if (alTerminar) alTerminar(data)
      return
    }
    if (vueltas < 40) setTimeout(mirar, 5000)
  }
  setTimeout(mirar, 4000)
}

// --- arranque --------------------------------------------------------------------

async function proyectoRef () {
  const m = /[#&]p=([a-z0-9]+)/.exec(location.hash)
  if (m) { try { localStorage.setItem('bs.proyecto', m[1]) } catch (e) {} return m[1] }
  try { const x = localStorage.getItem('bs.proyecto'); if (x) return x } catch (e) {}
  // La app del celular (en la pantalla de inicio) no siempre trae el link.
  try { const r = await fetch('proyecto.json', { cache: 'no-store' }); if (r.ok) return (await r.json()).ref } catch (e) {}
  return ''
}

async function arrancar () {
  aplicarTema()
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {})
  S.proyecto = await proyectoRef()
  if (!S.proyecto) return pantallaMensaje('Falta el link', 'Abrí el link completo que te dio el programa de la caja (Configuración → Ver desde el celular).')
  const base = 'https://' + S.proyecto + '.supabase.co'
  let conf
  try {
    const r = await fetch(base + '/storage/v1/object/public/panel/config.json', { cache: 'no-store' })
    if (!r.ok) throw new Error('Falta publicar la página desde la caja (' + r.status + ').')
    conf = await r.json()
  } catch (err) { return pantallaMensaje('Sin conexión', err.message, true) }
  S.negocio = conf.nombre || conf.negocio || 'Mi negocio'
  document.title = 'Panel · ' + S.negocio
  S.sb = window.supabase.createClient(base, conf.anon, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'bs-panel', detectSessionInUrl: true } })
  S.sb.auth.onAuthStateChange((evento) => { if (evento === 'PASSWORD_RECOVERY') pantallaNuevaClave() })
  const { data } = await S.sb.auth.getSession()
  if (/type=recovery/.test(location.hash)) return
  if (!data.session) return pantallaEntrar()
  entrarAlPanel(data.session)
}

function pantallaMensaje (titulo, texto, reintentar) {
  poner($app, el('div', { clase: 'entrar' }, el('h1', {}, titulo), el('p', {}, texto),
    reintentar ? el('button', { clase: 'btn primario ancho', onclick: () => location.reload() }, 'Probar de nuevo') : null))
}

function pantallaEntrar (mensaje) {
  const email = el('input', { type: 'email', autocomplete: 'username', placeholder: 'tu@email.com', inputmode: 'email' })
  const clave = el('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Contraseña' })
  const error = el('div', { clase: 'error' }, mensaje || '')
  try { email.value = localStorage.getItem('bs.email') || '' } catch (e) {}
  const entrar = async () => {
    error.textContent = ''
    const { data, error: err } = await S.sb.auth.signInWithPassword({ email: email.value.trim(), password: clave.value })
    if (err) { error.textContent = /invalid/i.test(err.message) ? 'Email o contraseña incorrectos.' : err.message; return }
    try { localStorage.setItem('bs.email', email.value.trim()) } catch (e) {}
    entrarAlPanel(data.session)
  }
  const olvide = async () => {
    if (!email.value.trim()) { error.textContent = 'Escribí tu email y tocá de nuevo.'; return }
    const { error: err } = await S.sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: location.origin + location.pathname })
    error.textContent = err ? err.message : 'Te mandamos un mail para crear una contraseña nueva. Abrilo en este mismo celular o compu.'
  }
  clave.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') entrar() })
  poner($app, el('div', { clase: 'entrar' },
    el('h1', {}, S.negocio),
    el('p', {}, 'Entrá con tu email y tu contraseña.'),
    el('label', { clase: 'campo' }, 'Email', email),
    el('label', { clase: 'campo' }, 'Contraseña', clave),
    error,
    el('button', { clase: 'btn primario ancho', onclick: entrar }, 'Entrar'),
    el('p', { estilo: { marginTop: '14px', textAlign: 'center' } }, el('a', { href: '#', onclick: (ev) => { ev.preventDefault(); olvide() } }, 'Me olvidé la contraseña'))))
  ;(email.value ? clave : email).focus()
}

function pantallaNuevaClave () {
  const clave = el('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Contraseña nueva (8 o más)' })
  const error = el('div', { clase: 'error' })
  const guardar = async () => {
    if (clave.value.length < 8) { error.textContent = 'Tiene que tener 8 o más caracteres.'; return }
    const { error: err } = await S.sb.auth.updateUser({ password: clave.value })
    if (err) { error.textContent = err.message; return }
    history.replaceState(null, '', location.pathname)
    toast('Contraseña cambiada')
    const { data } = await S.sb.auth.getSession()
    entrarAlPanel(data.session)
  }
  poner($app, el('div', { clase: 'entrar' },
    el('h1', {}, 'Contraseña nueva'), el('p', {}, 'Elegí la contraseña con la que vas a entrar al panel.'),
    el('label', { clase: 'campo' }, 'Contraseña nueva', clave), error,
    el('button', { clase: 'btn primario ancho', onclick: guardar }, 'Guardar')))
  clave.focus()
}

async function entrarAlPanel (sesion) {
  S.email = (sesion && sesion.user && sesion.user.email) || ''
  const { data: admin } = await S.sb.from('pos_admins').select('email').limit(1)
  if (!admin || !admin.length) {
    return pantallaMensaje('Sin permiso', 'El usuario ' + S.email + ' no está autorizado para ver el panel. Pedile al dueño que lo agregue.')
  }
  const { data: filas } = await S.sb.from('pos_resumen').select('sucursal_id,nombre').order('nombre')
  S.sucursales = (filas || []).map((f) => ({ id: f.sucursal_id, nombre: f.nombre }))
  try { S.sucursal = localStorage.getItem('bs.sucursal') || '' } catch (e) {}
  if (!S.sucursales.some((x) => x.id === S.sucursal)) S.sucursal = S.sucursales[0] ? S.sucursales[0].id : ''
  const m = /[#&]s=([a-z]+)/.exec(location.hash)
  if (m && SECCIONES[m[1]]) S.seccion = m[1]
  pintarArmazon()
  ir(S.seccion)
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.seccion === 'hoy') ir('hoy') })
  contarAvisos()
}

// --- armazon y navegacion ------------------------------------------------------------

const SECCIONES = {
  hoy: { nombre: 'Hoy', ic: '●', fn: () => secHoy() },
  ventas: { nombre: 'Ventas', ic: '▤', fn: () => secVentas() },
  cierres: { nombre: 'Cierres de caja', corto: 'Cierres', ic: '☰', fn: () => secCierres() },
  faltantes: { nombre: 'Faltantes', ic: '!', fn: () => secFaltantes() },
  pedidos: { nombre: 'Pedidos', ic: '⇪', fn: () => secPedidos() },
  productos: { nombre: 'Productos', ic: '▦', fn: () => secProductos() },
  promos: { nombre: 'Promos', ic: '%', fn: () => secPromos() },
  avisos: { nombre: 'Avisos', ic: '◉', fn: () => secAvisos() },
  mas: { nombre: 'Más', ic: '⋯', fn: () => secMas(), soloCelular: true }
}
const ABAJO = ['hoy', 'ventas', 'pedidos', 'productos', 'mas']

function pintarArmazon () {
  const lado = el('nav', { clase: 'lado' },
    el('div', { clase: 'marca' }, S.negocio),
    Object.entries(SECCIONES).filter(([, s]) => !s.soloCelular).map(([id, s]) => el('button', { 'data-sec': id, onclick: () => ir(id) }, el('span', {}, s.ic), s.nombre, id === 'avisos' ? el('span', { clase: 'insignia', 'data-insignia': '', estilo: { display: 'none' } }) : null)),
    el('div', { clase: 'pie-lado' }, S.email, el('br'), el('a', { href: '#', onclick: (ev) => { ev.preventDefault(); salir() } }, 'Salir')))
  const abajo = el('nav', { clase: 'abajo' }, ABAJO.map((id) => el('button', { 'data-sec': id, onclick: () => ir(id) },
    el('span', { clase: 'ic' }, SECCIONES[id].ic), SECCIONES[id].corto || SECCIONES[id].nombre,
    id === 'mas' ? el('span', { clase: 'insignia', 'data-insignia': '', estilo: { display: 'none' } }) : null)))
  S.main = el('main', {})
  poner($app, el('div', { clase: 'app' }, lado, S.main), abajo)
}

function ir (id) {
  S.seccion = id
  clearInterval(S.reloj)
  for (const b of document.querySelectorAll('[data-sec]')) {
    const activo = b.dataset.sec === id || (b.closest('.abajo') && id !== 'hoy' && !ABAJO.includes(id) && b.dataset.sec === 'mas')
    b.classList.toggle('activo', !!activo)
  }
  S.main.classList.add('cargando')
  Promise.resolve(SECCIONES[id].fn()).catch((err) => {
    poner(S.main, el('div', { clase: 'caja' }, el('div', { clase: 'nada' }, 'No se pudo cargar: ' + (err.message || err))))
  }).finally(() => S.main.classList.remove('cargando'))
  window.scrollTo(0, 0)
}

async function salir () {
  await S.sb.auth.signOut()
  pantallaEntrar()
}

// Elegir sucursal (en las secciones de una sola).
function elegirSucursal (alCambiar) {
  if (S.sucursales.length < 2) return null
  return el('div', { clase: 'seg' }, S.sucursales.map((x) => el('button', {
    clase: S.sucursal === x.id ? 'activo' : '',
    onclick: () => { S.sucursal = x.id; try { localStorage.setItem('bs.sucursal', x.id) } catch (e) {} alCambiar() }
  }, x.nombre)))
}

function cabecera (titulo, sub, ...derecha) {
  return el('div', { clase: 'cabecera' }, el('div', {}, el('h1', {}, titulo), sub ? el('div', { clase: 'sub' }, sub) : null), el('div', { clase: 'chips' }, derecha))
}

function nombreSucursal (id) { return (S.sucursales.find((x) => x.id === id) || {}).nombre || 'Sucursal' }

// --- HOY -----------------------------------------------------------------------------

async function secHoy () {
  const { data, error } = await S.sb.from('pos_resumen').select('*').order('nombre')
  if (error) throw error
  const filas = data || []
  const total = filas.reduce((s, f) => s + ((f.datos || {}).total || 0), 0)
  const ventas = filas.reduce((s, f) => s + ((f.datos || {}).ventas || 0), 0)
  const masViejo = filas.map((f) => f.actualizado).sort()[0]
  const atrasado = masViejo && Date.now() - new Date(masViejo).getTime() > 5 * 60000
  const anul = await leerDatos('anulaciones').catch(() => ({}))
  const pedidosAnular = Object.values(anul).reduce((s, x) => s + ((x.datos || []).length), 0)

  poner(S.main, 
    cabecera('Hoy', (atrasado ? '⚠ Datos atrasados · ' : 'En vivo · ') + (masViejo ? hace(masViejo) : 'sin datos'),
      el('button', { clase: 'btn chico', onclick: () => ir('hoy') }, 'Actualizar')),
    pedidosAnular ? el('div', { clase: 'aviso-caja alerta' }, el('b', {}, pedidosAnular + (pedidosAnular === 1 ? ' venta a cuenta para anular' : ' ventas a cuenta para anular')), ' · ',
      el('a', { href: '#', onclick: (ev) => { ev.preventDefault(); ir('avisos') } }, 'Ver')) : null,
    el('div', { clase: 'tiles' }, tile('Vendido hoy · ' + (filas.length === 1 ? filas[0].nombre : 'todas'), plata(total), ventas + (ventas === 1 ? ' venta' : ' ventas'), null, true)),
    el('div', { clase: 'grilla' }, filas.map(tarjetaLocal)))
  if (!filas.length) S.main.append(el('div', { clase: 'caja' }, el('div', { clase: 'nada' }, 'Todavía no subió ninguna caja.')))
  S.reloj = setInterval(() => { if (!document.hidden && S.seccion === 'hoy') ir('hoy') }, 60000)
}

function tarjetaLocal (fila) {
  const d = fila.datos || {}
  const c = d.caja || {}
  const alertas = []
  if (!c.abierta) alertas.push(el('span', { clase: 'chip mal' }, 'Caja cerrada'))
  if (d.stock && d.stock.negativos) alertas.push(el('span', { clase: 'chip mal' }, d.stock.negativos + ' en negativo'))
  if (d.stock && d.stock.bajoMinimo) alertas.push(el('span', { clase: 'chip alerta' }, d.stock.bajoMinimo + ' bajo el mínimo'))
  if (d.vencimientos && d.vencimientos.vencidos) alertas.push(el('span', { clase: 'chip mal' }, d.vencimientos.vencidos + ' vencidos'))
  if (d.suspendidas) alertas.push(el('span', { clase: 'chip' }, d.suspendidas + ' en espera'))
  if (!alertas.length) alertas.push(el('span', { clase: 'chip ok' }, 'Todo en orden'))
  const color = { verde: 'ok', amarillo: 'alerta', rojo: 'mal' }
  const personal = d.personal || {}
  const horas = (d.porHora || []).map((x, h) => ({ h, v: x[0], n: x[1] }))
  const hasta = new Date().getHours()
  return el('div', { clase: 'caja' },
    el('h2', {}, fila.nombre),
    el('div', { clase: 'sub' }, c.abierta ? 'Turno de ' + (c.usuario || '—') + ' desde las ' + hora(c.desde) + ' · caja ' + (c.terminal || '') : 'Sin turno abierto', ' · ', hace(fila.actualizado)),
    el('div', { clase: 'num', estilo: { fontSize: '28px', fontWeight: '750', marginTop: '8px' } }, plata(d.total)),
    el('div', { clase: 'sub' }, (d.ventas || 0) + ' ventas · ticket ' + plata(d.ticketPromedio) + (d.ultimaVenta ? ' · última ' + hora(d.ultimaVenta) : '')),
    horas.length && d.total ? barras(horas.filter((x) => x.h <= hasta || x.v), (x) => String(x.h).padStart(2, '0') + ':00 · ' + plata(x.v) + ' · ' + x.n + ' ventas', (x) => (x.h % 3 === 0 ? String(x.h) : '')) : null,
    el('div', { clase: 'cuatro' },
      el('div', { clase: 'mini' }, el('div', { clase: 'r' }, 'Última hora'), el('div', { clase: 'v' }, plata(d.ultimaHora))),
      el('div', { clase: 'mini' }, el('div', { clase: 'r' }, 'En el cajón'), el('div', { clase: 'v' }, c.abierta ? plata(c.efectivoEsperado) : '—')),
      el('div', { clase: 'mini' }, el('div', { clase: 'r' }, 'Gastos del día'), el('div', { clase: 'v' }, plata(d.gastosDia))),
      el('div', { clase: 'mini' }, el('div', { clase: 'r' }, 'Te deben'), el('div', { clase: 'v' }, plata((d.deuda || {}).total)))),
    (personal.trabajando || []).length || (personal.faltan || []).length ? el('h3', {}, 'Personal') : null,
    (personal.trabajando || []).map((x) => el('div', { clase: 'fila' }, el('span', { clase: 'izq' }, x.nombre + ' · desde ' + hora(x.desde)), el('span', { clase: 'chip ' + (color[x.color] || '') }, x.texto))),
    (personal.faltan || []).map((x) => el('div', { clase: 'fila' }, el('span', { clase: 'izq' }, x.nombre), el('span', { clase: 'chip ' + (color[x.color] || 'mal') }, x.texto))),
    (d.medios || []).length ? el('h3', {}, 'Cómo pagaron') : null,
    (d.medios || []).map((m) => el('div', { clase: 'fila' }, el('span', { clase: 'tenue' }, m.nombre), el('b', { clase: 'num' }, plata(m.importe)))),
    (d.top || []).length ? el('h3', {}, 'Lo más vendido') : null,
    (d.top || []).map((p) => el('div', { clase: 'fila' }, el('span', { clase: 'izq tenue' }, p.descripcion), el('b', { clase: 'num' }, unidades(p.unidades)))),
    el('div', { clase: 'chips', estilo: { marginTop: '10px' } }, alertas))
}

// --- VENTAS (dias anteriores) -------------------------------------------------------------

const PERIODOS = [['ayer', 'Ayer'], ['7', '7 días'], ['30', '30 días'], ['mes', 'Este mes'], ['mesPasado', 'Mes pasado'], ['anio', 'Este año']]

function rangoDe (p) {
  const hoy = hoyISO()
  if (p === 'ayer') return { desde: sumarDias(hoy, -1), hasta: sumarDias(hoy, -1) }
  if (p === '7') return { desde: sumarDias(hoy, -6), hasta: hoy }
  if (p === '30') return { desde: sumarDias(hoy, -29), hasta: hoy }
  if (p === 'mes') return { desde: hoy.slice(0, 8) + '01', hasta: hoy }
  if (p === 'mesPasado') {
    const [a, m] = hoy.split('-').map(Number)
    const f = new Date(a, m - 2, 1)
    const ini = f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') + '-01'
    return { desde: ini, hasta: sumarDias(hoy.slice(0, 8) + '01', -1) }
  }
  return { desde: hoy.slice(0, 4) + '-01-01', hasta: hoy }
}

function largoDias (r) { let n = 0; for (let d = r.desde; d <= r.hasta && n < 800; d = sumarDias(d, 1)) n++; return n }

async function secVentas () {
  S.periodo = S.periodo || '7'
  const hist = await leerDatos('historial')
  const r = rangoDe(S.periodo)
  const largo = largoDias(r)
  const ant = { desde: sumarDias(r.desde, -largo), hasta: sumarDias(r.desde, -1) }
  const anioAntes = (d) => (Number(d.slice(0, 4)) - 1) + d.slice(4)
  const suc = Object.entries(hist)
  const sumar = (dias, rango) => {
    const x = { total: 0, ventas: 0, costo: 0, dias: 0, medios: {}, sinCosto: false }
    for (const d of dias) {
      if (d.dia < rango.desde || d.dia > rango.hasta) continue
      x.total += d.total; x.ventas += d.ventas; x.costo += d.costo || 0; x.dias++
      if (d.gc) x.sinCosto = true
      for (const [m, v] of Object.entries(d.medios || {})) x.medios[m] = (x.medios[m] || 0) + v
    }
    return x
  }
  const porSuc = suc.map(([id, f]) => ({ id, nombre: f.nombre, act: sumar(f.datos, r), ant: sumar(f.datos, ant), pasado: sumar(f.datos, { desde: anioAntes(r.desde), hasta: anioAntes(r.hasta) }) }))
  const tot = (k, campo) => porSuc.reduce((s, x) => s + x[k][campo], 0)
  const total = tot('act', 'total')
  const tickets = tot('act', 'ventas')
  const ganancia = porSuc.some((x) => x.act.sinCosto) ? null : total - tot('act', 'costo')
  const totalAnt = tot('ant', 'total')
  const ticketsAnt = tot('ant', 'ventas')
  const pasado = tot('pasado', 'total')

  // Dia por dia, las sucursales sumadas.
  const dias = {}
  for (const [, f] of suc) for (const d of f.datos) if (d.dia >= r.desde && d.dia <= r.hasta) {
    const x = dias[d.dia] || (dias[d.dia] = { dia: d.dia, v: 0, n: 0, suc: [] })
    x.v += d.total; x.n += d.ventas; x.suc.push(f.nombre + ' ' + plata(d.total))
  }
  const lista = []
  for (let d = r.desde, n = 0; d <= r.hasta && n < 400; d = sumarDias(d, 1), n++) lista.push(dias[d] || { dia: d, v: 0, n: 0, suc: [] })
  const mejor = lista.reduce((a, b) => (b.v > (a ? a.v : 0) ? b : a), null)
  const medios = {}
  for (const x of porSuc) for (const [m, v] of Object.entries(x.act.medios)) medios[m] = (medios[m] || 0) + v
  const NOMBRES = { efectivo: 'Efectivo', mercado_pago: 'Mercado Pago', debito: 'Débito', credito: 'Crédito', transferencia: 'Transferencia', qr: 'QR otras billeteras', cuenta_corriente: 'Cuenta corriente' }

  poner(S.main, 
    cabecera('Ventas', r.desde === r.hasta ? fechaCorta(r.desde) : fechaCorta(r.desde) + ' al ' + fechaCorta(r.hasta) + ' · contra los ' + largo + ' días anteriores'),
    el('div', { clase: 'seg', estilo: { marginBottom: '12px' } }, PERIODOS.map(([id, t]) => el('button', { clase: S.periodo === id ? 'activo' : '', onclick: () => { S.periodo = id; ir('ventas') } }, t))),
    el('div', { clase: 'tiles' },
      tile('Vendido', plata(total), tickets + ' ventas', delta(total, totalAnt), true),
      tile('Ticket promedio', plata(tickets ? total / tickets : 0), null, delta(tickets ? total / tickets : 0, ticketsAnt ? totalAnt / ticketsAnt : 0)),
      tile('Ventas (tickets)', String(tickets), null, delta(tickets, ticketsAnt)),
      ganancia != null ? tile('Ganancia bruta', plata(ganancia), total ? 'vendido menos lo que costaba' : null) : null,
      pasado ? tile('El año pasado', plata(pasado), 'mismo período', delta(total, pasado)) : null),
    lista.length > 1 ? el('div', { clase: 'caja' }, el('h2', {}, 'Día por día'),
      barras(lista, (x) => fechaCorta(x.dia) + ' · ' + plata(x.v) + (x.suc.length > 1 ? ' (' + x.suc.join(' · ') + ')' : ''), (x, i) => (lista.length <= 10 || i % Math.ceil(lista.length / 8) === 0 ? x.dia.slice(8, 10) : '')),
      mejor && mejor.v ? el('div', { clase: 'sub', estilo: { marginTop: '8px' } }, 'Mejor día: ' + fechaCorta(mejor.dia) + ' · ' + plata(mejor.v)) : null) : null,
    el('div', { clase: 'grilla' },
      el('div', { clase: 'caja' }, el('h2', {}, 'Por sucursal'),
        el('div', { clase: 'scroll-x' }, el('table', {},
          el('thead', {}, el('tr', {}, el('th', {}, 'Sucursal'), el('th', { clase: 'num' }, 'Vendido'), el('th', {}, ''), el('th', { clase: 'num' }, 'Tickets'), el('th', { clase: 'num' }, 'Ticket'))),
          el('tbody', {}, porSuc.map((x) => el('tr', {},
            el('td', {}, el('b', {}, x.nombre)), el('td', { clase: 'num' }, plata(x.act.total)), el('td', {}, delta(x.act.total, x.ant.total)),
            el('td', { clase: 'num' }, String(x.act.ventas)), el('td', { clase: 'num' }, plata(x.act.ventas ? x.act.total / x.act.ventas : 0)))))))),
      Object.keys(medios).length ? el('div', { clase: 'caja' }, el('h2', {}, 'Cómo pagaron'),
        Object.entries(medios).sort((a, b) => b[1] - a[1]).map(([m, v]) => el('div', { clase: 'fila' }, el('span', { clase: 'tenue' }, NOMBRES[m] || m),
          el('span', { clase: 'der' }, el('b', { clase: 'num' }, plata(v)), el('span', { clase: 'sub' }, '  ' + (total ? Math.round(v * 100 / total) : 0) + '%'))))) : null))
}

// --- CIERRES DE CAJA ----------------------------------------------------------------

async function secCierres () {
  const datos = await leerDatos('cierres')
  S.filtroCierres = S.filtroCierres || ''
  const todos = []
  for (const [id, f] of Object.entries(datos)) for (const c of f.datos || []) todos.push(Object.assign({ sucursal: f.nombre, sucursalId: id }, c))
  todos.sort((a, b) => String(b.cerradaEn).localeCompare(String(a.cerradaEn)))
  const lista = todos.filter((c) => !S.filtroCierres || c.sucursalId === S.filtroCierres)
  const conDif = lista.filter((c) => c.fueraDeTolerancia)
  const faltante = lista.filter((c) => c.diferencia < 0).reduce((s, c) => s + c.diferencia, 0)
  const chip = (c) => {
    if (typeof c.diferencia !== 'number') return el('span', { clase: 'chip' }, 'sin contar')
    if (!c.fueraDeTolerancia) return el('span', { clase: 'chip ok' }, '✓ Cerró bien' + (c.diferencia ? ' (' + (c.diferencia > 0 ? '+' : '−') + plata(Math.abs(c.diferencia)) + ')' : ''))
    return el('span', { clase: 'chip ' + (c.diferencia < 0 ? 'mal' : 'alerta') }, (c.diferencia < 0 ? '▼ Faltaron ' : '▲ Sobraron ') + plata(Math.abs(c.diferencia)))
  }
  poner(S.main, 
    cabecera('Cierres de caja', 'Cada turno cerrado: lo que tendría que haber y lo que contaron'),
    S.sucursales.length > 1 ? el('div', { clase: 'seg', estilo: { marginBottom: '12px' } },
      el('button', { clase: !S.filtroCierres ? 'activo' : '', onclick: () => { S.filtroCierres = ''; ir('cierres') } }, 'Todas'),
      S.sucursales.map((x) => el('button', { clase: S.filtroCierres === x.id ? 'activo' : '', onclick: () => { S.filtroCierres = x.id; ir('cierres') } }, x.nombre))) : null,
    el('div', { clase: 'tiles' },
      tile('Cierres', String(lista.length), 'los últimos'),
      tile('Con diferencia', String(conDif.length), conDif.length ? 'fuera de la tolerancia' : 'todos cerraron bien'),
      tile('Faltantes sumados', plata(Math.abs(faltante)), faltante ? 'lo que faltó en total' : 'nada')),
    lista.length ? el('div', { clase: 'caja' }, lista.map((c) => {
      const detalle = el('div', { estilo: { display: 'none', marginTop: '8px' } },
        el('div', { clase: 'fila' }, el('span', { clase: 'tenue' }, 'Vendido en el turno'), el('b', { clase: 'num' }, plata(c.ventaTotal))),
        el('div', { clase: 'fila' }, el('span', { clase: 'tenue' }, 'Fondo + efectivo − gastos − retiros'), el('b', { clase: 'num' }, plata(c.esperado))),
        el('div', { clase: 'fila' }, el('span', { clase: 'tenue' }, 'Contaron'), el('b', { clase: 'num' }, c.contado == null ? '—' : plata(c.contado))),
        c.gastos ? el('div', { clase: 'fila' }, el('span', { clase: 'tenue' }, 'Gastos de caja'), el('b', { clase: 'num' }, plata(c.gastos))) : null,
        c.retiros ? el('div', { clase: 'fila' }, el('span', { clase: 'tenue' }, 'Retiros'), el('b', { clase: 'num' }, plata(c.retiros))) : null,
        (c.porMedio || []).map((m) => el('div', { clase: 'fila' }, el('span', { clase: 'tenue' }, m.nombre), el('b', { clase: 'num' }, plata(m.importe)))))
      return el('div', { clase: 'fila', estilo: { display: 'block', cursor: 'pointer' }, onclick: () => { detalle.style.display = detalle.style.display === 'none' ? 'block' : 'none' } },
        el('div', { estilo: { display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' } },
          el('div', { clase: 'izq' }, el('b', {}, fechaCorta(c.dia) + ' · ' + (c.usuario || '—')),
            el('div', { clase: 'sub' }, (S.sucursales.length > 1 ? c.sucursal + ' · ' : '') + 'caja ' + (c.terminal || '') + ' · ' + hora(c.abiertaEn) + ' a ' + hora(c.cerradaEn) + ' · ' + c.tickets + ' ventas · ' + plata(c.ventaTotal))),
          chip(c)),
        detalle)
    })) : el('div', { clase: 'caja' }, el('div', { clase: 'nada' }, 'Todavía no hay cierres subidos.')))
}

// --- FALTANTES ----------------------------------------------------------------------

async function secFaltantes () {
  const datos = await leerDatos('faltantes')
  if (!S.sucursal) return
  const lista = ((datos[S.sucursal] || {}).datos) || []
  S.buscaFalt = S.buscaFalt || ''
  const busca = el('input', { type: 'search', placeholder: 'Buscar…', valor: S.buscaFalt })
  const zona = el('div', {})
  const pintar = () => {
    const filas = lista.filter((p) => coincide(p.descripcion + ' ' + p.codigo + ' ' + p.proveedor + ' ' + p.familia, S.buscaFalt))
    poner(zona, filas.length
      ? filas.map((p) => el('div', { clase: 'fila' },
        el('div', { clase: 'izq' }, el('b', {}, p.descripcion), el('div', { clase: 'sub' }, [p.proveedor || 'sin proveedor', p.familia, p.vendido30 ? 'vendió ' + unidades(p.vendido30) + ' en 30 días' : ''].filter(Boolean).join(' · '))),
        el('div', { clase: 'der' },
          el('span', { clase: 'chip ' + (p.stock < 0 ? 'mal' : 'alerta') }, (p.stock < 0 ? '▼ ' : '') + 'hay ' + unidades(p.stock) + (p.minimo ? ' / mín ' + unidades(p.minimo) : '')),
          el('div', {}, el('button', { clase: 'btn chico', estilo: { marginTop: '6px' }, onclick: () => hojaStock(S.sucursal, p) }, 'Corregir')))))
      : el('div', { clase: 'nada' }, lista.length ? 'Nada coincide.' : 'No falta nada: nada en negativo ni bajo el mínimo.'))
  }
  busca.addEventListener('input', () => { S.buscaFalt = busca.value; pintar() })
  pintar()
  const negativos = lista.filter((p) => p.stock < 0).length
  poner(S.main, 
    cabecera('Faltantes', nombreSucursal(S.sucursal) + ' · ' + negativos + ' en negativo · ' + (lista.length - negativos) + ' bajo el mínimo', elegirSucursal(() => ir('faltantes'))),
    el('div', { clase: 'caja' }, el('div', { clase: 'barra-busqueda' }, busca),
      el('div', { clase: 'sub', estilo: { marginBottom: '6px' } }, 'Primero lo que está en negativo (se vendió más de lo que el sistema tenía), después lo que está bajo el mínimo.'), zona))
}

// Corregir el stock de un producto desde la casa.
function hojaStock (sucursalId, p) {
  const cant = el('input', { type: 'text', inputmode: 'decimal', valor: String(Math.max(0, p.stock / 1000)).replace('.', ',') })
  const motivo = el('input', { type: 'text', placeholder: 'Ej: contaron en la góndola' })
  abrirHoja('Stock de ' + p.descripcion, [
    el('p', { clase: 'tenue' }, 'Ahora el sistema dice ' + unidades(p.stock) + ' en ' + nombreSucursal(sucursalId) + '. Poné cuántos hay de verdad.'),
    el('label', { clase: 'campo' }, 'Cuántos hay', cant),
    el('label', { clase: 'campo' }, 'Motivo (opcional)', motivo)
  ], [{ texto: 'Guardar', primario: true, alTocar: async (cerrar) => {
    const n = aMilesimas(cant.value)
    if (!Number.isFinite(n)) return toast('Escribí un número')
    cerrar()
    await mandarOrden(sucursalId, 'stock', { productoId: p.id, cantidad: n, motivo: motivo.value.trim() }, () => { if (S.seccion === 'faltantes' || S.seccion === 'productos') ir(S.seccion) })
  } }])
}

// --- PEDIDOS --------------------------------------------------------------------------

async function secPedidos () {
  S.vistaPedido = S.vistaPedido || 'pedido_hoy'
  const datos = await leerDatos(S.vistaPedido)
  if (!S.sucursal) return
  const p = (datos[S.sucursal] || {}).datos
  S.ajustesPedido = S.ajustesPedido || {}
  S.buscaPedido = S.buscaPedido || ''
  const busca = el('input', { type: 'search', placeholder: 'Buscar un producto en el pedido…', valor: S.buscaPedido })
  const zona = el('div', {})
  const clave = (f) => S.sucursal + '|' + S.vistaPedido + '|' + f.productoId
  const cant = (f) => (S.ajustesPedido[clave(f)] != null ? S.ajustesPedido[clave(f)] : f.sugerido)
  const pintar = () => {
    limpiar(zona)
    const grupos = (p && p.grupos) || []
    let alguno = false
    for (const g of grupos) {
      const filas = g.filas.filter((f) => coincide(f.descripcion + ' ' + (f.codigo || ''), S.buscaPedido))
      if (!filas.length) continue
      alguno = true
      const texto = () => 'Pedido ' + S.negocio + ' (' + nombreSucursal(S.sucursal) + '):\n' + g.filas.filter((f) => cant(f) > 0).map((f) => unidades(cant(f)) + ' x ' + f.descripcion).join('\n')
      const tel = String(g.telefono || '').replace(/[^0-9]/g, '')
      const wa = tel ? 'https://wa.me/' + (tel.length === 10 ? '549' + tel : tel.replace(/^0/, '549')) + '?text=' + encodeURIComponent(texto()) : 'https://wa.me/?text=' + encodeURIComponent(texto())
      zona.append(el('div', { clase: 'caja' },
        el('div', { clase: 'cabecera', estilo: { marginBottom: '6px' } },
          el('div', {}, el('h2', { estilo: { margin: 0 } }, g.nombre), el('div', { clase: 'sub' }, g.filas.length + ' productos' + (g.telefono ? ' · ' + g.telefono : ' · sin teléfono cargado'))),
          el('div', { clase: 'chips' },
            el('a', { clase: 'btn primario chico', href: wa, target: '_blank', rel: 'noreferrer', onclick: (ev) => { ev.currentTarget.href = tel ? 'https://wa.me/' + (tel.length === 10 ? '549' + tel : tel.replace(/^0/, '549')) + '?text=' + encodeURIComponent(texto()) : 'https://wa.me/?text=' + encodeURIComponent(texto()) } }, 'WhatsApp'),
            el('button', { clase: 'btn chico', onclick: async () => { try { await navigator.clipboard.writeText(texto()); toast('Pedido copiado') } catch (e) { toast('No se pudo copiar') } } }, 'Copiar'))),
        filas.map((f) => {
          const inp = el('input', { type: 'text', inputmode: 'decimal', valor: unidades(cant(f)), estilo: { width: '72px', textAlign: 'right' } })
          inp.addEventListener('input', () => { const n = aMilesimas(inp.value); if (Number.isFinite(n)) S.ajustesPedido[clave(f)] = Math.max(0, n) })
          return el('div', { clase: 'fila' },
            el('div', { clase: 'izq' }, el('b', {}, f.descripcion), el('div', { clase: 'sub' }, 'hay ' + unidades(f.stock) + (f.vendido != null ? ' · vendido ' + unidades(f.vendido) : f.vendidas != null ? ' · vendido ' + unidades(f.vendidas) : '') + (f.estado === 'urgente' ? ' · urgente' : ''))),
            el('div', { clase: 'der' }, inp))
        })))
    }
    if (!alguno) zona.append(el('div', { clase: 'caja' }, el('div', { clase: 'nada' }, !grupos.length ? (S.vistaPedido === 'pedido_hoy' ? 'Todavía no se vendió nada hoy.' : 'Nada para pedir.') : 'Nada coincide.')))
  }
  busca.addEventListener('input', () => { S.buscaPedido = busca.value; pintar() })
  pintar()
  poner(S.main, 
    cabecera('Pedidos', nombreSucursal(S.sucursal) + (p ? ' · ' + (p.productos || (p.grupos || []).reduce((s, g) => s + g.filas.length, 0)) + ' productos' : ''), elegirSucursal(() => ir('pedidos'))),
    el('div', { clase: 'barra-busqueda' },
      el('div', { clase: 'seg' }, [['pedido_hoy', 'Lo de hoy'], ['pedido_semana', 'La semana'], ['pedido_sugerido', 'Sugerido']].map(([id, t]) => el('button', { clase: S.vistaPedido === id ? 'activo' : '', onclick: () => { S.vistaPedido = id; ir('pedidos') } }, t))),
      busca),
    el('div', { clase: 'sub', estilo: { marginBottom: '10px' } }, S.vistaPedido === 'pedido_sugerido' ? 'Lo que conviene pedir para llegar a la próxima visita del proveedor.' : 'Se repone lo mismo que se vendió. Cambiá las cantidades y mandalo por WhatsApp.'),
    zona)
}

// --- PRODUCTOS --------------------------------------------------------------------------

async function secProductos () {
  if (!S.sucursal) return
  const [lista, provs, rubros] = await Promise.all([leerCatalogo(S.sucursal), leerDatos('proveedores'), leerDatos('rubros')])
  const proveedores = ((provs[S.sucursal] || {}).datos) || []
  const listaRubros = ((rubros[S.sucursal] || {}).datos) || []
  S.buscaProd = S.buscaProd || ''
  S.filtroProd = S.filtroProd || 'todos'
  const busca = el('input', { type: 'search', placeholder: 'Buscar por nombre o código…', valor: S.buscaProd })
  const zona = el('div', {})
  const filtros = [['todos', 'Todos'], ['negativo', 'En negativo'], ['minimo', 'Bajo el mínimo'], ['sinProv', 'Sin proveedor'], ['sinCosto', 'Sin costo'], ['inactivos', 'Dados de baja']]
  const pasa = (p) => {
    if (S.filtroProd === 'inactivos') return !p.activo
    if (!p.activo) return false
    if (S.filtroProd === 'negativo') return p.stock < 0
    if (S.filtroProd === 'minimo') return p.minimo > 0 && p.stock < p.minimo
    if (S.filtroProd === 'sinProv') return !p.proveedorId
    if (S.filtroProd === 'sinCosto') return !p.costo
    return true
  }
  let limite = 60
  const pintar = () => {
    const filas = lista.filter((p) => pasa(p) && coincide(p.descripcion + ' ' + (p.codigos || []).join(' ') + ' ' + p.rubro + ' ' + p.proveedor, S.buscaProd))
      .sort((a, b) => b.vendido30 - a.vendido30 || a.descripcion.localeCompare(b.descripcion, 'es'))
    poner(zona, 
      el('div', { clase: 'sub', estilo: { marginBottom: '6px' } }, filas.length + ' productos · los que más se venden primero'),
      filas.slice(0, limite).map((p) => el('div', { clase: 'fila', estilo: { cursor: 'pointer' }, onclick: () => hojaProducto(S.sucursal, p, proveedores, listaRubros) },
        el('div', { clase: 'izq' }, el('b', {}, p.descripcion), el('div', { clase: 'sub' }, [(p.codigos || [])[0] || 'sin código', p.proveedor || 'sin proveedor'].join(' · '))),
        el('div', { clase: 'der' }, el('b', { clase: 'num' }, plata(p.precio)),
          el('div', { clase: 'sub ' + (p.stock < 0 ? '' : '') }, el('span', { estilo: { color: p.stock < 0 ? 'var(--rojo)' : p.minimo && p.stock < p.minimo ? 'var(--ambar)' : '' } }, 'stock ' + unidades(p.stock)))))),
      filas.length > limite ? el('button', { clase: 'btn ancho', estilo: { marginTop: '8px' }, onclick: () => { limite += 100; pintar() } }, 'Ver más') : null)
  }
  busca.addEventListener('input', () => { S.buscaProd = busca.value; limite = 60; pintar() })
  pintar()
  poner(S.main, 
    cabecera('Productos', nombreSucursal(S.sucursal) + ' · tocá un producto para cambiarlo', elegirSucursal(() => ir('productos')),
      el('button', { clase: 'btn chico', onclick: () => hojaAumento(S.sucursal, proveedores, listaRubros, lista) }, 'Aumentar precios')),
    el('div', { clase: 'caja' },
      el('div', { clase: 'barra-busqueda' }, busca),
      el('div', { clase: 'chips', estilo: { marginBottom: '8px' } }, filtros.map(([id, t]) => el('button', { clase: 'btn chico' + (S.filtroProd === id ? ' primario' : ''), onclick: () => { S.filtroProd = id; ir('productos') } }, t))),
      zona),
    await panelOrdenes(S.sucursal))
  if (S.buscaProd) busca.focus()
}

// Las ultimas ordenes mandadas a esta sucursal y como les fue.
async function panelOrdenes (sucursalId) {
  const { data } = await S.sb.from('pos_ordenes').select('id,tipo,datos,estado,resultado,creado').eq('sucursal_id', sucursalId).order('creado', { ascending: false }).limit(8)
  if (!data || !data.length) return null
  const nombre = { producto: 'Cambio de producto', stock: 'Corrección de stock', aumento: 'Aumento de precios', promo_estado: 'Promo', promo_borrar: 'Borrar promo', promo_guardar: 'Promo nueva', anular_venta: 'Anular venta', anulacion_rechazar: 'No anular' }
  return el('div', { clase: 'caja' }, el('h2', {}, 'Lo último que mandaste'),
    data.map((o) => el('div', { clase: 'fila' },
      el('div', { clase: 'izq' }, el('b', {}, nombre[o.tipo] || o.tipo), el('div', { clase: 'sub' }, hace(o.creado) + (o.resultado ? ' · ' + (o.resultado.mensaje || o.resultado.error || '') : ''))),
      el('span', { clase: 'chip ' + (o.estado === 'aplicada' ? 'ok' : o.estado === 'error' ? 'mal' : 'alerta') }, o.estado === 'aplicada' ? '✓ Aplicado' : o.estado === 'error' ? '✗ No se pudo' : '… Esperando la caja'))))
}

function hojaProducto (sucursalId, p, proveedores, rubros) {
  const nombre = el('input', { type: 'text', valor: p.descripcion })
  const precio = el('input', { type: 'text', inputmode: 'decimal', valor: plataExacta(p.precio) })
  const costo = el('input', { type: 'text', inputmode: 'decimal', valor: p.costo ? plataExacta(p.costo) : '' })
  const minimo = el('input', { type: 'text', inputmode: 'decimal', valor: p.minimo ? unidades(p.minimo) : '' })
  const stock = el('input', { type: 'text', inputmode: 'decimal', valor: unidades(p.stock) })
  const prov = el('select', {}, el('option', { valor: '' }, 'Sin proveedor'), proveedores.map((x) => el('option', { valor: x.id, selected: x.id === p.proveedorId }, x.nombre)))
  const activo = el('input', { type: 'checkbox' })
  activo.checked = p.activo
  const margen = el('div', { clase: 'sub' })
  const pintarMargen = () => {
    const pr = aCentavos(precio.value)
    const co = aCentavos(costo.value)
    margen.textContent = co > 0 && pr > 0 ? 'Ganancia ' + plata(pr - co) + ' por unidad · ' + pct((pr - co) * 10000 / co) + ' sobre el costo' : ''
  }
  precio.addEventListener('input', pintarMargen)
  costo.addEventListener('input', pintarMargen)
  pintarMargen()
  abrirHoja(p.descripcion, [
    el('div', { clase: 'sub', estilo: { marginBottom: '10px' } }, (p.codigos || []).join(' · ') + (p.rubro ? ' · ' + p.rubro : '') + ' · vendió ' + unidades(p.vendido30) + ' en 30 días'),
    el('label', { clase: 'campo' }, 'Nombre', nombre),
    el('div', { clase: 'dos' }, el('label', { clase: 'campo' }, 'Precio ($)', precio), el('label', { clase: 'campo' }, 'Costo ($)', costo)),
    margen,
    el('div', { clase: 'dos', estilo: { marginTop: '10px' } }, el('label', { clase: 'campo' }, 'Stock (lo que hay)', stock), el('label', { clase: 'campo' }, 'Stock mínimo', minimo)),
    el('label', { clase: 'campo' }, 'Proveedor', prov),
    el('label', { clase: 'campo', estilo: { display: 'flex', gap: '8px', alignItems: 'center' } }, activo, 'Se vende (desactivalo para darlo de baja)'),
    el('div', { clase: 'sub' }, 'Los cambios los aplica la caja de ' + nombreSucursal(sucursalId) + ' en menos de un minuto.')
  ], [{ texto: 'Guardar', primario: true, alTocar: async (cerrar) => {
    const cambios = {}
    if (nombre.value.trim() && nombre.value.trim() !== p.descripcion) cambios.descripcion = nombre.value.trim()
    const pr = aCentavos(precio.value)
    if (!Number.isFinite(pr) || pr < 0) return toast('El precio no es válido')
    if (pr !== p.precio) cambios.precio = pr
    const co = costo.value.trim() ? aCentavos(costo.value) : 0
    if (!Number.isFinite(co) || co < 0) return toast('El costo no es válido')
    if (co !== (p.costo || 0)) cambios.costo = co
    const mi = minimo.value.trim() ? aMilesimas(minimo.value) : 0
    if (Number.isFinite(mi) && mi !== (p.minimo || 0)) cambios.minimo = mi
    if ((prov.value || null) !== (p.proveedorId || null)) cambios.proveedorId = prov.value || null
    if (activo.checked !== p.activo) cambios.activo = activo.checked
    const st = aMilesimas(stock.value)
    const cambiaStock = Number.isFinite(st) && st !== p.stock
    if (!Object.keys(cambios).length && !cambiaStock) { cerrar(); return }
    cerrar()
    const recargar = () => { if (S.seccion === 'productos') ir('productos') }
    if (Object.keys(cambios).length) await mandarOrden(sucursalId, 'producto', { productoId: p.id, cambios }, recargar)
    if (cambiaStock) await mandarOrden(sucursalId, 'stock', { productoId: p.id, cantidad: st, motivo: 'corregido desde el panel' }, recargar)
    if (S.seccion === 'productos') setTimeout(() => ir('productos'), 600)
  } }])
}

function hojaAumento (sucursalId, proveedores, rubros, lista) {
  const porcentaje = el('input', { type: 'text', inputmode: 'decimal', placeholder: 'Ej: 8' })
  const prov = el('select', {}, el('option', { valor: '' }, 'Todos los proveedores'), proveedores.map((x) => el('option', { valor: x.id }, x.nombre)))
  const familias = rubros.filter((r) => !r.padreId).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const rub = el('select', {}, el('option', { valor: '' }, 'Todas las familias'), familias.map((x) => el('option', { valor: x.id }, x.nombre)))
  let redondeo = 'cien'
  const seg = el('div', { clase: 'seg' })
  const pintarSeg = () => { poner(seg, [['ninguno', 'Sin redondear'], ['decena', 'a $10'], ['cincuenta', 'a $50'], ['cien', 'a $100']].map(([id, t]) => el('button', { clase: redondeo === id ? 'activo' : '', onclick: () => { redondeo = id; pintarSeg() } }, t))) }
  pintarSeg()
  const cuantos = el('div', { clase: 'sub', estilo: { margin: '8px 0' } })
  const hijos = {}
  for (const r of rubros) if (r.padreId) (hijos[r.padreId] = hijos[r.padreId] || []).push(r.id)
  const rama = (id) => { const s = new Set([id]); const pend = [id]; while (pend.length) for (const h of hijos[pend.pop()] || []) if (!s.has(h)) { s.add(h); pend.push(h) } return s }
  const contar = () => {
    const r = rub.value ? rama(rub.value) : null
    const n = lista.filter((p) => p.activo && (!prov.value || p.proveedorId === prov.value) && (!r || r.has(p.rubroId))).length
    cuantos.textContent = n + ' productos van a cambiar de precio.'
  }
  prov.addEventListener('change', contar)
  rub.addEventListener('change', contar)
  contar()
  abrirHoja('Aumentar precios en ' + nombreSucursal(sucursalId), [
    el('label', { clase: 'campo' }, 'Cuánto (%)', porcentaje),
    el('label', { clase: 'campo' }, 'De qué proveedor', prov),
    el('label', { clase: 'campo' }, 'De qué familia', rub),
    el('div', { clase: 'campo' }, el('span', { clase: 'chico tenue' }, 'Redondeo'), seg),
    cuantos,
    el('div', { clase: 'sub' }, 'Queda anotado en la caja y se puede volver atrás desde Productos → Historial de aumentos.')
  ], [{ texto: 'Aumentar', primario: true, alTocar: async (cerrar) => {
    const n = Number(String(porcentaje.value).replace(',', '.'))
    if (!Number.isFinite(n) || n === 0 || n < -50 || n > 200) return toast('Poné un porcentaje (por ejemplo 8)')
    cerrar()
    await mandarOrden(sucursalId, 'aumento', { porcentajeBasis: Math.round(n * 100), redondeo, proveedorId: prov.value || undefined, rubroId: rub.value || undefined, alcance: 'Desde el panel: ' + n + '%' + (prov.value ? ' · ' + prov.selectedOptions[0].textContent : '') + (rub.value ? ' · ' + rub.selectedOptions[0].textContent : '') }, () => { if (S.seccion === 'productos') ir('productos') })
  } }])
}

// --- PROMOS -----------------------------------------------------------------------------

async function secPromos () {
  if (!S.sucursal) return
  const datos = await leerDatos('promos')
  const lista = ((datos[S.sucursal] || {}).datos) || []
  const estado = (p) => (!p.activa ? el('span', { clase: 'chip' }, 'Pausada') : p.vencida ? el('span', { clase: 'chip' }, 'Vencida') : p.vigenteAhora ? el('span', { clase: 'chip ok' }, '● Aplicándose') : el('span', { clase: 'chip alerta' }, 'Programada'))
  poner(S.main, 
    cabecera('Promos', nombreSucursal(S.sucursal), elegirSucursal(() => ir('promos')), el('button', { clase: 'btn primario chico', onclick: () => hojaPromo(S.sucursal) }, 'Nueva promo')),
    el('div', { clase: 'caja' }, lista.length ? lista.map((p) => el('div', { clase: 'fila' },
      el('div', { clase: 'izq' }, el('b', {}, p.nombre), el('div', { clase: 'sub' }, [p.etiqueta, p.tipo === 'combo' ? p.textoComponentes : p.textoAlcance, p.textoDisparador ? 'llevando ' + p.textoDisparador : '', p.textoVigencia].filter(Boolean).join(' · '))),
      el('div', { clase: 'der' }, estado(p), el('div', { clase: 'chips', estilo: { marginTop: '6px', justifyContent: 'flex-end' } },
        el('button', { clase: 'btn chico', onclick: () => mandarOrden(S.sucursal, 'promo_estado', { promoId: p.id, activa: !p.activa }, () => ir('promos')) }, p.activa ? 'Pausar' : 'Activar'),
        el('button', { clase: 'btn chico peligro', onclick: () => { if (confirm('¿Borrar "' + p.nombre + '"? Las ventas que ya la usaron no cambian.')) mandarOrden(S.sucursal, 'promo_borrar', { promoId: p.id }, () => ir('promos')) } }, 'Borrar')))))
      : el('div', { clase: 'nada' }, 'No hay promociones en esta sucursal.')),
    await panelOrdenes(S.sucursal))
}

async function hojaPromo (sucursalId) {
  const [lista, rubrosD] = await Promise.all([leerCatalogo(sucursalId), leerDatos('rubros')])
  const rubros = ((rubrosD[sucursalId] || {}).datos) || []
  const ruta = (id) => { const x = []; let r = rubros.find((y) => y.id === id); while (r) { x.unshift(r.nombre); r = rubros.find((y) => y.id === r.padreId) } return x.join(' › ') }
  const nombre = el('input', { type: 'text', placeholder: 'Ej: Finde bebidas 10%', maxlength: '60' })
  let tipo = 'porcentaje'
  let alcance = 'productos'
  const elegidos = []
  const rubrosElegidos = []
  const valor = el('input', { type: 'text', inputmode: 'decimal' })
  const lleva = el('input', { type: 'number', valor: '3', min: '2' })
  const paga = el('input', { type: 'number', valor: '2', min: '1' })
  const zonaValor = el('div', {})
  const segTipo = el('div', { clase: 'seg' })
  const pintarTipo = () => {
    poner(segTipo, [['porcentaje', '% off'], ['descuento', '$ menos'], ['precio', 'Precio fijo'], ['nxm', 'Lleva N paga M']].map(([id, t]) => el('button', { clase: tipo === id ? 'activo' : '', onclick: () => { tipo = id; pintarTipo() } }, t)))
    poner(zonaValor, tipo === 'nxm'
      ? el('div', { clase: 'dos' }, el('label', { clase: 'campo' }, 'Lleva', lleva), el('label', { clase: 'campo' }, 'Paga', paga))
      : el('label', { clase: 'campo' }, tipo === 'porcentaje' ? 'Descuento (%)' : tipo === 'precio' ? 'Precio fijo por unidad ($)' : 'Pesos menos por unidad ($)', valor))
  }
  pintarTipo()
  const busca = el('input', { type: 'search', placeholder: 'Buscar producto…' })
  const resultados = el('div', {})
  const chips = el('div', { clase: 'chips', estilo: { margin: '6px 0' } })
  const selRubro = el('select', {}, el('option', { valor: '' }, 'Elegí un rubro…'), rubros.map((r) => el('option', { valor: r.id }, ruta(r.id))).sort((a, b) => a.textContent.localeCompare(b.textContent, 'es')))
  const zonaAlcance = el('div', {})
  const segAlcance = el('div', { clase: 'seg' })
  const pintarChips = () => {
    poner(chips, (alcance === 'productos' ? elegidos.map((p) => [p.id, p.descripcion]) : rubrosElegidos.map((id) => [id, ruta(id)])).map(([id, t]) =>
      el('span', { clase: 'chip' }, t, el('button', { estilo: { background: 'none', border: 0, cursor: 'pointer', color: 'inherit' }, onclick: () => {
        const arr = alcance === 'productos' ? elegidos : rubrosElegidos
        const i = arr.findIndex((x) => (x.id || x) === id); if (i >= 0) arr.splice(i, 1); pintarChips()
      } }, '×'))))
  }
  const pintarAlcance = () => {
    poner(segAlcance, [['productos', 'Productos'], ['rubros', 'Rubros']].map(([id, t]) => el('button', { clase: alcance === id ? 'activo' : '', onclick: () => { alcance = id; pintarAlcance() } }, t)))
    poner(zonaAlcance, alcance === 'productos' ? [busca, resultados] : [selRubro])
    pintarChips()
  }
  busca.addEventListener('input', () => {
    limpiar(resultados)
    if (busca.value.trim().length < 2) return
    for (const p of lista.filter((x) => x.activo && coincide(x.descripcion + ' ' + (x.codigos || []).join(' '), busca.value)).slice(0, 8)) {
      resultados.append(el('div', { clase: 'fila', estilo: { cursor: 'pointer' }, onclick: () => { if (!elegidos.some((x) => x.id === p.id)) elegidos.push(p); busca.value = ''; limpiar(resultados); pintarChips() } },
        el('span', { clase: 'izq' }, p.descripcion), el('span', { clase: 'num sub' }, plata(p.precio))))
    }
  })
  selRubro.addEventListener('change', () => { if (selRubro.value && !rubrosElegidos.includes(selRubro.value)) rubrosElegidos.push(selRubro.value); selRubro.value = ''; pintarChips() })
  pintarAlcance()
  const dias = new Set([0, 1, 2, 3, 4, 5, 6])
  const segDias = el('div', { clase: 'chips' })
  const pintarDias = () => { poner(segDias, [1, 2, 3, 4, 5, 6, 0].map((d) => el('button', { clase: 'btn chico' + (dias.has(d) ? ' primario' : ''), onclick: () => { if (dias.has(d) && dias.size > 1) dias.delete(d); else dias.add(d); pintarDias() } }, DIAS[d]))) }
  pintarDias()
  abrirHoja('Promo nueva en ' + nombreSucursal(sucursalId), [
    el('label', { clase: 'campo' }, 'Nombre (sale en el ticket)', nombre),
    el('div', { clase: 'campo' }, el('span', { clase: 'chico tenue' }, 'Qué descuento'), segTipo), zonaValor,
    el('div', { clase: 'campo' }, el('span', { clase: 'chico tenue' }, 'A qué productos'), segAlcance), zonaAlcance, chips,
    el('div', { clase: 'campo' }, el('span', { clase: 'chico tenue' }, 'Qué días'), segDias),
    el('div', { clase: 'sub' }, 'Para combos y "llevando uno, descuento en otro", usá la pantalla Promos de la caja.')
  ], [{ texto: 'Crear promo', primario: true, alTocar: async (cerrar) => {
    const promo = { nombre: nombre.value.trim(), tipo, alcance, productoIds: elegidos.map((p) => p.id), rubroIds: rubrosElegidos.slice(), dias: dias.size === 7 ? [] : [...dias], activa: true }
    if (!promo.nombre) return toast('Ponele un nombre')
    if (tipo === 'nxm') { promo.lleva = Number(lleva.value); promo.paga = Number(paga.value) }
    else if (tipo === 'porcentaje') promo.valor = Math.round(Number(String(valor.value).replace(',', '.')) * 100)
    else promo.valor = aCentavos(valor.value)
    if (tipo !== 'nxm' && !(promo.valor > 0)) return toast('Completá el valor del descuento')
    if (alcance === 'productos' ? !promo.productoIds.length : !promo.rubroIds.length) return toast('Elegí a qué productos se aplica')
    cerrar()
    await mandarOrden(sucursalId, 'promo_guardar', { promo }, () => { if (S.seccion === 'promos') ir('promos') })
  } }])
}

// --- AVISOS ---------------------------------------------------------------------------------

async function contarAvisos () {
  try {
    let visto = ''
    try { visto = localStorage.getItem('bs.avisosVistos') || '' } catch (e) {}
    const { count } = await S.sb.from('pos_avisos').select('id', { count: 'exact', head: true }).gt('creado', visto || '1970-01-01')
    for (const i of document.querySelectorAll('[data-insignia]')) { i.textContent = count > 99 ? '99+' : String(count || ''); i.style.display = count ? '' : 'none' }
  } catch (e) { /* sin avisos */ }
}

async function secAvisos () {
  const [{ data }, anul] = await Promise.all([
    S.sb.from('pos_avisos').select('*').order('creado', { ascending: false }).limit(120),
    leerDatos('anulaciones').catch(() => ({}))
  ])
  try { localStorage.setItem('bs.avisosVistos', new Date().toISOString()) } catch (e) {}
  contarAvisos()
  const tono = { cierre: 'mal', anulacion: 'alerta', pedido_anulacion: 'alerta', personal: 'mal', caja: 'mal' }
  const icono = { cierre: '$', anulacion: '↺', pedido_anulacion: '?', personal: '☺', caja: '⏻' }
  const pedidos = []
  for (const [id, f] of Object.entries(anul)) for (const p of f.datos || []) pedidos.push(Object.assign({ sucursalId: id, sucursal: f.nombre }, p))
  let dia = ''
  const filas = []
  for (const a of data || []) {
    const d = a.creado.slice(0, 10)
    if (d !== dia) { dia = d; filas.push(el('h3', {}, fechaCorta(d))) }
    filas.push(el('div', { clase: 'fila' },
      el('div', { clase: 'izq' }, el('b', {}, el('span', { clase: 'chip ' + (tono[a.tipo] || '') }, icono[a.tipo] || '•'), ' ', a.titulo), el('div', { clase: 'sub' }, (a.nombre || '') + ' · ' + hora(a.creado) + (a.texto ? ' · ' + a.texto : '')))))
  }
  poner(S.main, 
    cabecera('Avisos', 'Lo que pasó en los locales y te conviene saber'),
    await panelNotificaciones(),
    pedidos.length ? el('div', { clase: 'caja' }, el('h2', {}, 'Ventas a cuenta para anular'),
      pedidos.map((p) => el('div', { clase: 'fila', estilo: { display: 'block' } },
        el('div', { estilo: { display: 'flex', justifyContent: 'space-between', gap: '8px' } },
          el('div', { clase: 'izq' }, el('b', {}, (p.cliente || 'Sin cliente') + ' · ' + plata(p.total)), el('div', { clase: 'sub' }, p.sucursal + ' · ' + p.numero + ' · pidió ' + p.usuario + ': ' + p.motivo)),
          el('div', { clase: 'chips' },
            el('button', { clase: 'btn chico peligro', onclick: () => { const m = prompt('Motivo de la anulación', p.motivo || ''); if (m) mandarOrden(p.sucursalId, 'anular_venta', { ventaId: p.ventaId, motivo: m }, () => ir('avisos')) } }, 'Anular'),
            el('button', { clase: 'btn chico', onclick: () => mandarOrden(p.sucursalId, 'anulacion_rechazar', { ventaId: p.ventaId }, () => ir('avisos')) }, 'No anular'))),
        el('div', { clase: 'sub' }, (p.items || []).map((it) => unidades(it.cantidad) + ' × ' + it.descripcion).join(' · '))))) : null,
    el('div', { clase: 'caja' }, filas.length ? filas : el('div', { clase: 'nada' }, 'Todavía no hubo avisos.')))
}

function urlBase64AUint8 (b64) {
  const relleno = '='.repeat((4 - b64.length % 4) % 4)
  const bin = atob((b64 + relleno).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...bin].map((c) => c.charCodeAt(0)))
}

async function panelNotificaciones () {
  const caja = el('div', { clase: 'caja' }, el('h2', {}, 'Avisos en este celular'))
  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const instalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    caja.append(el('p', { clase: 'tenue' }, esIOS && !instalada
      ? 'En el iPhone, primero agregá esta página a la pantalla de inicio: tocá Compartir y "Agregar a inicio". Después abrila desde el ícono y volvé acá.'
      : 'Este navegador no puede recibir avisos.'))
    return caja
  }
  // Si el que recibe los avisos no se pudo instalar, no se espera para siempre.
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 4000))])
  if (!reg) { caja.append(el('p', { clase: 'tenue' }, 'Los avisos no están disponibles en este navegador ahora. Probá recargar la página.')); return caja }
  const actual = await reg.pushManager.getSubscription()
  const estado = el('p', { clase: 'tenue' })
  const boton = el('button', { clase: 'btn primario' })
  const pintar = (sub) => {
    estado.textContent = sub ? '✓ Este ' + (esIOS || /android/i.test(navigator.userAgent) ? 'celular' : 'navegador') + ' recibe los avisos: faltante al cerrar la caja, venta anulada, empleado que no llegó, caja cerrada, pedidos de anulación.' : 'Activalos para que te llegue una notificación cuando pasa algo importante, aunque no tengas la página abierta.'
    boton.textContent = sub ? 'Desactivar avisos' : 'Activar avisos'
    boton.className = 'btn' + (sub ? '' : ' primario')
  }
  pintar(actual)
  boton.addEventListener('click', async () => {
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await S.sb.from('pos_suscripciones').delete().eq('endpoint', sub.endpoint)
      await sub.unsubscribe()
      pintar(null)
      return
    }
    const { data } = await S.sb.from('pos_datos').select('datos').eq('sucursal_id', '_').eq('clave', 'vapid_publica').maybeSingle()
    if (!data) return toast('Todavía no está listo: la caja tiene que conectarse una vez con la versión nueva.', 6)
    const permiso = await Notification.requestPermission()
    if (permiso !== 'granted') return toast('Sin permiso para avisos. Se habilita en los ajustes del celular.', 6)
    try {
      const nueva = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64AUint8(data.datos.publica) })
      const { error } = await S.sb.from('pos_suscripciones').upsert({ endpoint: nueva.endpoint, datos: nueva.toJSON(), email: S.email.toLowerCase() })
      if (error) throw error
      pintar(nueva)
      toast('Listo: los avisos llegan a este ' + (esIOS ? 'celular' : 'dispositivo'))
    } catch (err) { toast('No se pudo activar: ' + err.message, 6) }
  })
  caja.append(estado, boton)
  if (esIOS && !instalada) caja.append(el('p', { clase: 'sub', estilo: { marginTop: '10px' } }, 'En iPhone los avisos funcionan con la página agregada a la pantalla de inicio (Compartir → Agregar a inicio).'))
  return caja
}

// --- MAS (celular) ---------------------------------------------------------------------------

function secMas () {
  poner(S.main, 
    cabecera('Más', S.email),
    el('div', { clase: 'caja' }, ['cierres', 'faltantes', 'promos', 'avisos'].map((id) => el('div', { clase: 'fila', estilo: { cursor: 'pointer' }, onclick: () => ir(id) },
      el('b', {}, SECCIONES[id].ic + '  ' + SECCIONES[id].nombre), id === 'avisos' ? el('span', { clase: 'insignia', 'data-insignia': '', estilo: { display: 'none' } }) : el('span', { clase: 'sub' }, '›')))),
    el('div', { clase: 'caja' },
      el('div', { clase: 'fila' }, el('span', {}, 'Tema'), el('div', { clase: 'seg' }, [['auto', 'Automático'], ['dark', 'Oscuro'], ['light', 'Claro']].map(([id, t]) => el('button', { clase: (localStorage.getItem('bs.tema') || 'auto') === id ? 'activo' : '', onclick: () => { try { localStorage.setItem('bs.tema', id) } catch (e) {} aplicarTema(); secMas() } }, t)))),
      el('div', { clase: 'fila', estilo: { cursor: 'pointer' }, onclick: salir }, el('span', { estilo: { color: 'var(--rojo)' } }, 'Salir'), el('span', { clase: 'sub' }, '›'))))
  contarAvisos()
}

function aplicarTema () {
  let t = 'auto'
  try { t = localStorage.getItem('bs.tema') || 'auto' } catch (e) {}
  if (t === 'auto') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', t)
}

// --- la hoja (ventana que sube desde abajo) ------------------------------------------------

function abrirHoja (titulo, cuerpo, botones) {
  const cerrar = () => { telon.remove(); document.removeEventListener('keydown', tecla) }
  const tecla = (ev) => { if (ev.key === 'Escape') cerrar() }
  const telon = el('div', { clase: 'telon', onclick: (ev) => { if (ev.target === telon) cerrar() } },
    el('div', { clase: 'hoja', role: 'dialog', 'aria-label': titulo },
      el('div', { clase: 'titulo-hoja' }, el('h2', {}, titulo), el('button', { clase: 'cerrar', 'aria-label': 'Cerrar', onclick: cerrar }, '×')),
      cuerpo,
      el('div', { clase: 'acciones' }, el('button', { clase: 'btn', onclick: cerrar }, 'Cancelar'),
        (botones || []).map((b) => el('button', { clase: 'btn' + (b.primario ? ' primario' : ''), onclick: () => b.alTocar(cerrar) }, b.texto)))))
  document.addEventListener('keydown', tecla)
  document.body.append(telon)
  const primero = telon.querySelector('input, select')
  if (primero && window.innerWidth > 820) primero.focus()
}

arrancar()
