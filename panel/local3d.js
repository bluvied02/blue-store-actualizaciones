// Recorre el local en 3D (PRUEBA 06-11-2026). Lo carga tienda.html solo cuando
// alguien entra a "Recorre el local": la tienda normal no baja nada de esto.
//
// El salon copia el local real de la foto que paso el dueño: piso de madera,
// techo oscuro con spots, botellas en la pared izquierda, gondola larga al
// medio con un exhibidor adelante, exhibidor y racks redondos a la derecha,
// la caja, y al fondo la fila de heladeras con el freezer.
//
// Los productos son botellas, latas, bolsas y cajas (una sola pieza 3D por
// forma, repetida: anda en celulares comunes). El frente de cada uno sale de
// una hoja grande ("atlas") con su nombre en el color de la categoria, o su
// foto si tiene. Arrastrar = mirar; tocar el piso = caminar; tocar un
// producto = acercarse y elegirlo (la tienda muestra el boton de agregar).
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js'

const OJO = 1.55
const N = 32 // atlas de 32 x 32 frentes
const CELDA = 64

// Formas: ancho, alto, profundidad (metros).
const FORMAS = {
  botella: [0.085, 0.3, 0.085],
  lata: [0.066, 0.122, 0.066],
  bolsa: [0.15, 0.21, 0.06],
  caja: [0.12, 0.17, 0.05],
  chico: [0.075, 0.075, 0.03],
  pote: [0.11, 0.085, 0.11]
}

const normal = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const azar = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) } return ((h >>> 0) % 1000) / 1000 }

function zonaDe (p) {
  const n = normal(p.categoria + ' ' + p.subrubro)
  if (/helad|congelad|hielo/.test(n)) return 'freezer'
  if (/vino|fernet|aperitiv|vodka|whisk|\bgin\b|licor|trago|espumant|\bron\b|champ|sidra/.test(n)) return 'licores'
  if (/sobre|polvo/.test(n)) return 'almacen'
  if (/gaseos|bebida|agua|soda|energiz|isoton|cerveza|lacte|leche|yogur|jugo/.test(n)) return 'heladeras'
  if (/snack|papas|palito|chizito|mani\b|copetin/.test(n)) return 'snacks'
  if (/galletit|galleta|bizcoch|budin|tostad/.test(n)) return 'galletitas'
  if (/golosin|caramel|chicle|chupet|chupaleta|bombon|chocolat|alfajor|turron|oblea|pastilla/.test(n)) return 'golosinas'
  return 'almacen'
}
function formaDe (p, zona) {
  const n = normal(p.nombre)
  if (zona === 'freezer') return 'pote'
  if (zona === 'licores') return 'botella'
  if (zona === 'heladeras') return /lata|laton|473|354|269|310|energiz|speed|monster/.test(n + normal(p.categoria)) ? 'lata' : 'botella'
  if (zona === 'snacks') return 'bolsa'
  if (zona === 'golosinas') return /alfajor|chocolate|tableta|block/.test(n) ? 'caja' : 'chico'
  return 'caja'
}

function lienzo (w, h, dibujar) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  dibujar(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}
function texturaMadera (base, oscuro, tablas, repetirX, repetirY) {
  const t = lienzo(512, 512, (g, w, h) => {
    const ancho = w / tablas
    for (let i = 0; i < tablas; i++) {
      const v = 0.85 + azar('t' + i + base) * 0.3
      g.fillStyle = `rgb(${base[0] * v | 0},${base[1] * v | 0},${base[2] * v | 0})`
      g.fillRect(i * ancho, 0, ancho, h)
      for (let k = 0; k < 14; k++) { // vetas
        g.strokeStyle = 'rgba(0,0,0,.06)'
        g.beginPath()
        const x = i * ancho + azar(i + 'v' + k + base) * ancho
        g.moveTo(x, 0); g.bezierCurveTo(x + 6, h / 3, x - 6, h * 2 / 3, x + 3, h); g.stroke()
      }
      g.fillStyle = oscuro
      g.fillRect(i * ancho, 0, 2, h)
      const corte = azar(i + 'c' + base) * h
      g.fillRect(i * ancho, corte, ancho, 2)
    }
  })
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repetirX, repetirY)
  return t
}
function cartel (texto, fondo, color) {
  const t = lienzo(512, 128, (g, w, h) => {
    g.fillStyle = fondo; g.fillRect(0, 0, w, h)
    g.fillStyle = color
    g.font = '900 54px system-ui, sans-serif'
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(texto, w / 2, h / 2 + 3, w - 30)
  })
  return new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: t }))
}

export function montar (caja, op) {
  const ancho0 = Math.max(1, caja.clientWidth)
  const alto0 = Math.max(1, caja.clientHeight)
  const render = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  render.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  render.setSize(ancho0, alto0)
  caja.replaceChildren(render.domElement)
  const escena = new THREE.Scene()
  escena.background = new THREE.Color('#2a1d14')
  const camara = new THREE.PerspectiveCamera(68, ancho0 / alto0, 0.05, 60)
  camara.rotation.order = 'YXZ'
  escena.add(new THREE.HemisphereLight('#fff4e0', '#6b4a2e', 1.5))
  const sol = new THREE.DirectionalLight('#fff1d6', 1.1)
  sol.position.set(1, 6, 3)
  escena.add(sol)

  const mat = (c) => new THREE.MeshLambertMaterial({ color: c })
  const negro = mat('#222326')
  const caja3 = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); escena.add(o); return o }

  // ---------- El salon ----------
  const W = 7; const L = 16; const H = 3.7
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshLambertMaterial({ map: texturaMadera([184, 140, 96], 'rgba(60,35,15,.55)', 8, 3, 7) }))
  piso.rotation.x = -Math.PI / 2
  piso.position.set(0, 0, -L / 2)
  escena.add(piso)
  const techo = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshLambertMaterial({ map: texturaMadera([92, 60, 36], 'rgba(20,10,5,.7)', 10, 2, 6) }))
  techo.rotation.x = Math.PI / 2
  techo.position.set(0, H, -L / 2)
  escena.add(techo)
  const pared = mat('#cdb88d')
  caja3(0.1, H, L, pared, -W / 2, H / 2, -L / 2)
  caja3(0.1, H, L, pared, W / 2, H / 2, -L / 2)
  caja3(W, H, 0.1, pared, 0, H / 2, -L)
  // Frente con la puerta de madera.
  const madera = mat('#5a3b22')
  caja3(2.6, H, 0.1, pared, -2.2, H / 2, 0.05)
  caja3(2.6, H, 0.1, pared, 2.2, H / 2, 0.05)
  caja3(1.8, 0.8, 0.1, pared, 0, H - 0.4, 0.05)
  caja3(0.1, 2.9, 0.12, madera, -0.9, 1.45, 0.02)
  caja3(0.1, 2.9, 0.12, madera, 0.9, 1.45, 0.02)
  // Vigas, rieles negros y spots del techo.
  const viga = mat('#3d2716')
  for (let z = -0.8; z > -L; z -= 1.15) caja3(W, 0.16, 0.12, viga, 0, H - 0.08, z)
  const spot = new THREE.MeshBasicMaterial({ color: '#fffbe8' })
  const discoSpot = new THREE.CylinderGeometry(0.07, 0.07, 0.05, 14)
  for (const x of [-1.2, 1.4]) {
    caja3(0.05, 0.05, L - 1, negro, x, H - 0.2, -L / 2)
    for (let z = -1.2; z > -L + 0.5; z -= 1.15) { const s = new THREE.Mesh(discoSpot, spot); s.position.set(x, H - 0.25, z); escena.add(s) }
  }

  // ---------- Muebles ----------
  // Cada nivel es un estante donde se acomodan productos: desde, direccion (a lo
  // largo), largo, altura, frente (hacia donde miran) y profundidad.
  const niveles = {} // zona -> [nivel]
  const sumar = (zona, n) => (niveles[zona] = niveles[zona] || []).push(n)
  const v = (x, y, z) => new THREE.Vector3(x, y, z)

  // Estanteria contra la pared (negra, con borde de luz), mirando hacia +x o -x.
  function estanteria (zona, x, z0, z1, alto, cant, cara) {
    const largo = Math.abs(z1 - z0)
    const zc = (z0 + z1) / 2
    const prof = 0.34
    const xb = x - cara * prof / 2
    caja3(0.03, alto, largo, negro, xb - cara * prof / 2, alto / 2, zc)
    for (const zz of [z0, z1]) caja3(prof, alto, 0.04, negro, xb, alto / 2, zz)
    const paso = (alto - 0.15) / cant
    for (let i = 0; i < cant; i++) {
      const y = 0.12 + i * paso
      caja3(prof, 0.025, largo, negro, xb, y, zc)
      sumar(zona, { desde: v(x - cara * 0.1, y + 0.013, z0 - Math.sign(z1 - z0) * -0.04), dir: v(0, 0, Math.sign(z1 - z0)), largo: largo - 0.08, frente: v(cara, 0, 0), alto: paso - 0.04 })
    }
    const luz = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, largo), new THREE.MeshBasicMaterial({ color: '#fff3c4' }))
    luz.position.set(x - cara * 0.03, alto + 0.02, zc)
    escena.add(luz)
  }
  // Gondola doble del medio.
  function gondola (x, z0, z1, alto, cant) {
    const largo = Math.abs(z1 - z0)
    const zc = (z0 + z1) / 2
    caja3(0.04, alto, largo, negro, x, alto / 2, zc)
    caja3(0.9, 0.1, largo, negro, x, 0.05, zc)
    for (const zz of [z0, z1]) caja3(0.9, alto, 0.04, negro, x, alto / 2, zz)
    const paso = (alto - 0.12) / cant
    for (let i = 0; i < cant; i++) {
      const y = 0.12 + i * paso
      caja3(0.84, 0.025, largo, negro, x, y, zc)
      sumar('gondolaEste', { desde: v(x + 0.3, y + 0.013, z0 - 0.04), dir: v(0, 0, -1), largo: largo - 0.08, frente: v(1, 0, 0), alto: paso - 0.04 })
      sumar('gondolaOeste', { desde: v(x - 0.3, y + 0.013, z1 + 0.04), dir: v(0, 0, 1), largo: largo - 0.08, frente: v(-1, 0, 0), alto: paso - 0.04 })
    }
  }
  // Exhibidor de carton de color (como los de las marcas), mirando a +z.
  function exhibidor (zona, x, z, ancho, alto, cant, color, texto) {
    const m = mat(color)
    caja3(ancho, alto, 0.04, m, x, alto / 2, z - 0.2)
    for (const xx of [x - ancho / 2, x + ancho / 2]) caja3(0.03, alto, 0.42, m, xx, alto / 2, z)
    const paso = (alto - 0.35) / cant
    for (let i = 0; i < cant; i++) {
      const y = 0.08 + i * paso
      caja3(ancho, 0.03, 0.4, m, x, y, z)
      caja3(ancho, 0.07, 0.02, m, x, y + 0.035, z + 0.2)
      sumar(zona, { desde: v(x - ancho / 2 + 0.03, y + 0.015, z + 0.05), dir: v(1, 0, 0), largo: ancho - 0.06, frente: v(0, 0, 1), alto: paso - 0.05 })
    }
    const c = cartel(texto, color, '#fff')
    c.scale.set(ancho / 1.6, ancho / 1.6, 1)
    c.position.set(x, alto - 0.12, z - 0.17)
    escena.add(c)
  }
  // Rack redondo de alambre con varios pisos (golosinas).
  function rack (x, z, alto, pisos) {
    caja3(0.04, alto, 0.04, negro, x, alto / 2, z)
    const alambre = new THREE.MeshLambertMaterial({ color: '#333', wireframe: true })
    for (let i = 0; i < pisos; i++) {
      const y = 0.35 + i * (alto - 0.4) / pisos
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 18, 1, true), alambre)
      d.position.set(x, y + 0.04, z)
      escena.add(d)
      caja3(0.84, 0.01, 0.84, negro, x, y, z).geometry = new THREE.CylinderGeometry(0.42, 0.42, 0.01, 24)
      // Un "estante" circular: se reparte por el borde, mirando hacia afuera.
      sumar('golosinas', { circulo: { x, z, r: 0.3 }, y: y + 0.01, alto: 0.2 })
    }
  }
  // Heladera vertical con puerta de vidrio y luz.
  function heladera (x, z, ancho) {
    const alto = 2.0
    caja3(0.04, alto, 0.7, negro, x - ancho / 2 + 0.02, alto / 2, z - 0.35)
    caja3(0.04, alto, 0.7, negro, x + ancho / 2 - 0.02, alto / 2, z - 0.35)
    caja3(ancho, 0.12, 0.7, negro, x, 0.06, z - 0.35)
    caja3(ancho, 0.2, 0.7, negro, x, alto - 0.1, z - 0.35)
    caja3(ancho, alto, 0.04, negro, x, alto / 2, z - 0.68)
    const fondo = new THREE.Mesh(new THREE.PlaneGeometry(ancho - 0.08, alto - 0.3), new THREE.MeshBasicMaterial({ color: '#dff1ff' }))
    fondo.position.set(x, alto / 2, z - 0.64)
    escena.add(fondo)
    const vidrio = new THREE.Mesh(new THREE.PlaneGeometry(ancho - 0.06, alto - 0.28), new THREE.MeshBasicMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.14, depthWrite: false }))
    vidrio.position.set(x, alto / 2, z + 0.005)
    escena.add(vidrio)
    caja3(ancho, 0.22, 0.04, mat('#1864ab'), x, alto - 0.11, z + 0.01)
    const cant = 5
    for (let i = 0; i < cant; i++) {
      const y = 0.14 + i * 0.35
      caja3(ancho - 0.08, 0.015, 0.6, new THREE.MeshLambertMaterial({ color: '#c9d3dd' }), x, y, z - 0.32)
      sumar('heladeras', { desde: v(x - ancho / 2 + 0.06, y + 0.008, z - 0.12), dir: v(1, 0, 0), largo: ancho - 0.12, frente: v(0, 0, 1), alto: 0.33 })
    }
  }
  // Freezer horizontal (helados), tapa de vidrio.
  function freezer (x, z, largo) {
    const blanco = mat('#f1f3f5')
    caja3(largo, 0.55, 0.7, blanco, x, 0.275, z)
    for (const dz of [-0.34, 0.34]) caja3(largo, 0.32, 0.03, blanco, x, 0.7, z + dz)
    for (const dx of [-largo / 2, largo / 2]) caja3(0.03, 0.32, 0.7, blanco, x + dx, 0.7, z)
    caja3(largo - 0.06, 0.02, 0.64, new THREE.MeshBasicMaterial({ color: '#d0ebff', transparent: true, opacity: 0.35, depthWrite: false }), x, 0.87, z)
    caja3(largo, 0.1, 0.02, mat('#1c7ed6'), x, 0.7, z + 0.36)
    for (let i = 0; i < 4; i++) sumar('freezer', { desde: v(x - largo / 2 + 0.06, 0.56, z - 0.24 + i * 0.16), dir: v(1, 0, 0), largo: largo - 0.12, frente: v(0, 0, 1), alto: 0.2 })
  }

  // Disposicion del local (como la foto).
  estanteria('licores', -W / 2 + 0.36, -1.4, -9.6, 2.4, 7, 1)
  estanteria('almacen', -W / 2 + 0.36, -10.1, -13.3, 2.2, 6, 1)
  gondola(0.3, -3.2, -11.8, 1.55, 4)
  exhibidor('snacks', 0.3, -2.55, 0.72, 1.75, 4, '#f2c418', 'SNACKS')
  exhibidor('galletitas', 2.0, -3.9, 0.62, 1.6, 5, '#d6262e', 'GALLETITAS')
  rack(2.95, -2.6, 1.55, 4)
  rack(2.95, -4.7, 1.55, 4)
  // La caja: mostrador negro con el monitor.
  caja3(0.7, 1.0, 3.2, negro, 2.85, 0.5, -7.0)
  caja3(0.75, 0.04, 3.25, mat('#3b2a1e'), 2.85, 1.02, -7.0)
  caja3(0.35, 0.25, 0.04, mat('#111'), 2.75, 1.25, -6.2).rotation.y = -Math.PI / 2
  for (let z = -5.6; z > -8.6; z -= 1.4) caja3(0.04, 0.55, 1.1, negro, W / 2 - 0.08, 1.75, z)
  for (let i = 0; i < 5; i++) heladera(-1.7 + i * 0.84, -15.2, 0.8)
  freezer(-2.6, -14.5, 1.3)

  // Carteles colgantes de cada zona.
  const colgar = (texto, x, y, z, rot) => {
    const c = cartel(texto, '#1d1d1f', '#ffd43b')
    c.position.set(x, y, z)
    c.rotation.y = rot || 0
    escena.add(c)
    for (const dx of [-0.7, 0.7]) caja3(0.01, H - y - 0.2, 0.01, negro, x + Math.cos(rot || 0) * dx, (H + y + 0.2) / 2, z - Math.sin(rot || 0) * dx)
  }
  colgar('HELADOS', -2.5, 2.3, -14.3)
  colgar('LICORES Y VINOS', -2.6, 2.75, -5.5, Math.PI / 2)
  colgar('GOLOSINAS', 2.6, 2.55, -3.6, -Math.PI / 2)
  colgar('CAJA', 2.4, 2.55, -7.0, -Math.PI / 2)
  colgar('ALMACÉN', -2.6, 2.6, -11.7, Math.PI / 2)
  // El nombre de la tienda arriba de las heladeras.
  const nombre = cartel(String(op.nombre || 'Bienvenidos').toUpperCase(), '#0b4fd6', '#fff')
  nombre.scale.set(1.5, 1.5, 1)
  nombre.position.set(0.3, 2.95, -15.9)
  escena.add(nombre)
  if (op.logo) {
    new THREE.TextureLoader().load(op.logo, (t) => {
      t.colorSpace = THREE.SRGBColorSpace
      const logo = new THREE.Mesh(new THREE.CircleGeometry(0.42, 40), new THREE.MeshBasicMaterial({ map: t }))
      logo.position.set(-2.4, 2.95, -15.9)
      escena.add(logo)
      pedir()
    })
  }

  // ---------- Los productos ----------
  const porZona = {}
  for (const p of op.productos) (porZona[zonaDe(p)] = porZona[zonaDe(p)] || []).push(p)
  // Donde va cada zona (si no entra, sigue en el siguiente mueble).
  const destinos = {
    heladeras: ['heladeras', 'gondolaOeste'],
    licores: ['licores', 'almacen'],
    freezer: ['freezer'],
    snacks: ['snacks', 'gondolaEste'],
    galletitas: ['galletitas', 'gondolaEste'],
    golosinas: ['golosinas', 'gondolaEste', 'gondolaOeste'],
    almacen: ['gondolaOeste', 'almacen', 'gondolaEste']
  }
  const puestos = [] // {p, forma, pos, frente}
  const usado = {}
  const cursor = {} // mueble -> { nivel, t, puestos }
  function acomodar (mueble, lista, repetir) {
    const nivs = niveles[mueble] || []
    const cu = cursor[mueble] = cursor[mueble] || { nivel: 0, t: 0, lista: [] }
    let i = 0
    const total = lista.length
    if (!total) return []
    const sobran = []
    for (; cu.nivel < nivs.length; cu.nivel++, cu.t = 0) {
      const n = nivs[cu.nivel]
      if (n.circulo) {
        const forma = formaDe(lista[i % total], zonaDe(lista[i % total]))
        const cant = Math.floor((2 * Math.PI * n.circulo.r) / (FORMAS[forma][0] + 0.02))
        for (let k = 0; k < cant; k++) {
          if (i >= total && !repetir) break
          const p = lista[i % total]
          const a = (k / cant) * Math.PI * 2
          puestos.push({ p, forma: formaDe(p, zonaDe(p)), pos: v(n.circulo.x + Math.cos(a) * n.circulo.r, n.y, n.circulo.z + Math.sin(a) * n.circulo.r), frente: v(Math.cos(a), 0, Math.sin(a)) })
          cu.lista.push(p)
          i++
        }
        if (i >= total && !repetir) { cu.nivel++; break }
        continue
      }
      let t = cu.t
      let saltos = 0
      while (t < n.largo && saltos <= total) {
        if (i >= total && !repetir) break
        const p = lista[i % total]
        const forma = formaDe(p, zonaDe(p))
        const [w, h] = FORMAS[forma]
        if (h > n.alto && forma !== 'botella') { i++; saltos++; continue }
        saltos = 0
        if (t + w > n.largo) break
        // Frentes: los mas vendidos ocupan 2 lugares (como en el local).
        const frentes = i < total && p.rank && p.rank <= 15 ? 2 : 1
        for (let f = 0; f < frentes && t + w <= n.largo; f++) {
          puestos.push({ p, forma, pos: n.desde.clone().addScaledVector(n.dir, t + w / 2), frente: n.frente })
          t += w + 0.012
        }
        cu.lista.push(p)
        i++
      }
      cu.t = t
      if (i >= total && !repetir) break
    }
    for (let k = i; k < total; k++) sobran.push(lista[k])
    return sobran
  }
  for (const [zona, lista] of Object.entries(porZona)) {
    let resto = lista
    for (const m of destinos[zona]) {
      if (!resto.length) break
      if (usado[m]) continue
      const ultimo = m === destinos[zona][destinos[zona].length - 1]
      const queda = acomodar(m, resto, false)
      if (queda.length < resto.length) usado[m] = true
      resto = queda
      if (ultimo) break
    }
  }
  // Lo que sobra de cada mueble se completa con los mismos productos (mas frentes,
  // como en el local); los vacios, con lo que mas se vende.
  const top = op.productos.filter((p) => p.rank).sort((a, b) => a.rank - b.rank)
  for (const m of Object.keys(niveles)) {
    const ya = cursor[m] && cursor[m].lista.length ? [...new Set(cursor[m].lista)] : top.filter((p) => destinos[zonaDe(p)].includes(m)).concat(top).slice(0, 40)
    if (ya.length) acomodar(m, ya, true)
  }

  // Atlas con el frente de cada producto distinto.
  const celdaDe = new Map()
  const atlas = document.createElement('canvas')
  atlas.width = atlas.height = N * CELDA
  const g = atlas.getContext('2d')
  const texAtlas = new THREE.CanvasTexture(atlas)
  texAtlas.colorSpace = THREE.SRGBColorSpace
  texAtlas.anisotropy = 4
  texAtlas.generateMipmaps = true
  let atlasSucio = false
  const colorDe = (p) => {
    const c = new THREE.Color(op.color(p.categoria))
    const hsl = {}
    c.getHSL(hsl)
    c.setHSL((hsl.h + (azar(p.id) - 0.5) * 0.12 + 1) % 1, Math.min(1, hsl.s * (0.75 + azar(p.id + 's') * 0.4)), Math.min(0.62, Math.max(0.28, hsl.l + (azar(p.id + 'l') - 0.5) * 0.25)))
    return c
  }
  function dibujarFrente (p, celda) {
    const x = (celda % N) * CELDA
    const y = Math.floor(celda / N) * CELDA
    const c = colorDe(p)
    g.fillStyle = '#' + c.getHexString()
    g.fillRect(x, y, CELDA, CELDA)
    g.fillStyle = 'rgba(255,255,255,.92)'
    g.fillRect(x + 4, y + 18, CELDA - 8, 30)
    const palabras = String(p.nombre).toUpperCase().split(/\s+/)
    g.fillStyle = '#111'
    g.textAlign = 'center'
    g.font = '900 11px system-ui, sans-serif'
    g.fillText((palabras[1] || palabras[0]).slice(0, 10), x + CELDA / 2, y + 30, CELDA - 10)
    g.font = '700 8px system-ui, sans-serif'
    g.fillText(palabras.slice(2, 5).join(' ').slice(0, 14), x + CELDA / 2, y + 42, CELDA - 10)
    g.fillStyle = 'rgba(255,255,255,.85)'
    g.font = '800 8px system-ui, sans-serif'
    g.fillText((palabras[0] || '').slice(0, 12), x + CELDA / 2, y + 12, CELDA - 6)
    if (p.foto) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        g.fillStyle = '#fff'
        g.fillRect(x, y, CELDA, CELDA)
        const k = Math.min(CELDA / img.width, CELDA / img.height)
        g.drawImage(img, x + (CELDA - img.width * k) / 2, y + (CELDA - img.height * k) / 2, img.width * k, img.height * k)
        atlasSucio = true
      }
      img.src = p.foto
    }
  }
  for (const pu of puestos) {
    if (celdaDe.has(pu.p.id)) continue
    const celda = celdaDe.size % (N * N)
    celdaDe.set(pu.p.id, celda)
    dibujarFrente(pu.p, celda)
  }
  texAtlas.needsUpdate = true

  // Geometrias base (con la base en el piso del estante).
  const geos = {}
  const perfil = [[0, 0], [0.5, 0], [0.5, 0.6], [0.44, 0.68], [0.2, 0.8], [0.17, 0.94], [0.19, 0.97], [0.19, 1], [0, 1]].map(([r, y]) => new THREE.Vector2(r, y))
  geos.botella = new THREE.LatheGeometry(perfil, 16)
  geos.lata = new THREE.CylinderGeometry(0.5, 0.5, 1, 16).translate(0, 0.5, 0)
  geos.pote = new THREE.CylinderGeometry(0.5, 0.42, 1, 16).translate(0, 0.5, 0)
  for (const k of ['bolsa', 'caja', 'chico']) geos[k] = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
  // Donde va la etiqueta en cada forma: [ancho, alto, altura del centro, adelante] (en proporcion).
  const ETIQUETA = { botella: [0.85, 0.32, 0.36, 0.51], lata: [0.9, 0.75, 0.5, 0.51], pote: [0.8, 0.7, 0.5, 0.48], bolsa: [0.96, 0.96, 0.5, 0.51], caja: [0.96, 0.96, 0.5, 0.51], chico: [0.96, 0.96, 0.5, 0.51] }

  const cuerpos = {} // forma -> InstancedMesh
  const deInstancia = {} // forma -> [puesto]
  const celdas = new Float32Array(Math.max(1, puestos.length))
  const matEtiqueta = new THREE.MeshBasicMaterial({ map: texAtlas })
  matEtiqueta.onBeforeCompile = (s) => {
    s.vertexShader = 'attribute float celda;\n' + s.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      vMapUv = vec2((uv.x + mod(celda, ${N}.0)) / ${N}.0, (uv.y + (${N}.0 - 1.0 - floor(celda / ${N}.0))) / ${N}.0);`)
  }
  const etiquetas = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), matEtiqueta, Math.max(1, puestos.length))
  const precios = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.028, 0.006), new THREE.MeshBasicMaterial(), Math.max(1, puestos.length))
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const arriba = v(0, 1, 0)
  let ie = 0
  for (const forma of Object.keys(FORMAS)) {
    const lista = puestos.filter((x) => x.forma === forma)
    if (!lista.length) continue
    const malla = new THREE.InstancedMesh(geos[forma], new THREE.MeshLambertMaterial({ color: '#ffffff' }), lista.length)
    deInstancia[forma] = lista
    const [w, h, d] = FORMAS[forma]
    const [ew, eh, ey, ez] = ETIQUETA[forma]
    lista.forEach((pu, k) => {
      const giro = Math.atan2(pu.frente.x, pu.frente.z) + (azar(pu.p.id + k) - 0.5) * 0.08
      q.setFromAxisAngle(arriba, giro)
      const esc = 0.96 + azar(pu.p.id) * 0.08
      m4.compose(pu.pos, q, v(w * esc, h * esc, d * esc))
      malla.setMatrixAt(k, m4)
      malla.setColorAt(k, forma === 'botella' && zonaDe(pu.p) === 'licores' ? colorDe(pu.p).multiplyScalar(0.55) : colorDe(pu.p))
      pu.giro = giro
      pu.alto = h * esc
      // Etiqueta al frente.
      const adelante = v(Math.sin(giro), 0, Math.cos(giro))
      const pos = pu.pos.clone().addScaledVector(adelante, d * esc * ez + 0.001)
      pos.y += h * esc * ey
      m4.compose(pos, q, v(w * esc * ew, h * esc * eh, 1))
      etiquetas.setMatrixAt(ie, m4)
      celdas[ie] = celdaDe.get(pu.p.id)
      // Precio en el borde del estante (rojo si tiene promo).
      const pp = pu.pos.clone().addScaledVector(pu.frente, d / 2 + 0.015)
      pp.y -= 0.012
      m4.compose(pp, q, v(1, 1, 1))
      precios.setMatrixAt(ie, m4)
      precios.setColorAt(ie, new THREE.Color(pu.p.promo ? '#e0262f' : '#ffd43b'))
      ie++
    })
    malla.instanceMatrix.needsUpdate = true
    if (malla.instanceColor) malla.instanceColor.needsUpdate = true
    cuerpos[forma] = malla
    escena.add(malla)
  }
  etiquetas.geometry.setAttribute('celda', new THREE.InstancedBufferAttribute(celdas, 1))
  etiquetas.count = ie
  precios.count = ie
  escena.add(etiquetas, precios)

  // Flecha amarilla arriba del elegido.
  const flecha = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 12), new THREE.MeshBasicMaterial({ color: '#ffd43b' }))
  flecha.rotation.x = Math.PI
  flecha.visible = false
  escena.add(flecha)

  // ---------- Camara: mirar, caminar, acercarse ----------
  const yo = { x: -1.0, z: -0.8, yaw: 0.06, pitch: 0.02 }
  const libre = (x, z) => {
    x = Math.max(-2.55, Math.min(2.3, x))
    z = Math.max(-14.4, Math.min(-0.6, z))
    const bloques = [[-0.5, 1.1, -12.2, -2.1], [2.2, 3.5, -8.9, -5.1], [2.35, 3.5, -5.3, -2.0], [1.55, 2.45, -4.35, -3.4], [-3.5, -1.75, -15, -13.95]]
    for (const [x0, x1, z0, z1] of bloques) {
      if (x > x0 && x < x1 && z > z0 && z < z1) {
        const op2 = [[x0 - 0.01, z, x - x0], [x1 + 0.01, z, x1 - x], [x, z0 - 0.01, z - z0], [x, z1 + 0.01, z1 - z]].sort((a, b) => a[2] - b[2])[0]
        x = op2[0]; z = op2[1]
      }
    }
    return [x, z]
  }
  let anim = null
  const ir = (dest, dur) => {
    const desde = { ...yo }
    let dy = dest.yaw - desde.yaw
    dy = Math.atan2(Math.sin(dy), Math.cos(dy))
    anim = { desde, hasta: { ...dest, yaw: desde.yaw + dy }, t0: performance.now(), dur: dur || 900 }
    pedir()
  }
  const mirarA = (x, z, px, py, pz) => ({ yaw: Math.atan2(-(px - x), -(pz - z)), pitch: Math.max(-0.7, Math.min(0.5, Math.atan2(py - OJO, Math.hypot(px - x, pz - z)))) })

  const ESTACIONES = [
    { id: 'entrada', nombre: '🚪 Entrada', x: -1.0, z: -0.8, yaw: 0.06, pitch: 0.02 },
    { id: 'licores', nombre: '🍷 Licores', x: -1.4, z: -5.2, yaw: Math.PI / 2, pitch: -0.05 },
    { id: 'snacks', nombre: '🍟 Snacks', x: 1.65, z: -6.5, yaw: Math.PI / 2, pitch: -0.25 },
    { id: 'golosinas', nombre: '🍬 Golosinas', x: 1.8, z: -1.4, yaw: -0.36, pitch: -0.25 },
    { id: 'almacen', nombre: '🥫 Almacén', x: -1.2, z: -8.5, yaw: -Math.PI / 2, pitch: -0.25 },
    { id: 'heladeras', nombre: '🥤 Heladeras', x: 0.3, z: -12.9, yaw: 0, pitch: -0.12 },
    { id: 'helados', nombre: '🍦 Helados', x: -1.5, z: -12.9, yaw: 0.6, pitch: -0.55 },
    { id: 'caja', nombre: '🧾 Caja', x: 1.4, z: -7, yaw: -Math.PI / 2, pitch: -0.1 }
  ]

  // ---------- Tocar, arrastrar ----------
  const lienzoGL = render.domElement
  lienzoGL.style.touchAction = 'none'
  const ray = new THREE.Raycaster()
  const punto = new THREE.Vector2()
  let toque = null
  let elegido = null
  const pos = (ev) => { const r = lienzoGL.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top, r] }
  const alBajar = (ev) => { const [x, y] = pos(ev); toque = { x, y, x0: x, y0: y, movio: false, id: ev.pointerId }; lienzoGL.setPointerCapture(ev.pointerId); op.alTocar && op.alTocar() }
  const alMover = (ev) => {
    if (!toque || ev.pointerId !== toque.id) return
    const [x, y] = pos(ev)
    if (Math.hypot(x - toque.x0, y - toque.y0) > 7) toque.movio = true
    if (toque.movio) {
      anim = null
      yo.yaw += (x - toque.x) * 0.0055
      yo.pitch = Math.max(-0.8, Math.min(0.55, yo.pitch + (y - toque.y) * 0.004))
      pedir()
    }
    toque.x = x; toque.y = y
  }
  const alSoltar = (ev) => {
    if (!toque || ev.pointerId !== toque.id) return
    const t = toque
    toque = null
    if (t.movio) return
    const [x, y, r] = pos(ev)
    punto.set((x / r.width) * 2 - 1, -(y / r.height) * 2 + 1)
    ray.setFromCamera(punto, camara)
    const golpes = ray.intersectObjects(Object.values(cuerpos), false)
    if (golpes.length && golpes[0].distance < 7) {
      const gol = golpes[0]
      const forma = Object.keys(cuerpos).find((f) => cuerpos[f] === gol.object)
      elegir(deInstancia[forma][gol.instanceId])
      return
    }
    const enPiso = ray.intersectObject(piso)[0]
    if (enPiso) {
      const [nx, nz] = libre(enPiso.point.x, enPiso.point.z)
      ir({ x: nx, z: nz, yaw: yo.yaw, pitch: Math.max(yo.pitch, -0.15) }, Math.min(1600, 350 + Math.hypot(nx - yo.x, nz - yo.z) * 220))
    }
  }
  function elegir (pu) {
    elegido = pu
    flecha.visible = true
    flecha.position.copy(pu.pos)
    flecha.position.y += pu.alto + 0.12
    // Acercarse: pararse adelante del producto, mirandolo.
    const parado = pu.pos.clone().addScaledVector(pu.frente, pu.frente.y ? 0 : 0.95)
    if (zonaDe(pu.p) === 'freezer') parado.set(pu.pos.x + 0.2, 0, pu.pos.z + 1.0)
    const [x, z] = libre(parado.x, parado.z)
    ir({ x, z, ...mirarA(x, z, pu.pos.x, pu.pos.y + pu.alto / 2, pu.pos.z) }, 800)
    op.alElegir && op.alElegir(pu.p)
  }
  const alRueda = (ev) => {
    ev.preventDefault()
    const paso = -Math.sign(ev.deltaY) * 0.5
    const [x, z] = libre(yo.x - Math.sin(yo.yaw) * paso, yo.z - Math.cos(yo.yaw) * paso)
    ir({ x, z, yaw: yo.yaw, pitch: yo.pitch }, 250)
  }
  const alTecla = (ev) => {
    if (ev.target && /input|textarea|select/i.test(ev.target.tagName)) return
    const k = ev.key
    if (k === 'ArrowLeft') { yo.yaw += 0.15; pedir() } else if (k === 'ArrowRight') { yo.yaw -= 0.15; pedir() } else if (k === 'ArrowUp' || k === 'ArrowDown') {
      const paso = k === 'ArrowUp' ? 0.6 : -0.6
      const [x, z] = libre(yo.x - Math.sin(yo.yaw) * paso, yo.z - Math.cos(yo.yaw) * paso)
      ir({ x, z, yaw: yo.yaw, pitch: yo.pitch }, 250)
    } else return
    ev.preventDefault()
  }
  lienzoGL.addEventListener('pointerdown', alBajar)
  lienzoGL.addEventListener('pointermove', alMover)
  lienzoGL.addEventListener('pointerup', alSoltar)
  lienzoGL.addEventListener('pointercancel', () => { toque = null })
  lienzoGL.addEventListener('wheel', alRueda, { passive: false })
  window.addEventListener('keydown', alTecla)

  // ---------- Dibujar (solo cuando algo cambia) ----------
  let pendiente = false
  let vivo = true
  let atlasT = 0
  function pedir () { if (!pendiente && vivo) { pendiente = true; requestAnimationFrame(cuadro) } }
  function cuadro (ahora) {
    pendiente = false
    if (!vivo) return
    let seguir = false
    if (anim) {
      const t = Math.min(1, (ahora - anim.t0) / anim.dur)
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      for (const k of ['x', 'z', 'yaw', 'pitch']) yo[k] = anim.desde[k] + (anim.hasta[k] - anim.desde[k]) * e
      if (t >= 1) anim = null
      else seguir = true
    }
    if (flecha.visible) {
      flecha.position.y = elegido.pos.y + elegido.alto + 0.12 + Math.sin(ahora / 220) * 0.025
      seguir = true
    }
    if (atlasSucio && ahora - atlasT > 400) { texAtlas.needsUpdate = true; atlasSucio = false; atlasT = ahora; seguir = true }
    if (atlasSucio) seguir = true
    camara.position.set(yo.x, OJO, yo.z)
    camara.rotation.set(yo.pitch, yo.yaw, 0)
    render.render(escena, camara)
    if (seguir && !document.hidden) pedir()
  }
  const ro = new ResizeObserver(() => {
    const w = caja.clientWidth; const h = caja.clientHeight
    if (!w || !h) return
    render.setSize(w, h)
    camara.aspect = w / h
    camara.updateProjectionMatrix()
    pedir()
  })
  ro.observe(caja)
  pedir()

  return {
    estaciones: ESTACIONES.map(({ id, nombre }) => ({ id, nombre })),
    irA (id) { const e = ESTACIONES.find((x) => x.id === id); if (e) ir(e, 1100) },
    soltar () { elegido = null; flecha.visible = false; pedir() },
    cerrar () {
      vivo = false
      ro.disconnect()
      window.removeEventListener('keydown', alTecla)
      escena.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
        for (const m of ms) { if (m.map) m.map.dispose(); m.dispose() }
      })
      render.dispose()
      render.forceContextLoss()
    }
  }
}
