'use strict'
// DONDE SE GUARDA TODO
//
// Dos maneras con las mismas funciones:
//   - Nube: Supabase, el mismo proyecto del panel de Blue Store (tablas prod_).
//     La direccion sale del link (#p=...) o de proyecto.json; la clave publica,
//     del config.json que ya sube la caja para el panel.
//   - Prueba: todo en este navegador, con datos de mentira. Se entra con
//     ?prueba en el link. Sirve para probar las pantallas sin tocar nada real.
//
// La chica y el que recibe usan un token (lo da el PIN); el dueño, su sesion.

const PRUEBA = /[?&]prueba\b/.test(location.search)

function agruparCatalogo (filas) {
  const cat = { config: null, insumos: [], productos: [] }
  for (const f of filas) {
    const d = Object.assign({}, f.datos, { id: f.id })
    if (f.tipo === 'config') cat.config = f.datos
    else if (f.tipo === 'insumo') cat.insumos.push(d)
    else if (f.tipo === 'producto') cat.productos.push(d)
  }
  return cat
}

const Nube = {
  modo: 'nube',
  sb: null,
  async iniciar () {
    let ref = ''
    const m = /[#&]p=([a-z0-9]+)/.exec(location.hash)
    if (m) { ref = m[1]; guardarLocal('prod.proyecto', ref); history.replaceState(null, '', location.pathname + location.search) }
    if (!ref) ref = leerLocal('prod.proyecto', '')
    if (!ref) { try { const r = await fetch('proyecto.json', { cache: 'no-store' }); if (r.ok) ref = (await r.json()).ref } catch (e) {} }
    if (!ref) throw new Error('falta_link')
    const base = 'https://' + ref + '.supabase.co'
    let conf = leerLocal('prod.config', null)
    try {
      const r = await fetch(base + '/storage/v1/object/public/panel/config.json', { cache: 'no-store' })
      if (!r.ok) throw new Error('config ' + r.status)
      conf = await r.json()
      guardarLocal('prod.config', conf)
    } catch (e) { if (!conf) throw new Error('sin_conexion') }
    this.sb = window.supabase.createClient(base, conf.anon, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'bs-produccion' } })
    // El nombre de config.json es el de la sucursal que lo subio; produccion es de las dos.
    return { negocio: 'Blue Store' }
  },
  async rpc (fn, args) {
    const { data, error } = await this.sb.rpc(fn, args)
    if (error) throw error
    return data
  },
  entrarPin (pin) { return this.rpc('prod_entrar', { p_pin: pin }) },
  estado (token) { return this.rpc('prod_estado', { p_token: token }) },
  registrar (token, mov) { return this.rpc('prod_registrar', { p_token: token || '', p_mov: mov }) },
  foto (token, id, datos) { return this.rpc('prod_foto', { p_token: token || '', p_id: id, p_datos: datos }) },
  async entrarEmail (email, clave) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password: clave })
    if (error) throw error
  },
  async sesionDuenio () {
    const { data } = await this.sb.auth.getSession()
    if (!data.session) return null
    const es = await this.rpc('prod_es_duenio', {})
    return es ? data.session.user.email : false
  },
  recuperarClave (email) { return this.sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }) },
  async salir () { await this.sb.auth.signOut() },
  async todas (tabla, columnas, orden) {
    const out = []
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await this.sb.from(tabla).select(columnas).order(orden, { ascending: true }).range(desde, desde + 999)
      if (error) throw error
      out.push(...data)
      if (data.length < 1000) break
    }
    return out
  },
  async todo () {
    const [cat, movimientos, piezas, dias, personal] = await Promise.all([
      this.todas('prod_catalogo', 'tipo,id,datos', 'id'),
      this.todas('prod_movimientos', 'id,fecha,tipo,datos,persona_id,persona_nombre,quien,dia_id', 'fecha'),
      this.todas('prod_piezas', '*', 'numero'),
      this.todas('prod_dias', '*', 'abierto'),
      this.todas('prod_personal', 'id,nombre,rol,sucursal,valor_hora,activo,creado', 'creado')
    ])
    return { catalogo: agruparCatalogo(cat), movimientos, piezas, dias, personal }
  },
  async verFoto (id) {
    const { data, error } = await this.sb.from('prod_fotos').select('datos').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? data.datos : null
  },
  async guardarCatalogo (tipo, id, datos) {
    const limpio = Object.assign({}, datos)
    delete limpio.id
    const { error } = await this.sb.from('prod_catalogo').upsert({ tipo, id, datos: limpio, actualizado: new Date().toISOString() })
    if (error) throw error
  },
  async borrarCatalogo (tipo, id) {
    const { error } = await this.sb.from('prod_catalogo').delete().eq('tipo', tipo).eq('id', id)
    if (error) throw error
  },
  guardarPersona (p) { return this.rpc('prod_guardar_persona', { p }) }
}

// --- prueba: la misma logica que la nube, guardada en este navegador -------------------------

const Prueba = {
  modo: 'prueba',
  clave: 'prod-prueba-v1',
  leer () {
    const d = leerLocal(this.clave, null)
    if (d) return d
    const nuevo = {
      catalogo: [], movimientos: [], piezas: [], dias: [], fotos: {}, sesiones: {}, duenio: false,
      personal: [
        { id: uuid(), nombre: 'Mica', rol: 'produccion', sucursal: null, pin: '1234', valor_hora: 600000, activo: true, creado: new Date().toISOString() },
        { id: uuid(), nombre: 'Encargado Duffy', rol: 'local', sucursal: 'duffy', pin: '2222', valor_hora: 0, activo: true, creado: new Date().toISOString() },
        { id: uuid(), nombre: 'Encargado Alberdi', rol: 'local', sucursal: 'alberdi', pin: '3333', valor_hora: 0, activo: true, creado: new Date().toISOString() }
      ]
    }
    this.escribir(nuevo)
    return nuevo
  },
  escribir (d) { guardarLocal(this.clave, d) },
  async iniciar () { return { negocio: 'Blue Store (prueba)' } },
  persona (d, token) { const id = d.sesiones[token]; return d.personal.find((p) => p.id === id && p.activo) || null },
  async entrarPin (pin) {
    const d = this.leer()
    const p = d.personal.find((x) => x.activo && x.pin === pin)
    if (!p) return { error: 'pin' }
    const token = uuid()
    d.sesiones[token] = p.id
    this.escribir(d)
    return { token, id: p.id, nombre: p.nombre, rol: p.rol, sucursal: p.sucursal }
  },
  async estado (token) {
    const d = this.leer()
    const v = this.persona(d, token)
    if (!v) return { error: 'sesion' }
    const cat = agruparCatalogo(d.catalogo)
    const conf = cat.config || {}
    const r = {
      persona: { id: v.id, nombre: v.nombre, rol: v.rol, sucursal: v.sucursal },
      config: { sucursales: conf.sucursales || [], fotoProduccion: conf.fotoProduccion !== false, contarAlAbrir: conf.contarAlAbrir !== false },
      productos: cat.productos.map((p) => ({ id: p.id, nombre: p.nombre, venta: p.venta, venceDias: p.venceDias, activo: p.activo !== false, insumos: [...new Set((p.recetas || []).flatMap((x) => (x.lineas || []).map((l) => l.insumoId)))] }))
    }
    const anulado = (id) => d.movimientos.some((a) => a.tipo === 'anular' && a.datos.movId === id)
    const recibido = (id) => d.movimientos.some((a) => a.tipo === 'recepcion' && a.datos.entregaId === id)
    if (v.rol === 'produccion') {
      const dia = d.dias.filter((x) => !x.cerrado).sort((a, b) => b.abierto.localeCompare(a.abierto))[0]
      r.insumos = cat.insumos.map((i) => ({ id: i.id, nombre: i.nombre, modo: i.modo, nombreUnidad: i.nombreUnidad, presentacion: i.presentacion, contar: i.contar !== false, activo: i.activo !== false }))
      r.piezas = d.piezas.filter((p) => p.estado === 'cerrada' || p.estado === 'abierta').map((p) => ({ id: p.id, insumoId: p.insumo_id, numero: p.numero, estado: p.estado })).sort((a, b) => a.numero - b.numero)
      r.dia = dia ? { id: dia.id, abierto: dia.abierto, persona: dia.persona_nombre } : null
      r.hoy = dia ? d.movimientos.filter((m) => m.dia_id === dia.id && ['produccion', 'merma', 'entrega', 'ingreso', 'terminar_pieza', 'conteo'].includes(m.tipo)).map((m) => ({ id: m.id, fecha: m.fecha, tipo: m.tipo, datos: m.datos, anulado: anulado(m.id), recibido: recibido(m.id) })) : []
    } else {
      r.pendientes = d.movimientos.filter((m) => m.tipo === 'entrega' && m.datos.sucursal === v.sucursal && !anulado(m.id) && !recibido(m.id))
        .map((m) => ({ id: m.id, fecha: m.fecha, persona: m.persona_nombre, productos: (m.datos.items || []).map((i) => i.productoId) }))
    }
    return r
  },
  async registrar (token, mov) {
    const d = this.leer()
    const ya = d.movimientos.find((m) => m.id === mov.id)
    if (ya) return Object.assign({}, ya.resultado, { ok: true, repetido: true })
    let quien, nombre, pid, v
    if (token) {
      v = this.persona(d, token)
      if (!v) return { error: 'sesion' }
      quien = v.rol; nombre = v.nombre; pid = v.id
    } else if (d.duenio) { quien = 'duenio'; nombre = 'Dueño'; pid = null } else return { error: 'permiso' }
    const tipo = mov.tipo
    let datos = JSON.parse(JSON.stringify(mov.datos || {}))
    if (quien === 'local' && tipo !== 'recepcion') return { error: 'permiso' }
    if (quien === 'produccion' && !['abrir_dia', 'cerrar_dia', 'conteo', 'ingreso', 'abrir_pieza', 'terminar_pieza', 'produccion', 'merma', 'entrega', 'anular'].includes(tipo)) return { error: 'permiso' }
    if (quien === 'duenio' && !['cerrar_dia', 'conteo', 'ingreso', 'precio_ingreso', 'abrir_pieza', 'terminar_pieza', 'merma', 'anular'].includes(tipo)) return { error: 'permiso' }
    let dia = d.dias.filter((x) => !x.cerrado).sort((a, b) => b.abierto.localeCompare(a.abierto))[0]
    const ahora = new Date().toISOString()
    let res = {}
    if (tipo === 'abrir_dia') {
      if (dia) return { error: 'dia_abierto', diaId: dia.id }
      dia = { id: mov.id, persona_id: pid, persona_nombre: nombre, abierto: ahora, cerrado: null }
      d.dias.push(dia)
    } else if (quien === 'produccion' && !dia) return { error: 'sin_dia' }
    const pieza = (id) => d.piezas.find((p) => p.id === id)
    if (tipo === 'ingreso' && Array.isArray(datos.piezas) && datos.piezas.length) {
      datos.piezas = datos.piezas.map((p) => {
        const numero = d.piezas.reduce((mx, x) => Math.max(mx, x.numero), 0) + 1
        d.piezas.push({ id: p.id, insumo_id: datos.insumoId, numero, estado: 'cerrada', creado: ahora })
        return Object.assign({}, p, { numero })
      })
      res = { piezas: datos.piezas }
    } else if (tipo === 'abrir_pieza') {
      const p = pieza(datos.piezaId); if (p && p.estado === 'cerrada') p.estado = 'abierta'
    } else if (tipo === 'produccion') {
      for (const k in (datos.piezas || {})) { const p = pieza(datos.piezas[k]); if (p && p.estado === 'cerrada') p.estado = 'abierta' }
    } else if (tipo === 'terminar_pieza' || (tipo === 'merma' && datos.piezaId && datos.todaLaPieza)) {
      const p = pieza(datos.piezaId); if (p && (p.estado === 'cerrada' || p.estado === 'abierta')) p.estado = 'terminada'
    } else if (tipo === 'conteo') {
      for (const x of datos.piezas || []) { const p = pieza(x.id); if (p && (x.estado === 'abierta' || x.estado === 'falta') && (p.estado === 'cerrada' || p.estado === 'abierta')) p.estado = x.estado }
    } else if (tipo === 'cerrar_dia') {
      if (!dia) return { error: 'sin_dia' }
      dia.cerrado = ahora
      dia.cerrado_por = quien
    } else if (tipo === 'recepcion') {
      const e = d.movimientos.find((m) => m.id === datos.entregaId && m.tipo === 'entrega')
      if (!e || e.datos.sucursal !== v.sucursal) return { error: 'permiso' }
      if (d.movimientos.some((m) => m.tipo === 'recepcion' && m.datos.entregaId === e.id)) return { error: 'ya_recibido' }
    } else if (tipo === 'anular') {
      const ref = d.movimientos.find((m) => m.id === datos.movId)
      if (!ref) return { error: 'datos' }
      if (quien === 'produccion' && (ref.persona_id !== pid || ref.dia_id !== (dia && dia.id) || !['produccion', 'merma', 'entrega'].includes(ref.tipo) || d.movimientos.some((m) => m.tipo === 'recepcion' && m.datos.entregaId === ref.id))) return { error: 'permiso' }
    }
    d.movimientos.push({ id: mov.id, fecha: ahora, tipo, datos, persona_id: pid, persona_nombre: nombre, quien, dia_id: dia ? dia.id : null, resultado: res })
    this.escribir(d)
    return Object.assign({}, res, { ok: true })
  },
  async foto (token, id, datos) {
    const d = this.leer()
    if (token ? !this.persona(d, token) : !d.duenio) return { error: 'permiso' }
    d.fotos[id] = datos
    try { this.escribir(d) } catch (e) {}
    return { ok: true }
  },
  async entrarEmail () { const d = this.leer(); d.duenio = true; this.escribir(d) },
  async sesionDuenio () { return this.leer().duenio ? 'dueño@prueba' : null },
  async recuperarClave () { return {} },
  async salir () { const d = this.leer(); d.duenio = false; this.escribir(d) },
  async todo () {
    const d = this.leer()
    return {
      catalogo: agruparCatalogo(d.catalogo),
      movimientos: d.movimientos.map((m) => Object.assign({}, m)),
      piezas: d.piezas.slice(),
      dias: d.dias.slice(),
      personal: d.personal.map((p) => ({ id: p.id, nombre: p.nombre, rol: p.rol, sucursal: p.sucursal, valor_hora: p.valor_hora, activo: p.activo, creado: p.creado }))
    }
  },
  async verFoto (id) { return this.leer().fotos[id] || null },
  async guardarCatalogo (tipo, id, datos) {
    const d = this.leer()
    const limpio = Object.assign({}, datos)
    delete limpio.id
    const f = d.catalogo.find((x) => x.tipo === tipo && x.id === id)
    if (f) f.datos = limpio
    else d.catalogo.push({ tipo, id, datos: limpio })
    this.escribir(d)
  },
  async borrarCatalogo (tipo, id) { const d = this.leer(); d.catalogo = d.catalogo.filter((x) => !(x.tipo === tipo && x.id === id)); this.escribir(d) },
  async guardarPersona (p) {
    const d = this.leer()
    if (!p.nombre || !['produccion', 'local'].includes(p.rol)) return { error: 'datos' }
    if (p.pin && !/^[0-9]{4,8}$/.test(p.pin)) return { error: 'pin_formato' }
    const id = p.id || uuid()
    if (p.pin && d.personal.some((x) => x.activo && x.id !== id && x.pin === p.pin)) return { error: 'pin_repetido' }
    let x = d.personal.find((y) => y.id === id)
    if (!x && !p.pin) return { error: 'pin_falta' }
    if (!x) { x = { id, creado: new Date().toISOString() }; d.personal.push(x) }
    Object.assign(x, { nombre: p.nombre, rol: p.rol, sucursal: p.sucursal || null, valor_hora: Number(p.valorHora) || 0, activo: p.activo !== false })
    if (p.pin) x.pin = p.pin
    if (p.pin || p.activo === false) for (const t in d.sesiones) if (d.sesiones[t] === id) delete d.sesiones[t]
    this.escribir(d)
    return { ok: true, id }
  },
  borrarTodo () { try { localStorage.removeItem(this.clave) } catch (e) {} }
}

const API = PRUEBA ? Prueba : Nube

// Los errores que devuelve la base, en castellano.
const ERRORES = {
  sesion: 'Se venció tu sesión. Entrá de nuevo con tu PIN.',
  permiso: 'No tenés permiso para esto.',
  sin_dia: 'Primero tenés que empezar el día.',
  dia_abierto: 'El día ya está empezado.',
  datos: 'Algo de lo que se cargó no está bien. Revisalo.',
  ya_recibido: 'Esto ya lo recibió alguien.',
  bloqueado: 'Demasiados PIN equivocados. Esperá 10 minutos.',
  pin: 'PIN equivocado.',
  pin_formato: 'El PIN tiene que ser de 4 a 8 números.',
  pin_repetido: 'Ese PIN ya lo usa otra persona. Elegí otro.',
  pin_falta: 'Poné un PIN para la persona nueva.'
}
const esDeRed = (e) => !!e && (e instanceof TypeError || /fetch|network|Failed to|Load failed|conexi/i.test(String(e.message || e)))
function textoError (e) {
  if (!e) return 'Algo salió mal.'
  if (typeof e === 'string') return ERRORES[e] || e
  if (e.error) return ERRORES[e.error] || e.error
  if (esDeRed(e)) return 'Sin conexión. Revisá el wifi o los datos y probá de nuevo.'
  return e.message || String(e)
}
