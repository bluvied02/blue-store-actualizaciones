'use strict'
// EL CALCULO DE LO QUE SE LE PAGA A UN EMPLEADO EN UN PERIODO
//
// Uno solo para la caja y para el celular: los dos arman la cuenta con los
// mismos datos (los dias trabajados, los movimientos de sueldo y las cajas de
// cada uno) y dan el mismo numero. El periodo es libre: una quincena, un mes,
// del 3 al 17, lo que va desde el ultimo pago.
//
//   horas trabajadas x valor hora (de cada dia)
//   + extras, aguinaldo, vacaciones, feriados
//   - adelantos, vales, fiado, roturas y descuentos
//   - faltantes de las cajas que abrio (salvo los perdonados)
//   = le corresponde
//   - lo que ya se le pago para ese periodo = saldo
//
// Las platas en centavos. Los dias son 'AAAA-MM-DD'.
;(function (raiz) {
  const imputada = (m) => m.periodoHasta || m.fecha
  const enRango = (d, desde, hasta) => d >= desde && d <= hasta
  const diaSemana = (dia) => new Date(dia + 'T12:00:00').getDay()

  // dias: filas de un empleado (o de todos, se filtra por usuarioId).
  function liquidar ({ dias = [], movimientos = [], cajas = [], usuarioId, desde, hasta }) {
    const misDias = dias.filter((f) => f.u === usuarioId && enRango(f.dia, desde, hasta))
    const trabajados = new Set()
    let minutos = 0; let minutosSemana = 0; let minutosFinde = 0; let sueldoHoras = 0
    let faltas = 0; let tardes = 0; let marcados = 0; let sinSalida = 0; let aMano = 0; let corregidos = 0
    for (const f of misDias) {
      if (f.tipo === 'falta') { faltas++; continue }
      if (f.tipo === 'marcado') { marcados++; continue }
      trabajados.add(f.dia)
      minutos += f.minutos || 0
      sueldoHoras += f.monto || 0
      const d = diaSemana(f.dia)
      if (d >= 1 && d <= 4) minutosSemana += f.minutos || 0
      else minutosFinde += f.minutos || 0
      if (f.llegada && (f.llegada.estado === 'tarde' || f.llegada.estado === 'muy_tarde')) tardes++
      if (f.cerradoSolo || (f.salidaEstado && f.salidaEstado.estado === 'sin_salida')) sinSalida++
      if (f.manual) aMano++
      if ((f.correcciones || []).length) corregidos++
    }
    const movs = movimientos.filter((m) => m.usuarioId === usuarioId && !m.anulado && enRango(imputada(m), desde, hasta))
      .sort((a, b) => imputada(a).localeCompare(imputada(b)) || String(a.fecha).localeCompare(String(b.fecha)))
    const suma = (tipos) => movs.filter((m) => tipos.includes(m.tipo)).reduce((s, m) => s + (m.importe || 0), 0)
    const faltantes = cajas.filter((c) => c.u === usuarioId && enRango(c.dia, desde, hasta) && c.cerrada && typeof c.diferencia === 'number' && c.diferencia < 0)
      .map((c) => ({ cajaId: c.id, dia: c.dia, importe: -c.diferencia, perdonado: !!c.perdonado, cerradaPor: c.cerroNombre || '', relevo: !!c.relevo }))
    const faltante = faltantes.filter((f) => !f.perdonado).reduce((s, f) => s + f.importe, 0)
    const extras = suma(['bono'])
    const adicionales = suma(['feriado', 'vacaciones', 'aguinaldo'])
    const adelantos = suma(['adelanto', 'vale'])
    const fiado = suma(['fiado'])
    const descuentos = suma(['rotura', 'descuento'])
    const aCobrar = sueldoHoras + extras + adicionales - adelantos - fiado - descuentos - faltante
    const pagado = suma(['pago'])
    return {
      usuarioId, desde, hasta,
      dias: trabajados.size, minutos, minutosSemana, minutosFinde, sueldoHoras,
      faltas, tardes, marcados, sinSalida, aMano, corregidos,
      extras, adicionales, adelantos, fiado, descuentos, faltante,
      aCobrar, pagado, saldo: aCobrar - pagado,
      movimientos: movs, faltantes
    }
  }

  // --- periodos ----------------------------------------------------------------
  const p2 = (n) => String(n).padStart(2, '0')
  const iso = (f) => f.getFullYear() + '-' + p2(f.getMonth() + 1) + '-' + p2(f.getDate())
  const fecha = (dia) => new Date(dia + 'T12:00:00')
  function sumarDias (dia, n) { const f = fecha(dia); f.setDate(f.getDate() + n); return iso(f) }
  const finDeMes = (dia) => { const f = fecha(dia); return iso(new Date(f.getFullYear(), f.getMonth() + 1, 0)) }
  const mesAntes = (dia) => { const f = fecha(dia); return iso(new Date(f.getFullYear(), f.getMonth() - 1, 1)) }

  // Los periodos de siempre, para elegir con un toque.
  function periodos (hoy, ultimoPagoHasta) {
    const m1 = hoy.slice(0, 8) + '01'
    const q2 = hoy.slice(0, 8) + '16'
    const enSegunda = hoy >= q2
    const ant = mesAntes(hoy)
    const lunes = sumarDias(hoy, -((diaSemana(hoy) + 6) % 7))
    const out = [
      { id: 'quincena', texto: 'Esta quincena', desde: enSegunda ? q2 : m1, hasta: enSegunda ? finDeMes(hoy) : hoy.slice(0, 8) + '15' },
      { id: 'quincena_pasada', texto: 'Quincena pasada', desde: enSegunda ? m1 : ant.slice(0, 8) + '16', hasta: enSegunda ? hoy.slice(0, 8) + '15' : finDeMes(ant) },
      { id: 'mes', texto: 'Este mes', desde: m1, hasta: finDeMes(hoy) },
      { id: 'mes_pasado', texto: 'Mes pasado', desde: ant, hasta: finDeMes(ant) },
      { id: 'semana', texto: 'Esta semana', desde: lunes, hasta: sumarDias(lunes, 6) },
      { id: 'semana_pasada', texto: 'Semana pasada', desde: sumarDias(lunes, -7), hasta: sumarDias(lunes, -1) }
    ]
    if (ultimoPagoHasta && ultimoPagoHasta < hoy) out.unshift({ id: 'desde_pago', texto: 'Desde el último pago', desde: sumarDias(ultimoPagoHasta, 1), hasta: hoy })
    return out
  }

  // Los meses ('AAAA-MM') que toca un periodo.
  function mesesDe (desde, hasta) {
    const out = []
    let d = desde.slice(0, 8) + '01'
    while (d <= hasta) { out.push(d.slice(0, 7)); d = iso(new Date(fecha(d).getFullYear(), fecha(d).getMonth() + 1, 1)) }
    return out
  }

  // Todos los dias de un periodo, del mas nuevo al mas viejo.
  function diasDe (desde, hasta) {
    const out = []
    for (let d = hasta; d >= desde && out.length < 400; d = sumarDias(d, -1)) out.push(d)
    return out
  }

  const textoHoras = (min) => Math.floor((min || 0) / 60) + ' h ' + p2((min || 0) % 60)

  const PersonalCalculo = { liquidar, periodos, mesesDe, diasDe, sumarDias, imputada, textoHoras }
  if (typeof module !== 'undefined' && module.exports) module.exports = PersonalCalculo
  else raiz.PersonalCalculo = PersonalCalculo
})(typeof window !== 'undefined' ? window : this)
