import { jsPDF } from 'jspdf'
import { CPC_META } from './constants'
import { sintesiStato, gravitaLabel } from './cpc'

// ----------------------------------------------------------------------------
// Scheda VTA in PDF generata "al volo" dal record dell'albero.
// ----------------------------------------------------------------------------

const MARGINE = 14
const LARGHEZZA = 210 - MARGINE * 2

async function urlToDataURL(url) {
  try {
    const blob = await (await fetch(url)).blob()
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
  riga('Rilevatore', albero.rilevatore)

  titoloSezione('2. Dati biometrici')
  riga('Specie botanica', albero.specie_botanica)
  riga('Altezza', albero.altezza_m != null ? `${albero.altezza_m} m` : '—')
  riga('Diametro fusto (DBH)', albero.dbh_cm != null ? `${albero.dbh_cm} cm` : '—')
  riga('Diametro chioma', albero.diametro_chioma_m != null ? `${albero.diametro_chioma_m} m` : '—')
  riga('Fase di sviluppo', albero.fase_sviluppo)

  titoloSezione('3. Contesto e bersagli')
  riga('Bersagli presenti', albero.bersagli?.length ? albero.bersagli.join(', ') : 'Nessuno')
  riga('Frequenza occupazione', albero.frequenza_occupazione)

  titoloSezione('4. Analisi dei difetti')
  for (const [nome, sez] of [['Radici', albero.radici], ['Fusto', albero.fusto], ['Chioma', albero.chioma]]) {
    riga(
      nome,
      sez?.difetti?.length
        ? `${sez.difetti.join(', ')} — gravità ${gravitaLabel(sez?.gravita || 0).toLowerCase()}`
        : 'Nessun difetto rilevato'
    )
  }
  if (albero.note_osservazioni) riga('Note', albero.note_osservazioni)
  riga('Sintesi stato', sintesiStato(albero))

  titoloSezione('5. Sintesi tecnica e gestione')
  riga('Classe CPC', meta.label)
  riga('Indagine strumentale', albero.richiesta_indagine_strumentale ? `Sì – ${albero.tipo_indagine_richiesta || ''}` : 'No')
  riga('Prossimo controllo', albero.data_prossimo_controllo ? new Date(albero.data_prossimo_controllo).toLocaleDateString('it-IT') : '—')
  riga('Prescrizioni', albero.prescrizioni_gestionali)

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
