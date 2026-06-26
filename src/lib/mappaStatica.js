import { CPC_META } from './constants'

// ----------------------------------------------------------------------------
// Immagine statica della zona per il verbale: tasselli satellitari (Esri World
// Imagery) cuciti su canvas + poligono dell'area + esemplari con etichetta del
// codice posizionata evitando le sovrapposizioni. Lo zoom è il più ravvicinato
// possibile che contenga tutti gli esemplari. Ritorna un dataURL JPEG, o null
// se i tasselli non sono utilizzabili (CORS): in tal caso si tenta lo sfondo
// stradale, e se anche quello fallisce il verbale esce senza mappa.
// ----------------------------------------------------------------------------

const TILE = 256
const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z
const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const etichettaDi = (a) => (a.codice || '').split('-').pop() || ''

function caricaImg(src) {
  return new Promise((res) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => res(img)
    img.onerror = () => res(null)
    img.src = src
  })
}

function pill(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

async function disegna(punti, alberi, { budgetW, budgetH, padding, satellite }) {
  const conCoord = alberi.filter((a) => a.lat != null && a.lng != null)
  const lats = [...punti.map((p) => p[0]), ...conCoord.map((a) => a.lat)]
  const lngs = [...punti.map((p) => p[1]), ...conCoord.map((a) => a.lng)]
  let minLat = Math.min(...lats), maxLat = Math.max(...lats)
  let minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const dLat = maxLat - minLat || 0.0008
  const dLng = maxLng - minLng || 0.0008
  minLat -= dLat * padding; maxLat += dLat * padding
  minLng -= dLng * padding; maxLng += dLng * padding

  // zoom MASSIMO in cui l'intera area rientra nel budget di pixel disponibile
  const zMax = satellite ? 19 : 18
  let z = zMax
  for (; z >= 2; z--) {
    const w = (lon2x(maxLng, z) - lon2x(minLng, z)) * TILE
    const h = (lat2y(minLat, z) - lat2y(maxLat, z)) * TILE
    if (w <= budgetW && h <= budgetH) break
  }

  // canvas ritagliato ESATTAMENTE sull'area (niente bande vuote): l'area riempie
  const left = lon2x(minLng, z) * TILE
  const top = lat2y(maxLat, z) * TILE
  const larghezza = Math.max(64, Math.round((lon2x(maxLng, z) - lon2x(minLng, z)) * TILE))
  const altezza = Math.max(64, Math.round((lat2y(minLat, z) - lat2y(maxLat, z)) * TILE))

  const canvas = document.createElement('canvas')
  canvas.width = larghezza
  canvas.height = altezza
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#0b1f2a'
  ctx.fillRect(0, 0, larghezza, altezza)

  const n = 2 ** z
  const tileUrl = satellite
    ? (zz, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zz}/${y}/${x}`
    : (zz, x, y) => `https://tile.openstreetmap.org/${zz}/${x}/${y}.png`

  const promesse = []
  for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + larghezza) / TILE); tx++) {
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + altezza) / TILE); ty++) {
      if (ty < 0 || ty >= n) continue
      const wx = ((tx % n) + n) % n
      promesse.push(
        caricaImg(tileUrl(z, wx, ty)).then((img) => {
          if (img) ctx.drawImage(img, tx * TILE - left, ty * TILE - top)
        })
      )
    }
  }
  await Promise.all(promesse)

  const toPx = (lat, lng) => [lon2x(lng, z) * TILE - left, lat2y(lat, z) * TILE - top]

  // poligono della zona
  ctx.beginPath()
  punti.forEach((p, i) => {
    const [x, y] = toPx(p[0], p[1])
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
  })
  ctx.closePath()
  ctx.fillStyle = 'rgba(255,255,255,0.10)'
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = '#facc15'
  ctx.stroke()

  // esemplari: pallino colore CPC
  const punteggiati = conCoord.map((a) => {
    const [x, y] = toPx(a.lat, a.lng)
    return { a, x, y }
  })
  for (const m of punteggiati) {
    const [r, g, b] = hex((CPC_META[m.a.cpc] || CPC_META.A).color)
    ctx.beginPath()
    ctx.arc(m.x, m.y, 5, 0, 2 * Math.PI)
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fill()
    ctx.lineWidth = 1.6
    ctx.strokeStyle = '#ffffff'
    ctx.stroke()
  }

  // etichette: posizionate evitando sovrapposizioni fra loro
  ctx.font = 'bold 11px sans-serif'
  ctx.textBaseline = 'middle'
  const piazzate = []
  const collide = (r) =>
    piazzate.some((p) => !(r.x + r.w < p.x || r.x > p.x + p.w || r.y + r.h < p.y || r.y > p.y + p.h))
  const padX = 3.5
  const h = 14
  for (const m of punteggiati) {
    const txt = etichettaDi(m.a)
    if (!txt) continue
    const w = ctx.measureText(txt).width + padX * 2
    const candidati = [
      { x: m.x + 8, y: m.y - h / 2 },
      { x: m.x - 8 - w, y: m.y - h / 2 },
      { x: m.x - w / 2, y: m.y - 9 - h },
      { x: m.x - w / 2, y: m.y + 9 },
    ]
    const scelto = candidati.find((c) => {
      const r = { x: c.x, y: c.y, w, h }
      return r.x >= 1 && r.y >= 1 && r.x + w <= larghezza - 1 && r.y + h <= altezza - 1 && !collide(r)
    })
    if (!scelto) continue // nessun posto libero: si salta per non sovrapporre
    const r = { x: scelto.x, y: scelto.y, w, h }
    piazzate.push(r)
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    pill(ctx, r.x, r.y, w, h, 3)
    ctx.fill()
    ctx.fillStyle = '#111827'
    ctx.fillText(txt, r.x + padX, r.y + h / 2 + 0.5)
  }

  // attribuzione
  ctx.font = '11px sans-serif'
  ctx.textBaseline = 'alphabetic'
  const attr = satellite ? '© Esri, Maxar — World Imagery' : '© OpenStreetMap'
  const tw = ctx.measureText(attr).width
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(larghezza - tw - 8, altezza - 16, tw + 8, 16)
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fillText(attr, larghezza - tw - 4, altezza - 4)

  try {
    return { url: canvas.toDataURL('image/jpeg', 0.92), w: larghezza, h: altezza }
  } catch {
    return null
  }
}

export async function mappaZonaDataURL(punti, alberi = [], { budgetW = 900, budgetH = 620, padding = 0.1 } = {}) {
  if (!punti || punti.length < 3) return null
  const sat = await disegna(punti, alberi, { budgetW, budgetH, padding, satellite: true })
  if (sat) return sat
  return disegna(punti, alberi, { budgetW, budgetH, padding, satellite: false })
}
