'use strict'
// LA PANTALLA DEL QUE RECIBE EN UN LOCAL
//
// Le llega lo que mando produccion. Cuenta a ciegas: ve QUE productos vienen
// pero no CUANTOS mandaron. Si no coincide, al dueño le salta el aviso.

const Local = {
  async arrancar () {
    poner($app, el('main', { clase: 'pagina-chica' }, barraPersona('Recibir producción'), el('div', { clase: 'nada' }, 'Cargando…')))
    try { await cargarEstado() } catch (e) {
      if (e && e.error === 'sesion') return
      return pantallaMensaje('Sin conexión', textoError(e), el('button', { clase: 'btn primario ancho grande', onclick: () => Local.arrancar() }, 'Probar de nuevo'))
    }
    Local.inicio()
  },
  producto (id) { return (S.estado.productos || []).find((p) => p.id === id) },
  inicio () {
    const e = S.estado
    const suc = (e.config.sucursales || []).find((s) => s.id === e.persona.sucursal)
    const pend = e.pendientes || []
    const cont = el('main', { clase: 'pagina-chica' }, barraPersona('Recibir producción'))
    cont.append(el('p', { clase: 'tenue' }, 'Local: ' + (suc ? suc.nombre : e.persona.sucursal || '—')))
    if (!pend.length) {
      cont.append(el('div', { clase: 'tarjeta' }, vacio('No hay nada para recibir.', 'recibir', el('button', { clase: 'btn', onclick: () => Local.arrancar() }, 'Actualizar'))))
    } else {
      cont.append(el('div', { clase: 'tarjeta sin-relleno' }, el('h2', {}, 'Para recibir'),
        el('div', { clase: 'lista' }, pend.map((p) => el('button', { clase: 'item', onclick: () => Local.recibir(p) },
          el('div', { clase: 'cuerpo' }, el('b', {}, 'Mandado ' + fechaCorta(Date.parse(p.fecha)) + ' ' + horaCorta(Date.parse(p.fecha))),
            el('div', { clase: 'sub' }, (p.persona ? p.persona + ' · ' : '') + (p.productos || []).map((id) => { const x = Local.producto(id); return x ? x.nombre : 'Producto' }).join(', '))),
          icono('flecha', 'tenue'))))))
    }
    poner($app, cont)
  },
  recibir (p) {
    const filas = (p.productos || []).map((id) => {
      const prod = Local.producto(id)
      const c = campoNumero(prod ? prod.nombre : 'Producto', prod && prod.venta === 'peso' ? 'g' : '', { placeholder: prod && prod.venta === 'peso' ? 'Pesalo' : 'Contalos' })
      return { id, c }
    })
    const error = el('div', { clase: 'error' })
    const guardar = el('button', { clase: 'btn primario' }, 'Confirmar')
    const h = hoja({
      titulo: 'Contá lo que llegó', completa: true,
      cuerpo: [el('div', { clase: 'aviso info' }, 'Contá cada cosa antes de guardarla en la heladera. Si de algo no llegó nada, poné 0.'), filas.map((f) => f.c), error],
      pie: [el('button', { clase: 'btn', onclick: () => h.cerrar() }, 'Cancelar'), guardar]
    })
    guardar.addEventListener('click', async () => {
      const items = {}
      for (const f of filas) {
        const v = f.c.valor()
        if (f.c.input.value.trim() === '' || !(v >= 0)) { error.textContent = 'Falta contar alguna cosa.'; return }
        items[f.id] = v
      }
      guardar.disabled = true
      try {
        await anotar('recepcion', { entregaId: p.id, items })
        h.cerrar()
        toast('Recibido. Gracias.', 'ok')
        Local.arrancar()
      } catch (e) { error.textContent = textoError(e); guardar.disabled = false }
    })
  }
}
