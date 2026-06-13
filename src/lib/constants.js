// ============================================================================
// Modello dati "Master" – vocabolari controllati per il rilievo VTA
// ============================================================================

// Classi di Propensione al Cedimento – protocollo S.I.A. (A, B, C, C/D, D).
export const CPC_META = {
  A: { label: 'A – Trascurabile', breve: 'Trascurabile', color: '#16a34a', bg: '#dcfce7', mesiControllo: 24 },
  B: { label: 'B – Bassa', breve: 'Bassa', color: '#ca8a04', bg: '#fef9c3', mesiControllo: 12 },
  C: { label: 'C – Moderata', breve: 'Moderata', color: '#f97316', bg: '#ffedd5', mesiControllo: 6 },
  'C/D': { label: 'C/D – Elevata', breve: 'Elevata', color: '#ea580c', bg: '#fed7aa', mesiControllo: 3 },
  D: { label: 'D – Estrema', breve: 'Estrema', color: '#dc2626', bg: '#fee2e2', mesiControllo: 2 },
}

export const CPC_CLASSI = ['A', 'B', 'C', 'C/D', 'D']

// VTA Livello 1 (visuale speditiva): gravità qualitativa per distretto
// anatomico. Il valore (0-4) determina la CPC con la regola del "valore
// peggiore" (MAX); ogni livello anticipa la classe che produce.
export const GRAVITA = [
  { v: 0, label: 'Assente', cpc: 'A' },
  { v: 1, label: 'Lieve', cpc: 'B' },
  { v: 2, label: 'Significativo', cpc: 'C' },
  { v: 3, label: 'Grave', cpc: 'C/D' },
  { v: 4, label: 'Estremo', cpc: 'D' },
]

export const SPECIE = [
  'Pinus pinea', 'Pinus halepensis', 'Quercus ilex', 'Quercus pubescens',
  'Olea europaea', 'Tilia spp.', 'Platanus x acerifolia', 'Cupressus sempervirens',
  'Celtis australis', 'Robinia pseudoacacia', 'Washingtonia robusta',
  'Phoenix dactylifera', 'Phoenix canariensis', 'Chamaerops humilis',
  'Eucalyptus camaldulensis', 'Melia azedarach', 'Ficus retusa',
  'Schinus molle', 'Jacaranda mimosifolia', 'Ligustrum lucidum',
  'Morus alba', 'Populus alba', 'Fraxinus ornus', 'Cercis siliquastrum',
  'Nerium oleander', 'Lagerstroemia indica', 'Acer negundo', 'Ulmus minor',
]

export const LOCALIZZAZIONI = [
  'Piazza', 'Viale alberato', 'Parco / giardino pubblico', 'Scuola',
  'Cimitero', 'Impianto sportivo', 'Parcheggio', 'Uffici comunali',
  'Lungomare', 'Area mercatale', 'Altro',
]

export const FASI_SVILUPPO = ['Giovane', 'Adulto', 'Maturo', 'Senescente']

export const BERSAGLI = [
  'Recinzioni', 'Edifici', 'Viabilità veicolare', 'Viabilità pedonale',
  'Parcheggi', 'Impianti / sottoservizi', 'Aree gioco', 'Arredo urbano', 'Altro',
]

export const FREQUENZE = [
  'Area isolata',
  'Area occasionalmente frequentata',
  'Area costantemente occupata',
]

export const DIFETTI_RADICI = [
  'Radici affioranti danneggiate', 'Radici strozzanti', 'Carpofori al colletto',
  'Marciume del colletto', 'Taglio radici / scavi recenti',
  'Sollevamento del terreno', 'Asfissia radicale / pavimentazione', 'Colletto interrato',
]

export const DIFETTI_FUSTO = [
  'Cavità', 'Carie / legno degradato', 'Fessurazioni / cretti',
  'Corteccia inclusa', 'Carpofori', 'Essudati', 'Inclinazione anomala',
  'Ferite / lesioni corticali', 'Cancri', 'Capitozzatura pregressa', 'Sbrancature',
]

export const DIFETTI_CHIOMA = [
  'Seccume diffuso', 'Branche morte', 'Inserzioni deboli / corteccia inclusa',
  'Sbilanciamento della chioma', 'Branche codominanti', 'Rotture / sbrancature',
  'Microfillia', 'Filloptosi anomala', 'Parassiti / fitofagi', 'Cavità su branche',
]

export const TIPI_INDAGINE = ['Nessuna', 'Tomografia sonica', 'Pulling test', 'Resistografia', 'Indagine radicale']

export const PRESCRIZIONI_SUGGERITE = [
  'Nessun intervento – monitoraggio ordinario',
  'Monitoraggio ravvicinato',
  'Potatura di rimonda del secco',
  'Potatura di riduzione / alleggerimento',
  'Consolidamento branche',
  'Indagine strumentale di approfondimento',
  'Transennamento area di pertinenza',
  'Abbattimento',
]

// ---------------------------------------------------------------------------
// Modello esteso (sulla scorta delle schede VTA professionali di Liv. 2/3)
// ---------------------------------------------------------------------------

// 6 distretti anatomici valutati separatamente (la CPC resta sul valore peggiore
// tra tutti i difetti di tutti i distretti). I record vecchi usano radici/fusto/
// chioma: restano leggibili (vedi DISTRETTI_KEYS e normalizzaDifetti).
export const DIFETTI_ZOLLA = [
  'Area asfaltata / pavimentata', 'Cordoli / sottoservizi', 'Depressione / ristagno',
  'Inclinazione / arcuatura della zolla', 'Sollevamento del terreno',
  'Ribaltamento / scivolamento', 'Radici tagliate o danneggiate', 'Carpofori radicali',
]
export const DIFETTI_COLLETTO = [
  'Colletto a imbuto', 'Colletto interrato', 'Marciume del colletto',
  'Carpofori al colletto', 'Ferite / lesioni', 'Cavità al colletto',
]
export const DIFETTI_FUSTO6 = [
  'Cavità', 'Carie / legno degradato', 'Legno disfunzionale', 'Fessurazioni / cretti',
  'Corteccia inclusa', 'Carpofori', 'Cordoni xilematici', 'Ferite / lesioni corticali',
  'Inclinazione anomala', 'Legno di reazione insufficiente', 'Cancri', 'Essudati',
]
export const DIFETTI_CASTELLO = [
  'Corteccia inclusa nelle inserzioni', 'Branche codominanti', 'Inclinazione / arcuatura',
  'Legno disfunzionale', "Cavità all'inserzione", 'Cordoni xilematici',
]
export const DIFETTI_BRANCHE = [
  'Branche morte / secche', 'Monconi', 'Rami sinuosi / arcuati',
  'Branche esposte / sovraestese', 'Rami patenti', 'Sbrancature / rotture', 'Cavità su branche',
]
export const DIFETTI_CHIOMA6 = [
  'Chioma diradata', 'Seccume diffuso', 'Disseccamenti dei ramuli', 'Alterazione morfologica',
  'Microfillia', 'Pericolante', 'Parassiti / fitofagi', 'Sbilanciamento della chioma',
]

export const DISTRETTI = [
  { key: 'zolla', label: 'Zolla radicale', opzioni: DIFETTI_ZOLLA },
  { key: 'colletto', label: 'Colletto', opzioni: DIFETTI_COLLETTO },
  { key: 'fusto', label: 'Fusto', opzioni: DIFETTI_FUSTO6 },
  { key: 'castello', label: 'Castello (inserzione branche)', opzioni: DIFETTI_CASTELLO },
  { key: 'branche', label: 'Branche e rami', opzioni: DIFETTI_BRANCHE },
  { key: 'chioma', label: 'Chioma', opzioni: DIFETTI_CHIOMA6 },
]
// tutte le chiavi-distretto possibili (incluse le vecchie) per CPC e sintesi
export const DISTRETTI_KEYS = ['radici', 'zolla', 'colletto', 'fusto', 'castello', 'branche', 'chioma']

// Salute e vigoria
export const VIGORIA = ['Buona', 'Media', 'Scarsa', 'Deperimento']

// Contesto
export const CONFLITTI = [
  'Marciapiedi', 'Pavimentazione / asfalto', 'Sottoservizi', 'Edifici',
  'Cavi aerei', 'Segnaletica / arredo', 'Muri / recinzioni', 'Altro',
]
// Conformità della specie ai CAM Verde Urbano rispetto al sito
export const CONFORMITA_CAM = ['Conforme', 'Non conforme', 'Da verificare']

// Prescrizioni con urgenza
export const URGENZE = ['Subito', 'Entro 6 mesi', 'Al bisogno', 'Programmabile']

// Modulo Rischio Liv.2: classe di rischio (propensione CPC × bersaglio)
export const CLASSE_RISCHIO_META = {
  Basso: { color: '#16a34a', bg: '#dcfce7', nota: 'Rischio accettabile' },
  Moderato: { color: '#ca8a04', bg: '#fef9c3', nota: 'Rischio tollerabile – monitoraggio' },
  Elevato: { color: '#ea580c', bg: '#fed7aa', nota: 'Tollerabile se ALARP – valutare costi/benefici' },
  Estremo: { color: '#dc2626', bg: '#fee2e2', nota: 'Inaccettabile – intervento di riduzione' },
}

export const RILEVATORE_DEFAULT = 'Dott. Agr. Ruggero Manca'

// Comuni demo (usati solo in modalità senza Supabase); share_token leggibili
// per provare i link pubblici: #/v/nardo e #/v/campi
export const COMUNI_DEMO = [
  { id: 'demo-nardo', nome: 'Comune di Nardò', codice: 'NAR', share_token: 'nardo', centro: { lat: 40.1765, lng: 18.0322 }, zoom: 14 },
  { id: 'demo-campi', nome: 'Comune di Campi Salentina', codice: 'CAM', share_token: 'campi', centro: { lat: 40.3989, lng: 18.0203 }, zoom: 14 },
]
