'use strict'
// PERSONAL, SUELDOS Y VENCIMIENTOS (solo el dueño).
//
// Lo mismo que las pantallas Personal y Vencimientos de la caja: quién está
// trabajando, cada empleado día por día (entrada, salida, horas, la plata de
// cada día, las cajas que abrió y cerró, lo que vendió), lo que se le paga en
// cualquier período (quincena, mes, desde el último pago), la liquidación del
// mes, horarios y valor hora, y las partidas por vencer.
//
// Empleados junta las dos sucursales: no hace falta ir cambiando de sucursal.
// Las platas van en centavos, como en la caja. Lo que cambia viaja como orden
// a la caja de ESA sucursal, que lo aplica con las mismas reglas que su
// pantalla. La cuenta de la plata es la misma de la caja (personal-calculo.js).

const COLOR_LLEGADA = { verde: 'ok', amarillo: 'alerta', rojo: 'mal' }
const chipColor = (c, texto) => (texto ? el('span', { clase: 'chip ' + (COLOR_LLEGADA[c] || '') }, texto) : null)
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIA_SEM_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const nombreMes = (m) => { const [a, n] = String(m).split('-'); return MESES[Number(n) - 1] + ' ' + a }
const horaCorta = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—')
const horasTexto = (min) => Math.floor((min || 0) / 60) + ' h ' + String((min || 0) % 60).padStart(2, '0') + ' min'
const horasCorto = (min) => Math.floor((min || 0) / 60) + ' h ' + String((min || 0) % 60).padStart(2, '0')
// "2026-10-23T08:00" (lo que da el campo) <-> ISO de la compu.
const aLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) }
const deLocalInput = (v) => (v ? new Date(v).toISOString() : '')
const diaSem = (dia) => new Date(dia + 'T12:00:00').getDay()
const ddmm = (dia) => dia.slice(8, 10) + '/' + dia.slice(5, 7)
function textoPeriodo (desde, hasta) {
  if (desde === hasta) return DIA_SEM_CORTO[diaSem(desde)] + ' ' + ddmm(desde)
  if (desde.slice(0, 7) === hasta.slice(0, 7)) return 'del ' + Number(desde.slice(8)) + ' al ' + Number(hasta.slice(8)) + ' de ' + MESES[Number(desde.slice(5, 7)) - 1]
  return 'del ' + ddmm(desde) + ' al ' + ddmm(hasta)
}

// --- PERSONAL -----------------------------------------------------------------------------

async function secPersonal () {
  if (!S.sucursal) return pintarSeccion('personal', cabecera('Personal'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'clientes')))
  const E = S.per = Object.assign({ vista: 'empleados', mes: hoyISO().slice(0, 7) }, S.per || {})
  if (E.vista === 'horas') E.vista = 'empleados'
  const pestanas = el('div', { clase: 'seg ancho', estilo: { marginBottom: '10px' } }, [['empleados', 'Empleados'], ['hoy', 'Hoy'], ['sueldos', 'Mes'], ['horarios', 'Horarios']].map(([id, t]) => el('button', { clase: E.vista === id ? 'activo' : '', onclick: () => { E.vista = id; render() } }, t)))
  const cuerpo = E.vista === 'sueldos' ? await vistaSueldos(E) : E.vista === 'horarios' ? await vistaHorarios() : E.vista === 'hoy' ? await vistaHoy() : await vistaEmpleados(E)
  const sub = E.vista === 'empleados' || E.vista === 'hoy' ? 'Todas las sucursales' : nombreSucursal(S.sucursal) + ' · cambiá la sucursal arriba'
  pintarSeccion('personal',
    cabecera('Personal', sub, el('button', { clase: 'btn', onclick: () => hojaCelularEmpleado() }, 'Celular'), el('button', { clase: 'btn', onclick: () => hojaTurno({ sucursalId: S.sucursal }) }, icono('sumar'), 'Día a mano')),
    pestanas, cuerpo)
}

// --- el período elegido -------------------------------------------------------------------

// E.periodo: id de un período de siempre, o 'otro' con E.desde / E.hasta.
function periodoDe (E, ultimoPagoHasta) {
  const lista = PersonalCalculo.periodos(hoyISO(), ultimoPagoHasta)
  if (E.periodo === 'otro' && E.desde && E.hasta) return { id: 'otro', texto: 'Otro', desde: E.desde, hasta: E.hasta, lista }
  const p = lista.find((x) => x.id === E.periodo) || lista.find((x) => x.id === 'quincena')
  return Object.assign({}, p, { lista })
}

function selectorPeriodo (E, per, alCambiar) {
  const visibles = per.lista.filter((x) => ['desde_pago', 'quincena', 'quincena_pasada', 'mes', 'mes_pasado'].includes(x.id))
  return el('div', {},
    el('div', { clase: 'filtros' },
      visibles.map((x) => el('button', { clase: 'filtro' + (per.id === x.id ? ' activo' : ''), onclick: () => { E.periodo = x.id; alCambiar() } }, x.texto)),
      el('button', { clase: 'filtro' + (per.id === 'otro' || per.id.startsWith('semana') ? ' activo' : ''), onclick: () => hojaElegirPeriodo(E, per, alCambiar) }, per.id === 'otro' || per.id.startsWith('semana') ? per.texto + ' ✎' : 'Otras fechas…')),
    el('p', { clase: 'sub', estilo: { margin: '0 0 10px' } }, 'Período: ' + textoPeriodo(per.desde, per.hasta) + (per.hasta > hoyISO() ? ' (los días que vienen todavía no cuentan)' : '')))
}

function hojaElegirPeriodo (E, per, alCambiar) {
  const desde = el('input', { type: 'date', valor: per.desde })
  const hasta = el('input', { type: 'date', valor: per.hasta })
  const atajo = (x) => el('button', { clase: 'btn chico', onclick: () => { cerrarHoja(); E.periodo = x.id; alCambiar() } }, x.texto)
  abrirHoja({
    titulo: 'Elegir el período',
    cuerpo: el('div', {},
      el('div', { clase: 'chips', estilo: { marginBottom: '12px' } }, per.lista.filter((x) => x.id.startsWith('semana')).map(atajo)),
      el('div', { clase: 'dos' }, el('label', { clase: 'campo' }, 'Desde', desde), el('label', { clase: 'campo' }, 'Hasta', hasta)),
      el('p', { clase: 'sub' }, 'Se ven los últimos 6 meses. Para pagar del 1 al 10, del 16 al 30, o lo que quieras.')),
    botones: [{ texto: 'Ver', primario: true, alTocar: () => {
      if (!desde.value || !hasta.value) return toast('Poné las dos fechas', 'mal')
      if (desde.value > hasta.value) return toast('El "desde" es después del "hasta"', 'mal')
      cerrarHoja()
      Object.assign(E, { periodo: 'otro', desde: desde.value, hasta: hasta.value })
      alCambiar()
    } }]
  })
}

// Los datos de personal de todas las sucursales para un período: los
// empleados y los meses que toca, juntos por sucursal.
async function datosPersonal (desde, hasta, forzar) {
  const meses = PersonalCalculo.mesesDe(desde, hasta)
  const [emp, ...porMes] = await Promise.all([leerDatos('personal_empleados', forzar), ...meses.map((m) => leerDatos('personal_mes:' + m, forzar).catch(() => ({})))])
  const out = []
  for (const suc of S.sucursales) {
    const ed = datosDe(emp, suc.id)
    if (!ed) continue
    const d = { dias: [], cajas: [], movimientos: [], ventas: {} }
    let faltan = 0
    meses.forEach((m, i) => {
      const x = datosDe(porMes[i], suc.id)
      if (!x) { faltan++; return }
      d.dias.push(...x.dias); d.cajas.push(...x.cajas); d.movimientos.push(...x.movimientos); Object.assign(d.ventas, x.ventas)
    })
    out.push({ sucursalId: suc.id, nombre: suc.nombre, empleados: ed, datos: d, faltanMeses: faltan })
  }
  return out
}

// --- EMPLEADOS: la lista con lo de cada uno en el período --------------------------------------

async function vistaEmpleados (E) {
  const per = periodoDe(E)
  const sucs = await datosPersonal(per.desde, per.hasta)
  const selector = selectorPeriodo(E, per, render)
  if (!sucs.length) return el('div', {}, selector, el('div', { clase: 'tarjeta' }, vacio('La caja todavía no subió el personal día por día. Aparece cuando se actualiza a la versión nueva.', 'clientes')))
  const hasta = per.hasta < hoyISO() ? per.hasta : hoyISO()
  let totalSaldo = 0; let totalMin = 0; let totalFaltas = 0; let trabajando = 0
  const grupos = sucs.map((s) => {
    const filas = s.empleados.lista.map((u) => {
      const liq = PersonalCalculo.liquidar(Object.assign({}, s.datos, { usuarioId: u.usuarioId, desde: per.desde, hasta }))
      return { u, liq }
    }).filter(({ u, liq }) => u.tieneHorario || liq.minutos || liq.movimientos.length || liq.faltantes.length || u.trabajandoDesde)
    for (const { u, liq } of filas) { totalSaldo += Math.max(0, liq.saldo); totalMin += liq.minutos; totalFaltas += liq.faltas; if (u.trabajandoDesde) trabajando++ }
    return { s, filas }
  })
  const item = (s, { u, liq }) => el('div', { clase: 'item tocable', onclick: () => abrirEmpleado(s.sucursalId, u.usuarioId) },
    el('div', { clase: 'avatar' }, (u.nombre || '?').slice(0, 1).toUpperCase()),
    el('div', { clase: 'cuerpo' },
      el('b', {}, u.nombre, u.trabajandoDesde ? el('span', { clase: 'chip ok', estilo: { marginLeft: '6px' } }, 'trabajando') : null),
      el('div', { clase: 'sub' }, [liq.dias + (liq.dias === 1 ? ' día' : ' días'), horasCorto(liq.minutos), liq.faltas ? liq.faltas + (liq.faltas === 1 ? ' falta' : ' faltas') : '', liq.tardes ? liq.tardes + ' tarde' : '', liq.sinSalida ? liq.sinSalida + ' sin salida' : ''].filter(Boolean).join(' · ')),
      liq.faltante ? el('div', { clase: 'sub rojo' }, 'Faltante de caja ' + plata(liq.faltante)) : null),
    el('div', { clase: 'fin' }, el('b', { clase: 'num ' + (liq.saldo > 0 ? 'rojo' : '') }, plata(liq.saldo)), el('div', { clase: 'sub' }, liq.saldo > 0 ? 'a pagar' : liq.pagado ? 'pagado' : 'saldo')))
  return el('div', {},
    selector,
    el('div', { clase: 'kpis' },
      kpi('A pagar en el período', plata(totalSaldo), 'lo que falta pagarles', { clase: 'principal' }),
      kpi('Horas', horasCorto(totalMin), trabajando ? trabajando + ' trabajando ahora' : 'nadie trabajando ahora'),
      kpi('Faltas', String(totalFaltas), 'días con horario sin venir', { clase: totalFaltas ? 'mal' : '' })),
    grupos.map(({ s, filas }) => [
      sucs.length > 1 ? el('h3', {}, s.nombre) : null,
      s.faltanMeses ? el('p', { clase: 'sub ambar' }, 'Hay meses de este período que la caja todavía no subió (se suben los últimos 6).') : null,
      el('div', { clase: 'tarjeta sin-relleno' }, filas.length ? el('div', { clase: 'lista' }, filas.map((f) => item(s, f))) : vacio('No hay empleados con horario ni horas en este período.', 'clientes'))]),
    el('p', { clase: 'sub' }, 'Tocá un empleado para ver día por día: a qué hora entró y salió, las horas, la plata de cada día, sus cajas y lo que vendió. Ahí mismo se corrige y se paga.'))
}

// --- ACCESO AL CELULAR PARA UN EMPLEADO ----------------------------------------------------
// Lo mismo que Configuración → Celular en la caja, pero desde acá: sirve
// aunque la caja de ese empleado no ande (lo hace otra caja que esté conectada).

async function hojaCelularEmpleado () {
  let emp
  try { [emp] = await Promise.all([leerDatos('personal_empleados', true), leerResumen(true)]) } catch (err) { return toast('No se pudo leer el personal: ' + (err.message || err), 'mal') }
  const opciones = []
  for (const suc of S.sucursales) {
    const ed = datosDe(emp, suc.id)
    for (const u of ((ed && ed.lista) || [])) if (u.rol !== 'duenio') opciones.push({ sucursalId: suc.id, sucursal: suc.nombre, usuarioId: u.usuarioId, nombre: u.nombre })
  }
  if (!opciones.length) return toast('Ninguna caja subió todavía la lista de personal', 'mal')
  opciones.sort((a, b) => (a.sucursalId === S.sucursal ? 0 : 1) - (b.sucursalId === S.sucursal ? 0 : 1) || a.sucursal.localeCompare(b.sucursal) || a.nombre.localeCompare(b.nombre))
  const varias = S.sucursales.length > 1
  const quien = el('select', {}, opciones.map((x, i) => el('option', { valor: String(i) }, x.nombre + (varias ? ' — ' + x.sucursal : ''))))
  const sugerido = (n) => String(n || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '').slice(0, 20)
  const usuario = el('input', { type: 'text', autocapitalize: 'none', autocomplete: 'off', maxlength: '20', placeholder: 'ej: lucia' })
  const pin = el('input', { type: 'password', inputmode: 'numeric', autocomplete: 'new-password', maxlength: '8', placeholder: '6 números' })
  const pin2 = el('input', { type: 'password', inputmode: 'numeric', autocomplete: 'new-password', maxlength: '8', placeholder: 'otra vez' })
  const ponerUsuario = () => { usuario.value = sugerido(opciones[Number(quien.value)].nombre) }
  quien.addEventListener('change', ponerUsuario)
  ponerUsuario()
  abrirHoja({
    titulo: 'Darle el celular a un empleado',
    cuerpo: el('div', {},
      el('label', { clase: 'campo' }, 'Empleado', quien),
      el('label', { clase: 'campo' }, 'Usuario para entrar', usuario),
      el('label', { clase: 'campo' }, 'PIN del celular (6 números)', pin),
      el('label', { clase: 'campo' }, 'Repetí el PIN', pin2),
      el('p', { clase: 'sub' }, 'En el celular toca "Soy empleado: entrar con mi usuario y PIN". Puede vender y contar stock. Si ya tenía usuario, se le cambia por este. Las ventas las carga la caja de su sucursal: si está apagada, quedan esperando hasta que se prenda.')),
    botones: [{ texto: 'Dar acceso', primario: true, alTocar: async (cerrar) => {
      const x = opciones[Number(quien.value)]
      const u = usuario.value.trim().toLowerCase()
      if (!/^[a-z0-9]{3,20}$/.test(u)) return toast('El usuario: de 3 a 20 letras o números, sin espacios ni acentos', 'mal')
      if (!/^\d{6,8}$/.test(pin.value.trim())) return toast('El PIN tiene que ser de 6 números', 'mal')
      if (pin.value.trim() !== pin2.value.trim()) return toast('Los dos PIN no son iguales', 'mal')
      // La caja que lo hace: la suya si está conectada; si no, cualquiera que sí.
      const conectada = (id) => !atrasoCaja(id)
      const hace = conectada(x.sucursalId) ? x.sucursalId : (S.sucursales.find((s) => conectada(s.id)) || {}).id
      if (!hace) return toast('No hay ninguna caja conectada para hacerlo. Probá cuando alguna esté prendida.', 'mal', 8)
      cerrar()
      await mandarOrden(hace, 'empleado_celular', { sucursalId: x.sucursalId, usuarioId: x.usuarioId, usuario: u, pin: pin.value.trim() }, { texto: 'Celular de ' + x.nombre })
    } }]
  })
}

function abrirEmpleado (sucursalId, usuarioId) {
  S.emp = { sucursalId, usuarioId }
  guardarLocal('bs.empleado', S.emp)
  ir('empleado')
}

// --- LA FICHA DE UN EMPLEADO ---------------------------------------------------------------

async function secEmpleado () {
  const sel = S.emp || leerLocal('bs.empleado', null)
  if (!sel) return ir('personal', null, true)
  S.emp = sel
  const E = S.per = Object.assign({ vista: 'empleados' }, S.per || {})
  const emp0 = datosDe(await leerDatos('personal_empleados'), sel.sucursalId)
  const u = emp0 && emp0.lista.find((x) => x.usuarioId === sel.usuarioId)
  const volver = el('button', { clase: 'btn', onclick: () => ir('personal') }, 'Volver')
  if (!u) return pintarSeccion('empleado', cabecera('Empleado', '', volver), el('div', { clase: 'tarjeta' }, vacio('No se encontró ese empleado. Puede que lo hayan dado de baja.', 'clientes')))
  const ultimo = u.ultimoPago || null
  const per = periodoDe(E, ultimo && ultimo.hasta)
  const hasta = per.hasta < hoyISO() ? per.hasta : hoyISO()
  const s = (await datosPersonal(per.desde, per.hasta)).find((x) => x.sucursalId === sel.sucursalId)
  if (!s) return pintarSeccion('empleado', cabecera(u.nombre, '', volver), el('div', { clase: 'tarjeta' }, vacio('La caja todavía no subió el personal día por día.', 'clientes')))
  const liq = PersonalCalculo.liquidar(Object.assign({}, s.datos, { usuarioId: u.usuarioId, desde: per.desde, hasta }))
  const ctx = { sucursalId: sel.sucursalId, u, per, liq, datos: s.datos, tipos: s.empleados.tipos || {}, marcas: s.empleados.marcas || {} }
  const editar = !!E.editar
  const botonEditar = el('button', { clase: 'btn' + (editar ? ' primario' : ''), onclick: () => { E.editar = !editar; render() } }, icono(editar ? 'ok' : 'editar'), editar ? 'Listo' : 'Editar')

  const fila = (t, v, clase) => el('div', { clase: 'fila' }, el('span', { clase: 'tenue' }, t), el('b', { clase: 'num ' + (clase || '') }, v))
  const cuenta = el('div', { clase: 'tarjeta' },
    el('h2', {}, 'La cuenta ' + textoPeriodo(per.desde, hasta)),
    fila('Horas lun a jue', horasCorto(liq.minutosSemana) + (u.valorHoraLunJue ? ' × ' + plata(u.valorHoraLunJue) : '')),
    fila('Horas vie a dom', horasCorto(liq.minutosFinde) + (u.valorHoraVieDom ? ' × ' + plata(u.valorHoraVieDom) : '')),
    fila('Sueldo por horas', plata(liq.sueldoHoras)),
    liq.extras ? fila('+ Extras', plata(liq.extras), 'verde') : null,
    liq.adicionales ? fila('+ Aguinaldo, vacaciones y feriados', plata(liq.adicionales), 'verde') : null,
    liq.adelantos ? fila('− Adelantos y vales', plata(liq.adelantos)) : null,
    liq.fiado ? fila('− Fiado de su cuenta', plata(liq.fiado)) : null,
    liq.descuentos ? fila('− Roturas y descuentos', plata(liq.descuentos)) : null,
    liq.faltante ? fila('− Faltantes de caja', plata(liq.faltante), 'rojo') : null,
    fila('Le corresponde', plata(liq.aCobrar)),
    fila('Ya pagado de este período', plata(liq.pagado)),
    fila('Saldo', plata(liq.saldo), liq.saldo > 0 ? 'rojo' : 'verde'),
    !u.valorHoraLunJue && !u.valorHoraVieDom ? el('div', { clase: 'aviso alerta', estilo: { marginTop: '8px' } }, 'No tiene valor hora cargado: las horas suman $ 0. Cargalo en Horarios.') : null,
    el('div', { clase: 'chips', estilo: { marginTop: '12px' } },
      el('button', { clase: 'btn primario', onclick: () => hojaMovEmpleado(ctx, 'pago') }, liq.saldo > 0 ? 'Pagar ' + plata(liq.saldo) : 'Registrar pago'),
      el('button', { clase: 'btn chico', onclick: () => hojaMovEmpleado(ctx, 'adelanto') }, '+ Adelanto'),
      el('button', { clase: 'btn chico', onclick: () => hojaMovEmpleado(ctx, 'vale') }, '+ Vale'),
      el('button', { clase: 'btn chico', onclick: () => hojaMovEmpleado(ctx, 'descuento') }, '+ Descuento'),
      el('button', { clase: 'btn chico', onclick: () => hojaMovEmpleado(ctx, 'bono') }, '+ Extra'),
      el('button', { clase: 'btn chico', onclick: () => hojaMasMovimientos(ctx) }, 'Más…'),
      el('button', { clase: 'btn chico', onclick: () => compartirResumen(ctx) }, 'Compartir')))

  const avisoPago = ultimo && ultimo.fecha ? el('div', { clase: 'aviso', estilo: { marginBottom: '10px' } },
    el('b', {}, 'Último pago: ' + plata(ultimo.importe) + ' el ' + fechaCorta(ultimo.fecha)),
    ultimo.hasta ? 'Cubrió ' + textoPeriodo(ultimo.desde || ultimo.hasta, ultimo.hasta) + '.' : 'Sin período anotado.') : null
  const fiado = u.cuenta && u.cuenta.debe > 0 ? el('div', { clase: 'aviso alerta', estilo: { marginBottom: '10px' } }, el('b', {}, 'Debe ' + plata(u.cuenta.debe) + ' de fiado'), ' en la cuenta ' + u.cuenta.nombre + '. ', el('button', { clase: 'btn chico', onclick: () => hojaMovEmpleado(ctx, 'fiado') }, 'Descontar del sueldo')) : null

  pintarSeccion('empleado',
    cabecera(u.nombre, s.nombre + ' · ' + resumenHorario(u, s.empleados.dias), volver, botonEditar),
    selectorPeriodo(E, per, render),
    editar ? el('div', { clase: 'aviso info', estilo: { marginBottom: '10px' } }, el('b', {}, 'Modo edición. '), 'Cada día tiene sus botones: corregir la hora, borrar un turno, cargar uno que falta o marcar franco. Todo queda anotado con el motivo.') : null,
    el('div', { clase: 'kpis' },
      kpi('Saldo a pagar', plata(liq.saldo), 'le corresponde ' + plata(liq.aCobrar), { clase: 'principal ' + (liq.saldo > 0 ? 'mal' : '') }),
      kpi('Horas', horasCorto(liq.minutos), liq.dias + (liq.dias === 1 ? ' día trabajado' : ' días trabajados')),
      kpi('Faltas', String(liq.faltas), [liq.tardes ? liq.tardes + ' tarde' : '', cajasDe(ctx).length ? cajasDe(ctx).length + ' cajas' : '', liq.faltante ? 'faltó ' + plata(liq.faltante) : ''].filter(Boolean).join(' · ') || 'sin llegadas tarde', { clase: liq.faltas || liq.faltante ? 'mal' : '' })),
    avisoPago, fiado,
    (liq.sinSalida || liq.aMano || liq.corregidos) ? el('div', { clase: 'aviso alerta', estilo: { marginBottom: '10px' } }, 'Para revisar: ' + [liq.sinSalida ? liq.sinSalida + ' sin fichar la salida' : '', liq.aMano ? liq.aMano + ' cargados a mano' : '', liq.corregidos ? liq.corregidos + ' corregidos' : ''].filter(Boolean).join(' · ') + '.') : null,
    cuenta,
    el('h3', {}, 'Día por día'),
    el('div', { clase: 'tarjeta sin-relleno' }, el('div', { clase: 'lista' }, PersonalCalculo.diasDe(per.desde, hasta).map((dia) => filaDia(ctx, dia, editar)))),
    listaMovimientos(ctx, editar),
    listaFaltantes(ctx))
}

function resumenHorario (u, nombresDias) {
  if (!u.tieneHorario) return 'sin horario cargado'
  const orden = [1, 2, 3, 4, 5, 6, 0]
  const usados = orden.filter((i) => u.dias[i])
  const iguales = usados.every((i) => u.dias[i].desde === u.dias[usados[0]].desde && u.dias[i].hasta === u.dias[usados[0]].hasta)
  if (iguales && usados.length) return usados.map((i) => DIA_SEM_CORTO[i]).join(' ') + ' ' + u.dias[usados[0]].desde + '–' + u.dias[usados[0]].hasta
  return usados.length + ' días por semana'
}

const cajasDe = (ctx) => ctx.datos.cajas.filter((c) => (c.u === ctx.u.usuarioId || c.cerro === ctx.u.usuarioId) && c.dia >= ctx.per.desde && c.dia <= ctx.per.hasta)

// Un día: los turnos (o la falta, o el franco), sus cajas y lo que vendió.
function filaDia (ctx, dia, editar) {
  const uid = ctx.u.usuarioId
  const filas = ctx.datos.dias.filter((f) => f.u === uid && f.dia === dia)
  const turnos = filas.filter((f) => f.tipo === 'fichaje').sort((a, b) => String(a.entrada).localeCompare(String(b.entrada)))
  const falta = filas.find((f) => f.tipo === 'falta')
  const marcado = filas.find((f) => f.tipo === 'marcado')
  const cajas = ctx.datos.cajas.filter((c) => c.dia === dia && (c.u === uid || c.cerro === uid))
  const venta = ctx.datos.ventas[uid + '|' + dia]
  const movs = ctx.datos.movimientos.filter((m) => m.usuarioId === uid && m.fecha === dia && !m.anulado)
  const plataDia = turnos.reduce((s, f) => s + (f.monto || 0), 0)
  const minDia = turnos.reduce((s, f) => s + (f.minutos || 0), 0)
  const programado = (filas[0] && filas[0].programado) || null
  const nada = !turnos.length && !falta && !marcado && !cajas.length && !movs.length
  const esHoy = dia === hoyISO()

  const lineas = []
  for (const f of turnos) {
    const ultimoTurno = f === turnos[turnos.length - 1]
    lineas.push(el('div', { clase: 'dia-linea' },
      el('b', { clase: 'num' }, horaCorta(f.entrada) + ' → ' + (f.salida ? horaCorta(f.salida) : (f.abierto ? 'trabajando' : '…'))),
      el('span', { clase: 'tenue' }, ' · ' + horasCorto(f.minutos)),
      ' ', chipColor(f.llegada && f.llegada.color, f.llegada && f.llegada.estado !== 'bien' && f.llegada.estado !== 'sin_horario' ? f.llegada.texto : ''),
      ' ', chipColor(f.salidaEstado && f.salidaEstado.color, f.salidaEstado && f.salidaEstado.estado !== 'bien' ? f.salidaEstado.texto : ''),
      f.manual ? el('span', { clase: 'chip info' }, 'a mano') : null,
      (f.correcciones || []).length ? el('span', { clase: 'chip info' }, 'corregido') : null,
      editar ? el('span', { clase: 'dia-acciones' },
        el('button', { clase: 'btn chico', onclick: (ev) => { ev.stopPropagation(); hojaTurno({ sucursalId: ctx.sucursalId, u: ctx.u, f, dia }) } }, 'Corregir'),
        el('button', { clase: 'btn chico peligro', onclick: (ev) => { ev.stopPropagation(); hojaBorrarTurno(ctx, f) } }, 'Borrar'),
        ultimoTurno ? el('button', { clase: 'btn chico', onclick: (ev) => { ev.stopPropagation(); hojaTurno({ sucursalId: ctx.sucursalId, u: ctx.u, dia, programado }) } }, '+ Turno') : null) : null))
  }
  if (falta) lineas.push(el('div', { clase: 'dia-linea' }, el('span', { clase: 'chip mal' }, 'Faltó'), el('span', { clase: 'tenue' }, ' tenía ' + falta.programado.desde + ' a ' + falta.programado.hasta)))
  if (marcado) lineas.push(el('div', { clase: 'dia-linea' }, el('span', { clase: 'chip' }, (ctx.marcas[marcado.marca] || marcado.marca)), marcado.motivo ? el('span', { clase: 'tenue' }, ' · ' + marcado.motivo) : null))
  if (!turnos.length && !falta && !marcado) lineas.push(el('div', { clase: 'dia-linea tenue' }, esHoy && programado ? 'Hoy le toca ' + programado.desde + ' a ' + programado.hasta : 'No trabajó'))
  for (const c of cajas) {
    const quien = c.u === uid ? (c.cerro && c.cerro !== uid ? 'Abrió la caja (la cerró ' + (c.cerroNombre || 'otro') + ')' : 'Su caja') : 'Cerró la caja de otro'
    lineas.push(el('div', { clase: 'dia-linea sub' }, icono('caja'), ' ' + quien + ' ' + horaCorta(c.abiertaEn) + ' → ' + (c.cerrada ? horaCorta(c.cerradaEn) : 'abierta') + ' · vendió ' + plata(c.ventaTotal) + (c.tickets != null ? ' (' + c.tickets + ' tickets)' : ''),
      c.diferencia != null && c.diferencia !== 0 ? el('span', { clase: 'chip ' + (c.diferencia < 0 ? (c.perdonado ? '' : 'mal') : 'ok'), estilo: { marginLeft: '6px' } }, (c.diferencia < 0 ? 'faltó ' : 'sobró ') + plata(Math.abs(c.diferencia)) + (c.perdonado ? ' (perdonado)' : '')) : (c.cerrada ? el('span', { clase: 'chip ok', estilo: { marginLeft: '6px' } }, 'cerró justo') : null)))
  }
  if (venta) lineas.push(el('div', { clase: 'dia-linea sub' }, 'Cobró ' + plata(venta.total) + ' en ' + venta.tickets + (venta.tickets === 1 ? ' ticket' : ' tickets')))
  for (const m of movs) lineas.push(el('div', { clase: 'dia-linea sub' }, (m.signo > 0 ? '+ ' : '− ') + m.nombreTipo + ' ' + plata(m.importe) + (m.motivo ? ' · ' + m.motivo : '')))
  if (editar && !turnos.length) {
    lineas.push(el('div', { clase: 'dia-acciones' },
      el('button', { clase: 'btn chico', onclick: (ev) => { ev.stopPropagation(); hojaTurno({ sucursalId: ctx.sucursalId, u: ctx.u, dia, programado }) } }, turnos.length ? '+ Otro turno' : '+ Cargar que trabajó'),
      (falta || marcado) ? el('button', { clase: 'btn chico', onclick: (ev) => { ev.stopPropagation(); hojaMarcarDia(ctx, dia, marcado) } }, marcado ? 'Cambiar marca' : 'Franco / justificada') : null))
  }
  const fecha = el('div', { clase: 'dia-fecha' + (esHoy ? ' hoy' : '') }, el('span', {}, DIA_SEM_CORTO[diaSem(dia)]), el('b', {}, String(Number(dia.slice(8)))))
  return el('div', { clase: 'item dia-emp' + (nada ? ' vacio' : '') + (falta ? ' falta' : '') + (editar ? '' : ' tocable'), onclick: editar ? null : () => hojaDia(ctx, dia) },
    fecha,
    el('div', { clase: 'cuerpo' }, lineas),
    el('div', { clase: 'fin' }, plataDia ? el('b', { clase: 'num' }, plata(plataDia)) : null, minDia ? el('div', { clase: 'sub' }, horasCorto(minDia)) : null))
}

// El detalle de un día, con todo lo anotado y las acciones.
function hojaDia (ctx, dia) {
  const uid = ctx.u.usuarioId
  const filas = ctx.datos.dias.filter((f) => f.u === uid && f.dia === dia)
  const turnos = filas.filter((f) => f.tipo === 'fichaje')
  const falta = filas.find((f) => f.tipo === 'falta')
  const marcado = filas.find((f) => f.tipo === 'marcado')
  const programado = (filas[0] && filas[0].programado) || null
  const cajas = ctx.datos.cajas.filter((c) => c.dia === dia && (c.u === uid || c.cerro === uid))
  const fila = (t, v) => el('div', { clase: 'fila' }, el('span', { clase: 'tenue' }, t), el('b', { clase: 'num' }, v))
  abrirHoja({
    titulo: ctx.u.nombre + ' · ' + DIA_SEM_CORTO[diaSem(dia)] + ' ' + fechaCorta(dia),
    completa: true,
    cuerpo: el('div', {},
      programado ? fila('Horario', programado.desde + ' a ' + programado.hasta) : fila('Horario', 'no tenía'),
      turnos.map((f) => el('div', { clase: 'tarjeta', estilo: { margin: '10px 0' } },
        fila('Entró', horaCorta(f.entrada)), fila('Salió', f.salida ? horaCorta(f.salida) : (f.abierto ? 'sigue trabajando' : '—')),
        fila('Horas', horasTexto(f.minutos)), fila('Plata del día', plata(f.monto)),
        el('div', { clase: 'chips' }, chipColor(f.llegada && f.llegada.color, f.llegada && f.llegada.texto), chipColor(f.salidaEstado && f.salidaEstado.color, f.salidaEstado && f.salidaEstado.texto)),
        f.manual ? el('p', { clase: 'sub' }, 'Cargado a mano' + (f.motivo ? ': ' + f.motivo : '')) : null,
        f.porCierreCaja ? el('p', { clase: 'sub' }, 'El turno terminó al cerrar la caja.') : null,
        (f.correcciones || []).map((c) => el('p', { clase: 'sub' }, 'Corregido el ' + fechaHora(c.ts) + ': ' + c.motivo + (c.antes ? ' (antes ' + c.antes + ')' : ''))),
        el('div', { clase: 'chips', estilo: { marginTop: '8px' } },
          el('button', { clase: 'btn chico', onclick: () => hojaTurno({ sucursalId: ctx.sucursalId, u: ctx.u, f, dia }) }, 'Corregir horas'),
          el('button', { clase: 'btn chico peligro', onclick: () => hojaBorrarTurno(ctx, f) }, 'Borrar turno')))),
      falta ? el('div', { clase: 'aviso mal' }, el('b', {}, 'Faltó. '), 'Tenía horario y no fichó.') : null,
      marcado ? el('div', { clase: 'aviso' }, el('b', {}, (ctx.marcas[marcado.marca] || marcado.marca) + '. '), marcado.motivo || '') : null,
      cajas.length ? el('h3', {}, 'Cajas') : null,
      cajas.map((c) => el('div', { clase: 'tarjeta', estilo: { margin: '8px 0' } },
        fila('Abrió', (c.u === uid ? ctx.u.nombre : 'otro') + ' ' + horaCorta(c.abiertaEn)),
        fila('Cerró', c.cerrada ? (c.cerroNombre || (c.cerro === uid ? ctx.u.nombre : '')) + ' ' + horaCorta(c.cerradaEn) + (c.relevo ? ' (relevo)' : '') : 'sigue abierta'),
        fila('Fondo', plata(c.fondo)), fila('Vendido', plata(c.ventaTotal) + (c.tickets != null ? ' · ' + c.tickets + ' tickets' : '')),
        c.diferencia != null ? fila('Al cerrar', c.diferencia === 0 ? 'justo' : (c.diferencia < 0 ? 'faltó ' : 'sobró ') + plata(Math.abs(c.diferencia)) + (c.perdonado ? ' (perdonado)' : '')) : null,
        c.observaciones ? el('p', { clase: 'sub' }, c.observaciones) : null)),
      el('div', { clase: 'chips', estilo: { marginTop: '12px' } },
        el('button', { clase: 'btn chico', onclick: () => hojaTurno({ sucursalId: ctx.sucursalId, u: ctx.u, dia, programado }) }, turnos.length ? '+ Otro turno ese día' : '+ Cargar que trabajó'),
        (falta || marcado) ? el('button', { clase: 'btn chico', onclick: () => hojaMarcarDia(ctx, dia, marcado) }, marcado ? 'Cambiar marca' : 'Marcar franco / justificada') : null))
  })
}

// Corregir un turno (f) o cargar uno nuevo a mano.
async function hojaTurno ({ sucursalId, u, f, dia, programado }) {
  let lista = u ? [u] : null
  if (!lista) { const h = datosDe(await leerDatos('personal_horarios'), sucursalId) || { lista: [] }; lista = h.lista }
  const quien = el('select', {}, lista.map((x) => el('option', { valor: x.usuarioId }, x.nombre)))
  const sugerida = (hhmm) => (dia && hhmm ? dia + 'T' + hhmm : '')
  const entrada = el('input', { type: 'datetime-local', valor: f ? aLocalInput(f.entrada) : sugerida(programado && programado.desde) })
  let finSug = programado && dia ? sugerida(programado.hasta) : ''
  if (finSug && programado.hasta <= programado.desde) finSug = PersonalCalculo.sumarDias(dia, 1) + 'T' + programado.hasta
  const salida = el('input', { type: 'datetime-local', valor: f ? aLocalInput(f.salida) : finSug })
  const motivo = el('input', { type: 'text', placeholder: f ? 'Ej: se olvidó de fichar la salida' : 'Ej: se cortó la luz y no pudo fichar' })
  abrirHoja({
    titulo: f ? 'Corregir turno' + (u ? ' de ' + u.nombre : '') : 'Cargar un turno a mano',
    cuerpo: el('div', {},
      u ? null : el('label', { clase: 'campo' }, 'Empleado', quien),
      el('label', { clase: 'campo' }, 'Entró', entrada),
      el('label', { clase: 'campo' }, f ? 'Salió (vacío = sigue trabajando)' : 'Salió', salida),
      el('label', { clase: 'campo' }, 'Motivo (obligatorio, queda anotado)', motivo),
      el('p', { clase: 'sub' }, 'Las horas y la plata del día se recalculan solas con su valor hora.')),
    botones: [{ texto: 'Guardar', primario: true, alTocar: async () => {
      if (!entrada.value) return toast('Poné la hora de entrada', 'mal')
      if (!f && !salida.value) return toast('Poné la hora de salida', 'mal')
      if (salida.value && salida.value <= entrada.value) return toast('La salida tiene que ser después de la entrada', 'mal')
      if (!motivo.value.trim()) return toast('Poné el motivo', 'mal')
      cerrarHoja(S.hojas.length)
      if (f) await mandarOrden(sucursalId, 'fichaje_corregir', { id: f.id, entrada: deLocalInput(entrada.value), salida: deLocalInput(salida.value) || null, motivo: motivo.value.trim() }, { texto: 'Turno corregido', alTerminar: refrescarSeccion })
      else await mandarOrden(sucursalId, 'fichaje_manual', { usuarioId: u ? u.usuarioId : quien.value, entrada: deLocalInput(entrada.value), salida: deLocalInput(salida.value), motivo: motivo.value.trim() }, { texto: 'Turno a mano', alTerminar: refrescarSeccion })
    } }]
  })
}

function hojaBorrarTurno (ctx, f) {
  const motivo = el('input', { type: 'text', placeholder: 'Ej: fichó dos veces' })
  abrirHoja({
    titulo: 'Borrar el turno ' + horaCorta(f.entrada) + ' → ' + (f.salida ? horaCorta(f.salida) : '…'),
    cuerpo: el('div', {}, el('p', {}, 'Se saca del día de ' + ctx.u.nombre + ' (' + fechaCorta(f.dia) + '): no suma horas ni plata. Queda anotado quién lo borró y por qué.'), el('label', { clase: 'campo' }, 'Motivo (obligatorio)', motivo)),
    botones: [{ texto: 'Borrar', peligro: true, alTocar: async () => {
      if (!motivo.value.trim()) return toast('Poné el motivo', 'mal')
      cerrarHoja(S.hojas.length)
      await mandarOrden(ctx.sucursalId, 'fichaje_anular', { id: f.id, motivo: motivo.value.trim() }, { texto: 'Turno borrado', alTerminar: refrescarSeccion })
    } }]
  })
}

function hojaMarcarDia (ctx, dia, marcado) {
  let elegida = marcado ? marcado.marca : 'franco'
  const opciones = el('div', { clase: 'chips' })
  const pintar = () => poner(opciones, Object.entries(ctx.marcas).map(([k, t]) => el('button', { clase: 'filtro' + (elegida === k ? ' activo' : ''), onclick: () => { elegida = k; pintar() } }, t)))
  pintar()
  const motivo = el('input', { type: 'text', placeholder: 'Opcional', valor: marcado ? marcado.motivo || '' : '' })
  abrirHoja({
    titulo: ctx.u.nombre + ' · ' + fechaCorta(dia),
    cuerpo: el('div', {}, el('p', { clase: 'sub' }, 'Tenía horario y no vino. Marcado así no cuenta como falta (no suma plata: si se le paga igual, cargale un extra).'), opciones, el('label', { clase: 'campo', estilo: { marginTop: '10px' } }, 'Motivo', motivo)),
    botones: [
      marcado ? { texto: 'Volver a falta', alTocar: async () => { cerrarHoja(S.hojas.length); await mandarOrden(ctx.sucursalId, 'dia_marcar', { usuarioId: ctx.u.usuarioId, dia, marca: null }, { texto: 'Marca sacada', alTerminar: refrescarSeccion }) } } : null,
      { texto: 'Guardar', primario: true, alTocar: async () => { cerrarHoja(S.hojas.length); await mandarOrden(ctx.sucursalId, 'dia_marcar', { usuarioId: ctx.u.usuarioId, dia, marca: elegida, motivo: motivo.value.trim() }, { texto: 'Día marcado', alTerminar: refrescarSeccion }) } }
    ].filter(Boolean)
  })
}

// Adelanto, vale, descuento, extra, pago... de la ficha. El pago lleva el
// período que cubre (así cuenta para ese período aunque se pague otro día).
function hojaMovEmpleado (ctx, tipo) {
  const { u, liq, per } = ctx
  const nombre = (ctx.tipos[tipo] || tipo)
  const conPlata = tipo === 'adelanto' || tipo === 'pago'
  const sugerido = tipo === 'pago' ? Math.max(0, liq.saldo) : tipo === 'fiado' && u.cuenta ? u.cuenta.debe : 0
  const importe = el('input', { type: 'text', inputmode: 'decimal', clase: 'plata-grande', valor: sugerido ? String(sugerido / 100).replace('.', ',') : '' })
  const motivo = el('input', { type: 'text', placeholder: tipo === 'vale' ? 'Qué se llevó' : 'Opcional' })
  const medio = el('select', {}, [['transferencia', 'Transferencia'], ['mercado_pago', 'Mercado Pago'], ['efectivo', 'Efectivo (fuera de la caja)']].map(([id, t]) => el('option', { valor: id }, t)))
  const fecha = el('input', { type: 'date', valor: hoyISO() })
  const pDesde = el('input', { type: 'date', valor: per.desde })
  const pHasta = el('input', { type: 'date', valor: per.hasta < hoyISO() ? per.hasta : hoyISO() })
  abrirHoja({
    titulo: nombre + ' · ' + u.nombre,
    cuerpo: el('div', {},
      el('label', { clase: 'campo' }, 'Importe ($)', importe),
      conPlata ? el('label', { clase: 'campo' }, 'Cómo se le pagó', medio) : null,
      el('label', { clase: 'campo' }, tipo === 'pago' ? 'Fecha en que se le pagó' : 'Fecha', fecha),
      tipo === 'pago' ? el('div', { clase: 'dos' }, el('label', { clase: 'campo' }, 'Paga desde', pDesde), el('label', { clase: 'campo' }, 'hasta', pHasta)) : null,
      tipo === 'fiado' ? null : el('label', { clase: 'campo' }, 'Motivo / detalle', motivo),
      tipo === 'pago' ? el('p', { clase: 'sub' }, 'El pago cuenta para ese período aunque se lo des antes o después. La próxima vez, "Desde el último pago" arranca el día siguiente.') : null,
      conPlata ? el('p', { clase: 'sub' }, 'Queda también como gasto "Sueldos". Si salió del cajón, cargalo en el local (así el cierre cierra).') : null),
    botones: [{ texto: 'Guardar', primario: true, alTocar: async () => {
      const n = aCentavos(importe.value)
      if (!Number.isFinite(n) || n <= 0) return toast('Escribí el importe', 'mal')
      if (tipo === 'pago' && (!pDesde.value || !pHasta.value || pDesde.value > pHasta.value)) return toast('Revisá el período que paga', 'mal')
      cerrarHoja(S.hojas.length)
      const datos = { usuarioId: u.usuarioId, tipo, importe: n, medio: conPlata ? medio.value : undefined, fecha: fecha.value, motivo: motivo.value.trim() }
      if (tipo === 'pago') Object.assign(datos, { periodoDesde: pDesde.value, periodoHasta: pHasta.value })
      await mandarOrden(ctx.sucursalId, 'sueldo_registrar', datos, { texto: nombre + ' de ' + u.nombre, alTerminar: refrescarSeccion })
    } }]
  })
}

function hojaMasMovimientos (ctx) {
  const b = (tipo) => el('button', { clase: 'btn', onclick: () => { cerrarHoja(); hojaMovEmpleado(ctx, tipo) } }, ctx.tipos[tipo] || tipo)
  abrirHoja({ titulo: 'Otros movimientos', cuerpo: el('div', { clase: 'chips' }, b('feriado'), b('vacaciones'), b('aguinaldo'), b('rotura'), ctx.u.cuenta ? b('fiado') : null) })
}

function listaMovimientos (ctx, editar) {
  const { liq } = ctx
  const anulados = ctx.datos.movimientos.filter((m) => m.usuarioId === ctx.u.usuarioId && m.anulado && PersonalCalculo.imputada(m) >= ctx.per.desde && PersonalCalculo.imputada(m) <= ctx.per.hasta)
  if (!liq.movimientos.length && !anulados.length) return null
  return [el('h3', {}, 'Adelantos, vales y pagos del período'),
    el('div', { clase: 'tarjeta sin-relleno' }, el('div', { clase: 'lista' },
      liq.movimientos.map((m) => el('div', { clase: 'item' },
        el('div', { clase: 'cuerpo' }, el('b', {}, (m.signo > 0 ? '+ ' : '− ') + m.nombreTipo),
          el('div', { clase: 'sub' }, [fechaCorta(m.fecha), m.periodoDesde ? 'paga ' + textoPeriodo(m.periodoDesde, m.periodoHasta) : '', m.nombreMedio || '', m.descripcion || '', m.motivo].filter(Boolean).join(' · '))),
        el('div', { clase: 'fin' }, el('b', { clase: 'num' }, plata(m.importe)),
          m.medio !== 'caja' ? el('button', { clase: 'btn chico peligro', estilo: { marginTop: '4px' }, onclick: () => { if (confirm('¿Anular ' + m.nombreTipo + ' de ' + plata(m.importe) + '?')) mandarOrden(ctx.sucursalId, 'sueldo_anular', { id: m.id, motivo: 'Anulado desde el celular' }, { texto: 'Anular movimiento', alTerminar: refrescarSeccion }) } }, 'Anular') : null))),
      anulados.map((m) => el('div', { clase: 'item inactivo' }, el('div', { clase: 'cuerpo' }, el('b', {}, m.nombreTipo + ' (anulado)'), el('div', { clase: 'sub' }, fechaCorta(m.fecha) + (m.motivoAnulacion ? ' · ' + m.motivoAnulacion : ''))), el('div', { clase: 'fin num' }, plata(m.importe))))))]
}

function listaFaltantes (ctx) {
  const lista = ctx.liq.faltantes
  if (!lista.length) return null
  return [el('h3', {}, 'Faltantes de sus cajas'),
    el('div', { clase: 'tarjeta sin-relleno' }, el('div', { clase: 'lista' }, lista.map((f) => el('div', { clase: 'item' },
      el('div', { clase: 'cuerpo' }, el('b', {}, fechaCorta(f.dia) + ' · ' + plata(f.importe)), el('div', { clase: 'sub' }, f.perdonado ? 'Perdonado: no se descuenta' : 'Se descuenta del sueldo' + (f.cerradaPor ? ' · cerró ' + f.cerradaPor : ''))),
      el('div', { clase: 'fin' }, el('button', { clase: 'btn chico', onclick: () => mandarOrden(ctx.sucursalId, 'sueldo_perdonar', { cajaId: f.cajaId, perdonado: !f.perdonado, motivo: 'Desde el celular' }, { texto: f.perdonado ? 'Volver a descontar' : 'Perdonar faltante', alTerminar: refrescarSeccion }) }, f.perdonado ? 'Descontar' : 'Perdonar'))))))]
}

// El resumen en texto, para mandárselo por WhatsApp al empleado.
async function compartirResumen (ctx) {
  const { u, liq, per } = ctx
  const hasta = per.hasta < hoyISO() ? per.hasta : hoyISO()
  const r = []
  r.push(u.nombre + ' · ' + textoPeriodo(per.desde, hasta))
  r.push('Trabajó ' + liq.dias + ' días, ' + horasCorto(liq.minutos) + ' h')
  r.push('')
  for (const dia of PersonalCalculo.diasDe(per.desde, hasta).reverse()) {
    const ts = ctx.datos.dias.filter((f) => f.u === u.usuarioId && f.dia === dia)
    for (const f of ts) {
      if (f.tipo === 'fichaje') r.push(DIA_SEM_CORTO[diaSem(dia)] + ' ' + ddmm(dia) + '  ' + horaCorta(f.entrada) + ' a ' + (f.salida ? horaCorta(f.salida) : '…') + '  ' + horasCorto(f.minutos) + '  ' + plata(f.monto))
      else if (f.tipo === 'falta') r.push(DIA_SEM_CORTO[diaSem(dia)] + ' ' + ddmm(dia) + '  faltó')
    }
  }
  r.push('')
  r.push('Por horas: ' + plata(liq.sueldoHoras))
  if (liq.extras) r.push('+ Extras: ' + plata(liq.extras))
  if (liq.adicionales) r.push('+ Aguinaldo/vacaciones/feriados: ' + plata(liq.adicionales))
  if (liq.adelantos) r.push('− Adelantos y vales: ' + plata(liq.adelantos))
  if (liq.fiado) r.push('− Fiado: ' + plata(liq.fiado))
  if (liq.descuentos) r.push('− Descuentos: ' + plata(liq.descuentos))
  if (liq.faltante) r.push('− Faltantes de caja: ' + plata(liq.faltante))
  r.push('Le corresponde: ' + plata(liq.aCobrar))
  if (liq.pagado) r.push('Ya pagado: ' + plata(liq.pagado))
  r.push('Saldo: ' + plata(liq.saldo))
  const texto = r.join('\n')
  try { if (navigator.share) { await navigator.share({ title: u.nombre, text: texto }); return } } catch (err) { if (err && err.name === 'AbortError') return }
  try { await navigator.clipboard.writeText(texto); toast('Resumen copiado: pegalo en WhatsApp') } catch (err) { abrirHoja({ titulo: 'Resumen', cuerpo: el('textarea', { valor: texto, estilo: { width: '100%', minHeight: '300px' } }) }) }
}

// --- HOY: quién está trabajando en cada sucursal --------------------------------------------

async function vistaHoy () {
  const todas = await leerDatos('personal_hoy')
  const sucs = S.sucursales.filter((s) => datosDe(todas, s.id))
  if (!sucs.length) return el('div', { clase: 'tarjeta' }, vacio('La caja todavía no subió el personal. Aparece cuando se actualiza a la versión nueva.', 'clientes'))
  const fila = (sucursalId, v) => el('div', { clase: 'item tocable', onclick: () => abrirEmpleado(sucursalId, v.usuarioId) },
    el('div', { clase: 'cuerpo' }, el('b', {}, v.nombre), el('div', { clase: 'sub' }, 'entró ' + horaCorta(v.entrada) + (v.salida ? ' · salió ' + horaCorta(v.salida) : ' · sigue trabajando') + ' · ' + horasTexto(v.minutos))),
    el('div', { clase: 'fin' }, chipColor(v.llegada && v.llegada.color, (v.llegada && v.llegada.texto) || '')))
  const tot = (k) => sucs.reduce((s, x) => s + datosDe(todas, x.id)[k].length, 0)
  return el('div', {},
    el('div', { clase: 'kpis' }, kpi('Trabajando', String(tot('trabajando')), sucs.flatMap((x) => datosDe(todas, x.id).trabajando.map((v) => v.nombre)).slice(0, 3).join(', ') || 'nadie ahora', { clase: 'principal' }), kpi('Sin llegar', String(tot('faltan')), tot('faltan') ? 'revisá abajo' : 'todos al día', { clase: tot('faltan') ? 'mal' : '' }), kpi('Más tarde', String(tot('proximos')), 'todavía no les toca')),
    sucs.map((s) => {
      const d = datosDe(todas, s.id)
      return [sucs.length > 1 ? el('h2', { estilo: { margin: '18px 0 4px' } }, s.nombre) : null,
        d.faltan.length ? [el('h3', {}, 'No llegaron'), el('div', { clase: 'tarjeta sin-relleno' }, el('div', { clase: 'lista' }, d.faltan.map((x) => el('div', { clase: 'item tocable', onclick: () => abrirEmpleado(s.id, x.usuarioId) }, el('div', { clase: 'cuerpo' }, el('b', {}, x.nombre), el('div', { clase: 'sub' }, 'Tenía que entrar a las ' + horaCorta(x.turno.inicio))), el('div', { clase: 'fin' }, chipColor(x.color, x.texto))))))] : null,
        el('h3', {}, 'Trabajando ahora'),
        el('div', { clase: 'tarjeta sin-relleno' }, d.trabajando.length ? el('div', { clase: 'lista' }, d.trabajando.map((v) => fila(s.id, v))) : vacio('No hay nadie con el turno iniciado.', 'clientes')),
        d.terminaron.length ? [el('h3', {}, 'Ya terminaron'), el('div', { clase: 'tarjeta sin-relleno' }, el('div', { clase: 'lista' }, d.terminaron.map((v) => fila(s.id, v))))] : null]
    }),
    el('p', { clase: 'sub' }, 'Tocá a alguien para ver su ficha día por día y corregir la entrada o la salida.'))
}

// --- SUELDOS ------------------------------------------------------------------------------

async function vistaSueldos (E) {
  const hoy = hoyISO()
  const meses = [0, 1, 2].map((i) => { const f = new Date(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 1 - i, 1); return f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') })
  if (!meses.includes(E.mes)) E.mes = meses[0]
  const d = datosDe(await leerDatos('sueldos_mes:' + E.mes))
  const selector = el('div', { clase: 'seg ancho', estilo: { marginBottom: '10px' } }, meses.map((m) => el('button', { clase: E.mes === m ? 'activo' : '', onclick: () => { E.mes = m; render() } }, nombreMes(m).split(' ')[0])))
  if (!d) return el('div', {}, selector, el('div', { clase: 'tarjeta' }, vacio('La caja todavía no subió los sueldos de ' + nombreMes(E.mes) + '.', 'clientes')))
  const t = d.total
  return el('div', {}, selector,
    el('div', { clase: 'kpis' }, kpi('A pagar en el mes', plata(t.aCobrar), 'horas ' + plata(t.sueldoHoras), { clase: 'principal' }), kpi('Ya pagado', plata(t.pagado), 'adelantos y vales ' + plata(t.adelantos)), kpi('Saldo', plata(t.saldo), t.saldo > 0 ? 'falta pagar' : 'al día', { clase: t.saldo > 0 ? 'mal' : '' })),
    el('div', { clase: 'tarjeta sin-relleno' }, d.empleados.length ? el('div', { clase: 'lista' }, d.empleados.map((x) => el('div', { clase: 'item tocable', onclick: () => hojaEmpleadoSueldo(d, x.usuarioId) },
      el('div', { clase: 'cuerpo' }, el('b', {}, x.nombre), el('div', { clase: 'sub' }, horasTexto(x.minutos) + ' · le corresponde ' + plata(x.aCobrar) + (x.pagado ? ' · pagado ' + plata(x.pagado) : '') + (x.sinValorHora ? ' · SIN valor hora' : '')),
        x.cuenta && x.cuenta.debe > 0 ? el('div', { clase: 'sub ambar' }, 'Debe ' + plata(x.cuenta.debe) + ' de fiado') : null),
      el('div', { clase: 'fin' }, el('b', { clase: 'num ' + (x.saldo > 0 ? 'rojo' : '') }, plata(x.saldo)), el('div', { clase: 'sub' }, 'saldo'))))) : vacio('No hay empleados con movimientos este mes.', 'clientes')),
    el('p', { clase: 'sub' }, 'Horas × valor hora + extras − adelantos, vales, fiado, descuentos y faltantes de caja. Lo que se paga con el efectivo del cajón se carga en el local (así el cierre cierra); acá van las transferencias, Mercado Pago y el efectivo de afuera.'))
}

function hojaEmpleadoSueldo (liq, usuarioId) {
  const x = liq.empleados.find((y) => y.usuarioId === usuarioId)
  if (!x) return
  const fila = (t, v, clase) => el('div', { clase: 'fila' }, el('span', { clase: 'tenue' }, t), el('b', { clase: 'num ' + (clase || '') }, v))
  const botonTipo = (tipo, texto) => el('button', { clase: 'btn chico', onclick: () => hojaMovimientoSueldo(liq, x, tipo) }, texto)
  abrirHoja({
    titulo: x.nombre + ' · ' + nombreMes(liq.mes),
    completa: true,
    cuerpo: el('div', {},
      fila('Horas trabajadas', horasTexto(x.minutos) + ' (' + x.dias + ' días)'),
      fila('Valor hora lun-jue / vie-dom', plata(x.valorHoraLunJue) + ' / ' + plata(x.valorHoraVieDom)),
      fila('Sueldo por horas', plata(x.sueldoHoras)),
      x.extras ? fila('+ Extras', plata(x.extras), 'verde') : null,
      x.adicionales ? fila('+ Aguinaldo, vacaciones y feriados', plata(x.adicionales), 'verde') : null,
      x.aguinaldoSugerido ? fila('Aguinaldo sin cargar', plata(x.aguinaldoSugerido), 'ambar') : null,
      x.adelantos ? fila('− Adelantos y vales', plata(x.adelantos)) : null,
      x.fiado ? fila('− Fiado de su cuenta', plata(x.fiado)) : null,
      x.descuentos ? fila('− Roturas y descuentos', plata(x.descuentos)) : null,
      x.faltante ? fila('− Faltantes de caja', plata(x.faltante)) : null,
      fila('Le corresponde', plata(x.aCobrar)),
      fila('Ya pagado', plata(x.pagado)),
      fila('Saldo', plata(x.saldo), x.saldo > 0 ? 'rojo' : 'verde'),
      // Lo que debe en su cuenta de fiado (la cuenta se elige en la caja, en Sueldos).
      x.cuenta && x.cuenta.debe > 0 ? el('div', { clase: 'aviso alerta', estilo: { marginTop: '10px' } }, el('b', {}, 'Debe ' + plata(x.cuenta.debe) + ' de fiado'), 'En la cuenta ' + x.cuenta.nombre + '. Al descontarlo del sueldo, la cuenta queda pagada.', el('div', { estilo: { marginTop: '8px' } }, el('button', { clase: 'btn chico primario', onclick: () => hojaMovimientoSueldo(liq, x, 'fiado') }, 'Descontar del sueldo'))) : null,
      el('div', { clase: 'chips', estilo: { margin: '12px 0' } }, botonTipo('adelanto', '+ Adelanto'), botonTipo('vale', '+ Vale'), botonTipo('descuento', '+ Descuento'), botonTipo('bono', '+ Extra'), botonTipo('feriado', '+ Feriado'), botonTipo('vacaciones', '+ Vacaciones'), botonTipo('aguinaldo', '+ Aguinaldo'), botonTipo('pago', 'Pagar sueldo')),
      x.faltantes.length ? [el('h3', {}, 'Faltantes de caja'), x.faltantes.map((f) => el('div', { clase: 'fila' },
        el('span', { clase: 'tenue' }, fechaCorta(f.dia) + ' · ' + plata(f.importe) + (f.perdonado ? ' (perdonado)' : '')),
        el('button', { clase: 'btn chico', onclick: async () => { cerrarHoja(); await mandarOrden(S.sucursal, 'sueldo_perdonar', { cajaId: f.cajaId, perdonado: !f.perdonado, motivo: 'Desde el celular' }, { texto: f.perdonado ? 'Volver a descontar' : 'Perdonar faltante', alTerminar: refrescarSeccion }) } }, f.perdonado ? 'Descontar' : 'Perdonar')))] : null,
      x.movimientos.length ? [el('h3', {}, 'Movimientos del mes'), x.movimientos.map((m) => el('div', { clase: 'fila' },
        el('div', { clase: 'izq' }, el('b', {}, (m.signo > 0 ? '+ ' : '− ') + m.nombreTipo), el('div', { clase: 'sub' }, fechaCorta(m.fecha) + (m.motivo ? ' · ' + m.motivo : '') + (m.nombreMedio ? ' · ' + m.nombreMedio : ''))),
        el('b', { clase: 'num' }, plata(m.importe)),
        m.medio === 'caja' ? null : el('button', { clase: 'btn chico peligro', onclick: () => { if (confirm('¿Anular este movimiento?')) { cerrarHoja(); mandarOrden(S.sucursal, 'sueldo_anular', { id: m.id, motivo: 'Anulado desde el celular' }, { texto: 'Anular movimiento', alTerminar: refrescarSeccion }) } } }, 'Anular')))] : null)
  })
}

function hojaMovimientoSueldo (liq, x, tipo) {
  const nombres = liq.tipos
  const conPlata = tipo === 'adelanto' || tipo === 'pago'
  const sugerido = tipo === 'pago' && x.saldo > 0 ? x.saldo : tipo === 'fiado' && x.cuenta ? x.cuenta.debe : 0
  const importe = el('input', { type: 'text', inputmode: 'decimal', clase: 'plata-grande', valor: (sugerido || (tipo === 'aguinaldo' && x.aguinaldoSugerido)) ? String((sugerido || x.aguinaldoSugerido) / 100).replace('.', ',') : '' })
  const motivo = el('input', { type: 'text', placeholder: tipo === 'vale' ? 'Qué se llevó' : 'Opcional' })
  const medio = el('select', {}, [['transferencia', 'Transferencia'], ['mercado_pago', 'Mercado Pago'], ['efectivo', 'Efectivo (fuera de la caja)']].map(([id, t]) => el('option', { valor: id }, t)))
  const fecha = el('input', { type: 'date', valor: hoyISO() })
  abrirHoja({
    titulo: nombres[tipo] + ' · ' + x.nombre,
    cuerpo: el('div', {},
      el('label', { clase: 'campo' }, 'Importe ($)', importe),
      conPlata ? el('label', { clase: 'campo' }, 'Cómo se le pagó', medio) : null,
      el('label', { clase: 'campo' }, 'Fecha', fecha),
      tipo === 'fiado' ? null : el('label', { clase: 'campo' }, 'Motivo / detalle', motivo),
      conPlata ? el('p', { clase: 'sub' }, 'Queda también como gasto "Sueldos". Si salió del cajón, cargalo en el local.') : null,
      tipo === 'fiado' && x.cuenta ? el('p', { clase: 'sub' }, 'Debe ' + plata(x.cuenta.debe) + ' en la cuenta ' + x.cuenta.nombre + '. Lo que descontás queda pagado en la cuenta.') : null),
    botones: [{ texto: 'Guardar', primario: true, alTocar: async () => {
      const n = aCentavos(importe.value)
      if (!Number.isFinite(n) || n <= 0) return toast('Escribí el importe', 'mal')
      cerrarHoja(2)
      await mandarOrden(S.sucursal, 'sueldo_registrar', { usuarioId: x.usuarioId, tipo, importe: n, medio: conPlata ? medio.value : undefined, fecha: fecha.value, motivo: motivo.value.trim() }, { texto: nombres[tipo] + ' de ' + x.nombre, alTerminar: refrescarSeccion })
    } }]
  })
}

// --- HORARIOS -----------------------------------------------------------------------------

async function vistaHorarios () {
  const d = datosDe(await leerDatos('personal_horarios'))
  if (!d) return el('div', { clase: 'tarjeta' }, vacio('Todavía no hay horarios subidos.', 'clientes'))
  const dias = [1, 2, 3, 4, 5, 6, 0]
  const resumen = (u) => u.tieneHorario ? dias.filter((i) => u.dias[i]).map((i) => d.dias[i].slice(0, 3) + ' ' + u.dias[i].desde + '-' + u.dias[i].hasta).join(' · ') : 'Sin horario cargado'
  return el('div', {},
    el('div', { clase: 'tarjeta sin-relleno' }, el('div', { clase: 'lista' }, d.lista.map((u) => el('div', { clase: 'item tocable', onclick: () => hojaHorario(d, u) },
      el('div', { clase: 'cuerpo' }, el('b', {}, u.nombre), el('div', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, resumen(u))),
      el('div', { clase: 'fin' }, el('div', { clase: 'sub' }, 'hora ' + plata(u.valorHoraLunJue) + ' / ' + plata(u.valorHoraVieDom))))))),
    el('p', { clase: 'sub' }, 'Tolerancia ' + d.config.tolerancia + ' min · "muy tarde" desde ' + d.config.tarde + ' min. Un horario nuevo rige desde hoy; los días viejos quedan como estaban.'))
}

function hojaHorario (d, u) {
  const dias = [1, 2, 3, 4, 5, 6, 0]
  const campos = {}
  for (const i of dias) campos[i] = { desde: el('input', { type: 'time', valor: (u.dias[i] || {}).desde || '' }), hasta: el('input', { type: 'time', valor: (u.dias[i] || {}).hasta || '' }) }
  const semana = el('input', { type: 'text', inputmode: 'decimal', valor: u.valorHoraLunJue ? String(u.valorHoraLunJue / 100).replace('.', ',') : '' })
  const finde = el('input', { type: 'text', inputmode: 'decimal', valor: u.valorHoraVieDom ? String(u.valorHoraVieDom / 100).replace('.', ',') : '' })
  abrirHoja({
    titulo: 'Horario de ' + u.nombre,
    completa: true,
    cuerpo: el('div', {},
      dias.map((i) => el('div', { clase: 'dos' }, el('label', { clase: 'campo' }, d.dias[i] + ' · entra', campos[i].desde), el('label', { clase: 'campo' }, 'sale', campos[i].hasta))),
      el('p', { clase: 'sub' }, 'Dejá vacío el día que no trabaja. Un turno que termina a la madrugada cuenta para el día en que empieza.'),
      el('div', { clase: 'dos' }, el('label', { clase: 'campo' }, 'Valor hora lun a jue ($)', semana), el('label', { clase: 'campo' }, 'Valor hora vie a dom ($)', finde))),
    botones: [{ texto: 'Guardar', primario: true, alTocar: async () => {
      const dd = {}
      for (const i of dias) {
        const a = campos[i].desde.value
        const b = campos[i].hasta.value
        if ((a && !b) || (!a && b)) return toast(d.dias[i] + ': completá la entrada y la salida', 'mal')
        dd[i] = a ? { desde: a, hasta: b } : null
      }
      const v1 = aCentavos(semana.value)
      const v2 = aCentavos(finde.value)
      cerrarHoja()
      await mandarOrden(S.sucursal, 'horario_guardar', { usuarioId: u.usuarioId, dias: dd, valorHoraLunJue: Number.isFinite(v1) ? v1 : 0, valorHoraVieDom: Number.isFinite(v2) ? v2 : 0 }, { texto: 'Horario de ' + u.nombre, alTerminar: refrescarSeccion })
    } }]
  })
}

// --- VENCIMIENTOS -------------------------------------------------------------------------

const ESTADO_VTO = { vencido: ['mal', 'Vencido'], urgente: ['alerta', 'Urgente'], proximo: ['info', 'Este mes'], lejos: ['', 'Con tiempo'], resuelto: ['', 'Resuelto'] }

async function secVencimientos () {
  if (!S.sucursal) return pintarSeccion('vencimientos', cabecera('Vencimientos'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'reloj')))
  const d = datosDe(await leerDatos('vencimientos'))
  if (!d) return pintarSeccion('vencimientos', cabecera('Vencimientos', nombreSucursal(S.sucursal)), el('div', { clase: 'tarjeta' }, vacio('La caja todavía no subió los vencimientos. Aparecen cuando se actualiza a la versión nueva.', 'reloj')))
  const E = S.vto = Object.assign({ ver: 'urgentes', busca: '' }, S.vto || {})
  // El encargado recorre la gondola: ve y resuelve las partidas, sin lo que cuestan.
  const conPlata = S.rol === 'duenio'
  const busca = el('input', { type: 'search', placeholder: 'Buscar producto o lote…', valor: E.busca })
  const zona = el('div', { clase: 'lista' })
  const filtros = {
    urgentes: (p) => p.estado === 'vencido' || p.estado === 'urgente',
    vencidos: (p) => p.estado === 'vencido',
    mes: (p) => p.dias <= 30,
    todos: () => true
  }
  const pintar = () => {
    const base = E.ver === 'resueltos' ? d.resueltos || [] : d.lista.filter(filtros[E.ver] || filtros.todos)
    const lista = base.filter((p) => !E.busca || coincide(p.descripcion + ' ' + (p.lote || '') + ' ' + (p.codigo || ''), E.busca))
    poner(zona, lista.length ? lista.map((p) => el('div', { clase: 'item tocable', onclick: () => hojaPartida(p) },
      el('div', { clase: 'cuerpo' }, el('b', {}, p.descripcion), el('div', { clase: 'sub' }, [unidades(p.cantidad) + ' u.', 'vence ' + fechaCorta(p.fecha), p.dias < 0 ? 'hace ' + (-p.dias) + ' días' : p.dias === 0 ? 'hoy' : 'en ' + p.dias + ' días', p.lote ? 'lote ' + p.lote : ''].filter(Boolean).join(' · '))),
      el('div', { clase: 'fin' }, el('span', { clase: 'chip ' + ESTADO_VTO[p.estado][0] }, ESTADO_VTO[p.estado][1]), conPlata ? el('div', { clase: 'sub' }, plata(p.valorCosto)) : null))) : vacio(E.ver === 'resueltos' ? 'No hay partidas resueltas.' : 'No hay nada para mostrar acá.', 'reloj'))
  }
  busca.addEventListener('input', () => { E.busca = busca.value; pintar() })
  pintar()
  pintarSeccion('vencimientos',
    cabecera('Vencimientos', nombreSucursal(S.sucursal) + ' · ' + d.partidas + ' partidas', el('button', { clase: 'btn primario', onclick: () => hojaPartida(null) }, icono('sumar'), 'Nueva')),
    conPlata ? el('div', { clase: 'kpis' },
      kpi('Vencido', plata(d.plataVencida), d.vencidos + ' partidas', { clase: d.vencidos ? 'mal' : '' }),
      kpi('Vence esta semana', plata(d.plataUrgente), d.urgentes + ' partidas'),
      kpi('En riesgo (30 días)', plata(d.plataEnRiesgo), 'al costo', { clase: 'principal' }))
      : el('div', { clase: 'kpis' }, kpi('Vencidas', String(d.vencidos || 0), 'partidas', { clase: d.vencidos ? 'mal' : '' }), kpi('Vencen esta semana', String(d.urgentes || 0), 'partidas', { clase: 'principal' })),
    el('div', { clase: 'seg ancho', estilo: { marginBottom: '10px' } }, [['urgentes', 'Urgentes'], ['vencidos', 'Vencidos'], ['mes', '30 días'], ['todos', 'Todos'], ['resueltos', 'Resueltos']].map(([id, t]) => el('button', { clase: E.ver === id ? 'activo' : '', onclick: () => { E.ver = id; render() } }, t))),
    el('div', { clase: 'buscador' }, icono('buscar'), busca),
    el('div', { clase: 'tarjeta sin-relleno' }, zona),
    conPlata && (d.enRiesgo || []).length ? el('div', { clase: 'tarjeta' }, el('h2', {}, 'Lo que más plata tiene en riesgo'), ranking(d.enRiesgo.map((x) => ({ n: x.descripcion, texto: plata(x.valorCosto), sub: unidades(x.cantidad) + ' u. · desde ' + fechaCorta(x.primera), v: x.valorCosto })))) : null)
}

// Una partida (o una nueva si p es null).
async function hojaPartida (p) {
  const suc = S.sucursal
  if (!p) return hojaPartidaNueva()
  const resolver = (accion, texto) => async () => {
    if (accion === 'retirado' && !confirm('Se saca de la gondola y se descuentan ' + unidades(p.cantidad) + ' del stock como merma por vencimiento. ¿Seguro?')) return
    cerrarHoja()
    await mandarOrden(suc, 'vencimiento_resolver', { id: p.id, accion }, { texto: texto + ': ' + p.descripcion, alTerminar: refrescarSeccion })
  }
  const fila = (t, v) => el('div', { clase: 'fila' }, el('span', { clase: 'tenue' }, t), el('b', { clase: 'num' }, v))
  abrirHoja({
    titulo: p.descripcion,
    cuerpo: el('div', {},
      fila('Vence', fechaCorta(p.fecha) + (p.dias < 0 ? ' (hace ' + (-p.dias) + ' días)' : ' (en ' + p.dias + ' días)')),
      fila('Cantidad', unidades(p.cantidad) + ' u.'),
      S.rol === 'duenio' ? fila('Plata en juego (al costo)', plata(p.valorCosto)) : null,
      fila('Stock del producto', unidades(p.stockActual)),
      p.lote ? fila('Lote', p.lote) : null, p.nota ? fila('Nota', p.nota) : null,
      p.resuelto ? el('p', { clase: 'sub' }, 'Resuelta: ' + (p.accion || '')) : el('div', { clase: 'chips', estilo: { marginTop: '12px' } },
        el('button', { clase: 'btn primario', onclick: resolver('retirado', 'Retirar') }, 'Retirar de la gondola'),
        el('button', { clase: 'btn', onclick: resolver('vendido', 'Se vendió') }, 'Se vendió antes'),
        el('button', { clase: 'btn', onclick: () => { cerrarHoja(); hojaPartidaEditar(p) } }, 'Corregir'),
        S.rol !== 'duenio' ? null : el('button', { clase: 'btn peligro', onclick: () => { if (confirm('¿Borrar esta partida? No toca el stock.')) { cerrarHoja(); mandarOrden(suc, 'vencimiento_borrar', { id: p.id }, { texto: 'Borrar partida', alTerminar: refrescarSeccion }) } } }, 'Borrar')))
  })
}

function hojaPartidaEditar (p) {
  const fecha = el('input', { type: 'date', valor: p.fecha })
  const cant = el('input', { type: 'text', inputmode: 'decimal', valor: unidades(p.cantidad) })
  const lote = el('input', { type: 'text', valor: p.lote || '' })
  const nota = el('input', { type: 'text', valor: p.nota || '' })
  abrirHoja({
    titulo: 'Corregir ' + p.descripcion,
    cuerpo: el('div', {}, el('label', { clase: 'campo' }, 'Vence', fecha), el('label', { clase: 'campo' }, 'Cantidad', cant), el('label', { clase: 'campo' }, 'Lote', lote), el('label', { clase: 'campo' }, 'Nota', nota)),
    botones: [{ texto: 'Guardar', primario: true, alTocar: async () => {
      const n = aMilesimas(cant.value)
      if (!Number.isFinite(n) || n <= 0) return toast('Poné la cantidad', 'mal')
      if (!fecha.value) return toast('Poné la fecha', 'mal')
      cerrarHoja()
      await mandarOrden(S.sucursal, 'vencimiento_guardar', { id: p.id, fecha: fecha.value, cantidad: n, lote: lote.value.trim(), nota: nota.value.trim() }, { texto: 'Partida de ' + p.descripcion, alTerminar: refrescarSeccion })
    } }]
  })
}

async function hojaPartidaNueva () {
  const lista = await leerCatalogo(S.sucursal)
  let elegido = null
  const busca = el('input', { type: 'search', placeholder: 'Buscar producto…' })
  const resultados = el('div', { clase: 'lista' })
  const elegidoTxt = el('div', { clase: 'sub' }, 'Todavía no elegiste el producto')
  const escanear = el('button', { clase: 'btn ancho', estilo: { margin: '0 0 8px' }, onclick: async () => {
    const c = await leerCodigo({ titulo: 'Producto que vence' })
    if (!c) return
    const x = lista.find((y) => (y.codigos || []).includes(c))
    if (x) { elegido = x; elegidoTxt.textContent = x.descripcion }
    else toast('Ese código no está en ' + nombreSucursal(S.sucursal), 'mal')
  } }, icono('escanear'), 'Escanear el producto')
  const fecha = el('input', { type: 'date' })
  const cant = el('input', { type: 'text', inputmode: 'decimal', valor: '1' })
  const lote = el('input', { type: 'text', placeholder: 'Opcional' })
  busca.addEventListener('input', () => {
    limpiar(resultados)
    if (busca.value.trim().length < 2) return
    for (const x of lista.filter((y) => y.activo !== false && coincide(y.descripcion + ' ' + (y.codigos || []).join(' '), busca.value)).slice(0, 8)) {
      resultados.append(el('button', { clase: 'item', onclick: () => { elegido = x; elegidoTxt.textContent = x.descripcion; busca.value = ''; limpiar(resultados) } }, el('div', { clase: 'cuerpo' }, el('b', {}, x.descripcion)), el('span', { clase: 'num sub' }, 'stock ' + unidades(x.stock))))
    }
  })
  abrirHoja({
    titulo: 'Partida nueva',
    completa: true,
    cuerpo: el('div', {}, escanear, el('div', { clase: 'campo' }, 'Producto', el('div', { clase: 'buscador' }, icono('buscar'), busca), resultados, elegidoTxt), el('div', { clase: 'dos' }, el('label', { clase: 'campo' }, 'Vence', fecha), el('label', { clase: 'campo' }, 'Cantidad', cant)), el('label', { clase: 'campo' }, 'Lote', lote)),
    botones: [{ texto: 'Guardar', primario: true, alTocar: async () => {
      if (!elegido) return toast('Elegí el producto', 'mal')
      if (!fecha.value) return toast('Poné la fecha de vencimiento', 'mal')
      const n = aMilesimas(cant.value)
      if (!Number.isFinite(n) || n <= 0) return toast('Poné la cantidad', 'mal')
      cerrarHoja()
      await mandarOrden(S.sucursal, 'vencimiento_guardar', { productoId: elegido.id, fecha: fecha.value, cantidad: n, lote: lote.value.trim() }, { texto: 'Vencimiento de ' + elegido.descripcion, alTerminar: refrescarSeccion })
    } }]
  })
}

seccion('personal', { nombre: 'Personal', icono: 'clientes', grupo: 'negocio', fn: secPersonal })
seccion('empleado', { nombre: 'Empleado', icono: 'clientes', grupo: 'oculto', fn: secEmpleado })
seccion('vencimientos', { nombre: 'Vencimientos', icono: 'reloj', grupo: 'mercaderia', fn: secVencimientos })
