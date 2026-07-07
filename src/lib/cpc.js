import { CPC_META, GRAVITA, DISTRETTI, DISTRETTI_KEYS } from './constants'

// ----------------------------------------------------------------------------
// VTA Livello 1 (triage visuale speditivo). La CPC dipende dai DIFETTI
// dell'albero (i bersagli entrano nel rischio, non nella propensione) e si
// determina con la regola del "valore peggiore": si prende la gravità massima
// tra i difetti di tutti i distretti anatomici (zolla, colletto, fusto,
// castello, branche, chioma; "radici" è mantenuto per i record storici) e la si
// traduce nella classe corrispondente. La decisione finale resta al valutatore.
// ----------------------------------------------------------------------------

// Normalizza i difetti di un distretto in [{ nome, gravita }]:
// - formato nuovo: già oggetti { nome, gravita }
// - formato vecchio: stringhe, a cui si applica la gravità del distretto
export function normalizzaDifetti(sezione) {
  if (!sezione?.difetti?.length) return []
  return sezione.difetti.map((d) =>
    typeof d === 'string' ? { nome: d, gravita: sezione.gravita || 1 } : d
  )
}

// gravità massima di un distretto (massimo tra i suoi difetti)
export function gravitaDistretto(sezione) {
  return normalizzaDifetti(sezione).reduce((m, d) => Math.max(m, d.gravita || 0), 0)
}

// gravità massima dell'albero: il difetto più grave tra TUTTI i distretti
// (i 6 nuovi + i vecchi radici/fusto/chioma per i record precedenti)
export function gravitaMassima(record) {
  return DISTRETTI_KEYS.reduce((m, k) => Math.max(m, gravitaDistretto(record[k])), 0)
}

export function gravitaLabel(v) {
  return GRAVITA[v]?.label || 'Assente'
}

const ORD_CPC = ['A', 'B', 'C', 'C/D', 'D']

// inclinazione lineare recente/attiva (≥15°) senza curvatura correttiva:
// segno di cedimento in atto → eleva di una classe la propensione
export function inclinazionePericolosa(record) {
  const g = Number(record.inclinazione_gradi)
  return (
    record.inclinazione_tipo === 'Lineare' &&
    !record.curvatura_correttiva &&
    Number.isFinite(g) &&
    g >= 15
  )
}

export function suggerisciCPC(record) {
  // override: segni di cedimento imminente o instabilità al suolo → Classe D
  if (record.intervento_emergenza || record.instabilita_suolo) return 'D'
  const base = GRAVITA[gravitaMassima(record)]?.cpc || 'A'
  if (!inclinazionePericolosa(record)) return base
  const i = ORD_CPC.indexOf(base)
  return i >= 0 && i < ORD_CPC.length - 1 ? ORD_CPC[i + 1] : base
}

export function dataProssimoControllo(cpc, daData = new Date()) {
  const mesi = CPC_META[cpc]?.mesiControllo ?? 12
  const d = new Date(daData)
  d.setMonth(d.getMonth() + mesi)
  return d.toISOString().slice(0, 10)
}

// Codice univoco progressivo: NAR-2026-001
export function generaCodice(codiceComune, alberiEsistenti) {
  const anno = new Date().getFullYear()
  const prefix = `${codiceComune}-${anno}-`
  const massimo = alberiEsistenti
    .filter((a) => a.codice?.startsWith(prefix))
    .reduce((max, a) => {
      const n = parseInt(a.codice.slice(prefix.length), 10)
      return Number.isFinite(n) && n > max ? n : max
    }, 0)
  return `${prefix}${String(massimo + 1).padStart(3, '0')}`
}

// etichette dei distretti per la sintesi (nuovi + compatibilità "radici")
const ETICHETTE_DISTRETTI = {
  radici: 'radici', ...Object.fromEntries(DISTRETTI.map((d) => [d.key, d.label.toLowerCase()])),
}

// Sintesi testuale dello stato fitosanitario/strutturale per popup e PDF
export function sintesiStato(record) {
  const parti = []
  for (const k of DISTRETTI_KEYS) {
    const ds = normalizzaDifetti(record[k])
    if (ds.length) {
      parti.push(
        `${ETICHETTE_DISTRETTI[k]}: ` +
          ds.map((d) => `${d.nome.toLowerCase()} (${gravitaLabel(d.gravita).toLowerCase()})`).join(', ')
      )
    }
  }
  const testo = parti.length ? 'Difetti su ' + parti.join('; ') + '.' : 'Nessun difetto significativo rilevato.'
  return record.intervento_emergenza ? 'INTERVENTO DI EMERGENZA SEGNALATO. ' + testo : testo
}

// ----------------------------------------------------------------------------
// Modulo Rischio Liv.2: la propensione (CPC) incrocia il bersaglio (dato dalla
// frequenza di occupazione) in una matrice che restituisce la classe di rischio.
// È un suggerimento, modificabile dal valutatore.
// ----------------------------------------------------------------------------
const MATRICE_RISCHIO = {
  //          isolata     occasionale  costante
  A:    ['Basso', 'Basso', 'Basso'],
  B:    ['Basso', 'Basso', 'Moderato'],
  C:    ['Basso', 'Moderato', 'Elevato'],
  'C/D':['Moderato', 'Elevato', 'Estremo'],
  D:    ['Elevato', 'Estremo', 'Estremo'],
}

export function indiceBersaglio(frequenza) {
  if (frequenza === 'Area costantemente occupata') return 2
  if (frequenza === 'Area occasionalmente frequentata') return 1
  return 0
}

export function suggerisciRischio(cpc, frequenza) {
  return MATRICE_RISCHIO[cpc]?.[indiceBersaglio(frequenza)] || 'Basso'
}

// ISO 31000 – accettabilità della classe di rischio (frase pronta per scheda e
// verbale): rende esplicito che il rischio è la propensione (CPC) incrociata con
// la conseguenza (bersaglio), con la relativa soglia di accettabilità.
const ACCETTABILITA = {
  Basso: 'Rischio accettabile: nessuna azione oltre il controllo ordinario.',
  Moderato: 'Rischio tollerabile: monitoraggio periodico ed eventuali interventi colturali.',
  Elevato: 'Rischio tollerabile solo se ridotto per quanto ragionevolmente praticabile (ALARP): interventi da programmare a breve.',
  Estremo: 'Rischio inaccettabile: intervento di riduzione (messa in sicurezza o abbattimento) nei tempi indicati.',
}
export function accettabilitaRischio(classe) {
  return ACCETTABILITA[classe] || null
}

// Rischio residuo ATTESO dopo gli interventi prescritti: valore indicativo (non
// misurato). La buona pratica è prescrivere interventi che riconducano il rischio
// a un livello accettabile.
//  - emergenza / abbattimento / rimozione → Basso (bersaglio rimosso)
//  - con intervento colturale o mitigazione del bersaglio → scende di un livello
//  - senza interventi previsti → invariato
// ---------------------------------------------------------------------------
// Conseguenza (asse standard del rischio arboreo): quanto sarebbe GRAVE il danno
// se la parte cedesse. C = peso della parte × vulnerabilità del bersaglio (0–1).
// Tutto derivato dai dati già raccolti: la parte critica dal distretto col
// difetto peggiore, il bersaglio dall'elenco Bersagli. È un indice di gravità,
// NON una probabilità.
// ---------------------------------------------------------------------------
const PESO_PARTE = {
  chioma: 0.2, // rami e parti apicali
  branche: 0.5, ramificazione: 0.5, // branca grossa / cima
  castello: 1.0, fusto: 1.0, colletto: 1.0, zolla: 1.0, radici: 1.0, // fusto / ribaltamento
}
const ETICHETTA_PARTE = {
  chioma: 'chioma/rami', branche: 'branca', ramificazione: 'branca', castello: 'castello',
  fusto: 'fusto', colletto: 'colletto', zolla: 'zolla (ribaltamento)', radici: 'apparato radicale',
}

// distretto con la gravità più alta (la parte da cui verosimilmente cede)
export function distrettoCritico(record) {
  let best = null
  let max = -1
  for (const k of DISTRETTI_KEYS) {
    const g = gravitaDistretto(record[k])
    if (g > max) { max = g; best = k }
  }
  return max > 0 ? best : null
}

export function fattoreConseguenza(record) {
  const parte = distrettoCritico(record)
  const pesoParte = parte ? (PESO_PARTE[parte] ?? 0.5) : 0.5
  const bersagli = Array.isArray(record.bersagli) ? record.bersagli : []
  const sensibile = bersagli.some((b) => /sensibile|scuola|asilo|rsa/i.test(b))
  const persone = sensibile || bersagli.some((b) => /pedonale|veicolare|parcheggi|gioco|edific/i.test(b))
  const veicoli = bersagli.some((b) => /veicolare/i.test(b))
  const vulnerabilita = persone ? 1 : 0.3
  let c = pesoParte * vulnerabilita
  // maggiorazione per veicoli in transito o sito sensibile (recettori vulnerabili)
  if (veicoli || sensibile) c = Math.min(1, c * 1.2)
  c = Math.round(c * 100) / 100
  const livello = c >= 0.7 ? 'Alta' : c >= 0.3 ? 'Media' : 'Bassa'
  return {
    c,
    livello,
    parte: parte ? ETICHETTA_PARTE[parte] || parte : null,
    bersaglio: persone ? (veicoli ? 'persone e veicoli' : 'persone') : 'solo cose/beni',
  }
}

// descrizione discorsiva pronta per scheda/verbale
export function descriviConseguenza(record) {
  const f = fattoreConseguenza(record)
  const parti = [f.parte ? `parte critica: ${f.parte}` : null, `bersaglio: ${f.bersaglio}`].filter(Boolean)
  return `${f.livello} (${parti.join('; ')}; indice C = ${f.c.toLocaleString('it-IT')})`
}

// suggerimento prudenziale: quando la conseguenza è Alta ma la classe di rischio
// non è ancora la massima, invita a rivalutarla in via cautelativa (non modifica
// nulla in automatico: la decisione resta al tecnico)
export function nudgeConseguenza(record) {
  const f = fattoreConseguenza(record)
  if (f.livello === 'Alta' && record.classe_rischio && record.classe_rischio !== 'Estremo') {
    return 'Bersaglio ad alta conseguenza: valutare l\'elevazione cautelativa della classe di rischio.'
  }
  return null
}

const SCALA_RISCHIO = ['Basso', 'Moderato', 'Elevato', 'Estremo']
export function rischioResiduo(record) {
  const attuale = record.classe_rischio
  const i = SCALA_RISCHIO.indexOf(attuale)
  if (i < 0) return attuale || null
  const prescr = `${record.prescrizioni_gestionali || ''}`.toLowerCase()
  if (record.intervento_emergenza || /abbatt|rimoz|eliminaz/.test(prescr)) return 'Basso'
  if (record.prescrizioni_gestionali || record.mitigazione_bersaglio) return SCALA_RISCHIO[Math.max(0, i - 1)]
  return attuale
}
