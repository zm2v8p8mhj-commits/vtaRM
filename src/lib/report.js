import { jsPDF } from 'jspdf'
import { CPC_META, CLASSE_RISCHIO_META } from './constants'
import { sintesiStato } from './cpc'
import { urlToDataURL, dimensioniImg } from './pdf'

// ----------------------------------------------------------------------------
// Report di periodo per il committente: documento tecnico con premessa
// metodologica, quadro di sintesi, schede degli interventi PRIORITARI (urgenti)
// ed elenco completo dei rilievi del periodo. Carattere interlocutorio:
// segnala le priorità prima della consegna della relazione conclusiva.
// ----------------------------------------------------------------------------

const MARGINE = 14
const LARGHEZZA = 210 - MARGINE * 2
const VERDE = [22, 101, 52]
const TECNICO = 'Dott. Agr. Ruggero Manca'
const ALBO = 'Dottore Agronomo – ODAF Lecce n° 636 · idearurale'

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
    doc.rect(0, 0, 210, 22, 'F')
    doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(13)
    doc.text('REPORT DI SOPRALLUOGO – Valutazione di Stabilità degli Alberi (VTA)', MARGINE, 9)
    doc.setFontSize(9).setFont('helvetica', 'normal')
    doc.text(comuneNome || 'Committente', MARGINE, 15)
    const periodo = dataDa || dataA ? `Periodo: ${dataIT(dataDa)} – ${dataIT(dataA)}` : 'Tutti i rilievi'
    doc.text(periodo, MARGINE, 19.5)
    doc.setFontSize(7.5)
    doc.text(`Emesso il ${new Date().toLocaleDateString('it-IT')}`, 210 - MARGINE, 19.5, { align: 'right' })
    doc.setTextColor(0)
    y = 30
  }

  const controllaPagina = (h = 10) => {
    if (y + h > 280) {
      doc.addPage()
      intestazione()
    }
  }

  const titoloSezione = (t, colore = VERDE) => {
    controllaPagina(14)
    y += 2
    doc.setFillColor(colore[0], colore[1], colore[2])
    doc.rect(MARGINE, y - 4.5, LARGHEZZA, 7, 'F')
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(255)
    doc.text(t.toUpperCase(), MARGINE + 2, y)
    doc.setTextColor(0)
    y += 9
  }

  const paragrafo = (testo, size = 9.5, colore = [40, 40, 40]) => {
    doc.setFont('helvetica', 'normal').setFontSize(size).setTextColor(...colore)
    const righe = doc.splitTextToSize(testo, LARGHEZZA)
    controllaPagina(righe.length * (size * 0.5) + 2)
    doc.text(righe, MARGINE, y)
    y += righe.length * (size * 0.5) + 3
    doc.setTextColor(0)
  }

  intestazione()

  // ---- letterhead studio
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...VERDE)
  doc.text(TECNICO, MARGINE, y)
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(90)
  doc.text(ALBO, MARGINE, y + 4.5)
  doc.setTextColor(0)
  y += 11

  // ---- conteggi e indicatori
  const conteggi = { A: 0, B: 0, C: 0, 'C/D': 0, D: 0 }
  for (const a of alberi) if (conteggi[a.cpc] != null) conteggi[a.cpc]++
  const prioritari = alberi.filter(isPrioritario).sort((x, z) => rank(x) - rank(z))
  const nIndagini = alberi.filter((a) => a.richiesta_indagine_strumentale).length
  const nEmergenze = alberi.filter((a) => a.intervento_emergenza).length

  // ---- oggetto + premessa
  titoloSezione('Oggetto e premessa metodologica')
  paragrafo(
    `Il presente documento riepiloga i rilievi di stabilità arborea (VTA) eseguiti per ` +
      `${comuneNome || 'la committenza'} ${
        dataDa || dataA ? `nel periodo ${dataIT(dataDa)} – ${dataIT(dataA)}` : ''
      }, per un totale di ${alberi.length} esemplari valutati.`
  )
  paragrafo(
    'La valutazione è condotta con metodo VTA di Livello 1 (analisi visiva speditiva) secondo il ' +
      'protocollo S.I.A.: la Classe di Propensione al Cedimento (CPC) deriva dai difetti rilevati nei ' +
      'distretti anatomici dell\'albero con la regola del valore peggiore; la classe di rischio integra ' +
      'la propensione con il bersaglio (frequentazione dell\'area). Il documento ha carattere ' +
      'interlocutorio: segnala le priorità d\'intervento in attesa della relazione tecnica conclusiva.',
    9,
    [90, 90, 90]
  )

  // ---- quadro di sintesi
  titoloSezione('Quadro di sintesi')
  const celle = ['A', 'B', 'C', 'C/D', 'D']
  const wCella = LARGHEZZA / celle.length
  celle.forEach((c, i) => {
    const meta = CPC_META[c]
    const [r, g, b] = hex(meta.bg)
    const x = MARGINE + i * wCella
    doc.setFillColor(r, g, b)
    doc.roundedRect(x + 1, y, wCella - 2, 17, 1.5, 1.5, 'F')
    const [tr, tg, tb] = hex(meta.color)
    doc.setTextColor(tr, tg, tb).setFont('helvetica', 'bold')
    doc.setFontSize(14).text(String(conteggi[c]), x + wCella / 2, y + 7.5, { align: 'center' })
    doc.setFontSize(7).text(`Classe ${c}`, x + wCella / 2, y + 13, { align: 'center' })
  })
  doc.setTextColor(0)
  y += 21

  // indicatori chiave
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(60)
  doc.text(
    `Totale valutati: ${alberi.length}    |    Interventi prioritari: ${prioritari.length}` +
      `    |    Indagini strumentali richieste: ${nIndagini}    |    Emergenze: ${nEmergenze}`,
    MARGINE,
    y
  )
  y += 5
  doc.setFontSize(7.5).setTextColor(120)
  doc.text(
    'Legenda CPC:  A Trascurabile · B Bassa · C Moderata · C/D Elevata · D Estrema',
    MARGINE,
    y
  )
  doc.setTextColor(0)
  y += 5

  // ---- interventi prioritari
  if (prioritari.length) {
    titoloSezione('Interventi prioritari (urgenti)', [185, 28, 28])

    const nota =
      'Per gli esemplari qui segnalati si suggerisce di valutare, in via cautelativa e nei tempi ' +
      'indicati, le opportune misure di messa in sicurezza dell\'area (ad esempio la delimitazione ' +
      'o il transennamento della zona di pertinenza) e di programmare gli interventi proposti ' +
      'secondo le priorità riportate. Lo scrivente resta a disposizione per concordare insieme ' +
      'modalità e tempi più idonei.'
    const righeNota = doc.splitTextToSize(nota, LARGHEZZA - 6)
    const hNota = righeNota.length * 4.2 + 6
    controllaPagina(hNota + 2)
    doc.setFillColor(255, 251, 235)
    doc.setDrawColor(217, 119, 6)
    doc.roundedRect(MARGINE, y - 2, LARGHEZZA, hNota, 1.5, 1.5, 'FD')
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(146, 64, 14)
    doc.text('Nota per la committenza – messa in sicurezza', MARGINE + 3, y + 2.5)
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(60)
    doc.text(righeNota, MARGINE + 3, y + 7)
    doc.setTextColor(0)
    y += hNota + 5

    const X0 = MARGINE + 6 // contenuto rientrato (barra colorata a sinistra)
    for (const a of prioritari) {
      controllaPagina(46)
      const meta = CPC_META[a.cpc] || CPC_META.A
      const yStart = y - 5

      // titolo scheda: badge CPC + codice + specie
      const [cr, cg, cb] = hex(meta.color)
      doc.setFillColor(cr, cg, cb)
      doc.roundedRect(X0, y, 18, 8, 1.5, 1.5, 'F')
      doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(9)
      doc.text(a.cpc || '—', X0 + 9, y + 5.5, { align: 'center' })
      doc.setTextColor(0).setFont('helvetica', 'bold').setFontSize(11)
      doc.text(`${a.codice || ''}   ${a.specie_botanica || ''}`, X0 + 22, y + 4)
      // badge rischio a destra
      if (a.classe_rischio && CLASSE_RISCHIO_META[a.classe_rischio]) {
        const rm = CLASSE_RISCHIO_META[a.classe_rischio]
        const [rr, rg, rb] = hex(rm.bg)
        const [tr, tg, tb] = hex(rm.color)
        const tw = doc.getTextWidth(a.classe_rischio) + 8
        doc.setFillColor(rr, rg, rb)
        doc.roundedRect(MARGINE + LARGHEZZA - tw, y, tw, 8, 1.5, 1.5, 'F')
        doc.setTextColor(tr, tg, tb).setFont('helvetica', 'bold').setFontSize(8)
        doc.text(`Rischio ${a.classe_rischio}`, MARGINE + LARGHEZZA - tw / 2, y + 5.3, { align: 'center' })
        doc.setTextColor(0)
      }
      doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(90)
      doc.text([a.localizzazione, a.indirizzo].filter(Boolean).join(' – ') || '—', X0 + 22, y + 8.5)
      doc.setTextColor(0)
      y += 12

      const riga = (et, v) => {
        if (!v) return
        controllaPagina(6)
        doc.setFont('helvetica', 'bold').setFontSize(8.5)
        doc.text(`${et}:`, X0, y)
        doc.setFont('helvetica', 'normal')
        const righe = doc.splitTextToSize(String(v), LARGHEZZA - 42)
        doc.text(righe, X0 + 32, y)
        y += righe.length * 4.2 + 1
      }

      if (a.intervento_emergenza) {
        controllaPagina(6)
        doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(185, 28, 28)
        doc.text('⚠ EMERGENZA – messa in sicurezza / abbattimento immediato', X0, y)
        doc.setTextColor(0)
        y += 5
      }
      const bio = [
        a.altezza_m != null ? `H ${a.altezza_m} m` : null,
        a.dbh_cm != null ? `DBH ${a.dbh_cm} cm` : null,
        a.diametro_chioma_m != null ? `chioma ${a.diametro_chioma_m} m` : null,
        a.fase_sviluppo,
      ].filter(Boolean).join(' · ')
      riga('Biometria', bio)
      riga('Difetti', sintesiStato(a))
      riga('Prescrizione', `${a.prescrizioni_gestionali || '—'}${a.urgenza_intervento ? ` — ${a.urgenza_intervento}` : ''}`)
      if (a.mitigazione_bersaglio) riga('Mitigazione', `${a.mitigazione_bersaglio}${a.urgenza_mitigazione ? ` — ${a.urgenza_mitigazione}` : ''}`)
      if (a.richiesta_indagine_strumentale) riga('Indagine', `${a.tipo_indagine_richiesta || ''}${a.urgenza_indagine ? ` — ${a.urgenza_indagine}` : ''}`)
      if (a.lat != null) {
        controllaPagina(6)
        doc.setFont('helvetica', 'bold').setFontSize(8.5)
        doc.text('Posizione:', X0, y)
        doc.setFont('helvetica', 'normal')
        doc.text(`${a.lat.toFixed(6)}, ${a.lng.toFixed(6)}`, X0 + 32, y)
        doc.setTextColor(37, 99, 235)
        doc.textWithLink('Apri in Google Maps', X0 + 78, y, { url: `https://www.google.com/maps?q=${a.lat},${a.lng}` })
        doc.setTextColor(0)
        y += 5.2
      }

      const dett = fotoDettagli ? fotoDettagli(a) : []
      if (dett[0]) {
        const dataUrl = await urlToDataURL(dett[0].url)
        if (dataUrl) {
          const dim = await dimensioniImg(dataUrl)
          let w = 100
          let h = (w * dim.h) / dim.w
          if (h > 75) { h = 75; w = (h * dim.w) / dim.h }
          controllaPagina(h + 4)
          try { doc.addImage(dataUrl, 'JPEG', X0, y, w, h, undefined, 'SLOW') } catch { /* ignora */ }
          y += h + 2
        }
      }
      // barra colorata a sinistra per dare forma di "scheda"
      doc.setFillColor(cr, cg, cb)
      doc.rect(MARGINE, yStart, 2.5, y - yStart - 1, 'F')
      doc.setDrawColor(225)
      doc.line(MARGINE, y, MARGINE + LARGHEZZA, y)
      y += 5
    }
  }

  // ---- elenco completo del periodo
  titoloSezione('Elenco completo del periodo')
  const col = [MARGINE + 1, MARGINE + 27, MARGINE + 44, MARGINE + 98, MARGINE + 140, MARGINE + 152, MARGINE + 170]
  const header = () => {
    doc.setFillColor(...VERDE)
    doc.rect(MARGINE, y - 4, LARGHEZZA, 6, 'F')
    doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(7.5)
    ;['Codice', 'Data', 'Specie', 'Localizzazione', 'CPC', 'Rischio', 'Pross. contr.'].forEach((t, i) =>
      doc.text(t, col[i], y)
    )
    doc.setTextColor(0)
    y += 5
  }
  header()
  const ordinati = [...alberi].sort((x, z) => rank(x) - rank(z))
  doc.setFont('helvetica', 'normal').setFontSize(7.8)
  ordinati.forEach((a, idx) => {
    if (y > 280) { doc.addPage(); intestazione(); doc.setFontSize(7.8); header() }
    if (idx % 2 === 1) {
      doc.setFillColor(244, 247, 245)
      doc.rect(MARGINE, y - 3.4, LARGHEZZA, 5, 'F')
    }
    doc.setFont('helvetica', 'normal').setFontSize(7.8).setTextColor(0)
    doc.text(String(a.codice || ''), col[0], y)
    doc.text(dataIT(a.data_rilievo), col[1], y)
    doc.text(doc.splitTextToSize(a.specie_botanica || '', 52)[0] || '', col[2], y)
    doc.text(doc.splitTextToSize([a.localizzazione, a.indirizzo].filter(Boolean).join(' – '), 40)[0] || '', col[3], y)
    const meta = CPC_META[a.cpc]
    if (meta) {
      const [r, g, b] = hex(meta.color)
      doc.setTextColor(r, g, b).setFont('helvetica', 'bold')
      doc.text(a.cpc, col[4], y)
      doc.setTextColor(0).setFont('helvetica', 'normal')
    }
    doc.text(a.classe_rischio || '—', col[5], y)
    doc.text(dataIT(a.data_prossimo_controllo), col[6], y)
    y += 5
  })

  // ---- conclusioni + firma
  titoloSezione('Conclusioni')
  paragrafo(
    'Si raccomanda di dare seguito agli interventi prioritari nei tempi indicati e di programmare ' +
      'gli altri secondo le scadenze di ricontrollo riportate. Il presente report non sostituisce la ' +
      'relazione tecnica conclusiva, alla quale si rinvia per le valutazioni di dettaglio e le eventuali ' +
      'indagini strumentali di approfondimento.'
  )
  controllaPagina(28)
  y += 6
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(0)
  doc.text(`Luogo e data: ____________________________`, MARGINE, y)
  doc.text('Il tecnico incaricato', MARGINE + LARGHEZZA, y, { align: 'right' })
  y += 12
  doc.setDrawColor(150)
  doc.line(MARGINE + LARGHEZZA - 70, y, MARGINE + LARGHEZZA, y)
  doc.setFont('helvetica', 'bold').setFontSize(9)
  doc.text(TECNICO, MARGINE + LARGHEZZA, y + 4.5, { align: 'right' })
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(90)
  doc.text('Dottore Agronomo – ODAF Lecce n° 636', MARGINE + LARGHEZZA, y + 8.5, { align: 'right' })
  doc.setTextColor(0)

  // piè di pagina
  const pagine = doc.getNumberOfPages()
  for (let i = 1; i <= pagine; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(120)
    doc.text(
      `Report VTA – ${comuneNome || 'Committente'} – generato il ${new Date().toLocaleDateString('it-IT')} – ${TECNICO} – pag. ${i}/${pagine}`,
      105, 292, { align: 'center' }
    )
    doc.setTextColor(0)
  }

  const slug = (comuneNome || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  doc.save(`Report_VTA_${slug}_${new Date().toISOString().slice(0, 10)}.pdf`)
}
