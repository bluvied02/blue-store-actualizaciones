'use strict'
// PIEZAS COMUNES DE LAS PANTALLAS: armar elementos, iconos, avisos, hojas que
// suben desde abajo, numeros y fotos. Lo usan las tres partes de la app (la
// chica, el que recibe en el local y el dueño).

const $app = document.getElementById('app')

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
  for (const h of hijos.flat(6)) if (h != null && h !== false) n.append(h instanceof Node ? h : document.createTextNode(String(h)))
  return n
}
const limpiar = (n) => { while (n.firstChild) n.removeChild(n.firstChild); return n }
const poner = (n, ...hijos) => { limpiar(n); for (const h of hijos.flat(6)) if (h != null && h !== false) n.append(h); return n }

const { fmt, fmtPlata, fmtCant, fechaCorta, horaCorta } = window.Calculo
const plata = fmtPlata
const uuid = () => (crypto && crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16) }))
const guardarLocal = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) {} }
const leerLocal = (k, def) => { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v) } catch (e) { return def } }
const vibrar = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms || 30) } catch (e) {} }
const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
// "1.250,5" o "1250.5" -> 1250.5 (el punto de miles se acepta).
function aNumero (txt) {
  let s = String(txt == null ? '' : txt).trim().replace(/\s/g, '').replace(/\$/g, '')
  if (!s) return NaN
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}
const aCentavos = (txt) => { const n = aNumero(txt); return Number.isFinite(n) ? Math.round(n * 100) : NaN }
const fechaHora = (t) => fechaCorta(t) + ' ' + horaCorta(t)
function hace (t) {
  const min = Math.round((Date.now() - t) / 60000)
  return min < 1 ? 'recién' : min < 60 ? 'hace ' + min + ' min' : min < 1440 ? 'hace ' + Math.round(min / 60) + ' h' : 'hace ' + Math.round(min / 1440) + ' días'
}

// --- iconos (trazos simples, toman el color del texto) ---------------------------------
const ICONOS = {
  inicio: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  balanza: 'M12 3v18 M5 21h14 M4 8h16 M7 8l-3 7a3 3 0 0 0 6 0z M17 8l-3 7a3 3 0 0 0 6 0z',
  cocina: 'M7 3v8 M4 3v5a3 3 0 0 0 6 0V3 M7 11v10 M17 3c-2 2-3 5-3 8h3v10',
  camion: 'M2 6h12v10H2z M14 10h4l3 3v3h-7 M6 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M17 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  recibir: 'M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10 M8 13.5l4 2 4-2',
  foto: 'M4 7h3l2-3h6l2 3h3v12H4z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  candado: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
  pieza: 'M3 14l9-9 9 9-9 7z M12 5v16',
  dias: 'M4 5h16v16H4z M4 10h16 M9 3v4 M15 3v4',
  stock: 'M21 8 12 3 3 8v8l9 5 9-5z M3 8l9 5 9-5 M12 13v8',
  productos: 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6 M9 16h3',
  personas: 'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 20v-1a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8',
  ajustes: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.5-2.4 1a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5a7.6 7.6 0 0 0-2.6 1.5l-2.4-1-2 3.5 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.5 2.4-1a7.6 7.6 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 2.6-1.5l2.4 1 2-3.5z',
  mas: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
  alerta: 'M12 3 2 20h20z M12 10v4 M12 17h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v5 M12 8h.01',
  cerrar: 'M6 6l12 12 M18 6 6 18',
  flecha: 'M9 6l6 6-6 6',
  atras: 'M15 6l-6 6 6 6',
  ok: 'M5 12l5 5L20 7',
  sumar: 'M12 5v14 M5 12h14',
  restar: 'M5 12h14',
  basura: 'M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14',
  salir: 'M15 3h4v18h-4 M10 17l5-5-5-5 M15 12H3',
  refrescar: 'M20 11a8 8 0 1 0-2.3 5.7 M20 4v7h-7',
  compras: 'M6 6h15l-2 8H8z M6 6 5 3H2 M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M18 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  regla: 'M3 17 17 3l4 4L7 21z M7 13l2 2 M10 10l2 2 M13 7l2 2',
  historial: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2',
  plata: 'M12 2v20 M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  editar: 'M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4'
}
function icono (nombre, clase) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('class', 'ic' + (clase ? ' ' + clase : ''))
  svg.setAttribute('aria-hidden', 'true')
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  p.setAttribute('d', ICONOS[nombre] || ICONOS.mas)
  svg.append(p)
  return svg
}

function toast (texto, tipo, segundos) {
  for (const t of document.querySelectorAll('.aviso-toast')) t.remove()
  const t = el('div', { clase: 'aviso-toast ' + (tipo || ''), role: 'status' }, texto)
  document.body.append(t)
  setTimeout(() => t.remove(), (segundos || 3.5) * 1000)
}

function cabecera (titulo, sub, ...derecha) {
  return el('div', { clase: 'cabecera' }, el('div', { clase: 't' }, el('h1', {}, titulo), sub ? el('div', { clase: 'sub' }, sub) : null),
    derecha.flat().filter(Boolean).length ? el('div', { clase: 'acciones-cab' }, derecha) : null)
}
function kpi (rotulo, valor, detalle, clase, alTocar) {
  return el(alTocar ? 'button' : 'div', { clase: 'kpi' + (clase ? ' ' + clase : ''), onclick: alTocar || null },
    el('div', { clase: 'r' }, rotulo), el('div', { clase: 'v' }, valor), detalle ? el('div', { clase: 'd' }, detalle) : null)
}
function vacio (texto, icon, boton) {
  return el('div', { clase: 'nada' }, icon ? el('div', { clase: 'ico-grande' }, icono(icon)) : null, el('div', {}, texto), boton || null)
}
const chip = (texto, clase) => el('span', { clase: 'chip' + (clase ? ' ' + clase : '') }, texto)

// --- hoja que sube (detalle, cargar algo) ---------------------------------------------------
// hoja({ titulo, cuerpo, pie, completa }) -> { cerrar, cuerpo }. Se cierra con
// la X, tocando afuera o con el "atras" del celular.
//
// El "atras": mientras haya alguna hoja abierta hay UN solo paso extra en el
// historial (la guarda). El atras del celular cierra la de arriba y, si quedan
// otras, se vuelve a poner la guarda. Al cerrar la ultima se saca la guarda,
// pero un rato despues: si enseguida se abre otra (elegir algo y pasar al paso
// siguiente) la guarda se reusa y el historial no se desordena.
const HOJAS = []
const GUARDA = { puesta: false, sacando: null, ignorar: 0 }
function ponerGuarda () {
  if (GUARDA.sacando) { clearTimeout(GUARDA.sacando); GUARDA.sacando = null }
  if (!GUARDA.puesta) { history.pushState({ hoja: true }, ''); GUARDA.puesta = true }
}
function sacarGuarda () {
  if (!GUARDA.puesta || GUARDA.sacando) return
  GUARDA.sacando = setTimeout(() => {
    GUARDA.sacando = null
    if (HOJAS.length || !GUARDA.puesta) return
    GUARDA.puesta = false
    GUARDA.ignorar++
    history.back()
  }, 150)
}
window.addEventListener('popstate', () => {
  if (GUARDA.ignorar > 0) { GUARDA.ignorar--; return }
  if (!GUARDA.puesta) return
  GUARDA.puesta = false
  const h = HOJAS[HOJAS.length - 1]
  if (h) h.cerrar(true)
  if (HOJAS.length) ponerGuarda()
})
function hoja (op) {
  const cuerpo = el('div', { clase: 'cuerpo-hoja' }, op.cuerpo || null)
  const pie = op.pie && op.pie.length ? el('div', { clase: 'pie-hoja' }, op.pie) : null
  const caja = el('div', { clase: 'hoja' + (op.completa ? ' completa' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': op.titulo },
    el('div', { clase: 'agarre' }),
    el('div', { clase: 'cab-hoja' }, el('h2', {}, op.titulo), el('button', { clase: 'btn-ico', 'aria-label': 'Cerrar', onclick: () => h.cerrar() }, icono('cerrar'))),
    cuerpo, pie)
  const telon = el('div', { clase: 'telon', onclick: (ev) => { if (ev.target === telon && !op.fija) h.cerrar() } }, caja)
  const h = {
    cuerpo,
    pie,
    cerrado: false,
    cerrar (desdeAtras) {
      if (h.cerrado) return
      h.cerrado = true
      telon.remove()
      const i = HOJAS.indexOf(h)
      if (i >= 0) HOJAS.splice(i, 1)
      if (!desdeAtras && !HOJAS.length) sacarGuarda()
      if (op.alCerrar) op.alCerrar()
    }
  }
  HOJAS.push(h)
  ponerGuarda()
  document.body.append(telon)
  const primero = caja.querySelector('input:not([type=checkbox]):not([type=file]), select')
  if (primero && op.foco !== false) setTimeout(() => primero.focus(), 60)
  return h
}
const cerrarHojas = () => { while (HOJAS.length) HOJAS[HOJAS.length - 1].cerrar() }

function confirmar (titulo, texto, si, peligro) {
  return new Promise((ok) => {
    let res = false
    const h = hoja({
      titulo,
      cuerpo: el('p', { clase: 'tenue' }, texto),
      pie: [el('button', { clase: 'btn', onclick: () => h.cerrar() }, 'Volver'),
        el('button', { clase: 'btn ' + (peligro ? 'peligro' : 'primario'), onclick: () => { res = true; h.cerrar() } }, si || 'Sí')],
      alCerrar: () => ok(res)
    })
  })
}

// Un campo numerico grande con su unidad al costado ("g", "planchas").
function campoNumero (rotulo, unidad, opciones) {
  opciones = opciones || {}
  const input = el('input', { type: 'text', inputmode: opciones.decimales ? 'decimal' : 'numeric', autocomplete: 'off', placeholder: opciones.placeholder || '', clase: 'numero-grande', valor: opciones.valor != null ? String(opciones.valor) : null })
  const c = el('label', { clase: 'campo' }, rotulo, el('div', { clase: 'con-unidad' }, input, unidad ? el('span', { clase: 'unidad' }, unidad) : null), opciones.ayuda ? el('span', { clase: 'ayuda' }, opciones.ayuda) : null)
  c.input = input
  c.valor = () => aNumero(input.value)
  return c
}

// Sumar y restar con botones grandes (para cantidades de producción).
function contador (inicial, alCambiar, paso) {
  let v = inicial || 0
  const input = el('input', { type: 'text', inputmode: 'numeric', clase: 'numero-grande centro', valor: String(v) })
  const cambiar = (n) => { v = Math.max(0, n); input.value = String(v); alCambiar && alCambiar(v) }
  input.addEventListener('input', () => { const n = aNumero(input.value); v = Number.isFinite(n) ? Math.max(0, n) : 0; alCambiar && alCambiar(v) })
  input.addEventListener('focus', () => input.select())
  const c = el('div', { clase: 'contador-fila' },
    el('button', { clase: 'btn grande', 'aria-label': 'Restar ' + (paso || 1), onclick: () => cambiar(v - (paso || 1)) }, icono('restar')),
    input,
    el('button', { clase: 'btn grande', 'aria-label': 'Sumar ' + (paso || 1), onclick: () => cambiar(v + (paso || 1)) }, icono('sumar')))
  c.valor = () => v
  c.poner = cambiar
  c.input = input
  return c
}

// Sacar una foto con la camara y achicarla (para que suba rapido y no ocupe).
function botonFoto (rotulo) {
  let datos = null
  const vista = el('img', { clase: 'foto-vista', alt: 'Foto sacada', hidden: true })
  const archivo = el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true })
  const texto = el('span', {}, rotulo || 'Sacar foto')
  const boton = el('button', { clase: 'btn ancho grande', type: 'button', onclick: () => archivo.click() }, icono('foto'), texto)
  archivo.addEventListener('change', async () => {
    const f = archivo.files && archivo.files[0]
    if (!f) return
    try {
      datos = await achicarFoto(f, 960, 0.62)
      vista.src = datos
      vista.hidden = false
      texto.textContent = 'Sacar otra'
    } catch (e) { toast('No se pudo leer la foto. Probá de nuevo.', 'mal') }
  })
  const c = el('div', { clase: 'foto-campo' }, vista, boton, archivo)
  c.datos = () => datos
  return c
}
function achicarFoto (archivo, lado, calidad) {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(archivo)
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, lado / Math.max(img.width, img.height))
      const cv = document.createElement('canvas')
      cv.width = Math.round(img.width * k)
      cv.height = Math.round(img.height * k)
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height)
      URL.revokeObjectURL(url)
      ok(cv.toDataURL('image/jpeg', calidad))
    }
    img.onerror = (e) => { URL.revokeObjectURL(url); mal(e) }
    img.src = url
  })
}

// Botones grandes para elegir una cosa de una lista (producto, insumo, local).
function eleccion (items, alElegir, opciones) {
  opciones = opciones || {}
  return el('div', { clase: 'eleccion' + (opciones.dos ? ' dos-col' : '') }, items.map((x) =>
    el('button', { clase: 'opcion' + (x.clase ? ' ' + x.clase : ''), type: 'button', onclick: () => { vibrar(); alElegir(x) } },
      x.icono ? icono(x.icono) : null,
      el('span', { clase: 'txt' }, el('b', {}, x.nombre), x.sub ? el('span', { clase: 'sub' }, x.sub) : null),
      opciones.sinFlecha ? null : icono('flecha', 'tenue'))))
}

function aplicarTema () {
  const m = document.querySelector('meta[name=theme-color]')
  if (m) m.content = getComputedStyle(document.documentElement).getPropertyValue('--fondo').trim() || '#f5f6f8'
}

function pantallaMensaje (titulo, texto, boton) {
  poner($app, el('div', { clase: 'entrar' }, el('img', { clase: 'logo', src: 'icono-192.png', alt: '' }), el('h1', {}, titulo), el('p', {}, texto), boton || null))
}
