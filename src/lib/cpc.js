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

export function suggerisciCPC(record) {
  // override di emergenza: segni di cedimento imminente → forza Classe D
  if (record.intervento_emergenza) return 'D'
  return GRAVITA[gravitaMassima(record)]?.cpc || 'A'
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
