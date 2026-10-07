'use strict'
// LA PANTALLA DE LA CHICA DE PRODUCCION
//
// Todo a uno o dos toques y con numeros grandes: se usa con las manos ocupadas.
// Nunca ve costos ni lo que "deberia" haber: el conteo del cierre es a ciegas y
// al terminar solo dice "dia cerrado". Lo que se equivoca lo puede anular ese
// mismo dia (queda a la vista del dueño).

function plural (palabra, n) {
  if (!palabra || n === 1) return palabra || ''
  if (/ón$/.test(palabra)) return palabra.replace(/ón$/, 'ones')
  if (/[aeiou]$/i.test(palabra)) return palabra + 's'
  return palabra + 'es'
}
const unidadDe = (i) => (!i ? 'u' : i.modo === 'pieza' || i.modo === 'peso' ? 'g' : (i.nombreUnidad || 'unidad'))
function cantidadTexto (i, q) {
  const u = unidadDe(i)
  if (u === 'g') return fmtCant(q, 'g')
  return fmt(q) + ' ' + plural(u, q)
}

const Prod = {
  async arrancar () {
    poner($app, el('div', { clase: 'pagina-chica' }, barraPersona('Producción'), el('div', { clase: 'nada' }, 'Cargando…')))
    try { await cargarEstado() } catch (e) {
      if (e && e.error === 'sesion') return
      S.estado = leerLocal('prod.estado', null)
      if (!S.estado) return pantallaMensaje('Sin conexión', textoError(e), el('button', { clase: 'btn primario ancho grande', onclick: () => Prod.arrancar() }, 'Probar de nuevo'))
      toast('Sin señal: se ve lo último que se bajó.', 'mal')
    }
    Prod.inicio()
    vaciarCola()
  },

  // Despues de anotar algo: volver a bajar el estado y pintar el inicio.
  async refrescar () {
    try { await cargarEstado() } catch (e) { if (e && e.error === 'sesion') return }
    Prod.inicio()
  },

  insumo (id) { return (S.estado.insumos || []).find((i) => i.id === id) },
  producto (id) { return (S.estado.productos || []).find((p) => p.id === id) },
  insumos () { return (S.estado.insumos || []).filter((i) => i.activo !== false) },
  productos () { return (S.estado.productos || []).filter((p) => p.activo !== false) },
  piezas (insumoId, estado) { return (S.estado.piezas || []).filter((p) => p.insumoId === insumoId && (!estado || p.estado === estado)) },
  nombrePieza (p) { const i = Prod.insumo(p.insumoId); return (i ? i.nombre : 'Pieza') + ' N° ' + p.numero },

  inicio () {
    const e = S.estado
    const dia = e.dia
    const cont = el('main', { clase: 'pagina-chica' })
    cont.append(barraPersona('Producción'))
    if (!dia) {
      cont.append(
        el('div', { clase: 'tarjeta centro grande-espacio' },
          el('div', { clase: 'ico-grande' }, icono('balanza')),
          el('h2', {}, 'Hoy todavía no empezaste'),
          el('p', { clase: 'tenue' }, e.config.contarAlAbrir ? 'Al empezar vas a pesar y contar lo que hay, sin mirar nada más. Tarda unos minutos.' : 'Tocá para empezar el día.'),
          el('button', { clase: 'btn primario ancho grande', onclick: () => Prod.empezarDia() }, 'Empezar el día')))
      return poner($app, cont)
    }
    const conteoApertura = (e.hoy || []).some((m) => m.tipo === 'conteo' && m.datos && m.datos.momento === 'apertura')
    cont.append(el('div', { clase: 'sub', estilo: { margin: '-2px 0 12px' } }, 'Día empezado a las ' + horaCorta(Date.parse(dia.abierto))))
    if (e.config.contarAlAbrir && !conteoApertura) {
      cont.append(el('div', { clase: 'aviso alerta' }, el('b', {}, 'Falta el conteo de la mañana'), 'Antes de producir, pesá y contá lo que hay.',
        el('button', { clase: 'btn ancho', estilo: { marginTop: '10px' }, onclick: () => Prod.conteo('apertura') }, 'Contar ahora')))
    }
    const acciones = [
      { nombre: 'Anotar lo que hice', icono: 'cocina', fn: () => Prod.producir() },
      { nombre: 'Llegó mercadería', icono: 'recibir', fn: () => Prod.llego() },
      { nombre: 'Se terminó una pieza', icono: 'pieza', fn: () => Prod.terminarPieza() },
      { nombre: 'Merma (con foto)', icono: 'foto', fn: () => Prod.merma() },
      { nombre: 'Mandar a un local', icono: 'camion', fn: () => Prod.mandar() },
      { nombre: 'Terminar el día', icono: 'candado', fn: () => Prod.terminarDia(), clase: 'fin' }
    ]
    cont.append(el('div', { clase: 'acciones-chica' }, acciones.map((a) =>
      el('button', { clase: 'accion-chica' + (a.clase ? ' ' + a.clase : ''), onclick: () => { vibrar(); a.fn() } }, el('span', { clase: 'ico' }, icono(a.icono)), a.nombre))))
    cont.append(Prod.hoyLista())
    poner($app, cont)
    pintarCola()
  },

  hoyLista () {
    const hoy = (S.estado.hoy || []).filter((m) => m.tipo !== 'conteo').slice().reverse()
    const caja = el('div', { clase: 'tarjeta sin-relleno' }, el('h2', {}, 'Lo que anotaste hoy'))
    if (!hoy.length) { caja.append(vacio('Todavía nada.')); return caja }
    const lista = el('div', { clase: 'lista' })
    for (const m of hoy) {
      const d = m.datos || {}
      let titulo = ''
      let sub = horaCorta(Date.parse(m.fecha))
      if (m.tipo === 'produccion') {
        const p = Prod.producto(d.productoId)
        titulo = (p && p.venta === 'peso' ? fmtCant(d.cantidad, 'g') + (d.envases ? ' en ' + d.envases + ' ' + plural('bandeja', d.envases) : '') : fmt(d.cantidad)) + ' · ' + (p ? p.nombre : 'Producto')
      } else if (m.tipo === 'merma') {
        const it = d.clase === 'producto' ? Prod.producto(d.id) : Prod.insumo(d.id)
        titulo = 'Merma: ' + (it ? it.nombre : '') + ' (' + (d.clase === 'producto' ? (it && it.venta === 'peso' ? fmtCant(d.cantidad, 'g') : fmt(d.cantidad)) : cantidadTexto(it, d.cantidad)) + ')'
        sub += ' · ' + (d.motivo || '')
      } else if (m.tipo === 'entrega') {
        const suc = (S.estado.config.sucursales || []).find((s) => s.id === d.sucursal)
        titulo = 'Mandado a ' + (suc ? suc.nombre : d.sucursal)
        sub += ' · ' + (d.items || []).map((i) => { const p = Prod.producto(i.productoId); return fmt(i.cantidad) + ' ' + (p ? p.nombre : '') }).join(', ')
        if (m.recibido) sub += ' · recibido'
      } else if (m.tipo === 'ingreso') {
        const i = Prod.insumo(d.insumoId)
        titulo = 'Llegó ' + (i ? i.nombre : '') + (d.piezas && d.piezas.length ? ': N° ' + d.piezas.map((p) => p.numero).join(', ') : ' (' + cantidadTexto(i, d.cantidad) + ')')
      } else if (m.tipo === 'terminar_pieza') {
        const p = (S.estado.piezas || []).find((x) => x.id === d.piezaId)
        titulo = 'Pieza terminada' + (p ? ' N° ' + p.numero : d.numero ? ' N° ' + d.numero : '') + ' · punta ' + fmtCant(d.punta, 'g')
        sub += d.destino === 'merma' ? ' · se tiró' : ' · a bandejas'
      }
      const puedeAnular = !m.anulado && !m.recibido && ['produccion', 'merma', 'entrega'].includes(m.tipo)
      lista.append(el('div', { clase: 'item' + (m.anulado ? ' inactivo' : '') },
        el('div', { clase: 'cuerpo' }, el('b', {}, titulo), el('div', { clase: 'sub' }, m.anulado ? 'Anulado' : sub)),
        puedeAnular ? el('button', { clase: 'btn chico', onclick: () => Prod.anular(m, titulo) }, 'Me equivoqué') : null))
    }
    caja.append(lista)
    return caja
  },

  async anular (m, titulo) {
    if (!(await confirmar('Anular', '¿Anular "' + titulo + '"? Después lo podés anotar bien de nuevo. El dueño ve lo anulado.', 'Anular', true))) return
    try {
      await anotar('anular', { movId: m.id }, { puedeEsperar: true })
      toast('Anulado', 'ok')
      Prod.refrescar()
    } catch (e) { toast(textoError(e), 'mal', 5) }
  },

  // --- empezar el dia -----------------------------------------------------------------------
  async empezarDia () {
    try {
      const r = await anotar('abrir_dia', {})
      if (r && r.error) throw r
    } catch (e) {
      if (!(e && e.error === 'dia_abierto')) return toast(textoError(e), 'mal', 5)
    }
    await Prod.refrescar()
    if (S.estado.config.contarAlAbrir) Prod.conteo('apertura')
  },

  // --- anotar lo que hice -------------------------------------------------------------------
  producir () {
    const prods = Prod.productos()
    if (!prods.length) return toast('Todavía no hay productos cargados. Avisale al dueño.', 'mal', 5)
    const h = hoja({ titulo: '¿Qué hiciste?', completa: true, cuerpo: eleccion(prods.map((p) => ({ nombre: p.nombre, id: p.id, sub: p.venta === 'peso' ? 'Por peso' : '' })), (x) => { h.cerrar(); setTimeout(() => Prod.producirCuanto(Prod.producto(x.id)), 80) }) })
  },
  producirCuanto (p) {
    const porPeso = p.venta === 'peso'
    const cant = porPeso ? campoNumero('Peso total de lo que armaste', 'g', { placeholder: 'Ej: 1250', ayuda: 'Pesá todas las bandejas juntas.' }) : contador(0)
    const envases = porPeso ? contador(1) : null
    const error = el('div', { clase: 'error' })
    // Que pieza se uso de cada insumo que se pesa por pieza (hormas, jamon...).
    const elegidas = {}
    const bloques = []
    for (const insumoId of p.insumos || []) {
      const ins = Prod.insumo(insumoId)
      if (!ins || ins.modo !== 'pieza') continue
      const abiertas = Prod.piezas(insumoId, 'abierta')
      const cerradas = Prod.piezas(insumoId, 'cerrada')
      const b = el('div', { clase: 'campo' })
      const pintar = () => {
        const sel = elegidas[insumoId]
        const opciones = abiertas.length && !b.cambiar ? abiertas : abiertas.concat(cerradas)
        poner(b,
          el('span', {}, ins.nombre + ': ¿de qué pieza?'),
          !opciones.length
            ? el('div', { clase: 'aviso alerta' }, 'No hay ninguna pieza de ' + ins.nombre.toLowerCase() + ' anotada. Si llegó, anotala en "Llegó mercadería".')
            : el('div', { clase: 'chips grandes' }, opciones.map((pz) => el('button', {
              type: 'button', clase: 'chip-btn' + (sel === pz.id ? ' activo' : ''), onclick: () => { elegidas[insumoId] = pz.id; pintar() }
            }, 'N° ' + pz.numero + (pz.estado === 'cerrada' ? ' (nueva)' : '')))),
          abiertas.length && !b.cambiar && cerradas.length ? el('button', { type: 'button', clase: 'btn chico', estilo: { justifySelf: 'start' }, onclick: () => { b.cambiar = true; pintar() } }, 'Abrí una nueva') : null)
      }
      if (abiertas.length === 1) elegidas[insumoId] = abiertas[0].id
      pintar()
      b.necesita = () => (abiertas.length + cerradas.length > 0 ? insumoId : null)
      bloques.push(b)
    }
    const foto = S.estado.config.fotoProduccion ? botonFoto('Sacar foto de lo que hiciste') : null
    const guardar = el('button', { clase: 'btn primario' }, 'Guardar')
    const h = hoja({
      titulo: p.nombre,
      completa: true,
      cuerpo: [
        porPeso ? [cant, el('div', { clase: 'campo' }, '¿Cuántas bandejas?', envases)] : el('div', { clase: 'campo' }, '¿Cuántos hiciste?', cant),
        bloques,
        foto ? el('div', { clase: 'campo' }, 'Foto', foto) : null,
        error
      ],
      pie: [el('button', { clase: 'btn', onclick: () => h.cerrar() }, 'Cancelar'), guardar]
    })
    guardar.addEventListener('click', async () => {
      const cantidad = porPeso ? cant.valor() : cant.valor()
      if (!(cantidad > 0)) { error.textContent = porPeso ? 'Poné el peso.' : 'Poné cuántos hiciste.'; return }
      if (porPeso && !(envases.valor() > 0)) { error.textContent = 'Poné cuántas bandejas.'; return }
      for (const b of bloques) { const id = b.necesita(); if (id && !elegidas[id]) { error.textContent = 'Elegí de qué pieza de ' + Prod.insumo(id).nombre.toLowerCase() + '.'; return } }
      if (foto && !foto.datos()) { error.textContent = 'Falta la foto.'; return }
      guardar.disabled = true
      guardar.textContent = 'Guardando…'
      const fotoId = foto && foto.datos() ? uuid() : null
      try {
        const r = await anotar('produccion', { productoId: p.id, cantidad, envases: porPeso ? envases.valor() : undefined, piezas: elegidas, fotoId }, { puedeEsperar: true, foto: fotoId ? { id: fotoId, datos: foto.datos() } : null })
        h.cerrar()
        const vence = p.venceDias ? fechaCorta(Date.now() + p.venceDias * 86400000) : null
        Prod.listo('Anotado', (porPeso ? fmtCant(cantidad, 'g') : fmt(cantidad)) + ' · ' + p.nombre, vence ? 'Vencen el ' + vence + '. Escribilo en las etiquetas.' : '', r && r.encolado)
      } catch (e) {
        error.textContent = textoError(e)
        guardar.disabled = false
        guardar.textContent = 'Guardar'
      }
    })
  },

  // Cartel de "listo" con lo importante grande (la fecha de vencimiento, los numeros de pieza).
  listo (titulo, texto, grande, encolado) {
    const h = hoja({
      titulo,
      cuerpo: el('div', { clase: 'centro' },
        el('div', { clase: 'ico-grande ok' }, icono('ok')),
        el('p', { estilo: { fontSize: '17px', fontWeight: '650' } }, texto),
        grande ? el('div', { clase: 'aviso info grande-texto' }, grande) : null,
        encolado ? el('div', { clase: 'aviso alerta' }, 'Sin señal: quedó guardado y se manda solo cuando vuelva.') : null),
      pie: [el('button', { clase: 'btn primario grande', onclick: () => h.cerrar() }, 'Listo')],
      alCerrar: () => Prod.refrescar()
    })
  },

  // --- llego mercaderia ------------------------------------------------------------------------
  llego () {
    const ins = Prod.insumos()
    if (!ins.length) return toast('Todavía no hay insumos cargados. Avisale al dueño.', 'mal', 5)
    const h = hoja({
      titulo: '¿Qué llegó?', completa: true,
      cuerpo: eleccion(ins.map((i) => ({ id: i.id, nombre: i.nombre, sub: i.modo === 'pieza' ? 'Por pieza (se pesa cada una)' : i.modo === 'peso' ? 'Se pesa' : (i.presentacion ? 'Por ' + i.presentacion.nombre + ' o ' + unidadDe(i) : 'Por ' + unidadDe(i)) })), (x) => { h.cerrar(); setTimeout(() => Prod.llegoCuanto(Prod.insumo(x.id)), 80) })
    })
  },
  llegoCuanto (ins) {
    const error = el('div', { clase: 'error' })
    const guardar = el('button', { clase: 'btn primario' }, 'Guardar')
    const inicial = el('label', { clase: 'check' }, el('input', { type: 'checkbox' }), 'Es lo que ya había (para empezar a usar el sistema)')
    let leer
    let cuerpo
    if (ins.modo === 'pieza') {
      const pesos = el('div', {})
      let filas = []
      const armar = (n) => {
        const viejos = filas.map((f) => f.input.value)
        filas = Array.from({ length: n }, (_, i) => { const c = campoNumero('Pieza ' + (i + 1) + ': pesala', 'g', { placeholder: 'Ej: 4020' }); if (viejos[i]) c.input.value = viejos[i]; return c })
        poner(pesos, filas)
      }
      const cuantas = contador(1, (n) => armar(Math.min(20, Math.max(1, n))))
      armar(1)
      const boleta = campoNumero('Peso total que dice la boleta (si lo sabés)', 'g', { placeholder: 'Opcional' })
      cuerpo = [el('div', { clase: 'campo' }, '¿Cuántas piezas llegaron?', cuantas), pesos, boleta, inicial]
      leer = () => {
        const ps = filas.map((f) => f.valor())
        if (ps.some((x) => !(x > 0))) return 'Pesá cada pieza.'
        const b = boleta.valor()
        return { insumoId: ins.id, piezas: ps.map((peso) => ({ id: uuid(), peso })), pesoFactura: b > 0 ? b : undefined }
      }
    } else if (ins.modo === 'peso') {
      const peso = campoNumero('¿Cuánto pesa lo que llegó?', 'g', { placeholder: 'Ej: 2900' })
      const boleta = campoNumero('Peso que dice la boleta (si lo sabés)', 'g', { placeholder: 'Opcional' })
      cuerpo = [peso, boleta, inicial]
      leer = () => { const q = peso.valor(); if (!(q > 0)) return 'Poné el peso.'; const b = boleta.valor(); return { insumoId: ins.id, cantidad: q, pesoFactura: b > 0 ? b : undefined } }
    } else {
      const u = unidadDe(ins)
      const pres = ins.presentacion && ins.presentacion.cantidad > 0 ? ins.presentacion : null
      const enteros = pres ? campoNumero('Cantidad de ' + plural(pres.nombre, 2), plural(pres.nombre, 2), { placeholder: '0', ayuda: 'Cada ' + pres.nombre + ' trae ' + pres.cantidad + ' ' + plural(u, pres.cantidad) + '.' }) : null
      const sueltos = campoNumero(pres ? 'Y ' + plural(u, 2) + ' aparte' : 'Cantidad de ' + plural(u, 2), plural(u, 2), { placeholder: '0' })
      cuerpo = [enteros, sueltos, inicial]
      leer = () => {
        const q = (pres ? (enteros.valor() || 0) * pres.cantidad : 0) + (sueltos.valor() || 0)
        if (!(q > 0)) return 'Poné cuánto llegó.'
        return { insumoId: ins.id, cantidad: q }
      }
    }
    const h = hoja({ titulo: 'Llegó ' + ins.nombre.toLowerCase(), completa: true, cuerpo: [cuerpo, error], pie: [el('button', { clase: 'btn', onclick: () => h.cerrar() }, 'Cancelar'), guardar] })
    guardar.addEventListener('click', async () => {
      const d = leer()
      if (typeof d === 'string') { error.textContent = d; return }
      if (inicial.querySelector('input').checked) d.inicial = true
      guardar.disabled = true
      guardar.textContent = 'Guardando…'
      try {
        // Necesita señal: los numeros de las piezas los da la nube.
        const r = await anotar('ingreso', d)
        h.cerrar()
        if (r.piezas && r.piezas.length) {
          Prod.listo('Escribí los números', ins.nombre, el('div', {}, 'Escribí con fibrón el número en cada pieza:', el('div', { clase: 'numeros-piezas' }, r.piezas.map((p) => el('div', {}, el('b', {}, 'N° ' + p.numero), el('span', {}, fmtCant(p.peso, 'g')))))))
        } else Prod.listo('Anotado', 'Llegó ' + cantidadTexto(ins, d.cantidad) + ' de ' + ins.nombre.toLowerCase())
      } catch (e) {
        error.textContent = textoError(e)
        guardar.disabled = false
        guardar.textContent = 'Guardar'
      }
    })
  },

  // --- se termino una pieza -------------------------------------------------------------------------
  terminarPieza () {
    const ps = (S.estado.piezas || []).slice().sort((a, b) => (a.estado === b.estado ? a.numero - b.numero : a.estado === 'abierta' ? -1 : 1))
    if (!ps.length) return toast('No hay piezas anotadas.', 'mal')
    const h = hoja({
      titulo: '¿Qué pieza se terminó?', completa: true,
      cuerpo: eleccion(ps.map((p) => ({ id: p.id, nombre: Prod.nombrePieza(p), sub: p.estado === 'abierta' ? 'Abierta' : 'Sin abrir' })), (x) => { h.cerrar(); setTimeout(() => Prod.terminarPiezaPeso(ps.find((p) => p.id === x.id)), 80) })
    })
  },
  terminarPiezaPeso (pz) {
    const punta = campoNumero('Pesá lo que quedó (la punta)', 'g', { placeholder: 'Ej: 120', ayuda: 'Si no quedó nada, poné 0.' })
    let destino = 'recortes'
    const foto = botonFoto('Sacar foto de lo que se tira')
    const zonaFoto = el('div', { clase: 'campo', hidden: true }, 'Foto (obligatoria si se tira)', foto)
    const seg = el('div', { clase: 'seg ancho' })
    const pintar = () => {
      poner(seg, [['recortes', 'Va a bandejas'], ['merma', 'Se tira']].map(([v, t]) => el('button', { type: 'button', clase: destino === v ? 'activo' : '', onclick: () => { destino = v; zonaFoto.hidden = v !== 'merma'; pintar() } }, t)))
    }
    pintar()
    const error = el('div', { clase: 'error' })
    const guardar = el('button', { clase: 'btn primario' }, 'Guardar')
    const h = hoja({ titulo: Prod.nombrePieza(pz), completa: true, cuerpo: [punta, el('div', { clase: 'campo' }, '¿Qué se hace con la punta?', seg), zonaFoto, error], pie: [el('button', { clase: 'btn', onclick: () => h.cerrar() }, 'Cancelar'), guardar] })
    guardar.addEventListener('click', async () => {
      const q = punta.valor()
      if (!(q >= 0) || punta.input.value.trim() === '') { error.textContent = 'Pesá la punta (o poné 0).'; return }
      if (destino === 'merma' && q > 0 && !foto.datos()) { error.textContent = 'Falta la foto de lo que se tira.'; return }
      guardar.disabled = true
      const fotoId = destino === 'merma' && foto.datos() ? uuid() : null
      try {
        const r = await anotar('terminar_pieza', { piezaId: pz.id, numero: pz.numero, punta: q, destino, fotoId }, { puedeEsperar: true, foto: fotoId ? { id: fotoId, datos: foto.datos() } : null })
        h.cerrar()
        Prod.listo('Anotado', Prod.nombrePieza(pz) + ' terminada', '', r && r.encolado)
      } catch (e) { error.textContent = textoError(e); guardar.disabled = false }
    })
  },

  // --- merma -------------------------------------------------------------------------------------------
  merma () {
    const h = hoja({
      titulo: '¿Qué se perdió?', completa: true,
      cuerpo: [
        el('h3', {}, 'Algo ya hecho'),
        eleccion(Prod.productos().map((p) => ({ id: 'p:' + p.id, nombre: p.nombre })), (x) => { h.cerrar(); setTimeout(() => Prod.mermaCuanto('producto', Prod.producto(x.id.slice(2))), 80) }),
        el('h3', {}, 'Un insumo'),
        eleccion(Prod.insumos().map((i) => ({ id: 'i:' + i.id, nombre: i.nombre })), (x) => { h.cerrar(); setTimeout(() => Prod.mermaCuanto('insumo', Prod.insumo(x.id.slice(2))), 80) })
      ]
    })
  },
  mermaCuanto (clase, item) {
    const error = el('div', { clase: 'error' })
    const esPeso = clase === 'producto' ? item.venta === 'peso' : (item.modo === 'pieza' || item.modo === 'peso')
    const cant = esPeso ? campoNumero('¿Cuánto pesa lo que se tira?', 'g', { placeholder: 'Ej: 300' }) : el('div', { clase: 'campo' }, '¿Cuántos?', contador(1))
    const leerCant = () => (esPeso ? cant.valor() : cant.lastChild.valor())
    let pieza = null
    let toda = false
    let zonaPieza = null
    if (clase === 'insumo' && item.modo === 'pieza') {
      const ps = Prod.piezas(item.id)
      zonaPieza = el('div', { clase: 'campo' })
      const pintar = () => poner(zonaPieza, '¿De qué pieza?',
        el('div', { clase: 'chips grandes' }, ps.map((pz) => el('button', { type: 'button', clase: 'chip-btn' + (pieza === pz.id ? ' activo' : ''), onclick: () => { pieza = pz.id; pintar() } }, 'N° ' + pz.numero))),
        el('label', { clase: 'check' }, el('input', { type: 'checkbox', checked: toda || null, onchange: (ev) => { toda = ev.target.checked } }), 'Se tira la pieza entera (pesá todo lo que queda de ella)'))
      if (ps.length === 1) pieza = ps[0].id
      pintar()
    }
    let motivo = ''
    const motivos = ['Vencido', 'Se cayó o se rompió', 'En mal estado', 'Otro']
    const otro = el('input', { type: 'text', placeholder: 'Contá qué pasó', hidden: true })
    const chips = el('div', { clase: 'chips grandes' })
    const pintarMotivos = () => poner(chips, motivos.map((m) => el('button', { type: 'button', clase: 'chip-btn' + (motivo === m ? ' activo' : ''), onclick: () => { motivo = m; otro.hidden = m !== 'Otro'; pintarMotivos() } }, m)))
    pintarMotivos()
    const foto = botonFoto('Sacar foto')
    const guardar = el('button', { clase: 'btn primario' }, 'Guardar')
    const h = hoja({ titulo: 'Merma: ' + item.nombre, completa: true, cuerpo: [zonaPieza, cant, el('div', { clase: 'campo' }, '¿Por qué?', chips, otro), el('div', { clase: 'campo' }, 'Foto (obligatoria)', foto), error], pie: [el('button', { clase: 'btn', onclick: () => h.cerrar() }, 'Cancelar'), guardar] })
    guardar.addEventListener('click', async () => {
      const q = leerCant()
      if (zonaPieza && !pieza) { error.textContent = 'Elegí de qué pieza.'; return }
      if (!(q > 0)) { error.textContent = 'Poné cuánto.'; return }
      if (!motivo) { error.textContent = 'Elegí por qué.'; return }
      if (motivo === 'Otro' && !otro.value.trim()) { error.textContent = 'Contá qué pasó.'; return }
      if (!foto.datos()) { error.textContent = 'Falta la foto.'; return }
      guardar.disabled = true
      const fotoId = uuid()
      try {
        const r = await anotar('merma', { clase, id: item.id, cantidad: q, piezaId: pieza || undefined, todaLaPieza: toda || undefined, motivo: motivo === 'Otro' ? otro.value.trim() : motivo, fotoId }, { puedeEsperar: true, foto: { id: fotoId, datos: foto.datos() } })
        h.cerrar()
        Prod.listo('Merma anotada', item.nombre, '', r && r.encolado)
      } catch (e) { error.textContent = textoError(e); guardar.disabled = false }
    })
  },

  // --- mandar a un local ---------------------------------------------------------------------------------
  mandar () {
    const sucs = S.estado.config.sucursales || []
    if (!sucs.length) return toast('El dueño todavía no cargó los locales.', 'mal', 5)
    const h = hoja({ titulo: '¿A qué local?', cuerpo: eleccion(sucs.map((s) => ({ id: s.id, nombre: s.nombre, icono: 'camion' })), (x) => { h.cerrar(); setTimeout(() => Prod.mandarQue(x), 80) }) })
  },
  mandarQue (suc) {
    const filas = Prod.productos().map((p) => {
      const c = p.venta === 'peso' ? campoNumero('', 'g', { placeholder: '0' }) : contador(0)
      return { p, c, nodo: el('div', { clase: 'fila-mandar' }, el('b', {}, p.nombre), c) }
    })
    const error = el('div', { clase: 'error' })
    const guardar = el('button', { clase: 'btn primario' }, 'Mandar')
    const h = hoja({ titulo: 'Mandar a ' + suc.nombre, completa: true, cuerpo: [el('p', { clase: 'tenue' }, 'Poné cuánto de cada cosa va en este viaje.'), filas.map((f) => f.nodo), error], pie: [el('button', { clase: 'btn', onclick: () => h.cerrar() }, 'Cancelar'), guardar] })
    guardar.addEventListener('click', async () => {
      const items = filas.map((f) => ({ productoId: f.p.id, cantidad: f.c.valor() || 0 })).filter((i) => i.cantidad > 0)
      if (!items.length) { error.textContent = 'Poné al menos una cantidad.'; return }
      guardar.disabled = true
      try {
        const r = await anotar('entrega', { sucursal: suc.id, items }, { puedeEsperar: true })
        h.cerrar()
        Prod.listo('Anotado', 'Va a ' + suc.nombre, 'En ' + suc.nombre + ' lo tienen que contar y confirmar al recibirlo.', r && r.encolado)
      } catch (e) { error.textContent = textoError(e); guardar.disabled = false }
    })
  },

  // --- terminar el dia ---------------------------------------------------------------------------------------
  async terminarDia () {
    const pendientes = S.cola.length
    if (pendientes) return toast('Hay cosas sin mandar por falta de señal. Esperá a tener señal para cerrar.', 'mal', 5)
    if (!(await confirmar('Terminar el día', 'Vas a pesar y contar todo lo que queda. Después se cierra el día.', 'Empezar a contar'))) return
    Prod.conteo('cierre')
  },

  // El conteo a ciegas: todo vacio, hay que poner cada cosa (0 si no hay).
  conteo (momento) {
    const e = S.estado
    const error = el('div', { clase: 'error' })
    const campos = []
    const bloques = []
    // Piezas (hormas, jamon...): las abiertas se pesan; las cerradas, ¿estan?
    const piezasIns = Prod.insumos().filter((i) => i.modo === 'pieza')
    for (const ins of piezasIns) {
      const ps = Prod.piezas(ins.id)
      if (!ps.length) continue
      const caja = el('div', { clase: 'tarjeta' }, el('h2', {}, ins.nombre))
      for (const pz of ps) {
        if (pz.estado === 'abierta') {
          const c = campoNumero('N° ' + pz.numero + ' (abierta): pesala', 'g', { placeholder: 'Peso' })
          campos.push({ tipo: 'pieza', pz, leer: () => { const v = c.valor(); return c.input.value.trim() === '' || !(v >= 0) ? null : { id: pz.id, estado: v > 0 ? 'abierta' : 'falta', peso: v } }, nombre: 'N° ' + pz.numero })
          caja.append(c)
        } else {
          let est = null
          const peso = campoNumero('Pesala', 'g', { placeholder: 'Peso' })
          peso.hidden = true
          const seg = el('div', { clase: 'seg ancho' })
          const pintar = () => poner(seg, [['cerrada', 'Está cerrada'], ['abierta', 'La abrí'], ['falta', 'No está']].map(([v, t]) => el('button', { type: 'button', clase: est === v ? 'activo' : '', onclick: () => { est = v; peso.hidden = v !== 'abierta'; pintar() } }, t)))
          pintar()
          campos.push({ tipo: 'pieza', pz, leer: () => (est == null ? null : est === 'abierta' ? (peso.valor() > 0 ? { id: pz.id, estado: 'abierta', peso: peso.valor() } : null) : { id: pz.id, estado: est }), nombre: 'N° ' + pz.numero })
          caja.append(el('div', { clase: 'campo' }, 'N° ' + pz.numero, seg, peso))
        }
      }
      bloques.push(caja)
    }
    // Lo demas: se pesa o se cuenta.
    const otros = Prod.insumos().filter((i) => i.modo !== 'pieza' && i.contar !== false).concat([{ id: 'recortes', nombre: 'Recortes y puntas (para bandejas)', modo: 'peso' }])
    const cajaIns = el('div', { clase: 'tarjeta' }, el('h2', {}, 'Insumos'))
    for (const ins of otros) {
      const u = unidadDe(ins)
      const pres = ins.presentacion && ins.presentacion.cantidad > 0 ? ins.presentacion : null
      if (pres) {
        const a = campoNumero('Cantidad de ' + plural(pres.nombre, 2), '', { placeholder: 'Contalos' })
        const b = campoNumero(plural(u, 2) + ' aparte', '', { placeholder: 'Contalos' })
        campos.push({ tipo: 'insumo', id: ins.id, nombre: ins.nombre, leer: () => (a.input.value.trim() === '' && b.input.value.trim() === '' ? null : (a.valor() || 0) * pres.cantidad + (b.valor() || 0)) })
        cajaIns.append(el('div', { clase: 'campo' }, el('b', {}, ins.nombre), el('div', { clase: 'dos' }, a, b)))
      } else {
        const c = campoNumero(ins.nombre, u === 'g' ? 'g' : plural(u, 2), { placeholder: u === 'g' ? 'Pesalo' : 'Contalos', decimales: u !== 'g' })
        campos.push({ tipo: 'insumo', id: ins.id, nombre: ins.nombre, leer: () => { const v = c.valor(); return c.input.value.trim() === '' || !(v >= 0) ? null : v } })
        cajaIns.append(c)
      }
    }
    bloques.push(cajaIns)
    const cajaProd = el('div', { clase: 'tarjeta' }, el('h2', {}, 'Lo hecho que queda acá'), el('p', { clase: 'sub' }, 'Lo que todavía no mandaste a ningún local.'))
    for (const p of Prod.productos()) {
      const c = campoNumero(p.nombre, p.venta === 'peso' ? 'g' : '', { placeholder: p.venta === 'peso' ? 'Pesalo' : 'Contalos' })
      campos.push({ tipo: 'producto', id: p.id, nombre: p.nombre, leer: () => { const v = c.valor(); return c.input.value.trim() === '' || !(v >= 0) ? null : v } })
      cajaProd.append(c)
    }
    bloques.push(cajaProd)
    const guardar = el('button', { clase: 'btn primario' }, momento === 'cierre' ? 'Cerrar el día' : 'Listo')
    const h = hoja({
      titulo: momento === 'cierre' ? 'Conteo del cierre' : 'Conteo de la mañana',
      completa: true,
      fija: true,
      foco: false,
      cuerpo: [el('div', { clase: 'aviso info' }, 'Pesá y contá todo. Si de algo no hay, poné 0.'), bloques, error],
      pie: [el('button', { clase: 'btn', onclick: () => h.cerrar() }, 'Después'), guardar]
    })
    guardar.addEventListener('click', async () => {
      const datos = { momento, insumos: {}, piezas: [], productos: {} }
      const faltan = []
      for (const c of campos) {
        const v = c.leer()
        if (v == null) { faltan.push(c.nombre); continue }
        if (c.tipo === 'pieza') datos.piezas.push(v)
        else if (c.tipo === 'insumo') datos.insumos[c.id] = v
        else datos.productos[c.id] = v
      }
      if (faltan.length) { error.textContent = 'Te falta: ' + faltan.slice(0, 4).join(', ') + (faltan.length > 4 ? ' y ' + (faltan.length - 4) + ' más' : '') + '.'; return }
      guardar.disabled = true
      guardar.textContent = 'Guardando…'
      try {
        await anotar('conteo', datos)
        if (momento === 'cierre') await anotar('cerrar_dia', {})
        h.cerrar()
        if (momento === 'cierre') {
          poner($app, el('div', { clase: 'entrar centro' },
            el('div', { clase: 'ico-grande ok' }, icono('ok')),
            el('h1', {}, 'Día cerrado'),
            el('p', {}, 'Cerrado a las ' + horaCorta(Date.now()) + '. ¡Gracias, ' + S.sesion.persona.nombre + '!'),
            el('button', { clase: 'btn ancho grande', onclick: () => Prod.arrancar() }, 'Volver')))
        } else {
          toast('Conteo guardado', 'ok')
          Prod.refrescar()
        }
      } catch (err) {
        error.textContent = textoError(err)
        guardar.disabled = false
        guardar.textContent = momento === 'cierre' ? 'Cerrar el día' : 'Listo'
      }
    })
  }
}
