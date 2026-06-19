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

async function urlToDataURL(url) {
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

  // Riquadro CPC ben visibile
  const meta = CPC_META[albero.cpc] || CPC_META.A
  const [r, g, b] = hexToRgb(meta.color)
  doc.setFillColor(r, g, b)
  doc.roundedRect(140, y - 2, 56, 16, 2, 2, 'F')
  doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(9)
  doc.text('CLASSE CPC', 168, y + 3, { align: 'center' })
  doc.setFontSize(13)
  doc.text(meta.label, 168, y + 9.5, { align: 'center' })
  doc.setTextColor(0)

  doc.setFont('helvetica', 'bold').setFontSize(16)
  doc.text(albero.codice || '—', MARGINE, y + 4)
  doc.setFont('helvetica', 'italic').setFontSize(11)
  doc.text(albero.specie_botanica || '', MARGINE, y + 11)
  y += 22

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

  // Foto in coda alla scheda
  const dataUrls = (await Promise.all(fotoUrls.slice(0, 4).map(urlToDataURL))).filter(Boolean)
  if (dataUrls.length) {
    titoloSezione('Documentazione fotografica')
    let x = MARGINE + 2
    for (const dataUrl of dataUrls) {
      controllaPagina(64)
      try {
        doc.addImage(dataUrl, 'JPEG', x, y, 84, 60, undefined, 'MEDIUM')
      } catch {
        continue
      }
      x = x === MARGINE + 2 ? MARGINE + 94 : (y += 64, MARGINE + 2)
    }
    y += 64
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
