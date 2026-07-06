import { jsPDF } from 'jspdf'
import { CPC_META, CLASSE_RISCHIO_META } from './constants'
import { sintesiStato, accettabilitaRischio, rischioResiduo } from './cpc'
import { urlToDataURL, dimensioniImg } from './pdf'

// ----------------------------------------------------------------------------
// Report di periodo per il committente. Linea grafica sobria e tecnica:
// un solo colore d'accento (verde istituzionale), testo su scala di grigi,
// il colore della classe CPC ridotto a un piccolo segno. Niente riquadri pieni.
// ----------------------------------------------------------------------------

const MARGINE = 16
const LARGHEZZA = 210 - MARGINE * 2
const LABEL_X = MARGINE + 30 // colonna valori allineata

const ACCENT = [22, 101, 52]
const INK = [33, 37, 41]
const MUTE = [110, 116, 124]
const LINE = [214, 218, 222]
const FILL = [244, 246, 245]

const TECNICO = 'Dott. Agr. Ruggero Manca'

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

export async function generaReport(
  alberi,
  { comuneNome = '', dataDa, dataA, fotoDettagli, zonaEtichetta = '', descrizioneGenerale = '', zonaPunti = null } = {}
) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = 0
  // i report di zona sono "Verbali di sopralluogo"
  const verbale = Boolean(zonaEtichetta)
  const docTipo = verbale ? 'Verbale di sopralluogo' : 'Report di sopralluogo VTA'

  // intestazione minimale: filetto verde + titolo, ripetuta a ogni pagina
  const intestazione = () => {
    doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(...ACCENT)
    doc.text(docTipo, MARGINE, 16)
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTE)
    doc.text(comuneNome || 'Committente', MARGINE, 21)
    const periodo = zonaEtichetta || (dataDa || dataA ? `${dataIT(dataDa)} – ${dataIT(dataA)}` : 'Tutti i rilievi')
    doc.text(`${periodo}  ·  emesso il ${new Date().toLocaleDateString('it-IT')}`, 210 - MARGINE, 21, { align: 'right' })
    doc.setDrawColor(...ACCENT).setLineWidth(0.6)
    doc.line(MARGINE, 24, 210 - MARGINE, 24)
    doc.setLineWidth(0.2).setTextColor(0)
    y = 32
  }

  const controllaPagina = (h = 10) => {
    if (y + h > 280) {
      doc.addPage()
      intestazione()
    }
  }

  // titolo di sezione: testo verde + sottile filetto, niente riquadro pieno.
  // riservo spazio per l'intestazione + alcune righe, così non resta "orfana"
  // a fondo pagina (con il contenuto che scivola alla pagina dopo).
  const sezione = (t, riserva = 24) => {
    controllaPagina(riserva)
    y += 3
    doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...ACCENT)
    doc.text(t.toUpperCase(), MARGINE, y)
    y += 1.8
    doc.setDrawColor(...ACCENT).setLineWidth(0.4)
    doc.line(MARGINE, y, MARGINE + LARGHEZZA, y)
    doc.setLineWidth(0.2).setTextColor(0)
    y += 5
  }

  const paragrafo = (testo, colore = INK, size = 9.2) => {
    doc.setFont('helvetica', 'normal').setFontSize(size).setTextColor(...colore)
    const righe = doc.splitTextToSize(testo, LARGHEZZA)
    controllaPagina(righe.length * 4.4 + 2)
    doc.text(righe, MARGINE, y)
    y += righe.length * 4.4 + 3
    doc.setTextColor(0)
  }

  // riga etichetta/valore con colonna allineata
  const campo = (et, v, x0 = MARGINE) => {
    if (!v) return
    controllaPagina(6)
    doc.setFont('helvetica', 'bold').setFontSize(8.8).setTextColor(...INK)
    doc.text(et, x0, y)
    doc.setFont('helvetica', 'normal').setTextColor(...INK)
    const righe = doc.splitTextToSize(String(v), MARGINE + LARGHEZZA - LABEL_X)
    doc.text(righe, LABEL_X, y)
    y += righe.length * 4.4 + 1.2
    doc.setTextColor(0)
  }

  intestazione()

  // ---- letterhead studio
  doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...INK)
  doc.text(TECNICO, MARGINE, y)
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTE)
  doc.text('Dottore Agronomo · ODAF Lecce n° 636 · idearurale', MARGINE, y + 4.3)
  doc.setTextColor(0)
  y += 11

  const conteggi = { A: 0, B: 0, C: 0, 'C/D': 0, D: 0 }
  for (const a of alberi) if (conteggi[a.cpc] != null) conteggi[a.cpc]++
  const prioritari = alberi.filter(isPrioritario).sort((x, z) => rank(x) - rank(z))
  const nIndagini = alberi.filter((a) => a.richiesta_indagine_strumentale).length
  const nEmergenze = alberi.filter((a) => a.intervento_emergenza).length

  // ---- oggetto + premessa
  sezione('Oggetto e premessa metodologica')
  paragrafo(
    `Il presente ${verbale ? 'verbale' : 'documento'} riepiloga ` +
      `${verbale ? 'il sopralluogo di stabilità arborea eseguito' : 'i rilievi di stabilità arborea eseguiti'} per ` +
      `${comuneNome || 'la committenza'}${
        verbale
          ? ' nell\'area perimetrata in cartografia'
          : dataDa || dataA
            ? ` nel periodo ${dataIT(dataDa)} – ${dataIT(dataA)}`
            : ''
      }, per complessivi ${alberi.length} esemplari valutati.`
  )
  paragrafo(
    'Valutazione condotta con metodo VTA – Visual Tree Assessment (Mattheck & Breloer) di Livello 1 ' +
      '(analisi visiva): la Classe di Propensione al Cedimento (CPC) deriva dai difetti rilevati nei ' +
      'distretti anatomici con la regola del valore peggiore; la valutazione del rischio integra la ' +
      'propensione con il bersaglio secondo i principi della norma ISO 31000. Per gli esemplari con ' +
      'propensione elevata o quadro non dirimente si raccomanda l\'approfondimento strumentale di ' +
      'Livello 2. Il documento ha carattere interlocutorio e segnala le priorità d\'intervento in attesa ' +
      'della relazione tecnica conclusiva.',
    MUTE,
    8.6
  )

  // ---- quadro di sintesi (sobrio: piccoli segni colore + conteggi)
  sezione('Quadro di sintesi')
  doc.setFillColor(...FILL)
  doc.roundedRect(MARGINE, y, LARGHEZZA, 16, 1.5, 1.5, 'F')
  const passo = LARGHEZZA / 5
  ;['A', 'B', 'C', 'C/D', 'D'].forEach((c, i) => {
    const x = MARGINE + i * passo + 7
    const [r, g, b] = hex(CPC_META[c].color)
    doc.setFillColor(r, g, b)
    doc.rect(x, y + 5.5, 3.2, 3.2, 'F')
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...INK)
    doc.text(String(conteggi[c]), x + 5.5, y + 8.6)
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUTE)
    doc.text(`Classe ${c}`, x, y + 12.6)
  })
  doc.setTextColor(0)
  y += 20
  doc.setFont('helvetica', 'normal').setFontSize(8.6).setTextColor(...INK)
  doc.text(
    `Totale valutati ${alberi.length}    ·    Interventi prioritari ${prioritari.length}    ·    ` +
      `Indagini strumentali ${nIndagini}    ·    Emergenze ${nEmergenze}`,
    MARGINE,
    y
  )
  y += 4.5
  doc.setFontSize(7.3).setTextColor(...MUTE)
  doc.text('A Trascurabile · B Bassa · C Moderata · C/D Elevata · D Estrema', MARGINE, y)
  doc.setTextColor(0)
  y += 4

  // ---- legenda classi CPC, in linguaggio comprensibile a chiunque
  if (verbale) {
    const DESCR = {
      A: 'Albero in buone condizioni e stabile. Nessun intervento necessario: è sufficiente il controllo ordinario.',
      B: 'Lievi difetti, situazione sotto controllo. Si raccomanda solo un monitoraggio periodico.',
      C: 'Difetti significativi da tenere sotto osservazione. Possibili interventi e controlli più frequenti.',
      'C/D': 'Condizioni preoccupanti. Servono interventi e/o accertamenti strumentali in tempi brevi.',
      D: 'Elevata probabilità di cedimento. Intervento urgente di messa in sicurezza o abbattimento.',
    }
    sezione('Legenda — classi di propensione al cedimento (CPC)')
    paragrafo(
      'La classe CPC esprime quanto è probabile che l\'albero, o una sua parte, possa cedere. È la scala che ' +
        'guida priorità e urgenza degli interventi; di seguito il significato di ciascuna classe.',
      MUTE,
      8.4
    )
    for (const c of ['A', 'B', 'C', 'C/D', 'D']) {
      const m = CPC_META[c]
      const [r, g, b] = hex(m.color)
      const righe = doc.splitTextToSize(DESCR[c], MARGINE + LARGHEZZA - (MARGINE + 42))
      controllaPagina(Math.max(righe.length * 4.2, 6) + 2)
      doc.setFillColor(r, g, b)
      doc.roundedRect(MARGINE, y - 3.4, 8, 5, 1, 1, 'F')
      doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(7.5)
      doc.text(c, MARGINE + 4, y, { align: 'center' })
      doc.setTextColor(...INK).setFont('helvetica', 'bold').setFontSize(8.8)
      doc.text(m.breve, MARGINE + 12, y)
      doc.setFont('helvetica', 'normal').setTextColor(...MUTE).setFontSize(8.4)
      doc.text(righe, MARGINE + 42, y)
      doc.setTextColor(0)
      y += Math.max(righe.length * 4.2, 5) + 1.6
    }
  }

  // ---- stato generale del verde (descrizione discorsiva del tecnico)
  if (descrizioneGenerale && descrizioneGenerale.trim()) {
    sezione('Stato generale del verde')
    paragrafo(descrizioneGenerale.trim())
  }

  // ---- interventi prioritari
  if (prioritari.length) {
    sezione('Interventi prioritari')

    // nota committenza: box grigio chiaro con filetto verde a sinistra
    const nota =
      'Per gli esemplari segnalati si suggerisce di valutare, in via cautelativa e nei tempi indicati, ' +
      'le opportune misure di messa in sicurezza dell\'area (delimitazione o transennamento della zona ' +
      'di pertinenza) e di programmare gli interventi proposti secondo le priorità riportate. Lo ' +
      'scrivente resta a disposizione per concordare insieme modalità e tempi più idonei.'
    const righeNota = doc.splitTextToSize(nota, LARGHEZZA - 10)
    const hNota = righeNota.length * 4 + 9
    controllaPagina(hNota + 2)
    doc.setFillColor(...FILL)
    doc.roundedRect(MARGINE, y, LARGHEZZA, hNota, 1.5, 1.5, 'F')
    doc.setFillColor(...ACCENT)
    doc.rect(MARGINE, y, 2, hNota, 'F')
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...INK)
    doc.text('Nota per la committenza — messa in sicurezza', MARGINE + 5, y + 5)
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTE)
    doc.text(righeNota, MARGINE + 5, y + 9.5)
    doc.setTextColor(0)
    y += hNota + 6

    const larghVal = MARGINE + LARGHEZZA - LABEL_X
    for (let k = 0; k < prioritari.length; k++) {
      const a = prioritari[k]
      const meta = CPC_META[a.cpc] || CPC_META.A

      // --- raccolgo prima campi e foto, così posso misurare la scheda e
      //     tenerla tutta sulla stessa pagina (niente spezzature)
      const bio = [
        a.altezza_m != null ? `H ${a.altezza_m} m` : null,
        a.dbh_cm != null ? `DBH ${a.dbh_cm} cm` : null,
        a.diametro_chioma_m != null ? `chioma ${a.diametro_chioma_m} m` : null,
        a.fase_sviluppo,
      ].filter(Boolean).join(' · ')
      const campi = [
        ['Biometria', bio],
        ['Difetti', sintesiStato(a)],
        ['Prescrizione', `${a.prescrizioni_gestionali || '—'}${a.urgenza_intervento ? ` — ${a.urgenza_intervento}` : ''}`],
      ]
      if (a.mitigazione_bersaglio) campi.push(['Mitigazione', `${a.mitigazione_bersaglio}${a.urgenza_mitigazione ? ` — ${a.urgenza_mitigazione}` : ''}`])
      if (a.richiesta_indagine_strumentale) campi.push(['Indagine', `${a.tipo_indagine_richiesta || ''}${a.urgenza_indagine ? ` — ${a.urgenza_indagine}` : ''}`])
      const residuo = rischioResiduo(a)
      if (residuo && residuo !== a.classe_rischio) campi.push(['Rischio residuo', `${residuo} (atteso, a interventi eseguiti)`])
      const acc = accettabilitaRischio(a.classe_rischio)
      if (acc) campi.push(['Accettabilità', acc])

      let foto = null
      const dett = fotoDettagli ? fotoDettagli(a) : []
      if (dett[0]) {
        const dataUrl = await urlToDataURL(dett[0].url)
        if (dataUrl) {
          const dim = await dimensioniImg(dataUrl)
          let w = 80
          let h = (w * dim.h) / dim.w
          if (h > 56) { h = 56; w = (h * dim.w) / dim.h }
          foto = { dataUrl, w, h }
        }
      }

      // altezza stimata (coerente col rendering qui sotto)
      let hScheda = 10 // titolo + luogo
      if (a.intervento_emergenza) hScheda += 5
      for (const [, v] of campi) {
        if (!v) continue
        hScheda += doc.splitTextToSize(String(v), larghVal).length * 4.4 + 1.2
      }
      if (a.lat != null) hScheda += 5.5
      if (foto) hScheda += foto.h + 2.5
      hScheda += 5 // separatore
      controllaPagina(hScheda)

      // riga titolo: chip CPC + codice/specie  ·  rischio a destra
      const [cr, cg, cb] = hex(meta.color)
      doc.setFillColor(cr, cg, cb)
      doc.roundedRect(MARGINE, y - 3.6, 7, 5.4, 1, 1, 'F')
      doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(8)
      doc.text(a.cpc || '—', MARGINE + 3.5, y, { align: 'center' })
      doc.setTextColor(...INK).setFont('helvetica', 'bold').setFontSize(10.5)
      doc.text(`${a.codice || ''}   ${a.specie_botanica || ''}`, MARGINE + 10, y)
      if (a.classe_rischio) {
        doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...MUTE)
        doc.text(`Rischio: ${a.classe_rischio}`, MARGINE + LARGHEZZA, y, { align: 'right' })
      }
      doc.setTextColor(0)
      y += 5
      doc.setFont('helvetica', 'normal').setFontSize(8.3).setTextColor(...MUTE)
      doc.text([a.localizzazione, a.indirizzo].filter(Boolean).join(' · ') || '—', MARGINE + 10, y)
      doc.setTextColor(0)
      y += 5

      if (a.intervento_emergenza) {
        doc.setFont('helvetica', 'bold').setFontSize(8.6).setTextColor(180, 35, 35)
        doc.text('Emergenza — messa in sicurezza o abbattimento immediato', MARGINE, y)
        doc.setTextColor(0)
        y += 5
      }
      for (const [et, v] of campi) campo(et, v)
      if (a.lat != null) {
        doc.setFont('helvetica', 'bold').setFontSize(8.8).setTextColor(...INK)
        doc.text('Posizione', MARGINE, y)
        doc.setFont('helvetica', 'normal')
        doc.text(`${a.lat.toFixed(6)}, ${a.lng.toFixed(6)}`, LABEL_X, y)
        doc.setTextColor(...ACCENT)
        doc.textWithLink('apri in Google Maps', LABEL_X + 46, y, { url: `https://www.google.com/maps?q=${a.lat},${a.lng}` })
        doc.setTextColor(0)
        y += 5.5
      }
      if (foto) {
        try { doc.addImage(foto.dataUrl, 'JPEG', MARGINE, y, foto.w, foto.h, undefined, 'SLOW') } catch { /* ignora */ }
        y += foto.h + 2.5
      }
      // separatore sottile tra schede (non dopo l'ultima)
      if (k < prioritari.length - 1) {
        doc.setDrawColor(...LINE).setLineWidth(0.2)
        doc.line(MARGINE, y, MARGINE + LARGHEZZA, y)
        y += 5
      }
    }
    y += 2
  }

  // ---- elenco completo
  sezione(zonaEtichetta ? 'Elenco completo dell\'area' : 'Elenco completo del periodo')
  const col = [MARGINE, MARGINE + 26, MARGINE + 42, MARGINE + 96, MARGINE + 138, MARGINE + 150, MARGINE + 168]
  const header = () => {
    doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...MUTE)
    ;['Codice', 'Data', 'Specie', 'Indirizzo', 'CPC', 'Rischio', 'Controllo'].forEach((t, i) =>
      doc.text(t, col[i], y)
    )
    y += 1.6
    doc.setDrawColor(...LINE).setLineWidth(0.3)
    doc.line(MARGINE, y, MARGINE + LARGHEZZA, y)
    y += 4
    doc.setTextColor(0)
  }
  header()
  const ordinati = [...alberi].sort((x, z) => rank(x) - rank(z))
  ordinati.forEach((a, idx) => {
    if (y > 280) { doc.addPage(); intestazione(); header() }
    if (idx % 2 === 1) {
      doc.setFillColor(...FILL)
      doc.rect(MARGINE, y - 3.3, LARGHEZZA, 5, 'F')
    }
    doc.setFont('helvetica', 'normal').setFontSize(7.8).setTextColor(...INK)
    doc.text(String(a.codice || ''), col[0], y)
    doc.text(dataIT(a.data_rilievo), col[1], y)
    doc.text(doc.splitTextToSize(a.specie_botanica || '', 50)[0] || '', col[2], y)
    // mostra la via rilevata in automatico; ripiega sulla tipologia se assente
    doc.text(doc.splitTextToSize(a.indirizzo || a.localizzazione || '', 40)[0] || '', col[3], y)
    const meta = CPC_META[a.cpc]
    if (meta) {
      const [r, g, b] = hex(meta.color)
      doc.setFillColor(r, g, b)
      doc.rect(col[4], y - 2.6, 2.6, 2.6, 'F')
      doc.setTextColor(...INK).setFont('helvetica', 'bold')
      doc.text(a.cpc, col[4] + 4, y)
      doc.setFont('helvetica', 'normal')
    }
    doc.setTextColor(...INK)
    doc.text(a.classe_rischio || '—', col[5], y)
    doc.text(dataIT(a.data_prossimo_controllo), col[6], y)
    y += 5
  })
  doc.setTextColor(0)

  // ---- conclusioni + firma
  sezione('Conclusioni')
  paragrafo(
    'Si raccomanda di dare seguito agli interventi prioritari nei tempi indicati e di programmare gli ' +
      `altri secondo le scadenze di ricontrollo riportate. Il presente ${verbale ? 'verbale' : 'documento'} non sostituisce la ` +
      'relazione tecnica conclusiva, alla quale si rinvia per le valutazioni di dettaglio e le eventuali ' +
      'indagini strumentali di approfondimento.'
  )
  controllaPagina(26)
  y += 8
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...INK)
  doc.text('Luogo e data  ____________________________', MARGINE, y)
  doc.setDrawColor(...LINE).setLineWidth(0.3)
  doc.line(MARGINE + LARGHEZZA - 64, y, MARGINE + LARGHEZZA, y)
  doc.setFont('helvetica', 'bold').setFontSize(9)
  doc.text(TECNICO, MARGINE + LARGHEZZA, y + 4.5, { align: 'right' })
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTE)
  doc.text('Dottore Agronomo · ODAF Lecce n° 636', MARGINE + LARGHEZZA, y + 8.5, { align: 'right' })
  doc.setTextColor(0)

  // piè di pagina coerente
  const pagine = doc.getNumberOfPages()
  for (let i = 1; i <= pagine; i++) {
    doc.setPage(i)
    doc.setDrawColor(...LINE).setLineWidth(0.2)
    doc.line(MARGINE, 286, 210 - MARGINE, 286)
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUTE)
    doc.text(`${comuneNome || 'Committente'} · ${verbale ? 'Verbale di sopralluogo' : 'Report VTA'}`, MARGINE, 290)
    doc.text(`${TECNICO}`, 105, 290, { align: 'center' })
    doc.text(`pag. ${i}/${pagine}`, 210 - MARGINE, 290, { align: 'right' })
    doc.setTextColor(0)
  }

  const slug = (comuneNome || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  const prefisso = verbale ? 'Verbale_sopralluogo' : 'Report_VTA'
  doc.save(`${prefisso}_${slug}_${new Date().toISOString().slice(0, 10)}.pdf`)
}
