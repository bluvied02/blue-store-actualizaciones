'use strict'
// EL LECTOR DE CODIGOS CON LA CAMARA
//
// Sin sacar foto: la camara queda abierta y el codigo se lee solo, en cuanto
// entra en el recuadro. Vibra, suena y muestra el codigo leido.
//
// Dos motores, el que haya:
//   - El lector que trae el navegador (BarcodeDetector: Chrome en Android).
//   - ZXing (se baja la primera vez que se usa): Safari en iPhone, que no trae
//     lector propio.
// Formatos: EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39, ITF y Codabar: los
// de los productos de un almacen y los internos de los proveedores.
//
// Si no hay camara o no hay permiso, se escribe el codigo a mano abajo.

const FORMATOS_NATIVOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'codabar']
const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js'
let zxingCargando = null

function cargarZXing () {
  if (window.ZXing) return Promise.resolve(window.ZXing)
  if (!zxingCargando) {
    zxingCargando = new Promise((ok, mal) => {
      const s = document.createElement('script')
      s.src = ZXING_URL
      s.onload = () => ok(window.ZXing)
      s.onerror = () => { zxingCargando = null; mal(new Error('No se pudo cargar el lector (¿sin internet?).')) }
      document.head.append(s)
    })
  }
  return zxingCargando
}

// Un "bip" cortito al leer. El audio se prepara en el toque que abre la camara
// (en el iPhone no puede sonar nada que no empiece con un toque).
function prepararPitido () {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (Ctx && !S.audio) S.audio = new Ctx()
    if (S.audio && S.audio.state === 'suspended') S.audio.resume()
  } catch (e) { /* sin sonido */ }
}
function pitido () {
  try {
    const a = S.audio
    if (!a) return
    const o = a.createOscillator()
    const g = a.createGain()
    o.frequency.value = 1650
    g.gain.value = 0.07
    o.connect(g)
    g.connect(a.destination)
    o.start()
    o.stop(a.currentTime + 0.07)
  } catch (e) { /* sin sonido */ }
}

// Abre la camara y devuelve el codigo leido, o null si se cierra.
async function leerCodigo (opciones = {}) {
  prepararPitido()
  await esperarAtras()
  return new Promise((resolver) => {
    let terminado = false
    let stream = null
    let lectorZX = null
    let reloj = null
    const video = el('video', { muted: true, autoplay: true })
    video.setAttribute('playsinline', '')
    video.setAttribute('webkit-playsinline', '')
    const marco = el('div', { clase: 'marco' })
    const texto = el('div', { clase: 'texto-lector' }, opciones.texto || 'Apuntá al código de barras')
    const manual = el('input', { type: 'text', inputmode: 'numeric', placeholder: 'O escribí el código', enterkeyhint: 'search', autocomplete: 'off' })
    const linterna = el('button', { 'aria-label': 'Linterna', estilo: { visibility: 'hidden' } }, icono('linterna'))

    const terminar = (codigo, porAtras) => {
      if (terminado) return
      terminado = true
      clearTimeout(reloj)
      try { if (lectorZX) lectorZX.reset() } catch (e) {}
      if (stream) stream.getTracks().forEach((t) => t.stop())
      caja.remove()
      S.cerrarLector = null
      if (!porAtras) { S.ignorarPop++; history.back() }
      resolver(codigo || null)
    }
    const leido = (codigo) => {
      if (terminado) return
      const c = String(codigo || '').trim()
      if (!c) return
      vibrar(70)
      pitido()
      marco.classList.add('ok')
      poner(texto, el('span', { clase: 'codigo-leido' }, c))
      setTimeout(() => terminar(c), 260)
    }
    const buscarManual = () => { if (manual.value.trim()) leido(manual.value.trim()) }
    manual.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); buscarManual() } })

    const caja = el('div', { clase: 'lector', role: 'dialog', 'aria-label': 'Lector de códigos' },
      video, marco,
      el('div', { clase: 'arriba-lector' },
        el('button', { 'aria-label': 'Cerrar', onclick: () => terminar(null) }, icono('cerrar')),
        el('b', {}, opciones.titulo || 'Escanear'),
        linterna),
      texto,
      el('div', { clase: 'abajo-lector' },
        el('div', { estilo: { display: 'flex', gap: '8px' } }, manual, el('button', { clase: 'btn primario', onclick: buscarManual }, 'Buscar'))))
    document.body.append(caja)
    history.pushState({ lector: true }, '', location.hash)
    S.cerrarLector = () => terminar(null, true)

    ;(async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        poner(texto, 'Este navegador no deja usar la cámara. Escribí el código abajo.')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      } catch (err) {
        poner(texto, err && err.name === 'NotAllowedError'
          ? 'No hay permiso para la cámara. En el iPhone: Ajustes → Safari → Cámara → Permitir. O escribí el código abajo.'
          : 'No se pudo abrir la cámara. Escribí el código abajo.')
        return
      }
      if (terminado) { stream.getTracks().forEach((t) => t.stop()); return }
      video.srcObject = stream
      try { await video.play() } catch (e) { /* ya arranca solo */ }

      // La linterna, si el celular la deja prender desde la pagina.
      try {
        const pista = stream.getVideoTracks()[0]
        const cap = pista && pista.getCapabilities ? pista.getCapabilities() : {}
        if (cap.torch) {
          let prendida = false
          linterna.style.visibility = 'visible'
          linterna.onclick = async () => { prendida = !prendida; try { await pista.applyConstraints({ advanced: [{ torch: prendida }] }) } catch (e) {} }
        }
      } catch (e) { /* sin linterna */ }

      // 1. El lector del navegador.
      let detector = null
      if ('BarcodeDetector' in window) {
        try {
          const soportados = await window.BarcodeDetector.getSupportedFormats()
          const formats = FORMATOS_NATIVOS.filter((f) => soportados.includes(f))
          if (formats.length) detector = new window.BarcodeDetector({ formats })
        } catch (e) { detector = null }
      }
      if (detector) {
        const mirar = async () => {
          if (terminado) return
          try {
            if (video.readyState >= 2) {
              const encontrados = await detector.detect(video)
              const c = encontrados.find((x) => x.rawValue)
              if (c) return leido(c.rawValue)
            }
          } catch (e) { /* cuadro sin codigo */ }
          reloj = setTimeout(mirar, 110)
        }
        mirar()
        return
      }

      // 2. ZXing.
      try {
        const ZX = await cargarZXing()
        if (terminado) return
        const hints = new Map()
        const F = ZX.BarcodeFormat
        hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF, F.CODABAR])
        hints.set(ZX.DecodeHintType.TRY_HARDER, true)
        lectorZX = new ZX.BrowserMultiFormatReader(hints, 120)
        lectorZX.decodeFromStream(stream, video, (resultado) => { if (resultado && !terminado) leido(resultado.getText()) })
      } catch (err) {
        poner(texto, (err.message || 'No se pudo usar el lector.') + ' Escribí el código abajo.')
      }
    })()
  })
}
