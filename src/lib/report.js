import { jsPDF } from 'jspdf'
import { CPC_META, CLASSE_RISCHIO_META } from './constants'
import { urlToDataURL, dimensioniImg } from './pdf'

// ----------------------------------------------------------------------------
// Report di periodo da inviare al committente: riepilogo dei rilievi eseguiti
// in un intervallo di date, con in evidenza gli INTERVENTI PRIORITARI (urgenti)
// da eseguire subito, senza attendere la consegna dell'intero lavoro.
// ----------------------------------------------------------------------------

const MARGINE = 14
const LARGHEZZA = 210 - MARGINE * 2
const VERDE = [22, 101, 52]

// è un intervento prioritario? CPC alta, emergenza, o rischio elevato/estremo
export function isPrioritario(a) {
  return (
    a.intervento_emergenza ||
    a.cpc === 'D' ||
    a.cpc === 'C/D' ||
    a.classe_rischio === 'Elevato' ||
    a.classe_rischio === 'Estremo'
  )
}

function rank(a) {
  if (a.intervento_emergenza) return 0
  return { D: 1, 'C/D': 2, C: 3, B: 4, A: 5 }[a.cpc] ?? 9
}

const dataIT = (v) => (v ? new Date(v).toLocaleDateString('it-IT') : '—')
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

export async function generaReport(alberi, { comuneNome = '', dataDa, dataA, fotoDettagli } = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = 0

  const intestazione = () => {
    doc.setFillColor(...VERDE)
    doc.rect(0, 0, 210, 26, 'F')
    doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(15)
    doc.text('REPORT DI SOPRALLUOGO VTA', MARGINE, 11)
    doc.setFontSize(10).setFont('helvetica', 'normal')
    doc.text(comuneNome || 'Committente', MARGINE, 18)
    const periodo =
      dataDa || dataA ? `Periodo: ${dataIT(dataDa)} – ${dataIT(dataA)}` : 'Tutti i rilievi'
    doc.setFontSize(9)
    doc.text(periodo, MARGINE, 23)
    doc.setTextColor(0)
    y = 34
  }

  const controllaPagina = (h = 10) => {
    if (y + h > 282) {
      doc.addPage()
      intestazione()
    }
  }

  const titoloSezione = (t, colore = VERDE) => {
    controllaPagina(12)
    doc.setFillColor(colore[0], colore[1], colore[2])
    doc.rect(MARGINE, y - 4.5, LARGHEZZA, 7, 'F')
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(255)
    doc.text(t.toUpperCase(), MARGINE + 2, y)
    doc.setTextColor(0)
    y += 8
  }

  intestazione()

  // ---- conteggi
  const conteggi = { A: 0, B: 0, C: 0, 'C/D': 0, D: 0 }
  for (const a of alberi) if (conteggi[a.cpc] != null) conteggi[a.cpc]++
  const prioritari = alberi.filter(isPrioritario).sort((x, z) => rank(x) - rank(z))

  doc.setFont('helvetica', 'normal').setFontSize(10)
  doc.text(
    `Nel periodo sono stati valutati ${alberi.length} alberi. Si segnalano ` +
      `${prioritari.length} interventi prioritari da eseguire con urgenza (dettaglio sotto).`,
    MARGINE,
    y,
    { maxWidth: LARGHEZZA }
  )
  y += 10

  // riquadri conteggio per classe
  const celle = ['A', 'B', 'C', 'C/D', 'D']
  const wCella = LARGHEZZA / celle.length
  celle.forEach((c, i) => {
    const meta = CPC_META[c]
    const [r, g, b] = hex(meta.bg)
    const x = MARGINE + i * wCella
    doc.setFillColor(r, g, b)
    doc.roundedRect(x + 1, y, wCella - 2, 16, 1.5, 1.5, 'F')
    const [tr, tg, tb] = hex(meta.color)
    doc.setTextColor(tr, tg, tb).setFont('helvetica', 'bold')
    doc.setFontSize(13).text(String(conteggi[c]), x + wCella / 2, y + 7, { align: 'center' })
    doc.setFontSize(7.5).text(`Classe ${c}`, x + wCella / 2, y + 12.5, { align: 'center' })
  })
  doc.setTextColor(0)
  y += 22

  // ---- interventi prioritari
  if (prioritari.length) {
    titoloSezione('Interventi prioritari (urgenti)', [185, 28, 28])

    // nota: cosa deve fare la committenza per la messa in sicurezza
    const nota =
      'La committenza è tenuta a mettere in sicurezza senza indugio gli esemplari elencati: ' +
      'interdire o transennare l\'area di pertinenza e dare corso agli interventi prescritti nei ' +
      'tempi indicati. Fino all\'attuazione delle misure permane una condizione di rischio per ' +
      'persone e cose, di cui la committenza è resa edotta con il presente report.'
    const righeNota = doc.splitTextToSize(nota, LARGHEZZA - 6)
    const hNota = righeNota.length * 4.2 + 5
    controllaPagina(hNota + 2)
    doc.setFillColor(254, 242, 242)
    doc.setDrawColor(220, 38, 38)
    doc.roundedRect(MARGINE, y - 2, LARGHEZZA, hNota, 1.5, 1.5, 'FD')
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(153, 27, 27)
    doc.text('AZIONE RICHIESTA ALLA COMMITTENZA', MARGINE + 3, y + 2.5)
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(60)
    doc.text(righeNota, MARGINE + 3, y + 7)
    doc.setTextColor(0)
    y += hNota + 4

    for (const a of prioritari) {
      controllaPagina(40)
      const meta = CPC_META[a.cpc] || CPC_META.A
      const yBox = y
      // badge CPC
      const [cr, cg, cb] = hex(meta.color)
      doc.setFillColor(cr, cg, cb)
      doc.roundedRect(MARGINE, y, 20, 9, 1.5, 1.5, 'F')
      doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(10)
      doc.text(a.cpc || '—', MARGINE + 10, y + 6, { align: 'center' })
      doc.setTextColor(0)
      // titolo
      doc.setFont('helvetica', 'bold').setFontSize(11)
      doc.text(`${a.codice || ''}  ${a.specie_botanica || ''}`, MARGINE + 24, y + 4)
      doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(90)
      const luogo = [a.localizzazione, a.indirizzo].filter(Boolean).join(' – ')
      doc.text(luogo || '—', MARGINE + 24, y + 8.5)
      doc.setTextColor(0)
      y += 12

      const riga = (et, v) => {
        if (!v) return
        controllaPagina(6)
        doc.setFont('helvetica', 'bold').setFontSize(8.5)
        doc.text(`${et}:`, MARGINE + 2, y)
        doc.setFont('helvetica', 'normal')
        const righe = doc.splitTextToSize(String(v), LARGHEZZA - 38)
        doc.text(righe, MARGINE + 36, y)
        y += righe.length * 4.2 + 1
      }
      if (a.intervento_emergenza) {
        doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(185, 28, 28)
        doc.text('⚠ INTERVENTO DI EMERGENZA / MESSA IN SICUREZZA IMMEDIATA', MARGINE + 2, y)
        doc.setTextColor(0)
        y += 5
      }
      riga('Classe rischio', a.classe_rischio)
      riga('Prescrizione', `${a.prescrizioni_gestionali || '—'}${a.urgenza_intervento ? ` (${a.urgenza_intervento})` : ''}`)
      if (a.mitigazione_bersaglio) riga('Mitigazione', `${a.mitigazione_bersaglio}${a.urgenza_mitigazione ? ` (${a.urgenza_mitigazione})` : ''}`)
      if (a.richiesta_indagine_strumentale) riga('Indagine', `${a.tipo_indagine_richiesta || ''}${a.urgenza_indagine ? ` (${a.urgenza_indagine})` : ''}`)
      if (a.lat != null) riga('Posizione', `https://maps.google.com/?q=${a.lat},${a.lng}`)

      // foto di copertina (prima disponibile)
      const dett = fotoDettagli ? fotoDettagli(a) : []
      if (dett[0]) {
        const dataUrl = await urlToDataURL(dett[0].url)
        if (dataUrl) {
          const dim = await dimensioniImg(dataUrl)
          let w = 100
          let h = (w * dim.h) / dim.w
          if (h > 75) { h = 75; w = (h * dim.w) / dim.h }
          controllaPagina(h + 4)
          try { doc.addImage(dataUrl, 'JPEG', MARGINE + 2, y, w, h, undefined, 'SLOW') } catch { /* ignora */ }
          y += h + 2
        }
      }
      doc.setDrawColor(220)
      doc.line(MARGINE, y, MARGINE + LARGHEZZA, y)
      y += 5
      void yBox
    }
  }

  // ---- elenco completo del periodo
  titoloSezione('Elenco completo del periodo')
  doc.setFont('helvetica', 'bold').setFontSize(8)
  const col = [MARGINE + 1, MARGINE + 28, MARGINE + 46, MARGINE + 104, MARGINE + 150, MARGINE + 166]
  const header = () => {
    doc.setFillColor(...VERDE)
    doc.rect(MARGINE, y - 4, LARGHEZZA, 6, 'F')
    doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(8)
    ;['Codice', 'Data', 'Specie', 'Localizzazione', 'CPC', 'Pross. contr.'].forEach((t, i) =>
      doc.text(t, col[i], y)
    )
    doc.setTextColor(0)
    y += 5
  }
  header()
  const ordinati = [...alberi].sort((x, z) => rank(x) - rank(z))
  doc.setFont('helvetica', 'normal').setFontSize(8)
  for (const a of ordinati) {
    if (y > 282) { doc.addPage(); intestazione(); doc.setFontSize(8); header() }
    doc.text(String(a.codice || ''), col[0], y)
    doc.text(dataIT(a.data_rilievo), col[1], y)
    doc.text(doc.splitTextToSize(a.specie_botanica || '', 56)[0] || '', col[2], y)
    doc.text(doc.splitTextToSize([a.localizzazione, a.indirizzo].filter(Boolean).join(' – '), 44)[0] || '', col[3], y)
    const meta = CPC_META[a.cpc]
    if (meta) {
      const [r, g, b] = hex(meta.color)
      doc.setTextColor(r, g, b).setFont('helvetica', 'bold')
      doc.text(a.cpc, col[4], y)
      doc.setTextColor(0).setFont('helvetica', 'normal')
    }
    doc.text(dataIT(a.data_prossimo_controllo), col[5], y)
    y += 5
  }

  // piè di pagina
  const pagine = doc.getNumberOfPages()
  for (let i = 1; i <= pagine; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(120)
    doc.text(
      `Report generato il ${new Date().toLocaleDateString('it-IT')} – Dott. Agr. Ruggero Manca – GreenCure VTA – pag. ${i}/${pagine}`,
      105, 292, { align: 'center' }
    )
    doc.setTextColor(0)
  }

  const slug = (comuneNome || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  doc.save(`Report_VTA_${slug}_${new Date().toISOString().slice(0, 10)}.pdf`)
}
