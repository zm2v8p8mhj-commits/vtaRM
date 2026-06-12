import * as XLSX from 'xlsx'
import { CPC_META } from './constants'
import { gravitaLabel } from './cpc'

// ----------------------------------------------------------------------------
// Export Excel: foglio "Censimento" con una riga per esemplare e tutte le
// colonne del modello dati, più un foglio "Riepilogo" con i conteggi per
// committente e classe CPC.
// ----------------------------------------------------------------------------

const dataIT = (v) => (v ? new Date(v).toLocaleDateString('it-IT') : '')

export function esportaExcel(alberi, comuni, contaFoto, nomeFile = 'censimento_vta') {
  const nomeComune = (a) =>
    a.comune_nome || comuni.find((c) => c.id === a.comune_id)?.nome || ''

  const righe = alberi.map((a) => ({
    'Codice': a.codice || '',
    'Committente': nomeComune(a),
    'Data rilievo': a.data_rilievo ? new Date(a.data_rilievo).toLocaleString('it-IT') : '',
    'Rilevatore': a.rilevatore || '',
    'Localizzazione': a.localizzazione || '',
    'Latitudine': a.lat ?? '',
    'Longitudine': a.lng ?? '',
    'Google Maps': a.lat != null ? `https://maps.google.com/?q=${a.lat},${a.lng}` : '',
    'Specie botanica': a.specie_botanica || '',
    'Altezza (m)': a.altezza_m ?? '',
    'DBH (cm)': a.dbh_cm ?? '',
    'Diametro chioma (m)': a.diametro_chioma_m ?? '',
    'Fase di sviluppo': a.fase_sviluppo || '',
    'Bersagli': (a.bersagli || []).join('; '),
    'Frequenza occupazione': a.frequenza_occupazione || '',
    'Difetti radici': (a.radici?.difetti || []).join('; '),
    'Gravità radici': gravitaLabel(a.radici?.gravita || 0),
    'Difetti fusto': (a.fusto?.difetti || []).join('; '),
    'Gravità fusto': gravitaLabel(a.fusto?.gravita || 0),
    'Difetti chioma': (a.chioma?.difetti || []).join('; '),
    'Gravità chioma': gravitaLabel(a.chioma?.gravita || 0),
    'Note e osservazioni': a.note_osservazioni || '',
    'CPC': a.cpc || '',
    'CPC descrizione': CPC_META[a.cpc]?.label || '',
    'Intervento emergenza': a.intervento_emergenza ? 'SÌ' : 'No',
    'Indagine strumentale': a.richiesta_indagine_strumentale ? 'Sì' : 'No',
    'Tipo indagine': a.richiesta_indagine_strumentale ? a.tipo_indagine_richiesta || '' : '',
    'Prossimo controllo': dataIT(a.data_prossimo_controllo),
    'Prescrizioni gestionali': a.prescrizioni_gestionali || '',
    'N. foto': contaFoto ? contaFoto(a) : (a.url_foto || []).length,
    'Link foto': (a.url_foto || []).join(' | '),
  }))

  const ws = XLSX.utils.json_to_sheet(righe)
  // larghezze colonne proporzionate al contenuto tipico
  ws['!cols'] = [
    14, 24, 17, 22, 22, 11, 11, 30, 22, 10, 9, 15, 14, 28, 26,
    34, 16, 34, 15, 34, 16, 40, 5, 22, 12, 16, 16, 15, 36, 7, 50,
  ].map((wch) => ({ wch }))

  // -------- foglio riepilogo: conteggi per committente x classe CPC --------
  const perComune = new Map()
  for (const a of alberi) {
    const nome = nomeComune(a) || '—'
    if (!perComune.has(nome)) perComune.set(nome, { A: 0, B: 0, C: 0, D: 0 })
    const r = perComune.get(nome)
    if (r[a.cpc] != null) r[a.cpc]++
  }
  const righeRiepilogo = [...perComune.entries()].map(([nome, c]) => ({
    'Committente': nome,
    'Classe A (Trascurabile)': c.A,
    'Classe B (Bassa)': c.B,
    'Classe C (Moderata)': c.C,
    'Classe D (Elevata/Estrema)': c.D,
    'Totale': c.A + c.B + c.C + c.D,
    'Priorità (C+D)': c.C + c.D,
  }))
  const totale = { A: 0, B: 0, C: 0, D: 0 }
  for (const c of perComune.values()) {
    totale.A += c.A; totale.B += c.B; totale.C += c.C; totale.D += c.D
  }
  if (righeRiepilogo.length > 1) {
    righeRiepilogo.push({
      'Committente': 'TOTALE',
      'Classe A (Trascurabile)': totale.A,
      'Classe B (Bassa)': totale.B,
      'Classe C (Moderata)': totale.C,
      'Classe D (Elevata/Estrema)': totale.D,
      'Totale': totale.A + totale.B + totale.C + totale.D,
      'Priorità (C+D)': totale.C + totale.D,
    })
  }
  const wsRiepilogo = XLSX.utils.json_to_sheet(righeRiepilogo)
  wsRiepilogo['!cols'] = [26, 20, 16, 18, 24, 9, 14].map((wch) => ({ wch }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Censimento')
  XLSX.utils.book_append_sheet(wb, wsRiepilogo, 'Riepilogo')
  XLSX.writeFile(wb, `${nomeFile}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}
