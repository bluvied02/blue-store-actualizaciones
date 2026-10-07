'use strict'
// EL CALCULO DE PRODUCCION
//
// Con todo lo que se anoto (compras, produccion, mermas, entregas y conteos)
// arma lo que el dueño ve: cuanto deberia haber de cada cosa, cuanto falto en
// cada conteo y en cada pieza, cuanto cuesta cada producto y que va a faltar.
//
// La idea de fondo: cada gramo que entra tiene que salir en un producto, en
// una merma anotada (con foto) o seguir en el deposito. Lo que no aparece en
// ningun lado es FALTANTE, y se reconoce una sola vez, en el momento en que se
// mide (un conteo o una pieza que se termina), a nombre del dia en que se midio.
//
// No toca la red ni la pantalla: se usa igual en el celular y en las pruebas
// (node pruebas/prueba-calculo.js).
//
// Unidades: plata en centavos; peso en gramos; lo demas en su unidad (plancha,
// pan, rollo...). Los costos del catalogo: por kilo si se pesa, por unidad si no.

;(function (raiz, fabrica) {
  const C = fabrica()
  if (typeof module === 'object' && module.exports) module.exports = C
  else raiz.Calculo = C
})(typeof self !== 'undefined' ? self : this, function () {
  const RECORTES = 'recortes'
  const DIA_MS = 86400000

  const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0 }
  const ms = (f) => (typeof f === 'number' ? f : Date.parse(f) || 0)
  const pesa = (ins) => !!ins && (ins.modo === 'pieza' || ins.modo === 'peso')
  function diaLocal (t) {
    const f = new Date(t)
    return f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') + '-' + String(f.getDate()).padStart(2, '0')
  }

  // La receta vigente en una fecha. La primera receta vale tambien para atras:
  // lo que se produjo antes de medirla se recalcula con ella.
  function recetaEn (producto, t) {
    const rs = ((producto && producto.recetas) || []).slice().sort((a, b) => ms(a.desde) - ms(b.desde))
    if (!rs.length) return null
    let elegida = rs[0]
    for (const r of rs) if (ms(r.desde) <= t) elegida = r
    return elegida
  }
  const recetaCompleta = (r) => !!r && (r.lineas || []).length > 0 && r.lineas.every((l) => num(l.cantidad) > 0)

  // Cuanto de cada insumo lleva una tanda (cantidad = unidades, o gramos si se vende por peso).
  function consumoDe (producto, receta, cantidad, envases) {
    const out = []
    for (const l of (receta && receta.lineas) || []) {
      const c = num(l.cantidad)
      if (c <= 0) continue
      let q
      if (producto.venta === 'peso') q = l.por === 'envase' ? c * num(envases) : c * num(cantidad) / 1000
      else q = c * num(cantidad)
      if (q > 0) out.push({ insumoId: l.insumoId, q })
    }
    return out
  }

  function calcular (entrada, opciones) {
    opciones = opciones || {}
    const ahora = opciones.ahora || Date.now()
    const cat = entrada.catalogo || {}
    const config = Object.assign({ toleranciaPct: 2, horario: { dias: [1, 2, 3, 4, 5, 6], desde: '08:00', hasta: '14:00' } }, cat.config || {})
    const insumos = {}
    for (const i of cat.insumos || []) insumos[i.id] = i
    if (!insumos[RECORTES]) insumos[RECORTES] = { id: RECORTES, nombre: 'Recortes y puntas', modo: 'peso', costo: 0, sistema: true }
    const productos = {}
    for (const p of cat.productos || []) productos[p.id] = p
    const personal = {}
    for (const p of entrada.personal || []) personal[p.id] = p

    const nombreInsumo = (id) => (insumos[id] ? insumos[id].nombre : 'Insumo borrado')
    const nombreProducto = (id) => (productos[id] ? productos[id].nombre : 'Producto borrado')

    // --- lo que se anulo y los precios que se pusieron despues -------------------
    const todos = (entrada.movimientos || []).map((m, i) => Object.assign({}, m, { t: ms(m.fecha), orden: i, datos: m.datos || {} }))
    const anulados = new Map()
    for (const m of todos) if (m.tipo === 'anular' && m.datos.movId) anulados.set(m.datos.movId, m)
    const precioIngreso = {}
    for (const m of todos) if (m.tipo === 'precio_ingreso' && !anulados.has(m.id)) precioIngreso[m.datos.ingresoId] = num(m.datos.costoTotal)
    const movs = todos.filter((m) => m.tipo !== 'anular' && !anulados.has(m.id)).sort((a, b) => a.t - b.t || a.orden - b.orden)

    // --- estado que se va armando ----------------------------------------------------
    const stock = {} // insumos que no son piezas
    const visto = {} // insumos y productos que ya tuvieron movimiento (el primer conteo no es faltante)
    const costo = {} // costo actual por unidad base (centavos por g o por unidad)
    for (const id in insumos) {
      const i = insumos[id]
      costo[id] = num(i.costo) > 0 ? (pesa(i) ? num(i.costo) / 1000 : num(i.costo)) : 0
    }
    const piezas = {}
    const sinPieza = {} // consumo de un insumo por pieza cuando no habia ninguna cargada
    const lotes = {} // productoId -> [{t, cantidad}] lo hecho que sigue en produccion
    const dias = {}
    const entregas = {}
    const ingresos = []
    const avisos = []
    const consumoPorDia = {} // fecha -> insumoId -> cantidad (para la cobertura)

    const costoPieza = (pz) => (pz.costoG != null ? pz.costoG : costo[pz.insumoId] || 0)
    function costoProducto (p, t) {
      const r = recetaEn(p, t)
      let c = 0
      for (const x of consumoDe(p, r, p.venta === 'peso' ? 1000 : 1, 1)) c += x.q * (costo[x.insumoId] || 0)
      return c // por unidad, o por kilo si se vende por peso
    }

    // Los dias salen de la tabla de dias; lo anotado fuera de un dia (el dueño
    // cargando una compra un domingo) va a un dia "suelto" de esa fecha.
    for (const d of entrada.dias || []) {
      dias[d.id] = nuevoDia(d.id, ms(d.abierto), d.cerrado ? ms(d.cerrado) : null, d.persona_id || d.personaId, d.persona_nombre || d.personaNombre, d.cerrado_por || d.cerradoPor)
    }
    function nuevoDia (id, abierto, cerrado, personaId, personaNombre, cerradoPor) {
      return {
        id, fecha: diaLocal(abierto), abierto, cerrado, personaId: personaId || null, personaNombre: personaNombre || '', cerradoPor: cerradoPor || null,
        suelto: false, producido: {}, unidades: 0, consumo: {}, consumoPlata: 0, difs: [], mermas: [], mermaPlata: 0,
        entregas: [], ingresos: [], recetasIncompletas: [], conteos: { apertura: false, cierre: false }, movimientos: 0
      }
    }
    function diaDe (m) {
      if (m.dia_id && dias[m.dia_id]) return dias[m.dia_id]
      if (m.diaId && dias[m.diaId]) return dias[m.diaId]
      for (const id in dias) { const d = dias[id]; if (!d.suelto && d.abierto <= m.t && (d.cerrado == null || m.t <= d.cerrado)) return d }
      const id = 'suelto-' + diaLocal(m.t)
      if (!dias[id]) { dias[id] = nuevoDia(id, m.t, m.t); dias[id].suelto = true }
      return dias[id]
    }
    function diferencia (dia, x) {
      x.plata = Math.round(x.dif * x.costoU)
      dia.difs.push(x)
    }

    // --- piezas ---------------------------------------------------------------------------
    function abrir (pz, t, sola) {
      if (pz.estado !== 'cerrada') return
      pz.estado = 'abierta'
      pz.abierta = t
      if (sola) pz.abiertaSola = true
    }
    function piezaParaUsar (insumoId, elegida, t) {
      let pz = elegida && piezas[elegida]
      if (pz && pz.insumoId === insumoId && (pz.estado === 'abierta' || pz.estado === 'cerrada')) { abrir(pz, t); return pz }
      const deEse = Object.values(piezas).filter((p) => p.insumoId === insumoId)
      pz = deEse.filter((p) => p.estado === 'abierta').sort((a, b) => a.numero - b.numero)[0]
      if (pz) return pz
      pz = deEse.filter((p) => p.estado === 'cerrada').sort((a, b) => a.numero - b.numero)[0]
      if (pz) abrir(pz, t, true)
      return pz || null
    }
    function consumir (dia, insumoId, q, piezaElegida, t, productoId, unidades) {
      const ins = insumos[insumoId]
      let cu = costo[insumoId] || 0
      if (ins && ins.modo === 'pieza') {
        const pz = piezaParaUsar(insumoId, piezaElegida, t)
        if (pz) {
          cu = costoPieza(pz)
          pz.resto -= q
          pz.usadoTeorico += q
          pz.hecho[productoId] = (pz.hecho[productoId] || 0) + unidades
        } else sinPieza[insumoId] = (sinPieza[insumoId] || 0) + q
      } else stock[insumoId] = (stock[insumoId] || 0) - q
      dia.consumo[insumoId] = (dia.consumo[insumoId] || 0) + q
      dia.consumoPlata += q * cu
      const f = dia.fecha
      consumoPorDia[f] = consumoPorDia[f] || {}
      consumoPorDia[f][insumoId] = (consumoPorDia[f][insumoId] || 0) + q
    }

    // --- lo hecho que sigue en produccion (lotes con fecha, para el vencimiento) ---------
    const cantidadLotes = (id) => (lotes[id] || []).reduce((s, l) => s + l.cantidad, 0)
    function sacarLotes (id, cantidad) {
      const ls = lotes[id] || []
      let falta = cantidad
      let masViejo = null
      while (falta > 0 && ls.length) {
        const l = ls[0]
        if (masViejo == null) masViejo = l.t
        const s = Math.min(l.cantidad, falta)
        l.cantidad -= s
        falta -= s
        if (l.cantidad <= 1e-9) ls.shift()
      }
      lotes[id] = ls
      return masViejo
    }
    function ponerLote (id, t, cantidad) { (lotes[id] = lotes[id] || []).push({ t, cantidad }) }

    // --- recorrer todo en orden ------------------------------------------------------------
    for (const m of movs) {
      const d = m.datos
      const dia = diaDe(m)
      dia.movimientos++
      const t = m.t

      if (m.tipo === 'ingreso') {
        const ins = insumos[d.insumoId]
        const costoTotal = d.costoTotal != null && num(d.costoTotal) > 0 ? num(d.costoTotal) : (precioIngreso[m.id] || 0)
        let cantidad = num(d.cantidad)
        if (ins && ins.modo === 'pieza') {
          const ps = Array.isArray(d.piezas) ? d.piezas : []
          cantidad = ps.reduce((s, p) => s + num(p.peso), 0)
          for (const p of ps) {
            piezas[p.id] = {
              id: p.id, numero: p.numero, insumoId: d.insumoId, peso: num(p.peso), resto: num(p.peso), costoG: costoTotal > 0 && cantidad > 0 ? costoTotal / cantidad : null,
              estado: 'cerrada', llego: t, abierta: null, terminada: null, abiertaSola: false, usadoTeorico: 0, faltante: 0, merma: 0, punta: null, destinoPunta: null, hecho: {}, medidas: [], ingresoId: m.id
            }
          }
        } else stock[d.insumoId] = (stock[d.insumoId] || 0) + cantidad
        if (costoTotal > 0 && cantidad > 0) costo[d.insumoId] = costoTotal / cantidad
        visto[d.insumoId] = true
        const ing = { id: m.id, t, insumoId: d.insumoId, nombre: nombreInsumo(d.insumoId), cantidad, costoTotal, sinPrecio: !(costoTotal > 0), inicial: !!d.inicial, persona: m.persona_nombre || '', proveedor: d.proveedor || '', pesoFactura: num(d.pesoFactura) || null, piezas: (d.piezas || []).map((p) => p.numero) }
        ingresos.push(ing)
        dia.ingresos.push(ing)
        if (ing.pesoFactura && pesa(ins)) {
          const dif = cantidad - ing.pesoFactura
          ing.difFactura = dif
          if (dif < 0 && -dif > Math.max(20, ing.pesoFactura * 0.005)) {
            avisos.push({ nivel: 'alerta', tipo: 'compra', t, titulo: nombreInsumo(d.insumoId) + ': vino con ' + Math.round(-dif) + ' g menos', texto: 'La boleta decía ' + Math.round(ing.pesoFactura) + ' g y se pesaron ' + Math.round(cantidad) + ' g.', ir: { seccion: 'stock' } })
          }
        }
      } else if (m.tipo === 'abrir_pieza') {
        const pz = piezas[d.piezaId]
        if (pz) abrir(pz, t)
      } else if (m.tipo === 'produccion') {
        const p = productos[d.productoId]
        if (!p) continue
        const cantidad = num(d.cantidad)
        const envases = num(d.envases)
        const r = recetaEn(p, t)
        if (!recetaCompleta(r) && dia.recetasIncompletas.indexOf(p.id) < 0) dia.recetasIncompletas.push(p.id)
        const unidades = p.venta === 'peso' ? (envases || 1) : cantidad
        for (const x of consumoDe(p, r, cantidad, envases)) consumir(dia, x.insumoId, x.q, d.piezas && d.piezas[x.insumoId], t, p.id, unidades)
        ponerLote(p.id, t, cantidad)
        visto['p:' + p.id] = true
        const pr = dia.producido[p.id] = dia.producido[p.id] || { cantidad: 0, envases: 0, tandas: 0 }
        pr.cantidad += cantidad
        pr.envases += envases
        pr.tandas++
        dia.unidades += unidades
      } else if (m.tipo === 'terminar_pieza') {
        const pz = piezas[d.piezaId]
        if (!pz || pz.estado === 'terminada' || pz.estado === 'falta') continue
        abrir(pz, t)
        const punta = num(d.punta)
        const falta = pz.resto - punta // positivo = falto
        pz.faltante += falta
        pz.punta = punta
        pz.destinoPunta = d.destino === 'merma' ? 'merma' : 'recortes'
        pz.estado = 'terminada'
        pz.terminada = t
        pz.resto = 0
        diferencia(dia, { momento: 'pieza', clase: 'pieza', id: pz.id, insumoId: pz.insumoId, nombre: nombreInsumo(pz.insumoId) + ' N° ' + pz.numero, esperado: punta + falta, real: punta, dif: -falta, costoU: costoPieza(pz), unidad: 'g' })
        if (punta > 0) {
          if (pz.destinoPunta === 'recortes') {
            const antes = stock[RECORTES] || 0
            const cAntes = costo[RECORTES] || 0
            stock[RECORTES] = antes + punta
            costo[RECORTES] = (antes * cAntes + punta * costoPieza(pz)) / (antes + punta)
            visto[RECORTES] = true
          } else {
            const plata = Math.round(punta * costoPieza(pz))
            dia.mermas.push({ id: m.id, t, clase: 'insumo', itemId: pz.insumoId, nombre: 'Punta de ' + nombreInsumo(pz.insumoId) + ' N° ' + pz.numero, cantidad: punta, unidad: 'g', motivo: 'Punta tirada', fotoId: d.fotoId || null, plata, persona: m.persona_nombre || '' })
            dia.mermaPlata += plata
          }
        }
      } else if (m.tipo === 'merma') {
        const q = num(d.cantidad)
        let plata = 0
        let nombre = ''
        let unidad = ''
        if (d.clase === 'producto') {
          const p = productos[d.id]
          nombre = nombreProducto(d.id)
          unidad = p && p.venta === 'peso' ? 'g' : 'u'
          sacarLotes(d.id, q)
          plata = p ? Math.round(q * costoProducto(p, t) / (p.venta === 'peso' ? 1000 : 1)) : 0
        } else {
          const ins = insumos[d.id]
          nombre = nombreInsumo(d.id)
          unidad = pesa(ins) ? 'g' : (ins && ins.nombreUnidad) || 'u'
          if (ins && ins.modo === 'pieza') {
            const pz = piezaParaUsar(d.id, d.piezaId, t)
            if (pz) {
              plata = Math.round(q * costoPieza(pz))
              nombre += ' N° ' + pz.numero
              if (d.todaLaPieza) {
                // Se tira la pieza entera: lo que tenia que tener vs lo que pesa ahora.
                const falta = pz.resto - q
                pz.faltante += falta
                pz.merma += q
                pz.estado = 'terminada'
                pz.terminada = t
                pz.resto = 0
                if (Math.abs(falta) > 0.5) diferencia(dia, { momento: 'pieza', clase: 'pieza', id: pz.id, insumoId: pz.insumoId, nombre: nombreInsumo(pz.insumoId) + ' N° ' + pz.numero, esperado: q + falta, real: q, dif: -falta, costoU: costoPieza(pz), unidad: 'g' })
              } else {
                pz.resto -= q
                pz.merma += q
              }
            } else sinPieza[d.id] = (sinPieza[d.id] || 0) + q
          } else {
            stock[d.id] = (stock[d.id] || 0) - q
            plata = Math.round(q * (costo[d.id] || 0))
          }
        }
        dia.mermas.push({ id: m.id, t, clase: d.clase === 'producto' ? 'producto' : 'insumo', itemId: d.id, nombre, cantidad: q, unidad, motivo: d.motivo || '', fotoId: d.fotoId || null, plata, persona: m.persona_nombre || '' })
        dia.mermaPlata += plata
      } else if (m.tipo === 'entrega') {
        const items = (d.items || []).filter((i) => num(i.cantidad) > 0).map((i) => {
          const masViejo = sacarLotes(i.productoId, num(i.cantidad))
          return { productoId: i.productoId, nombre: nombreProducto(i.productoId), cantidad: num(i.cantidad), hecho: masViejo }
        })
        const suc = (config.sucursales || []).find((s) => s.id === d.sucursal)
        const e = { id: m.id, t, diaId: dia.id, sucursal: d.sucursal, nombreSucursal: suc ? suc.nombre : d.sucursal, items, persona: m.persona_nombre || '', recibido: null, recibidoPor: '', recibidoEn: null, difs: [], difPlata: 0 }
        entregas[m.id] = e
        dia.entregas.push(e)
      } else if (m.tipo === 'recepcion') {
        const e = entregas[d.entregaId]
        if (!e || e.recibido) continue
        e.recibido = d.items || {}
        e.recibidoPor = m.persona_nombre || ''
        e.recibidoEn = t
        const ids = new Set(e.items.map((i) => i.productoId).concat(Object.keys(e.recibido)))
        for (const id of ids) {
          const env = (e.items.find((i) => i.productoId === id) || {}).cantidad || 0
          const rec = num(e.recibido[id])
          if (rec !== env) {
            const p = productos[id]
            const plata = p ? Math.round((rec - env) * costoProducto(p, t) / (p.venta === 'peso' ? 1000 : 1)) : 0
            e.difs.push({ productoId: id, nombre: nombreProducto(id), enviado: env, recibido: rec, dif: rec - env, plata })
            e.difPlata += plata
          }
        }
        if (e.difs.length) {
          avisos.push({ nivel: 'mal', tipo: 'entrega', t, titulo: e.nombreSucursal + ' recibió distinto de lo que se mandó', texto: e.difs.map((x) => x.nombre + ': mandaron ' + fmt(x.enviado) + ', llegaron ' + fmt(x.recibido)).join(' · '), ir: { seccion: 'entregas', id: e.id } })
        }
      } else if (m.tipo === 'conteo') {
        const momento = d.momento || 'suelto'
        if (momento === 'apertura' || momento === 'cierre') dia.conteos[momento] = true
        for (const id in (d.insumos || {})) {
          const real = num(d.insumos[id])
          const ins = insumos[id]
          if (ins && ins.modo === 'pieza') continue
          const esperado = stock[id] || 0
          stock[id] = real
          if (!visto[id]) { visto[id] = true; continue }
          if (Math.abs(real - esperado) < 1e-6) continue
          diferencia(dia, { momento, clase: 'insumo', id, insumoId: id, nombre: nombreInsumo(id), esperado, real, dif: real - esperado, costoU: costo[id] || 0, unidad: pesa(ins) ? 'g' : (ins && ins.nombreUnidad) || 'u' })
        }
        const contadas = new Set()
        for (const x of d.piezas || []) {
          const pz = piezas[x.id]
          if (!pz || pz.estado === 'terminada' || pz.estado === 'falta') continue
          contadas.add(pz.insumoId)
          if (x.estado === 'falta') {
            const falta = pz.resto
            pz.faltante += falta
            pz.estado = 'falta'
            pz.terminada = t
            pz.resto = 0
            diferencia(dia, { momento, clase: 'pieza', id: pz.id, insumoId: pz.insumoId, nombre: nombreInsumo(pz.insumoId) + ' N° ' + pz.numero + ' (no estaba)', esperado: falta, real: 0, dif: -falta, costoU: costoPieza(pz), unidad: 'g' })
          } else if (x.estado === 'abierta') {
            abrir(pz, t)
            const real = num(x.peso)
            const dif = real - pz.resto
            pz.faltante -= dif
            pz.medidas.push({ t, peso: real, esperado: pz.resto })
            const esperado = pz.resto
            pz.resto = real
            if (Math.abs(dif) >= 0.5) diferencia(dia, { momento, clase: 'pieza', id: pz.id, insumoId: pz.insumoId, nombre: nombreInsumo(pz.insumoId) + ' N° ' + pz.numero, esperado, real, dif, costoU: costoPieza(pz), unidad: 'g' })
          }
        }
        // Lo que se uso sin ninguna pieza cargada queda medido con este conteo.
        for (const id of contadas) delete sinPieza[id]
        for (const id in (d.productos || {})) {
          const p = productos[id]
          if (!p) continue
          const real = num(d.productos[id])
          const esperado = cantidadLotes(id)
          if (real < esperado) sacarLotes(id, esperado - real)
          else if (real > esperado) ponerLote(id, t, real - esperado)
          if (!visto['p:' + id]) { visto['p:' + id] = true; continue }
          if (Math.abs(real - esperado) < 1e-6) continue
          diferencia(dia, { momento, clase: 'producto', id, nombre: nombreProducto(id), esperado, real, dif: real - esperado, costoU: costoProducto(p, t) / (p.venta === 'peso' ? 1000 : 1), unidad: p.venta === 'peso' ? 'g' : 'u' })
        }
      } else if (m.tipo === 'cerrar_dia') {
        if (m.quien === 'duenio') dia.cerradoPorDuenio = true
      }
    }

    // --- dias: totales -------------------------------------------------------------------------
    const listaDias = Object.values(dias).filter((d) => !d.suelto || d.movimientos > 0)
    for (const d of listaDias) {
      let neto = 0
      let bruto = 0
      let noche = 0
      for (const x of d.difs) {
        neto -= x.plata
        if (x.plata < 0) bruto -= x.plata
        if (x.momento === 'apertura') noche -= x.plata
      }
      d.faltante = Math.round(neto) // positivo = falto plata
      d.faltanteBruto = Math.round(bruto)
      d.faltanteNoche = Math.round(noche) // lo que falto entre el cierre anterior y esta apertura
      d.consumoPlata = Math.round(d.consumoPlata)
      d.rendimiento = d.consumoPlata > 0 ? Math.round(d.consumoPlata * 1000 / (d.consumoPlata + Math.max(0, d.faltante))) / 10 : null
      const fin = d.cerrado || (d.suelto ? d.abierto : Math.min(ahora, d.abierto + 12 * 3600000))
      d.horas = d.suelto ? 0 : Math.max(0, (fin - d.abierto) / 3600000)
      const per = personal[d.personaId]
      d.valorHora = per ? num(per.valor_hora != null ? per.valor_hora : per.valorHora) : 0
      d.manoDeObra = Math.round(d.horas * d.valorHora)
      d.abiertoAhora = !d.suelto && d.cerrado == null
    }
    listaDias.sort((a, b) => b.abierto - a.abierto)

    // --- piezas: como rindio cada una ---------------------------------------------------------
    const listaPiezas = Object.values(piezas).map((pz) => {
      const ins = insumos[pz.insumoId]
      // El producto que mas uso esta pieza: para decir "tenian que salir N".
      let principal = null
      for (const pid in pz.hecho) if (!principal || pz.hecho[pid] > pz.hecho[principal]) principal = pid
      let gPorUnidad = null
      if (principal && productos[principal]) {
        const r = recetaEn(productos[principal], ahora)
        const l = r && (r.lineas || []).find((x) => x.insumoId === pz.insumoId)
        if (l && num(l.cantidad) > 0 && productos[principal].venta !== 'peso') gPorUnidad = num(l.cantidad)
      }
      const usadoReal = pz.estado === 'terminada' || pz.estado === 'falta' ? pz.peso - (pz.punta || 0) - pz.merma : null
      const salieron = principal ? pz.hecho[principal] : 0
      return Object.assign({}, pz, {
        nombre: (ins ? ins.nombre : 'Insumo') + ' N° ' + pz.numero,
        insumoNombre: ins ? ins.nombre : 'Insumo',
        costoG: costoPieza(pz),
        faltantePlata: Math.round(pz.faltante * costoPieza(pz)),
        faltantePct: pz.peso > 0 ? Math.round(pz.faltante * 1000 / pz.peso) / 10 : 0,
        usadoReal,
        // Si de la pieza salieron varias cosas (migas y pebetes), todo se cuenta
        // como su equivalente en el producto principal.
        principal: principal ? {
          id: principal, nombre: nombreProducto(principal), gPorUnidad,
          mezcla: Object.keys(pz.hecho).length > 1,
          salieron: Object.keys(pz.hecho).length > 1 && gPorUnidad ? Math.round(pz.usadoTeorico / gPorUnidad) : salieron,
          deberian: gPorUnidad && usadoReal != null ? Math.floor((pz.peso - (pz.punta || 0) - pz.merma) / gPorUnidad) : null
        } : null
      })
    }).sort((a, b) => b.numero - a.numero)
    for (const pz of listaPiezas) {
      if ((pz.estado === 'terminada' || pz.estado === 'falta') && pz.faltante > Math.max(30, pz.peso * config.toleranciaPct / 100)) {
        avisos.push({
          nivel: 'mal', tipo: 'pieza', t: pz.terminada,
          titulo: pz.nombre + (pz.estado === 'falta' ? ': no estaba' : ': faltan ' + fmt(Math.round(pz.faltante)) + ' g'),
          texto: pz.principal && pz.principal.deberian != null ? textoRinde(pz.principal) + ' Son ' + fmtPlata(pz.faltantePlata) + '.' : 'Son ' + fmtPlata(pz.faltantePlata) + '.',
          ir: { seccion: 'piezas', id: pz.id }
        })
      }
    }

    // --- stock y cobertura ------------------------------------------------------------------------
    const fechasConConsumo = Object.keys(consumoPorDia).sort().slice(-14)
    const listaStock = Object.values(insumos).filter((i) => i.activo !== false || stock[i.id]).map((i) => {
      let cantidad
      let abiertas = 0
      let cerradas = 0
      if (i.modo === 'pieza') {
        cantidad = 0
        for (const pz of Object.values(piezas)) {
          if (pz.insumoId !== i.id) continue
          if (pz.estado === 'abierta') { abiertas++; cantidad += pz.resto }
          if (pz.estado === 'cerrada') { cerradas++; cantidad += pz.resto }
        }
        cantidad -= sinPieza[i.id] || 0
      } else cantidad = stock[i.id] || 0
      let usado = 0
      for (const f of fechasConConsumo) usado += (consumoPorDia[f][i.id] || 0)
      const porDia = fechasConConsumo.length ? usado / fechasConConsumo.length : 0
      const cobertura = porDia > 0 ? cantidad / porDia : null
      const minimo = num(i.minimo)
      return {
        id: i.id, nombre: i.nombre, modo: i.modo, unidad: pesa(i) ? 'g' : (i.nombreUnidad || 'u'), presentacion: i.presentacion || null,
        cantidad, abiertas, cerradas, costoU: costo[i.id] || 0, plata: Math.round(Math.max(0, cantidad) * (costo[i.id] || 0)),
        porDia, cobertura, minimo, sistema: !!i.sistema,
        comprar: (minimo > 0 && cantidad <= minimo) || (cobertura != null && cobertura < 3)
      }
    }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    for (const s of listaStock) {
      if (s.comprar && !s.sistema) avisos.push({ nivel: 'alerta', tipo: 'stock', t: ahora, titulo: s.nombre + ': ' + (s.cobertura != null ? 'alcanza para ' + textoDias(s.cobertura) : 'por debajo del mínimo'), texto: 'Quedan ' + fmtCant(s.cantidad, s.unidad) + '.', ir: { seccion: 'stock' } })
    }

    // --- lo hecho que sigue en produccion y su vencimiento ------------------------------------------
    const enProduccion = Object.values(productos).map((p) => {
      const ls = (lotes[p.id] || []).filter((l) => l.cantidad > 1e-9)
      const venceDias = num(p.venceDias)
      return {
        id: p.id, nombre: p.nombre, venta: p.venta, cantidad: ls.reduce((s, l) => s + l.cantidad, 0),
        lotes: ls.map((l) => ({ t: l.t, cantidad: l.cantidad, vence: venceDias ? l.t + venceDias * DIA_MS : null }))
      }
    }).filter((x) => x.cantidad > 1e-9)
    for (const x of enProduccion) {
      for (const l of x.lotes) {
        if (l.vence && l.vence - ahora < 3 * DIA_MS) {
          avisos.push({ nivel: l.vence < ahora ? 'mal' : 'alerta', tipo: 'vence', t: l.t, titulo: x.nombre + ': ' + fmt(l.cantidad) + (x.venta === 'peso' ? ' g' : '') + (l.vence < ahora ? ' vencidos en producción' : ' vencen el ' + fechaCorta(l.vence)), texto: 'Se hicieron el ' + fechaCorta(l.t) + '. Hay que mandarlos o anotarlos como merma.', ir: { seccion: 'stock' } })
        }
      }
    }

    // --- costo de cada producto (insumos de la receta actual + mano de obra) -------------------------
    const ultimos30 = listaDias.filter((d) => !d.suelto && d.abierto > ahora - 30 * DIA_MS)
    let moTotal = 0
    let moUnidades = 0
    for (const d of ultimos30) { moTotal += d.manoDeObra; moUnidades += d.unidades }
    const moPorUnidad = moUnidades > 0 ? moTotal / moUnidades : 0
    const costos = Object.values(productos).map((p) => {
      const r = recetaEn(p, ahora)
      const base = p.venta === 'peso' ? 1000 : 1
      const lineas = consumoDe(p, r, base, 1).map((x) => ({ insumoId: x.insumoId, nombre: nombreInsumo(x.insumoId), q: x.q, unidad: pesa(insumos[x.insumoId]) ? 'g' : ((insumos[x.insumoId] || {}).nombreUnidad || 'u'), plata: x.q * (costo[x.insumoId] || 0) }))
      const insumosPlata = lineas.reduce((s, l) => s + l.plata, 0)
      const mo = p.venta === 'peso' ? 0 : moPorUnidad
      const total = insumosPlata + mo
      const precio = num(p.precio)
      return {
        id: p.id, nombre: p.nombre, venta: p.venta, lineas, insumos: Math.round(insumosPlata), manoDeObra: Math.round(mo), total: Math.round(total), precio,
        margen: precio > 0 && total > 0 ? Math.round((precio - total) * 1000 / total) / 10 : null,
        completa: recetaCompleta(r), activo: p.activo !== false
      }
    }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    for (const c of costos) {
      if (!c.completa && c.activo) avisos.push({ nivel: 'alerta', tipo: 'receta', t: 0, titulo: c.nombre + ': falta medir la receta', texto: 'Mientras no esté completa, lo que se usa para este producto no se controla.', ir: { seccion: 'productos', id: c.id } })
    }

    // --- avisos de los dias (faltantes, horario, dias sin cerrar) ---------------------------------------
    const h = config.horario || {}
    const minutos = (hhmm) => { const [a, b] = String(hhmm || '00:00').split(':').map(Number); return a * 60 + (b || 0) }
    for (const d of listaDias.slice(0, 30)) {
      if (d.suelto) continue
      const consumo = d.consumoPlata
      if (d.faltante > 0 && (consumo <= 0 || d.faltante * 100 / Math.max(1, consumo) > config.toleranciaPct)) {
        avisos.push({ nivel: 'mal', tipo: 'dia', t: d.cerrado || d.abierto, titulo: 'Faltante del ' + fechaCorta(d.abierto) + ': ' + fmtPlata(d.faltante), texto: (d.personaNombre ? 'Turno de ' + d.personaNombre + '. ' : '') + (d.faltanteNoche > 0 ? fmtPlata(d.faltanteNoche) + ' faltaron de noche (entre el cierre y la apertura).' : 'Rindió ' + pctTxt(d.rendimiento) + '.'), ir: { seccion: 'dias', id: d.id } })
      }
      if (d.abiertoAhora && diaLocal(d.abierto) !== diaLocal(ahora)) {
        avisos.push({ nivel: 'alerta', tipo: 'sin_cerrar', t: d.abierto, titulo: 'El día ' + fechaCorta(d.abierto) + ' quedó sin cerrar', texto: 'Sin el conteo del cierre no se puede saber si faltó algo.', ir: { seccion: 'dias', id: d.id } })
      }
      const f = new Date(d.abierto)
      const minAbre = f.getHours() * 60 + f.getMinutes()
      if (h.dias && h.dias.indexOf(f.getDay()) < 0) avisos.push({ nivel: 'info', tipo: 'horario', t: d.abierto, titulo: 'Se trabajó un día fuera del horario', texto: fechaCorta(d.abierto) + ' a las ' + horaCorta(d.abierto) + '.', ir: { seccion: 'dias', id: d.id } })
      else if (h.desde && minAbre > minutos(h.desde) + 15 && d.abierto > ahora - 7 * DIA_MS) avisos.push({ nivel: 'info', tipo: 'horario', t: d.abierto, titulo: 'Abrió tarde el ' + fechaCorta(d.abierto), texto: 'A las ' + horaCorta(d.abierto) + ' (el horario es desde las ' + h.desde + ').', ir: { seccion: 'dias', id: d.id } })
      if (d.cerradoPorDuenio) continue
      if (d.cerrado && !d.conteos.cierre && d.abierto > ahora - 7 * DIA_MS) avisos.push({ nivel: 'alerta', tipo: 'sin_conteo', t: d.cerrado, titulo: 'El ' + fechaCorta(d.abierto) + ' se cerró sin contar', texto: '', ir: { seccion: 'dias', id: d.id } })
    }
    for (const e of Object.values(entregas)) {
      if (!e.recibido && ahora - e.t > 6 * 3600000 && ahora - e.t < 7 * DIA_MS) avisos.push({ nivel: 'alerta', tipo: 'entrega', t: e.t, titulo: e.nombreSucursal + ' no confirmó lo que se mandó', texto: 'Se mandó el ' + fechaCorta(e.t) + ' a las ' + horaCorta(e.t) + '.', ir: { seccion: 'entregas', id: e.id } })
    }
    const sinPrecio = ingresos.filter((i) => i.sinPrecio && !i.inicial)
    if (sinPrecio.length) avisos.push({ nivel: 'info', tipo: 'precio', t: ahora, titulo: sinPrecio.length === 1 ? 'Una compra sin precio' : sinPrecio.length + ' compras sin precio', texto: 'Ponele lo que pagaste para que los costos estén al día.', ir: { seccion: 'compras' } })

    const peso = { mal: 0, alerta: 1, info: 2 }
    avisos.sort((a, b) => peso[a.nivel] - peso[b.nivel] || b.t - a.t)

    return {
      dias: listaDias,
      piezas: listaPiezas,
      stock: listaStock,
      enProduccion,
      entregas: Object.values(entregas).sort((a, b) => b.t - a.t),
      ingresos: ingresos.sort((a, b) => b.t - a.t),
      costos,
      moPorUnidad: Math.round(moPorUnidad),
      avisos,
      costoInsumo: costo
    }
  }

  function textoRinde (pr) {
    const n = pr.nombre.toLowerCase()
    return pr.mezcla
      ? 'Tenían que salir el equivalente a ' + pr.deberian + ' ' + n + ' y salió el equivalente a ' + fmt(pr.salieron) + ' (sumando lo demás que se hizo con esta pieza).'
      : 'Tenían que salir ' + pr.deberian + ' ' + n + ' y salieron ' + fmt(pr.salieron) + '.'
  }

  // --- formatos (los usan tambien las pantallas) --------------------------------------------------
  function fmt (n) { return (Math.round(num(n) * 100) / 100).toLocaleString('es-AR', { maximumFractionDigits: 2 }) }
  function fmtPlata (c) { const v = Math.round(num(c) / 100); return (v < 0 ? '−' : '') + '$ ' + Math.abs(v).toLocaleString('es-AR') }
  function fmtCant (q, unidad) {
    if (unidad === 'g') return Math.abs(q) >= 1000 ? fmt(Math.round(q / 10) / 100) + ' kg' : fmt(Math.round(q)) + ' g'
    const r = Math.round(q * 100) / 100
    return !unidad || unidad === 'u' ? fmt(r) : fmt(r) + ' ' + plural(unidad, r)
  }
  function plural (palabra, n) {
    if (!palabra || palabra === 'u' || Math.abs(n) === 1) return palabra || ''
    if (/ón$/.test(palabra)) return palabra.replace(/ón$/, 'ones')
    if (/[aeiou]$/i.test(palabra)) return palabra + 's'
    return palabra + 'es'
  }
  const textoDias = (n) => (n < 1 ? 'menos de 1 día' : Math.floor(n) === 1 ? '1 día' : Math.floor(n) + ' días')
  const pctTxt = (n) => (n == null ? '—' : n.toLocaleString('es-AR') + '%')
  const DIAS_SEM = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  function fechaCorta (t) { const f = new Date(t); return DIAS_SEM[f.getDay()] + ' ' + String(f.getDate()).padStart(2, '0') + '/' + String(f.getMonth() + 1).padStart(2, '0') }
  function horaCorta (t) { const f = new Date(t); return String(f.getHours()).padStart(2, '0') + ':' + String(f.getMinutes()).padStart(2, '0') }

  return { calcular, recetaEn, recetaCompleta, consumoDe, diaLocal, fmt, fmtPlata, fmtCant, fechaCorta, horaCorta, plural, textoDias, pctTxt, textoRinde, RECORTES }
})
