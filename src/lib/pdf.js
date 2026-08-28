import { jsPDF } from 'jspdf'
import { CPC_META } from './constants'
import { sintesiStato, gravitaLabel, normalizzaDifetti, accettabilitaRischio, rischioResiduo, descriviConseguenza, nudgeConseguenza } from './cpc'

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

// Mini-mappa IBRIDA (Esri World Imagery + strade ed etichette) centrata
// sull'albero, con marker. Compone le tile in un canvas e restituisce un
// dataURL JPEG. Best-effort: se offline o tile mancanti torna null.
const LAYER_MAPPA = [
  'World_Imagery/MapServer', // base satellitare (opaca)
  'Reference/World_Transportation/MapServer', // strade + etichette stradali
  'Reference/World_Boundaries_and_Places/MapServer', // confini e toponimi
]

async function caricaTile(url, msTimeout = 5000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), msTimeout)
  try {
    const resp = await fetch(url, { mode: 'cors', cache: 'no-store', signal: ctrl.signal })
    if (!resp.ok) return null
    return await createImageBitmap(await resp.blob())
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

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

    // tutte le tile (satellite + overlay) scaricate IN PARALLELO con timeout,
    // poi disegnate nell'ordine dei layer (uno sopra l'altro)
    const richieste = []
    LAYER_MAPPA.forEach((layer, li) => {
      for (let tx = txMin; tx <= txMax; tx++) {
        for (let ty = tyMin; ty <= tyMax; ty++) {
          const url = `https://server.arcgisonline.com/ArcGIS/rest/services/${layer}/tile/${zoom}/${ty}/${tx}?p=${Date.now()}`
          richieste.push(
            caricaTile(url).then((bitmap) => ({ bitmap, li, dx: tx * 256 - left, dy: ty * 256 - top }))
          )
        }
      }
    })
    const risultati = (await Promise.all(richieste)).filter((r) => r.bitmap)
    if (!risultati.length) return null // nessuna tile: scheda senza mappa
    risultati.sort((a, b) => a.li - b.li)
    for (const r of risultati) ctx.drawImage(r.bitmap, r.dx, r.dy)

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

// disegna UNA scheda sul doc fornito (la pagina corrente); riusata sia per la
// scheda singola sia per il PDF con tutte le schede di una zona
async function renderScheda(doc, albero, fotoUrls = [], comuneNome = '') {
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
    // zoom 17: inquadratura che mostra il nome della via (a zoom più alti le
    // etichette stradali non rientrano nel ritaglio)
    const mapData = await mappaSatellitareDataURL(albero.lat, albero.lng, 17, 384)
    if (mapData) {
      try {
        doc.addImage(mapData, 'JPEG', mapX, yTop - 2, MAP_SIZE, MAP_SIZE, undefined, 'SLOW')
      } catch { /* ignora */ }
      doc.setDrawColor(150)
      doc.rect(mapX, yTop - 2, MAP_SIZE, MAP_SIZE)
      doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(130)
      doc.text('Esri – ibrida', mapX + MAP_SIZE, yTop - 2 + MAP_SIZE + 3, { align: 'right' })
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
  if (albero.lat != null && albero.lng != null) {
    controllaPagina(6)
    doc.setFont('helvetica', 'bold').setFontSize(9)
    doc.text('Mappa:', MARGINE + 2, y)
    doc.setFont('helvetica', 'normal').setTextColor(37, 99, 235)
    // vero collegamento PDF, cliccabile in tutti i lettori
    doc.textWithLink('Apri in Google Maps', MARGINE + 50, y, {
      url: `https://www.google.com/maps?q=${albero.lat},${albero.lng}`,
    })
    doc.setTextColor(0)
    y += 6
  }
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
  // inclinazione: è un difetto di postura dell'intero albero → sta con i difetti
  if (albero.inclinazione_tipo) {
    riga('Inclinazione del fusto', `${albero.inclinazione_tipo}${albero.inclinazione_gradi != null ? ` – ${albero.inclinazione_gradi}°` : ''}` +
      `${albero.curvatura_correttiva ? ' · curvatura correttiva presente' : ' · nessuna curvatura correttiva'}`)
  }
  if (albero.instabilita_suolo) riga('Instabilità al suolo', 'Rilevata (sollevamento zolla / cretti sopravento) – override Classe D')
  if (albero.note_osservazioni) riga('Note', albero.note_osservazioni)
  riga('Sintesi stato', sintesiStato(albero))

  titoloSezione('5. Sintesi tecnica e gestione')
  riga('Classe CPC', meta.label)
  if (albero.classe_rischio) {
    // ISO 31000: rischio = propensione (CPC) × conseguenza (bersaglio) + accettabilità
    const acc = accettabilitaRischio(albero.classe_rischio)
    riga('Classe di rischio', `${albero.classe_rischio}${acc ? ` — ${acc}` : ''}`)
    const residuo = rischioResiduo(albero)
    if (residuo && residuo !== albero.classe_rischio) {
      riga('Rischio residuo atteso', `${residuo} (indicativo, a seguito degli interventi prescritti)`)
    }
    riga('Conseguenza attesa', descriviConseguenza(albero))
    const nudge = nudgeConseguenza(albero)
    if (nudge) riga('Nota cautelativa', nudge)
  }
  riga('Indagine strumentale', albero.richiesta_indagine_strumentale
    ? `Sì – ${albero.tipo_indagine_richiesta || ''}${albero.urgenza_indagine ? ` (${albero.urgenza_indagine})` : ''}` : 'No')
  riga('Prossimo controllo', albero.data_prossimo_controllo ? new Date(albero.data_prossimo_controllo).toLocaleDateString('it-IT') : '—')
  riga('Interventi colturali', albero.prescrizioni_gestionali
    ? `${albero.prescrizioni_gestionali}${albero.urgenza_intervento ? ` (${albero.urgenza_intervento})` : ''}` : '—')
  if (albero.mitigazione_bersaglio) riga('Mitigazione bersaglio',
    `${albero.mitigazione_bersaglio}${albero.urgenza_mitigazione ? ` (${albero.urgenza_mitigazione})` : ''}`)
  if (albero.compartimentazione) riga('Compartimentazione (CODIT)', albero.compartimentazione)
  if (albero.apc_m != null) riga('Area Potenziale di Caduta', `raggio indicativo ~ ${albero.apc_m} m`)
  if (albero.suolo_zpa) riga('Suolo nella ZPA', albero.suolo_zpa)
  if (albero.limiti_valutazione) riga('Limiti della valutazione', albero.limiti_valutazione)
  if (albero.motivazione_scelte) riga('Motivazione delle scelte', albero.motivazione_scelte)
  if (albero.data_ultimo_intervento) riga('Ultimo intervento', new Date(albero.data_ultimo_intervento).toLocaleDateString('it-IT'))
  if (albero.note_gestione) riga('Note gestione', albero.note_gestione)

  // Servizi ecosistemici in sezione propria: una riga per voce, leggibile
  if (albero.co2_stoccata_kg != null || albero.co2_kg_anno != null || albero.canopy_cover_m2 != null || albero.valore_economico_eur != null) {
    const num = (v) => Number(v).toLocaleString('it-IT')
    titoloSezione('6. Servizi ecosistemici e valore')
    if (albero.co2_stoccata_kg != null) riga('CO₂ stoccata', `${num(albero.co2_stoccata_kg)} kg`)
    if (albero.co2_kg_anno != null) riga('CO₂ assorbita', `${num(albero.co2_kg_anno)} kg/anno`)
    if (albero.canopy_cover_m2 != null) riga('Canopy cover effettivo', `${num(albero.canopy_cover_m2)} m² (chioma corretta per vigoria)`)
    if (albero.valore_economico_eur != null) riga('Valore ornamentale', `€ ${num(albero.valore_economico_eur)}`)
  }

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
    // --- ordinamento: prima le viste generali, poi i dettagli diagnostici in
    // sequenza anatomica (zolla → colletto → fusto → castello → branche → chioma)
    const ORDINE_DISTRETTI = ['zolla radicale', 'radici', 'colletto', 'fusto', 'castello', 'branche e rami', 'chioma']
    const categoriaDi = (c) => (c || '').split('·')[0].trim().toLowerCase()
    const rango = (it) => {
      if (!it.caption) return 0 // vista generale dell'albero
      if (categoriaDi(it.caption) === 'inclinazione') return 1
      const i = ORDINE_DISTRETTI.indexOf(categoriaDi(it.caption))
      return i >= 0 ? 10 + i : 2 // altre foto senza categoria nota: con le generali
    }
    const ordinate = [...conData].sort((a, b) => rango(a) - rango(b))

    // --- didascalia tecnica: "Foto 03 — Fusto · Cavità (significativa)".
    // La gravità, se ritrovabile nel record, arricchisce il difetto.
    const gravitaDi = (caption) => {
      const [cat, dif] = (caption || '').split('·').map((s) => s.trim())
      if (!cat || !dif) return ''
      const voce = DISTRETTI_PDF.find(([nome]) => nome.toLowerCase() === cat.toLowerCase())
      if (!voce) return ''
      const trovato = normalizzaDifetti(albero[voce[1]]).find((d) => d.nome?.toLowerCase() === dif.toLowerCase())
      return trovato ? ` (${gravitaLabel(trovato.gravita).toLowerCase()})` : ''
    }
    const didascalia = (it, n) => {
      const num = `Foto ${String(n).padStart(2, '0')}`
      if (!it.caption) return `${num} — Vista generale`
      return `${num} — ${it.caption}${gravitaDi(it.caption)}`
    }

    // --- griglia a 2 colonne: le immagini mantengono le proporzioni reali
    // (equivalente di object-fit: contain — nessun ritaglio, nessuna deformazione)
    const GAP_X = 6 // mm tra le colonne
    const GAP_Y = 7 // mm tra una riga fotografica e la successiva
    const COL_W = (LARGHEZZA - GAP_X) / 2
    const MAX_H_CELLA = 62 // altezza massima dell'immagine in griglia
    const H_DIDASCALIA = 8.5 // didascalia + nome file
    const unaSola = ordinate.length === 1

    // dimensioni finali di ciascuna immagine dentro la sua cella
    const dim = (it, larghCella, maxH) => {
      let w = larghCella
      let h = (w * it.h) / it.w
      if (h > maxH) { h = maxH; w = (h * it.w) / it.h } // verticali: si adattano in altezza
      return { w, h }
    }

    if (unaSola) {
      // foto singola: usa tutta la larghezza (evita una cella piccola e vuota)
      const it = ordinate[0]
      const { w, h } = dim(it, LARGHEZZA, 150)
      controllaPagina(h + H_DIDASCALIA + 16)
      titoloSezione('Documentazione fotografica')
      try {
        doc.addImage(it.dataUrl, 'JPEG', MARGINE + (LARGHEZZA - w) / 2, y, w, h, undefined, 'SLOW')
        y += h + 2
        doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(22, 101, 52)
        doc.text(didascalia(it, 1), MARGINE + 2, y + 3)
        doc.setTextColor(0)
        y += H_DIDASCALIA
      } catch { /* immagine non inseribile: si ignora */ }
    } else {
      // righe da 2: la riga (immagini + didascalie) non viene mai spezzata
      const righe = []
      for (let i = 0; i < ordinate.length; i += 2) righe.push(ordinate.slice(i, i + 2))

      // il titolo non resta orfano: serve spazio anche per la prima riga
      const hRiga = (riga) => Math.max(...riga.map((it) => dim(it, COL_W, MAX_H_CELLA).h)) + H_DIDASCALIA
      controllaPagina(hRiga(righe[0]) + 16)
      titoloSezione('Documentazione fotografica')

      let n = 0
      for (const riga of righe) {
        const h = hRiga(riga)
        controllaPagina(h + GAP_Y)
        const yRiga = y
        riga.forEach((it, col) => {
          n += 1
          const d = dim(it, COL_W, MAX_H_CELLA)
          const xCella = MARGINE + col * (COL_W + GAP_X)
          const x = xCella + (COL_W - d.w) / 2 // immagine centrata nella cella
          try {
            doc.addImage(it.dataUrl, 'JPEG', x, yRiga, d.w, d.h, undefined, 'SLOW')
          } catch {
            return
          }
          // didascalie allineate al fondo della riga, così restano su una linea
          const yCap = yRiga + (h - H_DIDASCALIA) + 3
          doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(22, 101, 52)
          doc.text(doc.splitTextToSize(didascalia(it, n), COL_W)[0], xCella, yCap)
          if (it.nome) {
            doc.setFont('helvetica', 'normal').setFontSize(5.5).setTextColor(175)
            doc.text(doc.splitTextToSize(it.nome, COL_W)[0], xCella, yCap + 3.2)
          }
          doc.setTextColor(0)
        })
        y = yRiga + h + GAP_Y
      }
    }
  }

}

// piè di pagina numerato su tutte le pagine del documento
function piePagina(doc) {
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
}

export async function generaSchedaPDF(albero, fotoUrls = [], comuneNome = '') {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  await renderScheda(doc, albero, fotoUrls, comuneNome)
  piePagina(doc)
  doc.save(`Scheda_VTA_${albero.codice || albero.id}.pdf`)
}

// PDF unico con TUTTE le schede degli alberi passati (una per pagina).
// fotoPerAlbero(a) restituisce le foto/dettagli del singolo albero.
// onProgress(fatte, totale) opzionale per l'indicatore di avanzamento.
export async function generaSchedePDF(alberi, fotoPerAlbero, comuneNome = '', nomeFile = 'Schede_VTA.pdf', onProgress) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  for (let i = 0; i < alberi.length; i++) {
    if (i > 0) doc.addPage()
    await renderScheda(doc, alberi[i], fotoPerAlbero ? fotoPerAlbero(alberi[i]) : [], comuneNome)
    onProgress?.(i + 1, alberi.length)
  }
  piePagina(doc)
  doc.save(nomeFile)
}
