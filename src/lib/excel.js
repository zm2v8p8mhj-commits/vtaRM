import * as XLSX from 'xlsx'
import { CPC_META, DISTRETTI } from './constants'
import { gravitaLabel, normalizzaDifetti, gravitaDistretto, rischioResiduo, descriviConseguenza } from './cpc'
import { stimaO2Annua, stimaPM10Annuo } from './servizi'

// una coppia di colonne (difetti + gravità max) per ciascun distretto
function difettiColonne(a) {
  const out = {}
  for (const d of DISTRETTI) {
    const ds = normalizzaDifetti(a[d.key])
    out[`Difetti ${d.label}`] = ds.map((x) => `${x.nome} (${gravitaLabel(x.gravita)})`).join('; ')
    out[`Gravità max ${d.label}`] = ds.length ? gravitaLabel(gravitaDistretto(a[d.key])) : ''
  }
  const storico = normalizzaDifetti(a.radici)
  if (storico.length) {
    out['Difetti radici (storico)'] = storico.map((x) => `${x.nome} (${gravitaLabel(x.gravita)})`).join('; ')
  }
  return out
}

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
    'Indirizzo': a.indirizzo || '',
    'Latitudine': a.lat ?? '',
    'Longitudine': a.lng ?? '',
    'Google Maps': a.lat != null ? `https://maps.google.com/?q=${a.lat},${a.lng}` : '',
    'Specie botanica': a.specie_botanica || '',
    'Altezza (m)': a.altezza_m ?? '',
    'DBH (cm)': a.dbh_cm ?? '',
    'Circonferenza (cm)': a.circonferenza_cm ?? '',
    'Diametro chioma (m)': a.diametro_chioma_m ?? '',
    'Ø branca (cm)': a.diametro_branca_cm ?? '',
    'Lungh. branca (m)': a.lunghezza_branca_m ?? '',
    'H branca (m)': a.altezza_branca_m ?? '',
    'H bersaglio (m)': a.altezza_bersaglio_m ?? '',
    'Fase di sviluppo': a.fase_sviluppo || '',
    'Vigoria': a.vigoria || '',
    'Fitopatie': a.fitopatie || '',
    'Agente cariogeno': a.agente_cariogeno || '',
    'Bersagli': (a.bersagli || []).join('; '),
    'Frequenza occupazione': a.frequenza_occupazione || '',
    'Conflitti': (a.conflitti || []).join('; '),
    'Conformità CAM Verde Urbano': a.conformita_cam || '',
    ...difettiColonne(a),
    'Note e osservazioni': a.note_osservazioni || '',
    'CPC': a.cpc || '',
    'CPC descrizione': CPC_META[a.cpc]?.label || '',
    'Classe di rischio': a.classe_rischio || '',
    'Rischio residuo atteso': rischioResiduo(a) || '',
    'Conseguenza attesa': descriviConseguenza(a),
    'Intervento emergenza': a.intervento_emergenza ? 'SÌ' : 'No',
    'Indagine strumentale': a.richiesta_indagine_strumentale ? 'Sì' : 'No',
    'Tipo indagine': a.richiesta_indagine_strumentale ? a.tipo_indagine_richiesta || '' : '',
    'Urgenza indagine': a.urgenza_indagine || '',
    'Prossimo controllo': dataIT(a.data_prossimo_controllo),
    'Interventi colturali': a.prescrizioni_gestionali || '',
    'Urgenza interventi': a.urgenza_intervento || '',
    'Mitigazione bersaglio': a.mitigazione_bersaglio || '',
    'Urgenza mitigazione': a.urgenza_mitigazione || '',
    'CO2 stoccata (kg)': a.co2_stoccata_kg ?? '',
    'CO2 assorbita (kg/anno)': a.co2_kg_anno ?? '',
    'O2 prodotto (kg/anno)': stimaO2Annua(a.specie_botanica, a.dbh_cm, a.altezza_m, a.fase_sviluppo, a.vigoria) ?? '',
    'PM10 rimosso (g/anno)': stimaPM10Annuo(a.diametro_chioma_m, a.vigoria) ?? '',
    'Canopy cover effettivo (m²)': a.canopy_cover_m2 ?? '',
    'Valore economico (€)': a.valore_economico_eur ?? '',
    'Inclinazione tipo': a.inclinazione_tipo || '',
    'Inclinazione (°)': a.inclinazione_gradi ?? '',
    'Curvatura correttiva': a.curvatura_correttiva ? 'Sì' : '',
    'Instabilità al suolo': a.instabilita_suolo ? 'SÌ' : '',
    'Compartimentazione (CODIT)': a.compartimentazione || '',
    'APC raggio (m)': a.apc_m ?? '',
    'Suolo ZPA': a.suolo_zpa || '',
    'Limiti valutazione': a.limiti_valutazione || '',
    'Motivazione scelte': a.motivazione_scelte || '',
    'Data ultimo intervento': dataIT(a.data_ultimo_intervento),
    'Note gestione': a.note_gestione || '',
    'N. foto': contaFoto ? contaFoto(a) : (a.url_foto || []).length,
    'Link foto': (a.url_foto || []).join(' | '),
  }))

  const ws = XLSX.utils.json_to_sheet(righe)

  // -------- foglio riepilogo: conteggi per committente x classe CPC --------
  const perComune = new Map()
  for (const a of alberi) {
    const nome = nomeComune(a) || '—'
    if (!perComune.has(nome)) perComune.set(nome, { A: 0, B: 0, C: 0, 'C/D': 0, D: 0 })
    const r = perComune.get(nome)
    if (r[a.cpc] != null) r[a.cpc]++
  }
  const righeRiepilogo = [...perComune.entries()].map(([nome, c]) => ({
    'Committente': nome,
    'Classe A (Trascurabile)': c.A,
    'Classe B (Bassa)': c.B,
    'Classe C (Moderata)': c.C,
    'Classe C/D (Elevata)': c['C/D'],
    'Classe D (Estrema)': c.D,
    'Totale': c.A + c.B + c.C + c['C/D'] + c.D,
    'Priorità (C+C/D+D)': c.C + c['C/D'] + c.D,
  }))
  const totale = { A: 0, B: 0, C: 0, 'C/D': 0, D: 0 }
  for (const c of perComune.values()) {
    totale.A += c.A; totale.B += c.B; totale.C += c.C; totale['C/D'] += c['C/D']; totale.D += c.D
  }
  if (righeRiepilogo.length > 1) {
    righeRiepilogo.push({
      'Committente': 'TOTALE',
      'Classe A (Trascurabile)': totale.A,
      'Classe B (Bassa)': totale.B,
      'Classe C (Moderata)': totale.C,
      'Classe C/D (Elevata)': totale['C/D'],
      'Classe D (Estrema)': totale.D,
      'Totale': totale.A + totale.B + totale.C + totale['C/D'] + totale.D,
      'Priorità (C+C/D+D)': totale.C + totale['C/D'] + totale.D,
    })
  }
  const wsRiepilogo = XLSX.utils.json_to_sheet(righeRiepilogo)
  wsRiepilogo['!cols'] = [26, 20, 16, 18, 20, 16, 9, 16].map((wch) => ({ wch }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Censimento')
  XLSX.utils.book_append_sheet(wb, wsRiepilogo, 'Riepilogo')
  XLSX.writeFile(wb, `${nomeFile}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}
