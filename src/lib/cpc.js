import { CPC_META, GRAVITA } from './constants'

// ----------------------------------------------------------------------------
// VTA Livello 1 (triage visuale speditivo). La CPC dipende dai DIFETTI
// dell'albero (i bersagli entrano nel rischio, non nella propensione) e si
// determina con la regola del "valore peggiore": si prende la gravità massima
// tra i tre distretti anatomici (radici, fusto, chioma) e la si traduce nella
// classe corrispondente. La decisione finale resta al valutatore.
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

// gravità massima dell'albero: il difetto più grave tra tutti i distretti
export function gravitaMassima(record) {
  return Math.max(
    gravitaDistretto(record.radici),
    gravitaDistretto(record.fusto),
    gravitaDistretto(record.chioma),
  )
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

// Sintesi testuale dello stato fitosanitario/strutturale per popup e PDF
export function sintesiStato(record) {
  const parti = []
  for (const [nome, sezione] of [
    ['radici', record.radici],
    ['fusto', record.fusto],
    ['chioma', record.chioma],
  ]) {
    const ds = normalizzaDifetti(sezione)
    if (ds.length) {
      parti.push(
        `${nome}: ` +
          ds.map((d) => `${d.nome.toLowerCase()} (${gravitaLabel(d.gravita).toLowerCase()})`).join(', ')
      )
    }
  }
  const testo = parti.length ? 'Difetti su ' + parti.join('; ') + '.' : 'Nessun difetto significativo rilevato.'
  return record.intervento_emergenza ? 'INTERVENTO DI EMERGENZA SEGNALATO. ' + testo : testo
}
