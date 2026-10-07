'use strict'
// LA PANTALLA DEL DUEÑO
//
// Baja todo lo anotado, lo pasa por el calculo (calculo.js) y lo muestra:
// faltantes por dia y por pieza, stock, costos, entregas, horas y sueldo. Aca
// tambien se arman los insumos, los productos con sus recetas, el personal y
// los ajustes.

const D = { email: '', datos: null, r: null, seccion: 'inicio', filtroPiezas: 'todas', periodo: 'semana' }

const SECCIONES_D = {
  inicio: { nombre: 'Inicio', icono: 'inicio' },
  dias: { nombre: 'Días', icono: 'dias' },
  piezas: { nombre: 'Piezas', icono: 'pieza' },
  stock: { nombre: 'Stock', icono: 'stock' },
  compras: { nombre: 'Compras', icono: 'compras' },
  productos: { nombre: 'Productos y recetas', icono: 'productos' },
  insumos: { nombre: 'Insumos', icono: 'balanza' },
  entregas: { nombre: 'Entregas', icono: 'camion' },
  personal: { nombre: 'Personal y sueldos', icono: 'personas' },
  movimientos: { nombre: 'Todo lo anotado', icono: 'historial' },
  ajustes: { nombre: 'Ajustes', icono: 'ajustes' }
}
const ABAJO_D = ['inicio', 'dias', 'piezas', 'stock', 'mas']

const Duenio = {
  async arrancar (email) {
    D.email = email
    guardarLocal('prod.modo', 'duenio')
    poner($app, el('div', { clase: 'nada' }, 'Cargando…'))
    await Duenio.recargar(true)
    const m = /^#\/(\w+)/.exec(location.hash)
    Duenio.ir(m && SECCIONES_D[m[1]] ? m[1] : 'inicio')
    document.addEventListener('visibilitychange', () => { if (!document.hidden && !HOJAS.length) Duenio.recargar().then(() => Duenio.pintar()) })
    setInterval(() => { if (!document.hidden && !HOJAS.length) Duenio.recargar().then(() => Duenio.pintar()) }, 90000)
  },

  async recargar (primera) {
    try {
      D.datos = await API.todo()
      D.r = Calculo.calcular(D.datos)
      guardarLocal('prod.duenio', null)
    } catch (e) {
      if (primera) {
        pantallaMensaje('No se pudo cargar', textoError(e) + (/prod_|relation|function/i.test(e.message || '') ? ' (¿Ya se corrió el archivo produccion-supabase.sql en Supabase?)' : ''),
          el('button', { clase: 'btn primario ancho grande', onclick: () => location.reload() }, 'Probar de nuevo'))
        throw e
      }
      toast(textoError(e), 'mal')
    }
  },

  // Despues de guardar algo: bajar de nuevo y repintar donde estaba.
  async listo (texto) {
    if (texto) toast(texto, 'ok')
    await Duenio.recargar()
    Duenio.pintar()
  },

  ir (seccion) {
    D.seccion = seccion
    history.replaceState(null, '', location.pathname + location.search + '#/' + seccion)
    Duenio.pintar()
    window.scrollTo(0, 0)
  },

  pintar () {
    const main = el('main', {})
    const lado = el('nav', { clase: 'lado', 'aria-label': 'Secciones' },
      el('div', { clase: 'marca' }, el('img', { src: 'icono-192.png', alt: '' }), 'Producción'),
      Object.keys(SECCIONES_D).map((id) => el('button', { clase: D.seccion === id ? 'activo' : '', onclick: () => Duenio.ir(id) }, icono(SECCIONES_D[id].icono), SECCIONES_D[id].nombre)),
      el('div', { estilo: { marginTop: 'auto' } }),
      el('button', { onclick: () => Duenio.salir() }, icono('salir'), 'Salir'))
    const tab = el('nav', { clase: 'tabbar', 'aria-label': 'Secciones' }, ABAJO_D.map((id) => {
      const activo = id === 'mas' ? !ABAJO_D.includes(D.seccion) : D.seccion === id
      return el('button', { clase: activo ? 'activo' : '', onclick: () => (id === 'mas' ? Duenio.ir('mas') : Duenio.ir(id)) }, icono(id === 'mas' ? 'mas' : SECCIONES_D[id].icono), id === 'mas' ? 'Más' : SECCIONES_D[id].nombre)
    }))
    const arriba = el('div', { clase: 'arriba' },
      el('div', { clase: 'quien' }, el('div', { clase: 'negocio' }, S.negocio + ' · Producción'), el('div', { clase: 'sub' }, PRUEBA ? 'Modo prueba' : D.email)),
      el('button', { clase: 'btn-ico', 'aria-label': 'Actualizar', onclick: () => Duenio.listo('Actualizado') }, icono('refrescar')))
    main.append(arriba)
    const fn = Duenio['ver_' + D.seccion] || Duenio.ver_inicio
    try { main.append(fn()) } catch (e) { console.error(e); main.append(el('div', { clase: 'aviso mal' }, 'Algo falló al mostrar esto: ' + e.message)) }
    poner($app, el('div', { clase: 'app' }, lado, main, tab))
  },

  async salir () {
    if (!(await confirmar('Salir', '¿Salir de tu cuenta en este dispositivo?', 'Salir'))) return
    await API.salir()
    guardarLocal('prod.modo', 'pin')
    location.reload()
  },

  // --- utilidades del dueño ------------------------------------------------------------------
  insumo (id) { return (D.datos.catalogo.insumos || []).find((i) => i.id === id) || (id === 'recortes' ? { id, nombre: 'Recortes y puntas', modo: 'peso' } : null) },
  producto (id) { return (D.datos.catalogo.productos || []).find((p) => p.id === id) },
  config () { return Object.assign({ sucursales: [], horario: { dias: [1, 2, 3, 4, 5, 6], desde: '08:00', hasta: '14:00' }, fotoProduccion: true, contarAlAbrir: true, toleranciaPct: 2 }, D.datos.catalogo.config || {}) },
  unidad (i) { return !i ? 'u' : (i.modo === 'pieza' || i.modo === 'peso') ? 'g' : (i.nombreUnidad || 'u') },
  cant (i, q) { const u = Duenio.unidad(i); return u === 'g' ? fmtCant(q, 'g') : fmt(Math.round(q * 100) / 100) + ' ' + plural(u, q) },
  async registrar (tipo, datos) {
    const r = await API.registrar('', { id: uuid(), tipo, datos })
    if (r && r.error) throw r
    return r
  },
  async verFoto (id) {
    const img = el('img', { clase: 'foto-grande', alt: 'Foto' })
    const h = hoja({ titulo: 'Foto', cuerpo: el('div', { clase: 'centro' }, img, el('p', { clase: 'sub' }, 'Cargando…')) })
    try {
      const d = await API.verFoto(id)
      if (!d) { poner(h.cuerpo, vacio('No se encontró la foto (puede que no haya subido por falta de señal).', 'foto')); return }
      img.src = d
      poner(h.cuerpo, el('div', { clase: 'centro' }, img))
    } catch (e) { poner(h.cuerpo, el('div', { clase: 'aviso mal' }, textoError(e))) }
  },
  fila (izq, der, sub, clase) {
    return el('div', { clase: 'fila' + (clase ? ' ' + clase : '') }, el('div', { clase: 'izq' }, izq, sub ? el('div', { clase: 'sub' }, sub) : null), el('div', { clase: 'der num' }, der))
  },
  claseFaltante (plata) { return plata > 0 ? 'rojo' : plata < 0 ? 'verde' : '' },

  // --- inicio ------------------------------------------------------------------------------------
  ver_inicio () {
    const r = D.r
    const cat = D.datos.catalogo
    const c = el('div', {})
    if (!cat.config && !(cat.insumos || []).length) return Duenio.bienvenida()
    c.append(cabecera('Inicio', 'Lo que pasa en producción'))
    const cerrados = r.dias.filter((d) => !d.suelto && d.cerrado)
    const ultimo = cerrados[0]
    const hoyAbierto = r.dias.find((d) => d.abiertoAhora)
    const semana = r.dias.filter((d) => !d.suelto && d.abierto > Date.now() - 7 * 86400000)
    const falt7 = semana.reduce((s, d) => s + d.faltante, 0)
    const merma7 = semana.reduce((s, d) => s + d.mermaPlata, 0)
    const cons7 = semana.reduce((s, d) => s + d.consumoPlata, 0)
    c.append(el('div', { clase: 'kpis' },
      kpi('Faltante del último día', ultimo ? plata(ultimo.faltante) : '—', ultimo ? fechaCorta(ultimo.abierto) + (ultimo.personaNombre ? ' · ' + ultimo.personaNombre : '') : 'Todavía no se cerró ningún día', ultimo && ultimo.faltante > 0 ? 'mal' : '', ultimo ? () => Duenio.detalleDia(ultimo.id) : null),
      kpi('Faltante 7 días', plata(falt7), 'Mermas con foto: ' + plata(merma7), falt7 > 0 ? 'mal' : ''),
      kpi('Rindió (7 días)', cons7 > 0 ? (Math.round(cons7 * 1000 / (cons7 + Math.max(0, falt7))) / 10).toLocaleString('es-AR') + '%' : '—', 'De cada $100 de mercadería'),
      kpi('Hoy', hoyAbierto ? 'Trabajando' : 'Cerrado', hoyAbierto ? 'Desde las ' + horaCorta(hoyAbierto.abierto) + (hoyAbierto.personaNombre ? ' · ' + hoyAbierto.personaNombre : '') : 'Sin día abierto', hoyAbierto ? '' : '', hoyAbierto ? () => Duenio.detalleDia(hoyAbierto.id) : null)))
    if (!D.datos.personal.some((p) => p.rol === 'produccion' && p.activo)) {
      c.append(el('div', { clase: 'aviso alerta' }, el('b', {}, 'Falta darle un PIN a la chica de producción'), 'Sin PIN no puede entrar.', el('button', { clase: 'btn ancho', estilo: { marginTop: '8px' }, onclick: () => Duenio.editarPersona(null, 'produccion') }, 'Crear su PIN')))
    }
    if (r.avisos.length) {
      c.append(el('h3', {}, 'Avisos'))
      c.append(el('div', { clase: 'alertas' }, r.avisos.slice(0, 25).map((a) => el('button', {
        clase: 'alerta-fila ' + a.nivel, onclick: () => (a.ir && a.ir.seccion === 'dias' && a.ir.id ? Duenio.detalleDia(a.ir.id) : a.ir && a.ir.seccion === 'piezas' && a.ir.id ? Duenio.detallePieza(a.ir.id) : a.ir && a.ir.seccion === 'productos' && a.ir.id ? Duenio.editarProducto(a.ir.id) : a.ir ? Duenio.ir(a.ir.seccion) : null)
      }, el('span', { clase: 'ico' }, icono(a.nivel === 'info' ? 'info' : 'alerta')), el('span', { clase: 'txt' }, el('b', {}, a.titulo), a.texto ? el('span', { clase: 'sub' }, a.texto) : null)))))
    } else c.append(el('div', { clase: 'aviso ok' }, el('b', {}, 'Todo en orden'), 'No hay faltantes ni cosas para revisar.'))
    if (semana.length) {
      c.append(el('h3', {}, 'Últimos días'))
      c.append(Duenio.listaDias(semana.slice(0, 7)))
    }
    return c
  },

  bienvenida () {
    return el('div', {},
      cabecera('Empezar', 'Producción todavía está vacía'),
      el('div', { clase: 'tarjeta' },
        el('p', {}, 'Para arrancar te cargo una lista con lo de siempre: hormas de queso y jamón, salame, pan de miga, pan de pebete, mayonesa, manteca, film, vasos, bolsas de vacío y bandejas; y los productos: miga, pebete, fiambre al vacío y bandejas de fiambre.'),
        el('p', { clase: 'tenue' }, 'Después lo cambiás como quieras. Las cantidades de cada receta las vas a medir vos con la balanza (te guío).'),
        el('button', { clase: 'btn primario ancho grande', onclick: () => Duenio.cargarSugerido() }, 'Cargar la lista para empezar')))
  },
  async cargarSugerido () {
    const ins = [
      { id: 'queso', nombre: 'Queso (horma)', modo: 'pieza' },
      { id: 'jamon', nombre: 'Jamón cocido', modo: 'pieza' },
      { id: 'salame', nombre: 'Salame', modo: 'pieza' },
      { id: 'pan_miga', nombre: 'Pan de miga', modo: 'unidad', nombreUnidad: 'plancha', presentacion: { nombre: 'pilón', cantidad: null } },
      { id: 'pan_pebete', nombre: 'Pan de pebete', modo: 'unidad', nombreUnidad: 'pan' },
      { id: 'mayonesa', nombre: 'Mayonesa', modo: 'peso' },
      { id: 'manteca', nombre: 'Manteca', modo: 'peso' },
      { id: 'film', nombre: 'Film', modo: 'unidad', nombreUnidad: 'rollo', contar: false },
      { id: 'vaso', nombre: 'Vaso para fiambre', modo: 'unidad', nombreUnidad: 'vaso' },
      { id: 'bolsa_vacio', nombre: 'Bolsa de vacío', modo: 'unidad', nombreUnidad: 'bolsa' },
      { id: 'bandeja', nombre: 'Bandeja', modo: 'unidad', nombreUnidad: 'bandeja' }
    ]
    const ahora = new Date().toISOString()
    const prods = [
      { id: 'miga_jyq', nombre: 'Sándwich de miga jamón y queso', venta: 'unidad', venceDias: 15, recetas: [{ desde: ahora, lineas: [{ insumoId: 'pan_miga', cantidad: null }, { insumoId: 'jamon', cantidad: null }, { insumoId: 'queso', cantidad: null }, { insumoId: 'manteca', cantidad: null }, { insumoId: 'film', cantidad: null }] }] },
      { id: 'pebete_jyq', nombre: 'Pebete jamón y queso', venta: 'unidad', venceDias: 15, recetas: [{ desde: ahora, lineas: [{ insumoId: 'pan_pebete', cantidad: 1 }, { insumoId: 'jamon', cantidad: null }, { insumoId: 'queso', cantidad: null }, { insumoId: 'mayonesa', cantidad: null }, { insumoId: 'film', cantidad: null }] }] },
      { id: 'vaso_vacio', nombre: 'Fiambre al vacío (vaso)', venta: 'unidad', venceDias: 30, recetas: [{ desde: ahora, lineas: [{ insumoId: 'vaso', cantidad: 1 }, { insumoId: 'bolsa_vacio', cantidad: 1 }, { insumoId: 'jamon', cantidad: null }] }] },
      { id: 'bandeja_fiambre', nombre: 'Bandeja de fiambre', venta: 'peso', venceDias: 30, recetas: [{ desde: ahora, lineas: [{ insumoId: 'recortes', cantidad: 1000 }, { insumoId: 'bandeja', cantidad: 1, por: 'envase' }, { insumoId: 'film', cantidad: null, por: 'envase' }] }] }
    ]
    try {
      await API.guardarCatalogo('config', 'config', { sucursales: [{ id: 'alberdi', nombre: 'Alberdi' }, { id: 'duffy', nombre: 'Duffy y Mitre' }], horario: { dias: [1, 2, 3, 4, 5, 6], desde: '08:00', hasta: '14:00' }, fotoProduccion: true, contarAlAbrir: true, toleranciaPct: 2 })
      for (const i of ins) await API.guardarCatalogo('insumo', i.id, i)
      for (const p of prods) await API.guardarCatalogo('producto', p.id, p)
      await Duenio.listo('Lista cargada')
    } catch (e) { toast(textoError(e), 'mal', 6) }
  },

  // --- dias ----------------------------------------------------------------------------------------------
  listaDias (dias) {
    return el('div', { clase: 'tarjeta sin-relleno' }, el('div', { clase: 'lista' }, dias.map((d) => el('button', { clase: 'item', onclick: () => Duenio.detalleDia(d.id) },
      el('div', { clase: 'cuerpo' },
        el('b', {}, d.suelto ? fechaCorta(d.abierto) + ' · fuera de turno' : fechaCorta(d.abierto) + ' · ' + horaCorta(d.abierto) + ' a ' + (d.cerrado ? horaCorta(d.cerrado) : 'abierto')),
        el('div', { clase: 'sub' }, [d.personaNombre, d.horas ? fmt(Math.round(d.horas * 10) / 10) + ' h' : '', Object.keys(d.producido).length ? Object.values(d.producido).reduce((s, x) => s + (x.envases || x.cantidad), 0) + ' hechos' : '', d.abiertoAhora ? 'en curso' : ''].filter(Boolean).join(' · '))),
      el('div', { clase: 'fin' }, el('b', { clase: 'num ' + Duenio.claseFaltante(d.faltante) }, d.difs.length ? (d.faltante > 0 ? 'Faltó ' : d.faltante < 0 ? 'Sobró ' : '') + plata(Math.abs(d.faltante)) : '—'), el('span', { clase: 'sub' }, d.rendimiento != null ? 'rindió ' + Calculo.pctTxt(d.rendimiento) : ''))))))
  },
  ver_dias () {
    const dias = D.r.dias
    return el('div', {}, cabecera('Días', 'Cada día con su conteo. Lo que no aparece es faltante.'), dias.length ? Duenio.listaDias(dias.slice(0, 90)) : el('div', { clase: 'tarjeta' }, vacio('Todavía no hay días.', 'dias')))
  },
  detalleDia (id) {
    const d = D.r.dias.find((x) => x.id === id)
    if (!d) return
    const cuerpo = []
    cuerpo.push(el('div', { clase: 'dato-grande' },
      el('div', {}, el('div', { clase: 'r' }, 'Faltante'), el('div', { clase: 'v ' + Duenio.claseFaltante(d.faltante) }, plata(d.faltante))),
      el('div', {}, el('div', { clase: 'r' }, 'Mercadería usada'), el('div', { clase: 'v' }, plata(d.consumoPlata))),
      el('div', {}, el('div', { clase: 'r' }, 'Mermas con foto'), el('div', { clase: 'v' }, plata(d.mermaPlata)))))
    const datosDia = [d.personaNombre ? 'Turno de ' + d.personaNombre : '', d.suelto ? '' : 'Abrió ' + horaCorta(d.abierto) + (d.cerrado ? ', cerró ' + horaCorta(d.cerrado) : ', sigue abierto'), d.horas ? fmt(Math.round(d.horas * 10) / 10) + ' h · ' + plata(d.manoDeObra) + ' de sueldo' : '', d.rendimiento != null ? 'Rindió ' + Calculo.pctTxt(d.rendimiento) : ''].filter(Boolean).join(' · ')
    cuerpo.push(el('p', { clase: 'tenue' }, datosDia))
    if (d.cerradoPorDuenio) cuerpo.push(el('div', { clase: 'aviso alerta' }, 'Este día lo cerraste vos, sin conteo.'))
    else if (d.cerrado && !d.conteos.cierre && !d.suelto) cuerpo.push(el('div', { clase: 'aviso alerta' }, 'Se cerró sin el conteo del cierre.'))
    if (d.recetasIncompletas.length) cuerpo.push(el('div', { clase: 'aviso alerta' }, el('b', {}, 'Recetas sin medir'), d.recetasIncompletas.map((p) => (Duenio.producto(p) || {}).nombre).join(', ') + ': lo que se usó para esto no se descontó, así que puede aparecer como faltante.'))
    if (d.faltanteNoche > 0) cuerpo.push(el('div', { clase: 'aviso mal' }, el('b', {}, 'Faltó ' + plata(d.faltanteNoche) + ' de noche'), 'Entre el cierre anterior y la apertura de este día (cuando no había nadie en producción).'))
    // Diferencias de los conteos y de las piezas terminadas.
    const nombresMomento = { apertura: 'Conteo de la mañana', cierre: 'Conteo del cierre', pieza: 'Piezas terminadas', suelto: 'Conteos sueltos' }
    for (const mom of ['apertura', 'pieza', 'cierre', 'suelto']) {
      const xs = d.difs.filter((x) => x.momento === mom)
      if (!xs.length) continue
      cuerpo.push(el('h3', {}, nombresMomento[mom]))
      cuerpo.push(el('div', { clase: 'scroll-x' }, el('table', { clase: 'tabla' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Qué'), el('th', { clase: 'num' }, 'Tenía que haber'), el('th', { clase: 'num' }, 'Había'), el('th', { clase: 'num' }, 'Diferencia'))),
        el('tbody', {}, xs.map((x) => el('tr', {},
          el('td', {}, x.nombre),
          el('td', { clase: 'num' }, fmtCant(x.esperado, x.unidad)),
          el('td', { clase: 'num' }, fmtCant(x.real, x.unidad)),
          el('td', { clase: 'num ' + (x.plata < 0 ? 'rojo' : x.plata > 0 ? 'verde' : '') }, (x.dif > 0 ? '+' : '') + fmtCant(x.dif, x.unidad), el('div', { clase: 'sub' }, plata(x.plata)))))))))
    }
    if (!d.difs.length && !d.suelto) cuerpo.push(el('div', { clase: 'aviso ' + (d.conteos.cierre ? 'ok' : '') }, d.conteos.cierre ? 'El conteo dio justo: no faltó nada.' : 'Todavía no hay conteo para comparar.'))
    const prods = Object.keys(d.producido)
    if (prods.length) {
      cuerpo.push(el('h3', {}, 'Lo que se hizo'))
      cuerpo.push(el('div', {}, prods.map((pid) => { const p = Duenio.producto(pid) || {}; const x = d.producido[pid]; return Duenio.fila(p.nombre || 'Producto', p.venta === 'peso' ? fmtCant(x.cantidad, 'g') + ' (' + x.envases + ' band.)' : fmt(x.cantidad)) })))
    }
    if (d.mermas.length) {
      cuerpo.push(el('h3', {}, 'Mermas'))
      cuerpo.push(el('div', {}, d.mermas.map((m) => el('div', { clase: 'fila' },
        el('div', { clase: 'izq' }, m.nombre + ' · ' + fmtCant(m.cantidad, m.unidad === 'g' ? 'g' : m.unidad), el('div', { clase: 'sub' }, horaCorta(m.t) + ' · ' + m.motivo)),
        el('div', { clase: 'der' }, el('span', { clase: 'num' }, plata(m.plata)), ' ', m.fotoId ? el('button', { clase: 'btn chico', onclick: () => Duenio.verFoto(m.fotoId) }, 'Foto') : chip('Sin foto', 'alerta'))))))
    }
    if (d.entregas.length) {
      cuerpo.push(el('h3', {}, 'Lo que se mandó'))
      cuerpo.push(el('div', {}, d.entregas.map((e) => Duenio.fila(e.nombreSucursal + ' · ' + horaCorta(e.t), Duenio.estadoEntrega(e), e.items.map((i) => fmt(i.cantidad) + ' ' + i.nombre).join(', ')))))
    }
    if (d.ingresos.length) {
      cuerpo.push(el('h3', {}, 'Lo que llegó'))
      cuerpo.push(el('div', {}, d.ingresos.map((i) => Duenio.fila(i.nombre + (i.piezas.length ? ' N° ' + i.piezas.join(', ') : ''), Duenio.cant(Duenio.insumo(i.insumoId), i.cantidad), horaCorta(i.t) + (i.persona ? ' · ' + i.persona : '')))))
    }
    const pie = []
    if (d.abiertoAhora) pie.push(el('button', { clase: 'btn', onclick: async () => { if (await confirmar('Cerrar el día', 'Se cierra sin conteo: ese día no se va a poder controlar. Usalo solo si ella se olvidó de cerrarlo.', 'Cerrar sin conteo', true)) { try { await Duenio.registrar('cerrar_dia', {}); h.cerrar(); Duenio.listo('Día cerrado') } catch (e) { toast(textoError(e), 'mal') } } } }, 'Cerrar el día'))
    const h = hoja({ titulo: d.suelto ? fechaCorta(d.abierto) + ' (fuera de turno)' : 'Día ' + fechaCorta(d.abierto), completa: true, cuerpo, pie })
  },

  // --- piezas --------------------------------------------------------------------------------------------
  ver_piezas () {
    const filtros = { abiertas: (p) => p.estado === 'abierta', cerradas: (p) => p.estado === 'cerrada', terminadas: (p) => p.estado === 'terminada' || p.estado === 'falta', todas: () => true }
    const nombres = { terminadas: 'Terminadas', abiertas: 'Abiertas', cerradas: 'Sin abrir', todas: 'Todas' }
    const ps = D.r.piezas.filter(filtros[D.filtroPiezas])
    const term = D.r.piezas.filter(filtros.terminadas)
    const falt = term.reduce((s, p) => s + p.faltantePlata, 0)
    return el('div', {},
      cabecera('Piezas', 'Cada horma o pieza con su número: cuánto rindió.'),
      term.length ? el('div', { clase: 'kpis' }, kpi('Piezas terminadas', String(term.length)), kpi('Faltante en piezas', plata(falt), 'Sumando todas', falt > 0 ? 'mal' : '')) : null,
      el('div', { clase: 'filtros' }, Object.keys(nombres).map((k) => el('button', { clase: 'filtro' + (D.filtroPiezas === k ? ' activo' : ''), onclick: () => { D.filtroPiezas = k; Duenio.pintar() } }, nombres[k], el('span', { clase: 'n' }, String(D.r.piezas.filter(filtros[k]).length))))),
      ps.length ? el('div', { clase: 'tarjeta sin-relleno' }, el('div', { clase: 'lista' }, ps.map((p) => el('button', { clase: 'item', onclick: () => Duenio.detallePieza(p.id) },
        el('div', { clase: 'cuerpo' }, el('b', {}, p.nombre), el('div', { clase: 'sub' }, fmtCant(p.peso, 'g') + ' · llegó ' + fechaCorta(p.llego) + (p.principal ? ' · salieron ' + (p.principal.mezcla ? 'el equivalente a ' : '') + fmt(p.principal.salieron) + ' ' + (p.principal.nombre || '').toLowerCase() : ''))),
        el('div', { clase: 'fin' }, p.estado === 'terminada' || p.estado === 'falta'
          ? [el('b', { clase: 'num ' + Duenio.claseFaltante(p.faltantePlata) }, p.estado === 'falta' ? 'No estaba' : (p.faltante > 0 ? 'Faltan ' : 'Sobran ') + fmtCant(Math.abs(p.faltante), 'g')), el('span', { clase: 'sub' }, plata(p.faltantePlata))]
          : chip(p.estado === 'abierta' ? 'Abierta' : 'Sin abrir', p.estado === 'abierta' ? 'info' : '')))))) : el('div', { clase: 'tarjeta' }, vacio('No hay piezas acá.', 'pieza')))
  },
  detallePieza (id) {
    const p = D.r.piezas.find((x) => x.id === id)
    if (!p) return
    const cuerpo = [el('div', { clase: 'dato-grande' },
      el('div', {}, el('div', { clase: 'r' }, 'Pesaba'), el('div', { clase: 'v' }, fmtCant(p.peso, 'g'))),
      el('div', {}, el('div', { clase: 'r' }, 'Faltante'), el('div', { clase: 'v ' + Duenio.claseFaltante(p.faltantePlata) }, fmtCant(p.faltante, 'g'))),
      el('div', {}, el('div', { clase: 'r' }, 'En plata'), el('div', { clase: 'v ' + Duenio.claseFaltante(p.faltantePlata) }, plata(p.faltantePlata))))]
    if (p.principal && p.principal.deberian != null) cuerpo.push(el('div', { clase: 'aviso ' + (p.faltante > 0 ? 'mal' : 'ok') }, el('b', {}, Calculo.textoRinde(p.principal)), p.principal.nombre + ': ' + fmt(p.principal.gPorUnidad) + ' g cada uno.'))
    cuerpo.push(Duenio.fila('Llegó', fechaHora(p.llego)))
    if (p.abierta) cuerpo.push(Duenio.fila('Se abrió', fechaHora(p.abierta) + (p.abiertaSola ? ' (sin que lo anoten)' : '')))
    if (p.terminada) cuerpo.push(Duenio.fila(p.estado === 'falta' ? 'No estaba en el conteo' : 'Se terminó', fechaHora(p.terminada)))
    cuerpo.push(Duenio.fila('Usado según las recetas', fmtCant(p.usadoTeorico, 'g')))
    if (p.merma) cuerpo.push(Duenio.fila('Mermas anotadas', fmtCant(p.merma, 'g')))
    if (p.punta != null) cuerpo.push(Duenio.fila('Punta', fmtCant(p.punta, 'g') + (p.destinoPunta === 'merma' ? ' (se tiró)' : ' (a bandejas)')))
    if (p.estado === 'abierta' || p.estado === 'cerrada') cuerpo.push(Duenio.fila('Tendría que pesar ahora', fmtCant(p.resto, 'g')))
    cuerpo.push(Duenio.fila('Costo', plata(p.costoG * 1000) + ' el kilo'))
    if (p.medidas.length) {
      cuerpo.push(el('h3', {}, 'Cada vez que se pesó'))
      cuerpo.push(el('div', {}, p.medidas.map((m) => Duenio.fila(fechaHora(m.t), fmtCant(m.peso, 'g'), 'Tenía que pesar ' + fmtCant(m.esperado, 'g') + (m.esperado - m.peso > 0.5 ? ' · faltaron ' + fmtCant(m.esperado - m.peso, 'g') : '')))))
    }
    const hechos = Object.keys(p.hecho)
    if (hechos.length) {
      cuerpo.push(el('h3', {}, 'Lo que salió de esta pieza'))
      cuerpo.push(el('div', {}, hechos.map((pid) => Duenio.fila((Duenio.producto(pid) || {}).nombre || 'Producto', fmt(p.hecho[pid])))))
    }
    hoja({ titulo: p.nombre, completa: true, cuerpo })
  },

  // --- stock ----------------------------------------------------------------------------------------------
  ver_stock () {
    const st = D.r.stock
    const comprar = st.filter((s) => s.comprar && !s.sistema)
    const valor = st.reduce((s, x) => s + x.plata, 0)
    const c = el('div', {}, cabecera('Stock', 'Lo que tendría que haber, según todo lo anotado.', el('button', { clase: 'btn primario', onclick: () => Duenio.cargarCompra() }, icono('sumar'), 'Cargar compra')))
    c.append(el('div', { clase: 'kpis' }, kpi('Mercadería en producción', plata(valor), 'A costo'), kpi('Para comprar', String(comprar.length), comprar.length ? comprar.map((s) => s.nombre).slice(0, 3).join(', ') : 'Nada urgente', comprar.length ? 'alerta' : '')))
    if (comprar.length) {
      c.append(el('div', { clase: 'tarjeta' }, el('h2', {}, 'Lista de compras'), comprar.map((s) => Duenio.fila(s.nombre, 'Hay ' + fmtCant(s.cantidad, s.unidad), s.cobertura != null ? 'Alcanza para ' + Calculo.textoDias(s.cobertura) + ' (se usan ' + fmtCant(s.porDia, s.unidad) + ' por día)' : 'Por debajo del mínimo'))))
    }
    c.append(el('div', { clase: 'tarjeta sin-relleno' }, el('h2', {}, 'Insumos'), el('div', { clase: 'lista' }, st.map((s) => el('div', { clase: 'item' },
      el('div', { clase: 'cuerpo' }, el('b', {}, s.nombre), el('div', { clase: 'sub' }, [s.modo === 'pieza' ? s.abiertas + ' abierta' + (s.abiertas === 1 ? '' : 's') + ', ' + s.cerradas + ' sin abrir' : '', s.cobertura != null ? 'alcanza ' + (s.cobertura > 60 ? 'más de 60 días' : Calculo.textoDias(s.cobertura)) : '', s.costoU ? plata(s.costoU * (s.unidad === 'g' ? 1000 : 1)) + (s.unidad === 'g' ? ' el kilo' : ' c/u') : 'sin costo'].filter(Boolean).join(' · '))),
      el('div', { clase: 'fin' }, el('b', { clase: 'num' + (s.cantidad < 0 ? ' rojo' : '') }, fmtCant(s.cantidad, s.unidad)), s.plata ? el('span', { clase: 'sub' }, plata(s.plata)) : null))))))
    const enProd = D.r.enProduccion
    c.append(el('div', { clase: 'tarjeta' }, el('h2', {}, 'Hecho y todavía en producción'), enProd.length ? enProd.map((x) => Duenio.fila(x.nombre, x.venta === 'peso' ? fmtCant(x.cantidad, 'g') : fmt(x.cantidad),
      x.lotes.map((l) => fmt(l.cantidad) + ' del ' + fechaCorta(l.t) + (l.vence ? ' (vence ' + fechaCorta(l.vence) + ')' : '')).join(' · '))) : el('p', { clase: 'sub' }, 'Nada: todo lo hecho ya se mandó a los locales.')))
    return c
  },

  // --- compras --------------------------------------------------------------------------------------------
  ver_compras () {
    const ings = D.r.ingresos
    const sin = ings.filter((i) => i.sinPrecio)
    return el('div', {},
      cabecera('Compras', 'Lo que llegó a producción. Ponele el precio para que los costos estén al día.', el('button', { clase: 'btn primario', onclick: () => Duenio.cargarCompra() }, icono('sumar'), 'Cargar compra')),
      sin.length ? el('div', { clase: 'aviso info' }, el('b', {}, sin.length === 1 ? 'Una compra sin precio' : sin.length + ' compras sin precio'), 'Tocá cada una para ponerle lo que pagaste.') : null,
      ings.length ? el('div', { clase: 'tarjeta sin-relleno' }, el('div', { clase: 'lista' }, ings.slice(0, 200).map((i) => el('button', { clase: 'item', onclick: () => Duenio.ponerPrecio(i) },
        el('div', { clase: 'cuerpo' }, el('b', {}, i.nombre + (i.piezas.length ? ' · N° ' + i.piezas.join(', ') : '')), el('div', { clase: 'sub' }, fechaHora(i.t) + (i.persona ? ' · ' + i.persona : '') + (i.inicial ? ' · lo que ya había' : '') + (i.difFactura < -0.5 ? ' · ' + fmtCant(-i.difFactura, 'g') + ' menos que la boleta' : ''))),
        el('div', { clase: 'fin' }, el('b', { clase: 'num' }, Duenio.cant(Duenio.insumo(i.insumoId), i.cantidad)), i.sinPrecio ? chip('Sin precio', 'alerta') : el('span', { clase: 'sub' }, plata(i.costoTotal))))))) : el('div', { clase: 'tarjeta' }, vacio('Todavía no llegó nada.', 'compras')))
  },
  ponerPrecio (i) {
    const ins = Duenio.insumo(i.insumoId)
    const total = campoNumero('¿Cuánto pagaste en total?', '$', { decimales: true, valor: i.costoTotal ? i.costoTotal / 100 : null, ayuda: 'Por ' + Duenio.cant(ins, i.cantidad) + ', con IVA, como lo pagaste.' })
    const error = el('div', { clase: 'error' })
    const h = hoja({
      titulo: 'Precio: ' + i.nombre, cuerpo: [total, error],
      pie: [el('button', { clase: 'btn', onclick: () => h.cerrar() }, 'Cancelar'), el('button', { clase: 'btn primario', onclick: async () => {
        const v = aCentavos(total.input.value)
        if (!(v > 0)) { error.textContent = 'Poné el total.'; return }
        try { await Duenio.registrar('precio_ingreso', { ingresoId: i.id, costoTotal: v }); h.cerrar(); Duenio.listo('Precio guardado: ' + plata(v * (Duenio.unidad(ins) === 'g' ? 1000 : 1) / i.cantidad) + (Duenio.unidad(ins) === 'g' ? ' el kilo' : ' c/u')) } catch (e) { error.textContent = textoError(e) }
      } }, 'Guardar')]
    })
  },
  cargarCompra () {
    const ins = (D.datos.catalogo.insumos || []).filter((i) => i.activo !== false)
    if (!ins.length) return toast('Primero cargá los insumos.', 'mal')
    const h = hoja({ titulo: '¿Qué compraste?', completa: true, cuerpo: eleccion(ins.map((i) => ({ id: i.id, nombre: i.nombre })), (x) => { h.cerrar(); setTimeout(() => Duenio.cargarCompraCuanto(Duenio.insumo(x.id)), 80) }) })
  },
  cargarCompraCuanto (ins) {
    const error = el('div', { clase: 'error' })
    const total = campoNumero('Total pagado', '$', { decimales: true, placeholder: 'Opcional (lo podés poner después)' })
    const proveedor = el('input', { type: 'text', placeholder: 'Opcional' })
    let leer
    let cuerpo
    if (ins.modo === 'pieza') {
      const pesos = el('div', {})
      let filas = []
      const armar = (n) => { const v = filas.map((f) => f.input.value); filas = Array.from({ length: n }, (_, k) => { const c = campoNumero('Pieza ' + (k + 1), 'g', { placeholder: 'Peso' }); if (v[k]) c.input.value = v[k]; return c }); poner(pesos, filas) }
      armar(1)
      const boleta = campoNumero('Peso total de la boleta', 'g', { placeholder: 'Opcional' })
      cuerpo = [el('div', { clase: 'campo' }, '¿Cuántas piezas?', contador(1, (n) => armar(Math.min(20, Math.max(1, n))))), pesos, boleta]
      leer = () => { const ps = filas.map((f) => f.valor()); if (ps.some((x) => !(x > 0))) return 'Pesá cada pieza.'; const b = boleta.valor(); return { insumoId: ins.id, piezas: ps.map((peso) => ({ id: uuid(), peso })), pesoFactura: b > 0 ? b : undefined } }
    } else {
      const u = Duenio.unidad(ins)
      const pres = ins.presentacion && ins.presentacion.cantidad > 0 ? ins.presentacion : null
      const a = pres ? campoNumero(plural(pres.nombre, 2), '', { placeholder: '0', ayuda: pres.cantidad + ' ' + plural(u, pres.cantidad) + ' cada uno' }) : null
      const b = campoNumero(u === 'g' ? 'Peso' : (pres ? plural(u, 2) + ' aparte' : 'Cantidad'), u === 'g' ? 'g' : plural(u, 2), { placeholder: '0' })
      cuerpo = [a, b]
      leer = () => { const q = (a ? (a.valor() || 0) * pres.cantidad : 0) + (b.valor() || 0); return q > 0 ? { insumoId: ins.id, cantidad: q } : 'Poné cuánto llegó.' }
    }
    const guardar = el('button', { clase: 'btn primario' }, 'Guardar')
    const h = hoja({ titulo: 'Compra: ' + ins.nombre, completa: true, cuerpo: [cuerpo, total, el('label', { clase: 'campo' }, 'Proveedor', proveedor), error], pie: [el('button', { clase: 'btn', onclick: () => h.cerrar() }, 'Cancelar'), guardar] })
    guardar.addEventListener('click', async () => {
      const d = leer()
      if (typeof d === 'string') { error.textContent = d; return }
      const t = aCentavos(total.input.value)
      if (t > 0) d.costoTotal = t
      if (proveedor.value.trim()) d.proveedor = proveedor.value.trim()
      guardar.disabled = true
      try {
        const r = await Duenio.registrar('ingreso', d)
        h.cerrar()
        if (r.piezas && r.piezas.length) {
          hoja({ titulo: 'Números de las piezas', cuerpo: el('div', {}, el('p', {}, 'Escribí con fibrón el número en cada pieza:'), el('div', { clase: 'numeros-piezas' }, r.piezas.map((p) => el('div', {}, el('b', {}, 'N° ' + p.numero), el('span', {}, fmtCant(p.peso, 'g')))))) })
        }
        Duenio.listo('Compra cargada')
      } catch (e) { error.textContent = textoError(e); guardar.disabled = false }
    })
  },

  // --- productos y recetas ----------------------------------------------------------------------------------
  ver_productos () {
    const cs = D.r.costos
    return el('div', {},
      cabecera('Productos y recetas', 'Cuánto lleva cada uno, cuánto cuesta y cuánto ganás sobre el costo.', el('button', { clase: 'btn primario', onclick: () => Duenio.editarProducto(null) }, icono('sumar'), 'Producto nuevo')),
      D.r.moPorUnidad ? el('p', { clase: 'sub' }, 'Mano de obra: ' + plata(D.r.moPorUnidad) + ' por unidad (horas pagadas ÷ unidades hechas, últimos 30 días).') : null,
      cs.length ? el('div', { clase: 'tarjeta sin-relleno' }, el('div', { clase: 'lista' }, cs.map((c) => el('button', { clase: 'item' + (c.activo ? '' : ' inactivo'), onclick: () => Duenio.editarProducto(c.id) },
        el('div', { clase: 'cuerpo' }, el('b', {}, c.nombre), el('div', { clase: 'sub' }, c.completa ? 'Costo ' + plata(c.total) + (c.venta === 'peso' ? ' el kilo' : '') + (c.precio ? ' · vende a ' + plata(c.precio) : ' · sin precio de venta') : 'Falta medir la receta')),
        el('div', { clase: 'fin' }, c.completa ? (c.margen != null ? el('b', { clase: 'num ' + (c.margen < 0 ? 'rojo' : '') }, (c.margen > 0 ? '+' : '') + c.margen.toLocaleString('es-AR') + '%') : el('span', { clase: 'sub' }, '—')) : chip('Medir', 'alerta')))))) : el('div', { clase: 'tarjeta' }, vacio('No hay productos.', 'productos')))
  },
  editarProducto (id) {
    const p = id ? JSON.parse(JSON.stringify(Duenio.producto(id))) : { id: 'p_' + Date.now().toString(36), nombre: '', venta: 'unidad', venceDias: 15, recetas: [], activo: true }
    const r = Calculo.recetaEn(p, Date.now())
    let lineas = r ? JSON.parse(JSON.stringify(r.lineas || [])) : []
    const costo = D.r.costos.find((c) => c.id === p.id)
    const nombre = el('input', { type: 'text', valor: p.nombre, placeholder: 'Ej: Pebete de salame' })
    let venta = p.venta || 'unidad'
    const segVenta = el('div', { clase: 'seg ancho' })
    const pintarVenta = () => poner(segVenta, [['unidad', 'Por unidad'], ['peso', 'Por peso']].map(([v, t]) => el('button', { type: 'button', clase: venta === v ? 'activo' : '', onclick: () => { venta = v; pintarVenta(); pintarLineas() } }, t)))
    const vence = campoNumero('Se tiene que vender en menos de', 'días', { valor: p.venceDias || '' })
    const precio = campoNumero('Precio de venta', '$', { decimales: true, valor: p.precio ? p.precio / 100 : '', ayuda: 'El que cobra el local (por unidad, o por kilo si es por peso).' })
    const activo = el('label', { clase: 'check' }, el('input', { type: 'checkbox', checked: p.activo !== false || null }), 'Se sigue haciendo')
    const cajaLineas = el('div', {})
    const insumos = (D.datos.catalogo.insumos || []).filter((i) => i.activo !== false).concat([{ id: 'recortes', nombre: 'Recortes y puntas', modo: 'peso' }])
    function textoCant (l, ins) {
      const u = Duenio.unidad(ins)
      if (!(l.cantidad > 0)) return 'sin medir'
      if (u !== 'g' && l.cantidad < 1) return '1 ' + u + ' cada ' + fmt(Math.round(1 / l.cantidad * 10) / 10)
      return Duenio.cant(ins, l.cantidad)
    }
    function pintarLineas () {
      poner(cajaLineas, lineas.map((l, k) => {
        const ins = Duenio.insumo(l.insumoId)
        const u = Duenio.unidad(ins)
        const q = el('input', { type: 'text', inputmode: 'decimal', valor: l.cantidad > 0 ? String(Math.round(l.cantidad * 10000) / 10000).replace('.', ',') : '', placeholder: 'Sin medir', clase: 'chico-num' })
        q.addEventListener('input', () => { const v = aNumero(q.value); l.cantidad = v > 0 ? v : null; ayuda.textContent = textoCant(l, ins) })
        const ayuda = el('span', { clase: 'sub' }, textoCant(l, ins))
        const porQue = venta === 'peso' ? (l.por === 'envase' ? 'por bandeja' : 'por kilo') : 'por unidad'
        return el('div', { clase: 'linea-receta' },
          el('div', { clase: 'nombre' }, el('b', {}, ins ? ins.nombre : 'Insumo borrado'), ayuda),
          el('div', { clase: 'cant' }, q, el('span', { clase: 'sub' }, (u === 'g' ? 'g' : plural(u, 2)) + ' ' + porQue)),
          el('div', { clase: 'acc' },
            venta === 'peso' ? el('button', { clase: 'btn chico', type: 'button', onclick: () => { l.por = l.por === 'envase' ? undefined : 'envase'; pintarLineas() } }, l.por === 'envase' ? 'Por kilo' : 'Por bandeja') : null,
            el('button', { clase: 'btn chico suave', type: 'button', onclick: () => Duenio.medir(p, venta, l, ins, () => pintarLineas()) }, icono('regla'), 'Medir'),
            el('button', { clase: 'btn-ico', type: 'button', 'aria-label': 'Sacar', onclick: () => { lineas.splice(k, 1); pintarLineas() } }, icono('basura'))))
      }), lineas.length ? null : el('p', { clase: 'sub' }, 'Todavía no lleva nada. Agregá los insumos.'))
    }
    pintarVenta()
    pintarLineas()
    const agregar = el('select', {}, el('option', { value: '' }, '+ Agregar un insumo…'), insumos.map((i) => el('option', { value: i.id }, i.nombre)))
    agregar.addEventListener('change', () => { if (agregar.value && !lineas.some((l) => l.insumoId === agregar.value)) { lineas.push({ insumoId: agregar.value, cantidad: null }); pintarLineas() } agregar.value = '' })
    const error = el('div', { clase: 'error' })
    const guardar = el('button', { clase: 'btn primario' }, 'Guardar')
    const h = hoja({
      titulo: id ? p.nombre : 'Producto nuevo', completa: true,
      cuerpo: [
        costo && costo.completa ? el('div', { clase: 'dato-grande' },
          el('div', {}, el('div', { clase: 'r' }, 'Insumos'), el('div', { clase: 'v' }, plata(costo.insumos))),
          el('div', {}, el('div', { clase: 'r' }, 'Mano de obra'), el('div', { clase: 'v' }, plata(costo.manoDeObra))),
          el('div', {}, el('div', { clase: 'r' }, 'Ganancia s/ costo'), el('div', { clase: 'v' + (costo.margen < 0 ? ' rojo' : '') }, costo.margen != null ? costo.margen.toLocaleString('es-AR') + '%' : '—'))) : null,
        el('label', { clase: 'campo' }, 'Nombre', nombre),
        el('div', { clase: 'campo' }, 'Se vende', segVenta),
        el('div', { clase: 'dos' }, vence, precio),
        el('h3', {}, 'Receta: lo que lleva'),
        el('p', { clase: 'sub' }, 'Usá "Medir" con la balanza: pesás antes y después de hacer una tanda y la cuenta la hace sola.'),
        cajaLineas, agregar, activo, error
      ],
      pie: [el('button', { clase: 'btn', onclick: () => h.cerrar() }, 'Cancelar'), guardar]
    })
    guardar.addEventListener('click', async () => {
      if (!nombre.value.trim()) { error.textContent = 'Poné el nombre.'; return }
      p.nombre = nombre.value.trim()
      p.venta = venta
      p.venceDias = vence.valor() > 0 ? vence.valor() : null
      const pr = aCentavos(precio.input.value)
      p.precio = pr > 0 ? pr : null
      p.activo = activo.querySelector('input').checked
      const nuevas = lineas.filter((l) => l.insumoId)
      // Si la receta vigente estaba incompleta, se corrige ella misma (y vale
      // para atras); si ya estaba completa y cambia, queda una version nueva
      // desde hoy, para no recalcular lo que ya se controlo.
      const actual = Calculo.recetaEn(p, Date.now())
      const igual = actual && JSON.stringify(actual.lineas) === JSON.stringify(nuevas)
      if (!actual) p.recetas = [{ desde: new Date().toISOString(), lineas: nuevas }]
      else if (!igual) {
        if (!Calculo.recetaCompleta(actual)) actual.lineas = nuevas
        else p.recetas.push({ desde: new Date().toISOString(), lineas: nuevas })
      }
      guardar.disabled = true
      try { await API.guardarCatalogo('producto', p.id, p); h.cerrar(); Duenio.listo('Guardado') } catch (e) { error.textContent = textoError(e); guardar.disabled = false }
    })
  },

  // Medir cuanto lleva un producto de un insumo, con la balanza.
  medir (p, venta, linea, ins, alTerminar) {
    const u = Duenio.unidad(ins)
    const porPeso = venta === 'peso' && linea.por !== 'envase'
    const resultado = el('div', { clase: 'aviso info', hidden: true })
    let valor = null
    const campos = []
    let calcular
    if (u === 'g') {
      const antes = campoNumero('1. Pesá ' + ins.nombre.toLowerCase() + ' ANTES de empezar', 'g', { placeholder: 'Ej: 4020' })
      const despues = campoNumero('3. Pesá lo que quedó DESPUÉS', 'g', { placeholder: 'Ej: 3180' })
      const hechos = porPeso ? campoNumero('2. ¿Cuánto pesa lo que salió?', 'g', { placeholder: 'Ej: 1500' }) : campoNumero('2. ¿Cuántos hicieron?', venta === 'peso' ? 'bandejas' : 'unidades', { placeholder: 'Ej: 40' })
      campos.push(antes, hechos, despues)
      calcular = () => {
        const a = antes.valor(); const d = despues.valor(); const n = hechos.valor()
        if (!(a > 0) || !(d >= 0) || !(n > 0) || d >= a) return null
        return porPeso ? (a - d) / n * 1000 : (a - d) / n
      }
    } else {
      const usados = campoNumero('¿Cuántas ' + plural(u, 2) + ' usaron?', plural(u, 2), { placeholder: 'Ej: 1', decimales: true })
      const hechos = porPeso ? campoNumero('¿Cuánto pesa lo que salió?', 'g', { placeholder: 'Ej: 1500' }) : campoNumero('¿Cuántos salieron?', venta === 'peso' ? 'bandejas' : 'unidades', { placeholder: 'Ej: 24' })
      campos.push(usados, hechos)
      calcular = () => { const a = usados.valor(); const n = hechos.valor(); if (!(a > 0) || !(n > 0)) return null; return porPeso ? a / n * 1000 : a / n }
    }
    const actualizar = () => {
      valor = calcular()
      resultado.hidden = valor == null
      if (valor != null) poner(resultado, el('b', {}, porPeso ? fmtCant(valor, u) + ' por kilo' : (u === 'g' ? fmt(Math.round(valor * 10) / 10) + ' g' : valor < 1 ? '1 ' + u + ' cada ' + fmt(Math.round(1 / valor * 10) / 10) : fmt(Math.round(valor * 100) / 100) + ' ' + plural(u, valor)) + (venta === 'peso' ? (linea.por === 'envase' ? ' por bandeja' : '') : ' por unidad')),
        u === 'g' && !porPeso && ins.modo === 'pieza' ? 'De una pieza de 4 kg saldrían unos ' + Math.floor(4000 / valor) + '.' : '')
    }
    for (const c of campos) c.input.addEventListener('input', actualizar)
    const h = hoja({
      titulo: 'Medir: ' + ins.nombre, completa: true,
      cuerpo: [el('p', { clase: 'tenue' }, 'Hacé una tanda normal de ' + p.nombre.toLowerCase() + ' y anotá:'), campos, resultado],
      pie: [el('button', { clase: 'btn', onclick: () => h.cerrar() }, 'Cancelar'), el('button', { clase: 'btn primario', onclick: () => {
        if (valor == null) { toast('Completá los números.', 'mal'); return }
        linea.cantidad = Math.round(valor * 10000) / 10000
        h.cerrar()
        alTerminar()
      } }, 'Usar este valor')]
    })
  },

  // --- insumos --------------------------------------------------------------------------------------------
  ver_insumos () {
    const ins = (D.datos.catalogo.insumos || []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    const modos = { pieza: 'Por pieza numerada (hormas, jamón)', peso: 'Se pesa (mayonesa, manteca)', unidad: 'Se cuenta (pan, film, vasos)' }
    return el('div', {},
      cabecera('Insumos', 'Lo que se usa para producir.', el('button', { clase: 'btn primario', onclick: () => Duenio.editarInsumo(null) }, icono('sumar'), 'Insumo nuevo')),
      ins.length ? el('div', { clase: 'tarjeta sin-relleno' }, el('div', { clase: 'lista' }, ins.map((i) => el('button', { clase: 'item' + (i.activo === false ? ' inactivo' : ''), onclick: () => Duenio.editarInsumo(i.id) },
        el('div', { clase: 'cuerpo' }, el('b', {}, i.nombre), el('div', { clase: 'sub' }, modos[i.modo] + (i.presentacion && i.presentacion.nombre ? ' · ' + i.presentacion.nombre + (i.presentacion.cantidad > 0 ? ' de ' + i.presentacion.cantidad : ' (falta cuántas trae)') : ''))),
        el('div', { clase: 'fin' }, D.r.costoInsumo[i.id] ? el('span', { clase: 'sub' }, plata(D.r.costoInsumo[i.id] * (Duenio.unidad(i) === 'g' ? 1000 : 1)) + (Duenio.unidad(i) === 'g' ? '/kg' : ' c/u')) : chip('Sin costo', 'alerta')))))) : el('div', { clase: 'tarjeta' }, vacio('No hay insumos.', 'balanza')))
  },
  editarInsumo (id) {
    const i = id ? Object.assign({}, Duenio.insumo(id)) : { id: 'i_' + Date.now().toString(36), nombre: '', modo: 'pieza', activo: true }
    const nombre = el('input', { type: 'text', valor: i.nombre, placeholder: 'Ej: Mortadela' })
    let modo = i.modo || 'pieza'
    const seg = el('div', { clase: 'seg ancho' })
    const extra = el('div', {})
    const nombreUnidad = el('input', { type: 'text', valor: i.nombreUnidad || '', placeholder: 'Ej: plancha, pan, rollo' })
    const presNombre = el('input', { type: 'text', valor: (i.presentacion && i.presentacion.nombre) || '', placeholder: 'Ej: pilón, paquete, caja' })
    const presCant = campoNumero('¿Cuántas trae?', '', { valor: (i.presentacion && i.presentacion.cantidad) || '' })
    const costo = campoNumero('', '$', { decimales: true, valor: i.costo ? i.costo / 100 : '' })
    const minimo = campoNumero('', '', { decimales: true, valor: i.minimo ? (modo === 'unidad' ? i.minimo : i.minimo / 1000) : '' })
    const pintar = () => {
      poner(seg, [['pieza', 'Por pieza'], ['peso', 'Se pesa'], ['unidad', 'Se cuenta']].map(([v, t]) => el('button', { type: 'button', clase: modo === v ? 'activo' : '', onclick: () => { modo = v; pintar() } }, t)))
      costo.firstChild.textContent = modo === 'unidad' ? 'Costo de referencia por unidad' : 'Costo de referencia por kilo'
      minimo.firstChild.textContent = modo === 'unidad' ? 'Avisar cuando queden menos de (unidades)' : 'Avisar cuando queden menos de (kilos)'
      poner(extra,
        modo === 'pieza' ? el('p', { clase: 'sub' }, 'Cada pieza que llega se pesa y lleva un número. Así se ve cuánto rindió cada una.') : null,
        modo === 'unidad' ? [el('label', { clase: 'campo' }, '¿Cómo se llama una unidad?', nombreUnidad), el('div', { clase: 'dos' }, el('label', { clase: 'campo' }, 'Viene en (opcional)', presNombre), presCant)] : null)
    }
    pintar()
    const activo = el('label', { clase: 'check' }, el('input', { type: 'checkbox', checked: i.activo !== false || null }), 'Se sigue usando')
    const contar = el('label', { clase: 'check' }, el('input', { type: 'checkbox', checked: i.contar !== false || null }), 'Contarlo en cada conteo (sacale el tilde a lo que se usa de a poco, como el film: se controla por lo que se compra)')
    const error = el('div', { clase: 'error' })
    const guardar = el('button', { clase: 'btn primario' }, 'Guardar')
    const h = hoja({ titulo: id ? i.nombre : 'Insumo nuevo', completa: true, cuerpo: [el('label', { clase: 'campo' }, 'Nombre', nombre), el('div', { clase: 'campo' }, '¿Cómo se controla?', seg), extra, contar, costo, el('p', { clase: 'sub', estilo: { marginTop: '-6px' } }, 'Se reemplaza solo cuando cargás una compra con precio.'), minimo, activo, error], pie: [el('button', { clase: 'btn', onclick: () => h.cerrar() }, 'Cancelar'), guardar] })
    guardar.addEventListener('click', async () => {
      if (!nombre.value.trim()) { error.textContent = 'Poné el nombre.'; return }
      if (id && modo !== i.modo && D.r.stock.some((s) => s.id === id && Math.abs(s.cantidad) > 0.001)) { error.textContent = 'No se puede cambiar cómo se controla un insumo que tiene stock.'; return }
      const d = { nombre: nombre.value.trim(), modo, activo: activo.querySelector('input').checked }
      if (modo !== 'pieza' && !contar.querySelector('input').checked) d.contar = false
      if (modo === 'unidad') {
        d.nombreUnidad = nombreUnidad.value.trim().toLowerCase() || 'unidad'
        if (presNombre.value.trim()) d.presentacion = { nombre: presNombre.value.trim().toLowerCase(), cantidad: presCant.valor() > 0 ? presCant.valor() : null }
      }
      const c = aCentavos(costo.input.value)
      if (c > 0) d.costo = c
      const m = minimo.valor()
      if (m > 0) d.minimo = modo === 'unidad' ? m : m * 1000
      guardar.disabled = true
      try { await API.guardarCatalogo('insumo', i.id, d); h.cerrar(); Duenio.listo('Guardado') } catch (e) { error.textContent = textoError(e); guardar.disabled = false }
    })
  },

  // --- entregas ---------------------------------------------------------------------------------------------
  estadoEntrega (e) {
    if (!e.recibido) return chip('Sin confirmar', 'alerta')
    if (e.difs.length) return chip('Llegó distinto', 'mal')
    return chip('Recibido bien', 'ok')
  },
  ver_entregas () {
    const es = D.r.entregas
    return el('div', {}, cabecera('Entregas', 'Lo que se mandó a cada local y lo que contaron al recibirlo.'),
      es.length ? el('div', { clase: 'tarjeta sin-relleno' }, el('div', { clase: 'lista' }, es.slice(0, 200).map((e) => el('div', { clase: 'item' },
        el('div', { clase: 'cuerpo' }, el('b', {}, e.nombreSucursal + ' · ' + fechaHora(e.t)),
          el('div', { clase: 'sub' }, e.items.map((i) => fmt(i.cantidad) + ' ' + i.nombre).join(', ')),
          e.recibido ? el('div', { clase: 'sub' }, 'Recibió ' + (e.recibidoPor || '—') + ' ' + fechaHora(e.recibidoEn)) : null,
          e.difs.length ? el('div', { clase: 'sub rojo' }, e.difs.map((x) => x.nombre + ': mandaron ' + fmt(x.enviado) + ', llegaron ' + fmt(x.recibido)).join(' · ') + ' (' + plata(e.difPlata) + ')') : null),
        el('div', { clase: 'fin' }, Duenio.estadoEntrega(e)))))) : el('div', { clase: 'tarjeta' }, vacio('Todavía no se mandó nada.', 'camion')))
  },

  // --- personal y sueldos -------------------------------------------------------------------------------------
  ver_personal () {
    const per = D.datos.personal || []
    const sucs = Duenio.config().sucursales
    const c = el('div', {}, cabecera('Personal y sueldos', 'Quién entra con PIN y las horas de producción.', el('button', { clase: 'btn primario', onclick: () => Duenio.editarPersona(null, 'produccion') }, icono('sumar'), 'Persona nueva')))
    c.append(el('div', { clase: 'tarjeta sin-relleno' }, el('h2', {}, 'Quién entra'), per.length ? el('div', { clase: 'lista' }, per.map((p) => el('button', { clase: 'item' + (p.activo ? '' : ' inactivo'), onclick: () => Duenio.editarPersona(p) },
      el('div', { clase: 'cuerpo' }, el('b', {}, p.nombre), el('div', { clase: 'sub' }, p.rol === 'produccion' ? 'Producción' + (p.valor_hora ? ' · ' + plata(p.valor_hora) + ' la hora' : '') : 'Recibe en ' + ((sucs.find((s) => s.id === p.sucursal) || {}).nombre || p.sucursal || '—'))),
      p.activo ? null : chip('De baja')))) : el('p', { clase: 'sub', estilo: { padding: '0 16px 12px' } }, 'Nadie todavía.')))
    // Horas y sueldo del periodo.
    const ahora = new Date()
    const lunes = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - ((ahora.getDay() + 6) % 7))
    const periodos = {
      semana: ['Esta semana', lunes.getTime(), Infinity],
      semanaPasada: ['Semana pasada', lunes.getTime() - 7 * 86400000, lunes.getTime()],
      mes: ['Este mes', new Date(ahora.getFullYear(), ahora.getMonth(), 1).getTime(), Infinity],
      mesPasado: ['Mes pasado', new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1).getTime(), new Date(ahora.getFullYear(), ahora.getMonth(), 1).getTime()]
    }
    const [, desde, hasta] = periodos[D.periodo]
    const dias = D.r.dias.filter((d) => !d.suelto && d.abierto >= desde && d.abierto < hasta)
    const porPersona = {}
    for (const d of dias) {
      const k = d.personaNombre || '—'
      const x = porPersona[k] = porPersona[k] || { dias: 0, horas: 0, plata: 0, faltante: 0 }
      x.dias++; x.horas += d.horas; x.plata += d.manoDeObra; x.faltante += d.faltante
    }
    c.append(el('div', { clase: 'filtros' }, Object.keys(periodos).map((k) => el('button', { clase: 'filtro' + (D.periodo === k ? ' activo' : ''), onclick: () => { D.periodo = k; Duenio.pintar() } }, periodos[k][0]))))
    c.append(el('div', { clase: 'tarjeta' }, el('h2', {}, 'Horas y sueldo'),
      Object.keys(porPersona).length ? Object.keys(porPersona).map((k) => { const x = porPersona[k]; return Duenio.fila(k, plata(x.plata), x.dias + ' día' + (x.dias === 1 ? '' : 's') + ' · ' + fmt(Math.round(x.horas * 10) / 10) + ' h' + (x.faltante > 0 ? ' · faltante ' + plata(x.faltante) : '')) }) : el('p', { clase: 'sub' }, 'No hay días en este período.'),
      dias.length ? el('details', { clase: 'detalles', estilo: { marginTop: '10px' } }, el('summary', {}, 'Día por día'), dias.map((d) => Duenio.fila(fechaCorta(d.abierto) + ' · ' + horaCorta(d.abierto) + ' a ' + (d.cerrado ? horaCorta(d.cerrado) : '—'), fmt(Math.round(d.horas * 10) / 10) + ' h', d.personaNombre))) : null,
      el('p', { clase: 'sub' }, 'Las horas salen de cuándo empezó y cuándo cerró el día en la app.')))
    return c
  },
  editarPersona (p, rolNuevo) {
    const nueva = !p || !p.id
    p = p && p.id ? p : { nombre: '', rol: rolNuevo || 'produccion', sucursal: null, valor_hora: 600000, activo: true }
    const sucs = Duenio.config().sucursales
    const nombre = el('input', { type: 'text', valor: p.nombre, placeholder: 'Ej: Mica' })
    let rol = p.rol
    let sucursal = p.sucursal || (sucs[0] && sucs[0].id) || ''
    const segRol = el('div', { clase: 'seg ancho' })
    const extra = el('div', {})
    const valorHora = campoNumero('Valor de la hora', '$', { decimales: true, valor: p.valor_hora ? p.valor_hora / 100 : '' })
    const selSuc = el('select', {}, sucs.map((s) => el('option', { value: s.id, selected: s.id === sucursal || null }, s.nombre)))
    selSuc.addEventListener('change', () => { sucursal = selSuc.value })
    const pintar = () => {
      poner(segRol, [['produccion', 'Producción'], ['local', 'Recibe en un local']].map(([v, t]) => el('button', { type: 'button', clase: rol === v ? 'activo' : '', onclick: () => { rol = v; pintar() } }, t)))
      poner(extra, rol === 'produccion' ? valorHora : el('label', { clase: 'campo' }, '¿En qué local?', selSuc))
    }
    pintar()
    const pin = campoNumero(nueva ? 'PIN (4 a 8 números)' : 'PIN nuevo (dejalo vacío para no cambiarlo)', '', { placeholder: nueva ? 'Ej: 4821' : '' })
    pin.input.setAttribute('inputmode', 'numeric')
    const activo = el('label', { clase: 'check' }, el('input', { type: 'checkbox', checked: p.activo !== false || null }), 'Puede entrar')
    const error = el('div', { clase: 'error' })
    const guardar = el('button', { clase: 'btn primario' }, 'Guardar')
    const h = hoja({ titulo: nueva ? 'Persona nueva' : p.nombre, completa: true, cuerpo: [el('label', { clase: 'campo' }, 'Nombre', nombre), el('div', { clase: 'campo' }, '¿Qué hace?', segRol), extra, pin, el('p', { clase: 'sub' }, 'El PIN se lo decís vos. No lo puede ver nadie, ni vos después: si se lo olvida, le ponés uno nuevo.'), activo, error], pie: [el('button', { clase: 'btn', onclick: () => h.cerrar() }, 'Cancelar'), guardar] })
    guardar.addEventListener('click', async () => {
      const datos = { id: p.id || null, nombre: nombre.value.trim(), rol, sucursal: rol === 'local' ? sucursal : null, valorHora: rol === 'produccion' ? (aCentavos(valorHora.input.value) || 0) : 0, activo: activo.querySelector('input').checked }
      const pv = pin.input.value.trim()
      if (pv) datos.pin = pv
      if (!datos.nombre) { error.textContent = 'Poné el nombre.'; return }
      if (rol === 'local' && !sucursal) { error.textContent = 'Primero cargá los locales en Ajustes.'; return }
      guardar.disabled = true
      try {
        const r = await API.guardarPersona(datos)
        if (r && r.error) throw r
        h.cerrar()
        Duenio.listo('Guardado' + (pv ? '. Pasale el PIN en persona.' : ''))
      } catch (e) { error.textContent = textoError(e); guardar.disabled = false }
    })
  },

  // --- todo lo anotado ----------------------------------------------------------------------------------------
  describir (m) {
    const d = m.datos || {}
    const ins = (id) => (Duenio.insumo(id) || {}).nombre || 'insumo'
    const pro = (id) => (Duenio.producto(id) || {}).nombre || 'producto'
    switch (m.tipo) {
      case 'abrir_dia': return 'Empezó el día'
      case 'cerrar_dia': return 'Cerró el día'
      case 'conteo': return d.momento === 'apertura' ? 'Conteo de la mañana' : d.momento === 'cierre' ? 'Conteo del cierre' : 'Conteo'
      case 'ingreso': return 'Llegó ' + ins(d.insumoId) + (d.piezas && d.piezas.length ? ' N° ' + d.piezas.map((p) => p.numero).join(', ') : ' (' + Duenio.cant(Duenio.insumo(d.insumoId), d.cantidad) + ')')
      case 'precio_ingreso': return 'Precio de una compra: ' + plata(d.costoTotal)
      case 'abrir_pieza': return 'Abrió una pieza'
      case 'terminar_pieza': return 'Terminó una pieza (punta ' + fmtCant(d.punta, 'g') + ')'
      case 'produccion': return 'Hizo ' + fmt(d.cantidad) + ((Duenio.producto(d.productoId) || {}).venta === 'peso' ? ' g de ' : ' ') + pro(d.productoId)
      case 'merma': return 'Merma: ' + (d.clase === 'producto' ? pro(d.id) : ins(d.id)) + ' · ' + (d.motivo || '')
      case 'entrega': return 'Mandó a ' + ((Duenio.config().sucursales.find((s) => s.id === d.sucursal) || {}).nombre || d.sucursal)
      case 'recepcion': return 'Recibió en el local'
      case 'anular': return 'Anuló algo'
      default: return m.tipo
    }
  },
  ver_movimientos () {
    const anulados = new Set(D.datos.movimientos.filter((m) => m.tipo === 'anular').map((m) => m.datos.movId))
    const ms = D.datos.movimientos.slice().sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha)).slice(0, 300)
    return el('div', {}, cabecera('Todo lo anotado', 'Lo último primero. Nada se borra: lo que está mal se anula.'),
      ms.length ? el('div', { clase: 'tarjeta sin-relleno' }, el('div', { clase: 'lista' }, ms.map((m) => el('div', { clase: 'item' + (anulados.has(m.id) ? ' inactivo' : '') },
        el('div', { clase: 'cuerpo' }, el('b', {}, Duenio.describir(m)), el('div', { clase: 'sub' }, fechaHora(Date.parse(m.fecha)) + ' · ' + (m.persona_nombre || m.quien) + (anulados.has(m.id) ? ' · ANULADO' : ''))),
        m.datos && m.datos.fotoId ? el('button', { clase: 'btn chico', onclick: () => Duenio.verFoto(m.datos.fotoId) }, 'Foto') : null,
        !anulados.has(m.id) && ['produccion', 'merma', 'entrega', 'ingreso', 'terminar_pieza', 'precio_ingreso', 'recepcion', 'conteo'].includes(m.tipo)
          ? el('button', { clase: 'btn chico', onclick: async () => { if (await confirmar('Anular', '¿Anular "' + Duenio.describir(m) + '"? Se recalcula todo sin esto.', 'Anular', true)) { try { await Duenio.registrar('anular', { movId: m.id }); Duenio.listo('Anulado') } catch (e) { toast(textoError(e), 'mal') } } } }, 'Anular') : null)))) : el('div', { clase: 'tarjeta' }, vacio('Nada todavía.', 'historial')))
  },

  // --- ajustes ----------------------------------------------------------------------------------------------
  ver_ajustes () {
    const conf = JSON.parse(JSON.stringify(Duenio.config()))
    const c = el('div', {}, cabecera('Ajustes', ''))
    // Link para la chica.
    const link = location.origin + location.pathname + (PRUEBA ? '?prueba' : '') + (leerLocal('prod.proyecto', '') ? '#p=' + leerLocal('prod.proyecto', '') : '')
    c.append(el('div', { clase: 'tarjeta' }, el('h2', {}, 'El link para el celular de producción'),
      el('p', { clase: 'tenue' }, 'Abrilo en el celular de ella, entrá con su PIN y agregalo a la pantalla de inicio (en el menú del navegador: "Agregar a pantalla principal").'),
      el('div', { clase: 'link-copiar' }, el('code', {}, link), el('button', { clase: 'btn chico', onclick: async () => { try { await navigator.clipboard.writeText(link); toast('Link copiado', 'ok') } catch (e) { toast('Copialo a mano', 'mal') } } }, 'Copiar'))))
    // Locales.
    const listaSuc = el('div', {})
    const pintarSuc = () => poner(listaSuc, conf.sucursales.map((s, k) => el('div', { clase: 'dos', estilo: { alignItems: 'end', marginBottom: '8px' } },
      el('label', { clase: 'campo', estilo: { margin: 0 } }, 'Nombre', el('input', { type: 'text', valor: s.nombre, oninput: (ev) => { s.nombre = ev.target.value } })),
      el('button', { clase: 'btn peligro', onclick: () => { conf.sucursales.splice(k, 1); pintarSuc() } }, 'Sacar'))),
    el('button', { clase: 'btn', onclick: () => { conf.sucursales.push({ id: 's_' + Date.now().toString(36), nombre: '' }); pintarSuc() } }, icono('sumar'), 'Agregar local'))
    pintarSuc()
    c.append(el('div', { clase: 'tarjeta' }, el('h2', {}, 'Locales a los que se manda'), listaSuc))
    // Horario.
    const h = conf.horario
    const nombresDias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
    const desde = el('input', { type: 'time', valor: h.desde })
    const hasta = el('input', { type: 'time', valor: h.hasta })
    c.append(el('div', { clase: 'tarjeta' }, el('h2', {}, 'Horario de producción'),
      el('div', { clase: 'chips grandes' }, [1, 2, 3, 4, 5, 6, 0].map((dn) => el('label', { clase: 'chip-btn' + (h.dias.includes(dn) ? ' activo' : '') }, el('input', { type: 'checkbox', hidden: true, checked: h.dias.includes(dn) || null, onchange: (ev) => { if (ev.target.checked) h.dias.push(dn); else h.dias = h.dias.filter((x) => x !== dn); ev.target.parentNode.classList.toggle('activo', ev.target.checked) } }), nombresDias[dn]))),
      el('div', { clase: 'dos', estilo: { marginTop: '10px' } }, el('label', { clase: 'campo' }, 'Desde', desde), el('label', { clase: 'campo' }, 'Hasta', hasta)),
      el('p', { clase: 'sub' }, 'Te aviso si abre tarde o trabaja fuera de estos días.')))
    // Control.
    const foto = el('input', { type: 'checkbox', checked: conf.fotoProduccion !== false || null })
    const contar = el('input', { type: 'checkbox', checked: conf.contarAlAbrir !== false || null })
    const tol = campoNumero('Avisarme si el faltante del día pasa el', '%', { decimales: true, valor: conf.toleranciaPct })
    c.append(el('div', { clase: 'tarjeta' }, el('h2', {}, 'Control'),
      el('label', { clase: 'check' }, contar, 'Contar también a la mañana (así se sabe si falta algo de noche)'),
      el('label', { clase: 'check' }, foto, 'Pedir foto cada vez que anota lo que hizo'),
      tol))
    c.append(el('button', { clase: 'btn primario ancho grande', onclick: async () => {
      conf.sucursales = conf.sucursales.filter((s) => s.nombre.trim()).map((s) => ({ id: s.id, nombre: s.nombre.trim() }))
      conf.horario = { dias: h.dias.slice().sort(), desde: desde.value || '08:00', hasta: hasta.value || '14:00' }
      conf.fotoProduccion = foto.checked
      conf.contarAlAbrir = contar.checked
      conf.toleranciaPct = tol.valor() >= 0 ? tol.valor() : 2
      try { await API.guardarCatalogo('config', 'config', conf); Duenio.listo('Ajustes guardados') } catch (e) { toast(textoError(e), 'mal') }
    } }, 'Guardar ajustes'))
    if (PRUEBA) c.append(el('button', { clase: 'btn peligro ancho', estilo: { marginTop: '18px' }, onclick: async () => { if (await confirmar('Borrar la prueba', 'Se borra todo lo cargado en modo prueba en este navegador.', 'Borrar', true)) { Prueba.borrarTodo(); location.reload() } } }, 'Borrar los datos de prueba'))
    return c
  },

  ver_mas () {
    return el('div', {}, cabecera('Más', ''), el('div', { clase: 'mas-grilla' }, Object.keys(SECCIONES_D).filter((k) => !ABAJO_D.includes(k)).map((k) =>
      el('button', { clase: 'acceso', onclick: () => Duenio.ir(k) }, el('span', { clase: 'ico' }, icono(SECCIONES_D[k].icono)), SECCIONES_D[k].nombre)),
    el('button', { clase: 'acceso', onclick: () => Duenio.salir() }, el('span', { clase: 'ico' }, icono('salir')), 'Salir')))
  }
}
