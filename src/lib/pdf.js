import { jsPDF } from 'jspdf'
import { CPC_META } from './constants'
import { sintesiStato, gravitaLabel, normalizzaDifetti } from './cpc'

// distretti mostrati nella scheda PDF (6 nuovi + "radici" dei record vecchi)
const DISTRETTI_PDF = [
  ['Zolla radicale', 'zolla'], ['Radici (storico)', 'radici'], ['Colletto', 'colletto'],
  ['Fusto', 'fusto'], ['Castello', 'castello'], ['Branche e rami', 'branche'], ['Chioma', 'chioma'],
]

// ----------------------------------------------------------------------------
// Scheda VTA in PDF generata "al volo" dal record dell'albero.
// ----------------------------------------------------------------------------

const MARGINE = 14
const LARGHEZZA = 210 - MARGINE * 2

export async function urlToDataURL(url) {
  try {
    // i blob: locali si leggono direttamente; per le URL remote forziamo una
    // richiesta CORS fresca (cache-buster) così non riusiamo l'eventuale copia
    // "opaca" messa in cache dal service worker quando l'<img> del popup la carica
    const fetchUrl = url.startsWith('blob:')
      ? url
      : `${url}${url.includes('?') ? '&' : '?'}pdf=${Date.now()}`
    const resp = await fetch(fetchUrl, { mode: 'cors', cache: 'no-store' })
    if (!resp.ok) return null
    const blob = await resp.blob()
    return await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.onerror = reject
      r.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function hexToRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
}

// Mini-mappa satellitare (Esri World Imagery) centrata sull'albero, con marker.
// Compone le tile in un canvas e restituisce un dataURL JPEG. Best-effort:
// se offline o tile mancanti torna null (la scheda viene fatta senza mappa).
export async function mappaSatellitareDataURL(lat, lng, zoom = 19, size = 320) {
  try {
    const n = 2 ** zoom
    const latRad = (lat * Math.PI) / 180
    const gx = ((lng + 180) / 360) * n * 256 // pixel globale X
    const gy = ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n * 256
    const left = gx - size / 2
    const top = gy - size / 2
    const txMin = Math.floor(left / 256)
    const txMax = Math.floor((left + size - 1) / 256)
    const tyMin = Math.floor(top / 256)
    const tyMax = Math.floor((top + size - 1) / 256)

    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')

    for (let tx = txMin; tx <= txMax; tx++) {
      for (let ty = tyMin; ty <= tyMax; ty++) {
        const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${tx}?p=${Date.now()}`
        const resp = await fetch(url, { mode: 'cors', cache: 'no-store' })
        if (!resp.ok) continue
        const bitmap = await createImageBitmap(await resp.blob())
        ctx.drawImage(bitmap, tx * 256 - left, ty * 256 - top)
      }
    }

    // marker al centro (pin rosso con bordo bianco)
    const cx = size / 2
    const cy = size / 2
    ctx.beginPath()
    ctx.arc(cx, cy, 9, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(cx, cy, 6, 0, Math.PI * 2)
    ctx.fillStyle = '#dc2626'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(cx, cy, 2, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()

    return canvas.toDataURL('image/jpeg', 0.85)
  } catch {
    return null
  }
}

// dimensioni reali dell'immagine (per mantenere le proporzioni nel PDF)
export function dimensioniImg(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth || 4, h: img.naturalHeight || 3 })
    img.onerror = () => resolve({ w: 4, h: 3 })
    img.src = dataUrl
  })
}

export async function generaSchedaPDF(albero, fotoUrls = [], comuneNome = '') {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = 16

  const intestazione = () => {
    doc.setFillColor(22, 101, 52)
    doc.rect(0, 0, 210, 24, 'F')
    doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(13)
    doc.text('SCHEDA DI VALUTAZIONE VTA – Visual Tree Assessment', MARGINE, 10)
    doc.setFontSize(9).setFont('helvetica', 'normal')
    doc.text(
      `${comuneNome ? `${comuneNome} – ` : ''}Censimento e gestione del verde pubblico`,
      MARGINE, 17
    )
    doc.setTextColor(0)
    y = 32
  }

  const controllaPagina = (altezza = 10) => {
    if (y + altezza > 282) {
      doc.addPage()
      intestazione()
    }
  }

  const titoloSezione = (testo) => {
    controllaPagina(12)
    doc.setFillColor(240, 253, 244)
    doc.rect(MARGINE, y - 4.5, LARGHEZZA, 7, 'F')
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(22, 101, 52)
    doc.text(testo.toUpperCase(), MARGINE + 2, y)
    doc.setTextColor(0)
    y += 7
  }

  const riga = (etichetta, valore) => {
    controllaPagina(6)
    doc.setFont('helvetica', 'bold').setFontSize(9)
    doc.text(`${etichetta}:`, MARGINE + 2, y)
    doc.setFont('helvetica', 'normal')
    const righe = doc.splitTextToSize(String(valore ?? '—'), LARGHEZZA - 52)
    doc.text(righe, MARGINE + 50, y)
    y += righe.length * 4.5 + 1.5
  }

  intestazione()
  const meta = CPC_META[albero.cpc] || CPC_META.A
  const yTop = y

  // Mini-mappa satellitare con il puntino dell'albero, in alto a destra
  const MAP_SIZE = 44
  const mapX = 210 - MARGINE - MAP_SIZE
  if (albero.lat != null && albero.lng != null) {
    const mapData = await mappaSatellitareDataURL(albero.lat, albero.lng)
    if (mapData) {
      try {
        doc.addImage(mapData, 'JPEG', mapX, yTop - 2, MAP_SIZE, MAP_SIZE, undefined, 'SLOW')
      } catch { /* ignora */ }
      doc.setDrawColor(150)
      doc.rect(mapX, yTop - 2, MAP_SIZE, MAP_SIZE)
      doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(130)
      doc.text('Esri World Imagery', mapX + MAP_SIZE, yTop - 2 + MAP_SIZE + 3, { align: 'right' })
      doc.setTextColor(0)
    }
  }

  // Codice, specie e riquadro CPC a sinistra
  doc.setFont('helvetica', 'bold').setFontSize(16)
  doc.text(albero.codice || '—', MARGINE, yTop + 6)
  doc.setFont('helvetica', 'italic').setFontSize(11)
  doc.text(albero.specie_botanica || '', MARGINE, yTop + 13)
  const [r, g, b] = hexToRgb(meta.color)
  doc.setFillColor(r, g, b)
  doc.roundedRect(MARGINE, yTop + 18, 56, 14, 2, 2, 'F')
  doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(8.5)
  doc.text('CLASSE CPC', MARGINE + 28, yTop + 23, { align: 'center' })
  doc.setFontSize(12)
  doc.text(meta.label, MARGINE + 28, yTop + 29, { align: 'center' })
  doc.setTextColor(0)

  y = yTop + 46

  titoloSezione('1. Identificazione e localizzazione')
  riga('Data rilievo', albero.data_rilievo ? new Date(albero.data_rilievo).toLocaleString('it-IT') : '—')
  riga('Coordinate GPS', `${albero.lat?.toFixed(6)}, ${albero.lng?.toFixed(6)} (WGS84)`)
  riga('Localizzazione', albero.localizzazione)
  riga('Indirizzo', albero.indirizzo)
  riga('Rilevatore', albero.rilevatore)

  titoloSezione('2. Dati biometrici')
  riga('Specie botanica', albero.specie_botanica)
  riga('Altezza', albero.altezza_m != null ? `${albero.altezza_m} m` : '—')
  riga('Diametro fusto (DBH)', albero.dbh_cm != null ? `${albero.dbh_cm} cm` : '—')
  if (albero.circonferenza_cm != null) riga('Circonferenza', `${albero.circonferenza_cm} cm`)
  riga('Diametro chioma', albero.diametro_chioma_m != null ? `${albero.diametro_chioma_m} m` : '—')
  if (albero.altezza_bersaglio_m != null) riga('Altezza bersaglio', `${albero.altezza_bersaglio_m} m`)
  riga('Fase di sviluppo', albero.fase_sviluppo)
  if (albero.vigoria) riga('Vigoria', albero.vigoria)
  if (albero.fitopatie) riga('Fitopatie', albero.fitopatie)
  if (albero.agente_cariogeno) riga('Agente cariogeno', albero.agente_cariogeno)

  titoloSezione('3. Contesto e bersagli')
  riga('Bersagli presenti', albero.bersagli?.length ? albero.bersagli.join(', ') : 'Nessuno')
  riga('Frequenza occupazione', albero.frequenza_occupazione)
  if (albero.conflitti?.length) riga('Conflitti', albero.conflitti.join(', '))
  if (albero.conformita_cam) riga('Conformità CAM Verde Urbano', albero.conformita_cam)

  titoloSezione('4. Analisi dei difetti')
  for (const [nome, sez] of DISTRETTI_PDF) {
    const ds = normalizzaDifetti(albero[sez])
    if (ds.length) riga(nome, ds.map((d) => `${d.nome} (${gravitaLabel(d.gravita).toLowerCase()})`).join('; '))
  }
  if (albero.note_osservazioni) riga('Note', albero.note_osservazioni)
  riga('Sintesi stato', sintesiStato(albero))

  titoloSezione('5. Sintesi tecnica e gestione')
  riga('Classe CPC', meta.label)
  if (albero.classe_rischio) riga('Classe di rischio', albero.classe_rischio)
  riga('Indagine strumentale', albero.richiesta_indagine_strumentale
    ? `Sì – ${albero.tipo_indagine_richiesta || ''}${albero.urgenza_indagine ? ` (${albero.urgenza_indagine})` : ''}` : 'No')
  riga('Prossimo controllo', albero.data_prossimo_controllo ? new Date(albero.data_prossimo_controllo).toLocaleDateString('it-IT') : '—')
  riga('Interventi colturali', albero.prescrizioni_gestionali
    ? `${albero.prescrizioni_gestionali}${albero.urgenza_intervento ? ` (${albero.urgenza_intervento})` : ''}` : '—')
  if (albero.mitigazione_bersaglio) riga('Mitigazione bersaglio',
    `${albero.mitigazione_bersaglio}${albero.urgenza_mitigazione ? ` (${albero.urgenza_mitigazione})` : ''}`)
  if (albero.co2_stoccata_kg != null || albero.canopy_cover_m2 != null || albero.valore_economico_eur != null) {
    riga('Servizi ecosistemici', [
      albero.co2_stoccata_kg != null ? `CO₂ stoccata ${albero.co2_stoccata_kg} kg` : null,
      albero.canopy_cover_m2 != null ? `canopy ${albero.canopy_cover_m2} m²` : null,
      albero.valore_economico_eur != null ? `valore € ${albero.valore_economico_eur}` : null,
    ].filter(Boolean).join(' · '))
  }
  if (albero.data_ultimo_intervento) riga('Ultimo intervento', new Date(albero.data_ultimo_intervento).toLocaleDateString('it-IT'))
  if (albero.note_gestione) riga('Note gestione', albero.note_gestione)

  // Foto in coda alla scheda: grandi e a piena larghezza (≈2 per pagina), con
  // proporzioni reali e qualità massima, didascalia del difetto se presente.
  // fotoUrls può contenere stringhe (url) o oggetti { url, caption }.
  const baseName = (u) => decodeURIComponent((u.split('/').pop() || '').split('?')[0])
  const items = fotoUrls.slice(0, 12).map((f) =>
    typeof f === 'string' ? { url: f, caption: '', nome: baseName(f) } : { ...f, nome: f.nome || baseName(f.url) }
  )
  const conData = []
  for (const it of items) {
    const dataUrl = await urlToDataURL(it.url)
    if (!dataUrl) continue
    const dim = await dimensioniImg(dataUrl)
    conData.push({ caption: it.caption || '', nome: it.nome || '', dataUrl, ...dim })
  }
  if (conData.length) {
    titoloSezione('Documentazione fotografica')
    const MAX_H = 112 // mm: con la didascalia ne stanno ~2 per pagina
    for (const it of conData) {
      let w = LARGHEZZA
      let h = (w * it.h) / it.w
      if (h > MAX_H) {
        h = MAX_H
        w = (h * it.w) / it.h
      }
      controllaPagina(h + 14)
      const x = MARGINE + (LARGHEZZA - w) / 2 // centrata
      try {
        doc.addImage(it.dataUrl, 'JPEG', x, y, w, h, undefined, 'SLOW')
      } catch {
        continue
      }
      y += h + 1.5
      if (it.caption) {
        doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(22, 101, 52)
        doc.text(doc.splitTextToSize(it.caption, LARGHEZZA), MARGINE + 2, y + 3)
        doc.setTextColor(0)
        y += 4.5
      }
      if (it.nome) {
        doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(120)
        doc.text(it.nome, MARGINE + 2, y + 3)
        doc.setTextColor(0)
        y += 4
      }
      y += 4
    }
  }

  // Piè di pagina su ogni pagina
  const pagine = doc.getNumberOfPages()
  for (let i = 1; i <= pagine; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(120)
    doc.text(
      `Scheda generata il ${new Date().toLocaleDateString('it-IT')} – GreenCure VTA – pag. ${i}/${pagine}`,
      105, 292, { align: 'center' }
    )
    doc.setTextColor(0)
  }

  doc.save(`Scheda_VTA_${albero.codice || albero.id}.pdf`)
}
