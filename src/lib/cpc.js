import { CPC_META } from './constants'

// ----------------------------------------------------------------------------
// La CPC (Classe di Propensione al Cedimento) dipende dai DIFETTI dell'albero,
// non dai bersagli: questi ultimi entrano nella valutazione del rischio, non
// della propensione. L'app quindi SUGGERISCE una classe in base alla gravità
// massima rilevata, ma la decisione finale resta al valutatore.
// ----------------------------------------------------------------------------

export function gravitaMassima(record) {
  return Math.max(
    record.radici?.difetti?.length ? record.radici.gravita || 0 : 0,
    record.fusto?.difetti?.length ? record.fusto.gravita || 0 : 0,
    record.chioma?.difetti?.length ? record.chioma.gravita || 0 : 0,
  )
}

export function suggerisciCPC(record) {
  const g = gravitaMassima(record)
  if (g >= 4) return 'D'
  if (g === 3) return 'C'
  if (g === 2) return 'B'
  return 'A'
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
    if (sezione?.difetti?.length) {
      parti.push(`${nome}: ${sezione.difetti.join(', ').toLowerCase()} (gravità ${sezione.gravita}/5)`)
    }
  }
  if (!parti.length) return 'Nessun difetto significativo rilevato.'
  return 'Difetti su ' + parti.join('; ') + '.'
}
