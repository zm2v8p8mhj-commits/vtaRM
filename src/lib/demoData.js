import { dataProssimoControllo } from './cpc'

// Dati di esempio caricati al primo avvio in modalità demo (senza Supabase),
// per provare subito mappa, filtri, PDF ed export.

function albero(parz) {
  const base = {
    id: crypto.randomUUID(),
    data_rilievo: new Date('2026-05-12T09:30:00').toISOString(),
    rilevatore: 'Dott. Agr. Ruggero Manca',
    bersagli: ['Viabilità pedonale'],
    frequenza_occupazione: 'Area costantemente occupata',
    radici: { difetti: [] },
    fusto: { difetti: [] },
    chioma: { difetti: [] },
    note_osservazioni: '',
    richiesta_indagine_strumentale: false,
    intervento_emergenza: false,
    tipo_indagine_richiesta: 'Nessuna',
    url_foto: [],
    _synced: false,
  }
  const record = { ...base, ...parz }
  record.data_prossimo_controllo = dataProssimoControllo(record.cpc, new Date(record.data_rilievo))
  return record
}

export const ALBERI_DEMO = [
  albero({
    codice: 'NAR-2026-001', comune_id: 'demo-nardo', comune_nome: 'Comune di Nardò',
    lat: 40.17682, lng: 18.03249, localizzazione: 'Piazza',
    specie_botanica: 'Quercus ilex', altezza_m: 14, dbh_cm: 62, diametro_chioma_m: 11,
    fase_sviluppo: 'Maturo', cpc: 'A',
    prescrizioni_gestionali: 'Nessun intervento – monitoraggio ordinario',
  }),
  albero({
    codice: 'NAR-2026-002', comune_id: 'demo-nardo', comune_nome: 'Comune di Nardò',
    lat: 40.17750, lng: 18.03390, localizzazione: 'Viale alberato',
    specie_botanica: 'Pinus pinea', altezza_m: 18, dbh_cm: 75, diametro_chioma_m: 13,
    fase_sviluppo: 'Maturo', cpc: 'C',
    bersagli: ['Viabilità veicolare', 'Parcheggi'],
    radici: { difetti: [{ nome: 'Radici affioranti danneggiate', gravita: 2 }, { nome: 'Asfissia radicale / pavimentazione', gravita: 2 }] },
    fusto: { difetti: [{ nome: 'Inclinazione anomala', gravita: 2 }] },
    chioma: { difetti: [{ nome: 'Branche morte', gravita: 2 }] },
    note_osservazioni: 'Sollevamento del marciapiede in corrispondenza delle radici principali.',
    prescrizioni_gestionali: 'Potatura di rimonda del secco; monitoraggio ravvicinato apparato radicale',
  }),
  albero({
    codice: 'NAR-2026-003', comune_id: 'demo-nardo', comune_nome: 'Comune di Nardò',
    lat: 40.17580, lng: 18.03110, localizzazione: 'Parco / giardino pubblico',
    specie_botanica: 'Platanus x acerifolia', altezza_m: 21, dbh_cm: 88, diametro_chioma_m: 15,
    fase_sviluppo: 'Senescente', cpc: 'D',
    bersagli: ['Aree gioco', 'Viabilità pedonale'],
    fusto: { difetti: [{ nome: 'Cavità', gravita: 4 }, { nome: 'Carie / legno degradato', gravita: 4 }, { nome: 'Carpofori', gravita: 4 }] },
    chioma: { difetti: [{ nome: 'Branche morte', gravita: 3 }, { nome: 'Sbrancature', gravita: 3 }] },
    note_osservazioni: 'Estesa cavità basale con carie bianca, carpofori di Ganoderma al colletto.',
    richiesta_indagine_strumentale: true, tipo_indagine_richiesta: 'Tomografia sonica',
    prescrizioni_gestionali: 'Transennamento immediato area di pertinenza; abbattimento previa conferma strumentale',
  }),
  albero({
    codice: 'NAR-2026-004', comune_id: 'demo-nardo', comune_nome: 'Comune di Nardò',
    lat: 40.17820, lng: 18.03050, localizzazione: 'Scuola',
    specie_botanica: 'Tilia spp.', altezza_m: 12, dbh_cm: 45, diametro_chioma_m: 8,
    fase_sviluppo: 'Adulto', cpc: 'B',
    bersagli: ['Edifici', 'Aree gioco'],
    chioma: { difetti: [{ nome: 'Branche codominanti', gravita: 1 }, { nome: 'Inserzioni deboli / corteccia inclusa', gravita: 1 }] },
    prescrizioni_gestionali: 'Potatura di riduzione / alleggerimento delle branche codominanti',
  }),
  albero({
    codice: 'NAR-2026-005', comune_id: 'demo-nardo', comune_nome: 'Comune di Nardò',
    lat: 40.17480, lng: 18.03330, localizzazione: 'Lungomare',
    specie_botanica: 'Washingtonia robusta', altezza_m: 16, dbh_cm: 40, diametro_chioma_m: 5,
    fase_sviluppo: 'Adulto', cpc: 'A',
    bersagli: ['Viabilità pedonale'],
    prescrizioni_gestionali: 'Nessun intervento – monitoraggio ordinario',
  }),
  albero({
    codice: 'NAR-2026-006', comune_id: 'demo-nardo', comune_nome: 'Comune di Nardò',
    lat: 40.17900, lng: 18.03460, localizzazione: 'Cimitero',
    specie_botanica: 'Cupressus sempervirens', altezza_m: 17, dbh_cm: 38, diametro_chioma_m: 4,
    fase_sviluppo: 'Maturo', cpc: 'B',
    bersagli: ['Recinzioni', 'Arredo urbano'],
    fusto: { difetti: [{ nome: 'Ferite / lesioni corticali', gravita: 1 }] },
    prescrizioni_gestionali: 'Monitoraggio ravvicinato',
  }),
  albero({
    codice: 'NAR-2026-007', comune_id: 'demo-nardo', comune_nome: 'Comune di Nardò',
    lat: 40.17610, lng: 18.03520, localizzazione: 'Parcheggio',
    specie_botanica: 'Pinus halepensis', altezza_m: 15, dbh_cm: 55, diametro_chioma_m: 10,
    fase_sviluppo: 'Maturo', cpc: 'C/D',
    bersagli: ['Parcheggi', 'Impianti / sottoservizi'],
    fusto: { difetti: [{ nome: 'Inclinazione anomala', gravita: 3 }, { nome: 'Fessurazioni / cretti', gravita: 3 }] },
    radici: { difetti: [{ nome: 'Sollevamento del terreno', gravita: 3 }] },
    richiesta_indagine_strumentale: true, tipo_indagine_richiesta: 'Pulling test',
    prescrizioni_gestionali: 'Indagine strumentale di approfondimento; riduzione della vela',
  }),
  albero({
    codice: 'CAM-2026-001', comune_id: 'demo-campi', comune_nome: 'Comune di Campi Salentina',
    lat: 40.39920, lng: 18.02080, localizzazione: 'Piazza',
    specie_botanica: 'Quercus ilex', altezza_m: 13, dbh_cm: 58, diametro_chioma_m: 10,
    fase_sviluppo: 'Maturo', cpc: 'B',
    chioma: { difetti: [{ nome: 'Seccume diffuso', gravita: 1 }] },
    prescrizioni_gestionali: 'Potatura di rimonda del secco',
  }),
  albero({
    codice: 'CAM-2026-002', comune_id: 'demo-campi', comune_nome: 'Comune di Campi Salentina',
    lat: 40.39850, lng: 18.01950, localizzazione: 'Viale alberato',
    specie_botanica: 'Melia azedarach', altezza_m: 10, dbh_cm: 35, diametro_chioma_m: 7,
    fase_sviluppo: 'Adulto', cpc: 'D',
    bersagli: ['Viabilità veicolare'],
    fusto: { difetti: [{ nome: 'Capitozzatura pregressa', gravita: 4 }, { nome: 'Carie / legno degradato', gravita: 4 }] },
    prescrizioni_gestionali: 'Abbattimento e sostituzione',
  }),
]
