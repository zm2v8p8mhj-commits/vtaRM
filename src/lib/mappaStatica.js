import { CPC_META } from './constants'

// ----------------------------------------------------------------------------
// Genera un'immagine statica della zona per il report: tasselli OpenStreetMap
// cuciti su canvas + poligono dell'area + pallini degli alberi (colore CPC).
// Tutto lato client, senza API esterne. Ritorna un dataURL JPEG, o null se i
// tasselli non sono caricabili (in quel caso il report omette la mappa).
// ----------------------------------------------------------------------------

const TILE = 256
const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z
const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

function caricaImg(src) {
  return new Promise((res) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => res(img)
    img.onerror = () => res(null)
    img.src = src
  })
}

export async function mappaZonaDataURL(punti, alberi = [], { larghezza = 760, altezza = 430, padding = 0.25 } = {}) {
  if (!punti || punti.length < 3) return null

  const conCoord = alberi.filter((a) => a.lat != null && a.lng != null)
  const lats = [...punti.map((p) => p[0]), ...conCoord.map((a) => a.lat)]
  const lngs = [...punti.map((p) => p[1]), ...conCoord.map((a) => a.lng)]
  let minLat = Math.min(...lats), maxLat = Math.max(...lats)
  let minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const dLat = maxLat - minLat || 0.001
  const dLng = maxLng - minLng || 0.001
  minLat -= dLat * padding; maxLat += dLat * padding
  minLng -= dLng * padding; maxLng += dLng * padding

  // zoom più alto in cui l'area rientra nelle dimensioni richieste
  let z = 18
  for (; z >= 2; z--) {
    const w = (lon2x(maxLng, z) - lon2x(minLng, z)) * TILE
    const h = (lat2y(minLat, z) - lat2y(maxLat, z)) * TILE
    if (w <= larghezza && h <= altezza) break
  }

  const centerPxX = lon2x((minLng + maxLng) / 2, z) * TILE
  const centerPxY = lat2y((minLat + maxLat) / 2, z) * TILE
  const left = centerPxX - larghezza / 2
  const top = centerPxY - altezza / 2

  const canvas = document.createElement('canvas')
  canvas.width = larghezza
  canvas.height = altezza
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#e8eef0'
  ctx.fillRect(0, 0, larghezza, altezza)

  const n = 2 ** z
  const tx0 = Math.floor(left / TILE), tx1 = Math.floor((left + larghezza) / TILE)
  const ty0 = Math.floor(top / TILE), ty1 = Math.floor((top + altezza) / TILE)
  const promesse = []
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      if (ty < 0 || ty >= n) continue
      const wx = ((tx % n) + n) % n
      const url = `https://tile.openstreetmap.org/${z}/${wx}/${ty}.png`
      promesse.push(
        caricaImg(url).then((img) => {
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
  ctx.fillStyle = 'rgba(21,128,61,0.12)'
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = '#15803d'
  ctx.stroke()

  // alberi (colore per classe CPC)
  for (const a of conCoord) {
    const [x, y] = toPx(a.lat, a.lng)
    const [r, g, b] = hex((CPC_META[a.cpc] || CPC_META.A).color)
    ctx.beginPath()
    ctx.arc(x, y, 5, 0, 2 * Math.PI)
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = '#ffffff'
    ctx.stroke()
  }

  // attribuzione (obbligatoria per OSM)
  ctx.font = '11px sans-serif'
  const attr = '© OpenStreetMap'
  const tw = ctx.measureText(attr).width
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.fillRect(larghezza - tw - 8, altezza - 16, tw + 8, 16)
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillText(attr, larghezza - tw - 4, altezza - 4)

  try {
    return canvas.toDataURL('image/jpeg', 0.9)
  } catch {
    return null // canvas "tainted" (tasselli senza CORS): il report ometterà la mappa
  }
}
