// ============================================================================
// Modello dati "Master" – vocabolari controllati per il rilievo VTA
// ============================================================================

export const CPC_META = {
  A: { label: 'A – Trascurabile', breve: 'Trascurabile', color: '#16a34a', bg: '#dcfce7', mesiControllo: 24 },
  B: { label: 'B – Bassa', breve: 'Bassa', color: '#ca8a04', bg: '#fef9c3', mesiControllo: 12 },
  C: { label: 'C – Moderata', breve: 'Moderata', color: '#ea580c', bg: '#ffedd5', mesiControllo: 6 },
  D: { label: 'D – Elevata/Estrema', breve: 'Elevata', color: '#dc2626', bg: '#fee2e2', mesiControllo: 2 },
}

export const CPC_CLASSI = ['A', 'B', 'C', 'D']

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

export const RILEVATORE_DEFAULT = 'Dott. Agr. Ruggero Manca'

// Comuni demo (usati solo in modalità senza Supabase); share_token leggibili
// per provare i link pubblici: #/v/nardo e #/v/campi
export const COMUNI_DEMO = [
  { id: 'demo-nardo', nome: 'Comune di Nardò', codice: 'NAR', share_token: 'nardo', centro: { lat: 40.1765, lng: 18.0322 }, zoom: 14 },
  { id: 'demo-campi', nome: 'Comune di Campi Salentina', codice: 'CAM', share_token: 'campi', centro: { lat: 40.3989, lng: 18.0203 }, zoom: 14 },
]
