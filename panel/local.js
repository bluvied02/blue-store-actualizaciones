'use strict'
// COSAS DEL LOCAL CON EL CELULAR EN LA MANO
//
// Contar stock y recibir mercaderia caminando por el local: la camara queda
// abierta y cada codigo que lee suma uno. Lo que se va armando queda guardado
// en el celular (si se corta, no se pierde) hasta que se manda a la caja.

// Una lista que se arma escaneando: la usan Contar y Recibir.
function listaEscaneada (clave, vacia) {
  const L = S.listas = S.listas || {}
  if (!L[clave]) L[clave] = leerLocal(clave, null) || vacia()
  const guardar = () => guardarLocal(clave, L[clave])
  const borrar = () => { L[clave] = vacia(); guardar() }
  return { datos: L[clave], guardar, borrar, nueva: () => { borrar(); return L[clave] } }
}

// Sumar un producto leido a la lista (o uno mas si ya estaba).
function sumarALinea (lineas, p, extra) {
  let l = lineas.find((x) => x.productoId === p.id)
  if (l) l.cantidad += 1000
  else {
    l = Object.assign({ productoId: p.id, descripcion: p.descripcion, codigo: (p.codigos || [])[0] || '', stock: p.stock || 0, cantidad: 1000 }, extra ? extra(p) : {})
    lineas.unshift(l)
  }
  l.ts = new Date().toISOString()
  return l
}

// El campo de cantidad de cada renglon: se escribe o se toca + / −.
function campoCantidad (l, alCambiar) {
  const entrada = el('input', { type: 'text', inputmode: 'decimal', clase: 'num', valor: unidades(l.cantidad), estilo: { width: '64px', textAlign: 'center' } })
  entrada.addEventListener('change', () => {
    const n = aMilesimas(entrada.value)
    if (Number.isFinite(n) && n >= 0) { l.cantidad = n; l.ts = new Date().toISOString() }
    alCambiar()
  })
  entrada.addEventListener('focus', () => entrada.select())
  return el('div', { clase: 'fila', estilo: { gap: '4px', alignItems: 'center' } },
    el('button', { clase: 'btn-ico', 'aria-label': 'Uno menos', onclick: () => { l.cantidad = Math.max(0, l.cantidad - 1000); alCambiar() } }, icono('restar')),
    entrada,
    el('button', { clase: 'btn-ico', 'aria-label': 'Uno más', onclick: () => { l.cantidad += 1000; l.ts = new Date().toISOString(); alCambiar() } }, icono('sumar')))
}

// Buscador para agregar a mano lo que no tiene codigo (o no se deja leer).
function buscadorParaAgregar (lista, alElegir) {
  const busca = el('input', { type: 'search', placeholder: 'Buscar para agregar a mano…', enterkeyhint: 'search' })
  const resultados = el('div', { clase: 'lista' })
  const tarjeta = el('div', { clase: 'tarjeta sin-relleno', estilo: { display: 'none' } }, resultados)
  busca.addEventListener('input', () => {
    const q = busca.value.trim()
    tarjeta.style.display = q.length < 2 ? 'none' : ''
    if (q.length < 2) return poner(resultados)
    const filas = lista.filter((p) => p.activo !== false && coincide(p.descripcion + ' ' + (p.codigos || []).join(' '), q)).slice(0, 12)
    poner(resultados, filas.length ? filas.map((p) => itemProducto(p, () => { busca.value = ''; tarjeta.style.display = 'none'; alElegir(p) })) : vacio('Nada coincide.', 'buscar'))
  })
  return [el('div', { clase: 'buscador' }, icono('buscar'), busca), tarjeta]
}

// --- CONTAR STOCK -----------------------------------------------------------------------

async function secContar () {
  if (!S.sucursal) return pintarSeccion('contar', cabecera('Contar stock'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'stock')))
  const suc = S.sucursal
  const lista = await leerCatalogo(suc)
  const L = listaEscaneada('bs.contar.' + suc, () => ({ lineas: [], nota: '' }))
  const C = L.datos
  const zona = el('div', { clase: 'lista' })
  const resumen = el('div', { clase: 'sub', estilo: { margin: '6px 2px' } })

  const pintar = () => {
    L.guardar()
    poner(zona, C.lineas.length ? C.lineas.map((l, i) => {
      const dif = l.cantidad - l.stock
      return el('div', { clase: 'item' },
        el('div', { clase: 'cuerpo' },
          el('b', {}, l.descripcion),
          el('div', { clase: 'sub' }, 'El sistema dice ' + unidades(l.stock)),
          el('div', { clase: 'sub ' + (dif === 0 ? 'verde' : dif < 0 ? 'rojo' : 'ambar') }, dif === 0 ? 'Coincide' : dif < 0 ? 'Faltan ' + unidades(-dif) : 'Sobran ' + unidades(dif))),
        el('div', { clase: 'fin pila' },
          campoCantidad(l, pintar),
          el('button', { clase: 'btn chico', onclick: () => { C.lineas.splice(i, 1); pintar() } }, 'Sacar')))
    }) : vacio('Tocá "Escanear y contar" y pasá los productos por la cámara: cada lectura suma uno.', 'stock'))
    const conDif = C.lineas.filter((l) => l.cantidad !== l.stock).length
    resumen.textContent = C.lineas.length ? C.lineas.length + ' productos contados · ' + conDif + ' con diferencia' : ''
  }

  const escanear = () => leerCodigo({
    titulo: 'Contando',
    texto: 'Cada código que leés suma uno',
    textoListo: 'Terminé de contar',
    alLeer: async (c) => {
      const r = await buscarCodigo(c, suc).catch(() => ({}))
      if (!r.producto) return '✗ ' + c + ' no está en el catálogo'
      const l = sumarALinea(C.lineas, r.producto)
      L.guardar()
      return '✓ ' + l.descripcion + ' · ' + unidades(l.cantidad)
    }
  }).then(pintar)

  const mandar = async () => {
    const items = C.lineas.filter((l) => Number.isFinite(l.cantidad))
    if (!items.length) return toast('Todavía no contaste nada', 'mal')
    const conDif = items.filter((l) => l.cantidad !== l.stock).length
    if (!confirm('¿Mandar el conteo de ' + items.length + ' productos a ' + nombreSucursal(suc) + '?\n\n' + conDif + ' tienen diferencia: el stock queda en lo que contaste (menos lo que se vendió después de contarlo).')) return
    await mandarOrden(suc, 'conteo', { items: items.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad, ts: l.ts })), nota: C.nota || '' }, { texto: 'Conteo de ' + items.length, alTerminar: () => refrescarSeccion() })
    L.nueva()
    S.listas['bs.contar.' + suc] = null
    refrescarSeccion()
  }

  pintar()
  pintarSeccion('contar',
    cabecera('Contar stock', nombreSucursal(suc) + ' · escaneá lo que hay en la góndola'),
    el('button', { clase: 'btn primario ancho grande', estilo: { marginBottom: '10px' }, onclick: escanear }, icono('escanear'), 'Escanear y contar'),
    buscadorParaAgregar(lista, (p) => { sumarALinea(C.lineas, p); pintar() }),
    el('h3', {}, 'Contado'),
    el('div', { clase: 'tarjeta sin-relleno' }, zona),
    resumen,
    el('div', { clase: 'fila', estilo: { gap: '8px', marginTop: '8px' } },
      el('button', { clase: 'btn', onclick: () => { if (C.lineas.length && !confirm('¿Borrar todo lo contado?')) return; L.nueva(); S.listas['bs.contar.' + suc] = null; refrescarSeccion() } }, 'Empezar de nuevo'),
      el('button', { clase: 'btn primario', estilo: { flex: '1' }, onclick: mandar }, icono('ok'), 'Mandar el conteo')),
    el('p', { clase: 'sub', estilo: { marginTop: '10px', whiteSpace: 'normal' } }, 'Solo se corrigen los productos que contaste. Lo que se vende mientras contás se descuenta solo.'))
}

// --- RECIBIR MERCADERIA -----------------------------------------------------------------

async function secRecibir () {
  if (!S.sucursal) return pintarSeccion('recibir', cabecera('Recibir mercadería'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'proveedores')))
  const suc = S.sucursal
  const [lista, provs] = await Promise.all([leerCatalogo(suc), leerDatos('proveedores').catch(() => ({}))])
  const proveedores = (datosDe(provs, suc) || []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const conCostos = puede('verCostos')
  const L = listaEscaneada('bs.recibir.' + suc, () => ({ lineas: [], proveedorId: '', numero: '', aPagar: false, vence: sumarDias(hoyISO(), 21) }))
  const R = L.datos

  const prov = el('select', {}, el('option', { valor: '' }, '— sin proveedor —'), proveedores.map((x) => el('option', { valor: x.id, selected: x.id === R.proveedorId }, x.nombre)))
  const numero = el('input', { type: 'text', valor: R.numero || '', placeholder: 'Opcional', maxlength: '40' })
  const aPagar = el('input', { type: 'checkbox', checked: !!R.aPagar })
  const vence = el('input', { type: 'date', valor: R.vence || sumarDias(hoyISO(), 21) })
  const zonaPagar = el('div', {})
  prov.addEventListener('change', () => { R.proveedorId = prov.value; pintar() })
  numero.addEventListener('input', () => { R.numero = numero.value; L.guardar() })
  aPagar.addEventListener('change', () => { R.aPagar = aPagar.checked; pintar() })
  vence.addEventListener('change', () => { R.vence = vence.value; L.guardar() })

  const zona = el('div', { clase: 'lista' })
  const resumen = el('div', { clase: 'sub', estilo: { margin: '6px 2px' } })
  const total = () => R.lineas.reduce((s, l) => s + (l.costoUnit > 0 ? Math.round(l.cantidad * l.costoUnit / 1000) : 0), 0)

  const pintar = () => {
    L.guardar()
    poner(zona, R.lineas.length ? R.lineas.map((l, i) => {
      const costo = conCostos ? el('input', { type: 'text', inputmode: 'decimal', clase: 'num', placeholder: 'costo', valor: l.costoUnit > 0 ? plataExacta(l.costoUnit) : '', estilo: { width: '96px' } }) : null
      if (costo) costo.addEventListener('change', () => { const c = aCentavos(costo.value); l.costoUnit = Number.isFinite(c) && c > 0 ? c : null; pintar() })
      const vto = el('input', { type: 'date', valor: l.vence || '', estilo: { width: '140px' } })
      vto.addEventListener('change', () => { l.vence = vto.value; L.guardar() })
      return el('div', { clase: 'item', estilo: { flexWrap: 'wrap' } },
        el('div', { clase: 'cuerpo' },
          el('b', {}, l.descripcion),
          el('div', { clase: 'sub' }, (l.codigo || 'sin código') + ' · hay ' + unidades(l.stock))),
        el('div', { clase: 'fin pila' },
          campoCantidad(l, pintar),
          el('button', { clase: 'btn chico', onclick: () => { R.lineas.splice(i, 1); pintar() } }, 'Sacar')),
        el('div', { clase: 'fila', estilo: { width: '100%', gap: '8px', marginTop: '6px', alignItems: 'center' } },
          costo ? el('label', { clase: 'sub fila', estilo: { gap: '4px', alignItems: 'center' } }, 'Costo c/u $', costo) : null,
          el('label', { clase: 'sub fila', estilo: { gap: '4px', alignItems: 'center' } }, 'Vence', vto)))
    }) : vacio('Escaneá lo que trajo el proveedor: cada lectura suma uno.', 'proveedores'))
    const u = R.lineas.reduce((s, l) => s + l.cantidad, 0)
    const t = total()
    resumen.textContent = R.lineas.length ? R.lineas.length + (R.lineas.length === 1 ? ' producto · ' : ' productos · ') + unidades(u) + (u === 1000 ? ' unidad' : ' unidades') + (conCostos && t ? ' · total ' + plata(t) : '') : ''
    poner(zonaPagar, conCostos && R.proveedorId && t > 0
      ? el('div', { clase: 'tarjeta' },
        el('label', { clase: 'fila', estilo: { gap: '8px', alignItems: 'center' } }, aPagar, 'Anotar ' + plata(t) + ' en A pagar'),
        R.aPagar ? el('label', { clase: 'campo', estilo: { marginTop: '8px' } }, 'Hay que pagarlo el', vence) : null)
      : null)
  }

  const escanear = () => leerCodigo({
    titulo: 'Recibiendo',
    texto: 'Cada código que leés suma uno',
    textoListo: 'Listo',
    alLeer: async (c) => {
      const r = await buscarCodigo(c, suc).catch(() => ({}))
      if (!r.producto) return '✗ ' + c + ' no está: cargalo en Productos'
      const l = sumarALinea(R.lineas, r.producto, (p) => ({ costoUnit: conCostos && p.costo > 0 ? p.costo : null, vence: '' }))
      L.guardar()
      return '✓ ' + l.descripcion + ' · ' + unidades(l.cantidad)
    }
  }).then(pintar)

  const mandar = async () => {
    const lineas = R.lineas.filter((l) => l.cantidad > 0)
    if (!lineas.length) return toast('Todavía no cargaste nada', 'mal')
    const t = total()
    const nombreProv = R.proveedorId ? (proveedores.find((x) => x.id === R.proveedorId) || {}).nombre : ''
    if (!confirm('¿Cargar ' + lineas.length + ' productos en ' + nombreSucursal(suc) + (nombreProv ? ' de ' + nombreProv : '') + '?' + (R.aPagar && t ? '\n\nSe anota ' + plata(t) + ' en A pagar.' : ''))) return
    await mandarOrden(suc, 'recepcion', {
      proveedorId: R.proveedorId || null,
      numero: R.numero || '',
      lineas: lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad, costoUnit: conCostos && l.costoUnit > 0 ? l.costoUnit : null, vence: l.vence || '' })),
      deuda: R.aPagar && R.proveedorId && t > 0 && R.vence ? { vence: R.vence } : null
    }, { texto: 'Recepción' + (nombreProv ? ' de ' + nombreProv : ''), alTerminar: () => refrescarSeccion() })
    L.nueva()
    S.listas['bs.recibir.' + suc] = null
    refrescarSeccion()
  }

  pintar()
  pintarSeccion('recibir',
    cabecera('Recibir mercadería', nombreSucursal(suc) + ' · entra al stock cuando la caja lo aplica'),
    el('div', { clase: 'tarjeta' },
      el('label', { clase: 'campo' }, 'Proveedor', prov),
      el('label', { clase: 'campo' }, 'Número de remito o factura', numero)),
    el('button', { clase: 'btn primario ancho grande', estilo: { marginBottom: '10px' }, onclick: escanear }, icono('escanear'), 'Escanear lo que llegó'),
    buscadorParaAgregar(lista, (p) => { sumarALinea(R.lineas, p, (x) => ({ costoUnit: conCostos && x.costo > 0 ? x.costo : null, vence: '' })); pintar() }),
    el('h3', {}, 'Lo que llegó'),
    el('div', { clase: 'tarjeta sin-relleno' }, zona),
    resumen,
    zonaPagar,
    el('div', { clase: 'fila', estilo: { gap: '8px', marginTop: '8px' } },
      el('button', { clase: 'btn', onclick: () => { if (R.lineas.length && !confirm('¿Borrar todo lo cargado?')) return; L.nueva(); S.listas['bs.recibir.' + suc] = null; refrescarSeccion() } }, 'Empezar de nuevo'),
      el('button', { clase: 'btn primario', estilo: { flex: '1' }, onclick: mandar }, icono('ok'), 'Cargar en la caja')))
}

// --- ENCARGOS DE CLIENTES ---------------------------------------------------------------

const ESTADO_ENCARGO = { pendiente: ['Pendiente', 'alerta'], preparando: ['Preparando', ''], listo: ['Listo', 'ok'], entregado: ['Entregado', 'ok'], cancelado: ['Cancelado', 'mal'] }

function cuandoEncargo (para) {
  if (!para) return 'cuando pase'
  const dia = para.slice(0, 10)
  const h = para.slice(11, 16)
  return (dia === hoyISO() ? 'hoy' : dia === sumarDias(hoyISO(), 1) ? 'mañana' : fechaCorta(dia)) + ' ' + h
}

function itemEncargo (x, suc) {
  const [nombre, clase] = ESTADO_ENCARGO[x.estado] || [x.estado, '']
  const abierto = ['pendiente', 'preparando', 'listo'].includes(x.estado)
  const tarde = abierto && x.para && new Date(x.para).getTime() < Date.now()
  const cambiar = (estado) => mandarOrden(suc, 'encargo_estado', { id: x.id, estado }, { texto: x.numero + ': ' + ESTADO_ENCARGO[estado][0].toLowerCase(), alTerminar: () => refrescarSeccion() })
  const siguiente = x.estado === 'pendiente' ? 'preparando' : x.estado === 'preparando' ? 'listo' : x.estado === 'listo' ? 'entregado' : null
  return el('div', { clase: 'item', estilo: { flexWrap: 'wrap' } },
    el('span', { clase: 'ico', estilo: { color: 'var(--texto3)' } }, icono('pedidos')),
    el('div', { clase: 'cuerpo' },
      el('b', {}, x.numero + ' · ' + x.cliente.nombre),
      el('div', { clase: 'sub' + (tarde ? ' rojo' : ''), estilo: { whiteSpace: 'normal' } }, (x.entrega === 'envio' ? 'Envío a ' + x.cliente.direccion : 'Retira') + ' · ' + cuandoEncargo(x.para)),
      el('div', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, x.items.map((it) => unidades(it.cantidad) + ' ' + it.descripcion).join(' · ')),
      x.nota ? el('div', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, x.nota) : null),
    el('div', { clase: 'fin pila' },
      el('b', { clase: 'num' }, plata(x.total)),
      el('span', { clase: 'chip ' + clase }, nombre)),
    abierto ? el('div', { clase: 'fila', estilo: { width: '100%', gap: '8px', marginTop: '8px' } },
      siguiente ? el('button', { clase: 'btn chico primario', onclick: () => cambiar(siguiente) }, siguiente === 'entregado' ? 'Entregado' : ESTADO_ENCARGO[siguiente][0]) : null,
      x.cliente.telefono ? el('a', { clase: 'btn chico', href: 'https://wa.me/' + (String(x.cliente.telefono).replace(/\D/g, '').startsWith('54') ? '' : '549') + String(x.cliente.telefono).replace(/\D/g, '').replace(/^0/, ''), target: '_blank', rel: 'noreferrer' }, icono('mensaje'), 'WhatsApp') : null,
      el('button', { clase: 'btn chico', onclick: () => { if (confirm('¿Cancelar el encargo ' + x.numero + '?')) cambiar('cancelado') } }, 'Cancelar')) : null)
}

async function secEncargos () {
  if (!S.sucursal) return pintarSeccion('encargos', cabecera('Encargos'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'pedidos')))
  const suc = S.sucursal
  const d = datosDe(await leerDatos('encargos').catch(() => ({})), suc) || { abiertos: [], cerrados: [] }
  pintarSeccion('encargos',
    cabecera('Encargos', nombreSucursal(suc) + ' · pedidos de clientes para retirar o enviar',
      el('button', { clase: 'btn primario', onclick: () => hojaEncargo(suc) }, icono('sumar'), 'Nuevo')),
    el('h3', {}, 'Abiertos'),
    el('div', { clase: 'tarjeta sin-relleno' }, d.abiertos.length ? el('div', { clase: 'lista' }, d.abiertos.map((x) => itemEncargo(x, suc))) : vacio('No hay encargos abiertos.', 'pedidos')),
    d.cerrados.length ? el('h3', {}, 'Últimos cerrados') : null,
    d.cerrados.length ? el('div', { clase: 'tarjeta sin-relleno' }, el('div', { clase: 'lista' }, d.cerrados.slice(0, 10).map((x) => itemEncargo(x, suc)))) : null,
    el('p', { clase: 'sub', estilo: { whiteSpace: 'normal', marginTop: '10px' } }, 'Se cobran en la caja: en la pantalla Encargos, botón "Cobrar".'))
}

async function hojaEncargo (suc) {
  const lista = await leerCatalogo(suc)
  const lineas = []
  const nombre = el('input', { type: 'text', maxlength: '60', placeholder: 'Nombre del cliente' })
  const telefono = el('input', { type: 'tel', maxlength: '30', placeholder: 'Para avisarle' })
  const entrega = el('select', {}, el('option', { valor: 'retira' }, 'Retira en el local'), el('option', { valor: 'envio' }, 'Se lo mandamos'))
  const direccion = el('input', { type: 'text', maxlength: '120', placeholder: 'Calle, número, piso…' })
  const campoDir = el('label', { clase: 'campo', estilo: { display: 'none' } }, 'Dirección', direccion)
  entrega.addEventListener('change', () => { campoDir.style.display = entrega.value === 'envio' ? '' : 'none' })
  const para = el('input', { type: 'datetime-local' })
  const nota = el('input', { type: 'text', maxlength: '200', placeholder: 'Opcional' })
  const zona = el('div', { clase: 'lista' })
  const total = el('b', { clase: 'num' })
  const pintar = () => {
    poner(zona, lineas.length ? lineas.map((l, i) => el('div', { clase: 'item' },
      el('div', { clase: 'cuerpo' }, el('b', {}, l.descripcion), el('div', { clase: 'sub' }, plata(l.precioUnit) + ' c/u')),
      el('div', { clase: 'fin pila' }, campoCantidad(l, pintar), el('button', { clase: 'btn chico', onclick: () => { lineas.splice(i, 1); pintar() } }, 'Sacar'))))
      : vacio('Agregá lo que encargó.', 'pedidos'))
    total.textContent = plata(lineas.reduce((s, l) => s + Math.round(l.cantidad * l.precioUnit / 1000), 0))
  }
  const agregar = (p) => { sumarALinea(lineas, p, (x) => ({ precioUnit: x.precio || 0 })); pintar() }
  pintar()
  abrirHoja({
    titulo: 'Nuevo encargo',
    completa: true,
    cuerpo: el('div', {},
      el('label', { clase: 'campo' }, 'Cliente', nombre),
      el('label', { clase: 'campo' }, 'Teléfono', telefono),
      el('div', { clase: 'dos' }, el('label', { clase: 'campo' }, 'Entrega', entrega), el('label', { clase: 'campo' }, 'Para cuándo', para)),
      campoDir,
      el('button', { clase: 'btn ancho', estilo: { margin: '6px 0' }, onclick: async () => {
        const c = await leerCodigo({ titulo: 'Producto del encargo' })
        if (!c) return
        const r = await buscarCodigo(c, suc).catch(() => ({}))
        if (r.producto) agregar(r.producto)
        else toast('Ese código no está en ' + nombreSucursal(suc), 'mal')
      } }, icono('escanear'), 'Escanear producto'),
      buscadorParaAgregar(lista, agregar),
      el('div', { clase: 'tarjeta sin-relleno' }, zona),
      el('div', { clase: 'fila', estilo: { justifyContent: 'space-between', margin: '8px 2px' } }, el('span', { clase: 'sub' }, 'Total con los precios de hoy'), total),
      el('label', { clase: 'campo' }, 'Nota', nota)),
    botones: [{ texto: 'Anotar', primario: true, alTocar: async () => {
      if (!nombre.value.trim()) return toast('Falta el nombre del cliente', 'mal')
      if (!lineas.length) return toast('Agregá al menos un producto', 'mal')
      if (entrega.value === 'envio' && !direccion.value.trim()) return toast('Falta la dirección', 'mal')
      cerrarHoja()
      await mandarOrden(suc, 'encargo_guardar', { encargo: {
        id: uuid(),
        cliente: { nombre: nombre.value.trim(), telefono: telefono.value.trim(), direccion: direccion.value.trim() },
        entrega: entrega.value,
        para: para.value,
        nota: nota.value.trim(),
        items: lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad }))
      } }, { texto: 'Encargo de ' + nombre.value.trim(), alTerminar: () => refrescarSeccion() })
    } }]
  })
}

seccion('encargos', { nombre: 'Encargos', icono: 'pedidos', grupo: 'negocio', fn: secEncargos })
seccion('contar', { nombre: 'Contar stock', corto: 'Contar', icono: 'contar', grupo: 'mercaderia', fn: secContar })
seccion('recibir', { nombre: 'Recibir mercadería', icono: 'recibir', grupo: 'mercaderia', fn: secRecibir })
