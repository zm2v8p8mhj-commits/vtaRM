// ----------------------------------------------------------------------------
// Servizi ecosistemici: stime calcolate dai dati biometrici.
//  - Canopy cover: proiezione a terra della chioma (m²) = π·(Ø/2)²
//  - CO2 stoccata: stima allometrica dalla specie (densità del legno) + DBH + H
//    AGB = 0.0673·(ρ·D²·H)^0.976 (Chave 2014; D in cm, H in m, ρ g/cm³),
//    biomassa totale ≈ AGB·1.25 (radici), C = 0.47·biomassa, CO2 = C·3.667.
//    È una STIMA speditiva, sufficiente per il monitoraggio; non sostituisce i-Tree.
// ----------------------------------------------------------------------------

// densità del legno (g/cm³) per le specie più comuni; default 0.60
const DENSITA_LEGNO = {
  'pinus pinea': 0.55, 'pinus halepensis': 0.55, 'pinus': 0.52,
  'quercus ilex': 0.9, 'quercus pubescens': 0.85, 'quercus': 0.75,
  'olea europaea': 0.9, 'tilia': 0.45, 'platanus': 0.55,
  'cupressus sempervirens': 0.5, 'cupressus': 0.5, 'celtis australis': 0.65,
  'robinia pseudoacacia': 0.77, 'eucalyptus': 0.7, 'melia azedarach': 0.45,
  'ficus': 0.4, 'schinus molle': 0.55, 'jacaranda': 0.45, 'ligustrum lucidum': 0.65,
  'morus': 0.6, 'populus alba': 0.38, 'populus': 0.38, 'fraxinus': 0.66,
  'cercis siliquastrum': 0.65, 'nerium oleander': 0.6, 'lagerstroemia': 0.6,
  'acer negundo': 0.44, 'acer': 0.55, 'ulmus minor': 0.56, 'ulmus': 0.56,
  // palme: struttura non legnosa, densità bassa
  'washingtonia': 0.35, 'phoenix': 0.35, 'chamaerops': 0.35,
}

function densita(specie) {
  if (!specie) return 0.6
  const s = specie.trim().toLowerCase()
  for (const k of Object.keys(DENSITA_LEGNO)) {
    if (s.includes(k)) return DENSITA_LEGNO[k]
  }
  return 0.6
}

// Fattore di vigoria applicato al canopy "effettivo": misura la chioma viva che
// realmente ombreggia e fornisce servizi. La CO2 stoccata NON usa questo fattore
// (il carbonio resta immagazzinato nel legno anche in un albero deperiente).
const FATTORE_VIGORIA = { Buona: 1, Media: 0.6, Scarsa: 0.3, Deperimento: 0 }

// Canopy cover EFFETTIVO in m² (1 decimale): proiezione geometrica della chioma
// corretta per la vigoria. Senza vigoria indicata si assume piena (nessuna riduzione).
export function canopyCover(diametroChiomaM, vigoria) {
  const d = Number(diametroChiomaM)
  if (!Number.isFinite(d) || d <= 0) return null
  const fattore = vigoria in FATTORE_VIGORIA ? FATTORE_VIGORIA[vigoria] : 1
  return Math.round(Math.PI * (d / 2) ** 2 * fattore * 10) / 10
}

// CO2 stoccata in kg (arrotondata); richiede DBH e altezza
export function stimaCO2(specie, dbhCm, altezzaM) {
  const D = Number(dbhCm)
  const H = Number(altezzaM)
  if (!Number.isFinite(D) || !Number.isFinite(H) || D <= 0 || H <= 0) return null
  const rho = densita(specie)
  const agb = 0.0673 * Math.pow(rho * D * D * H, 0.976) // kg, parte aerea
  const biomassa = agb * 1.25 // + radici
  const carbonio = biomassa * 0.47
  const co2 = carbonio * 3.667
  return Math.round(co2)
}

// Incremento diametrico annuo indicativo (cm/anno) per fase di sviluppo:
// gli alberi giovani crescono di più, i senescenti quasi nulla.
const INCREMENTO_DBH = { Giovane: 0.8, Adulto: 0.5, Maturo: 0.3, Senescente: 0.1 }

// CO2 ASSORBITA all'anno in kg (servizio "attivo"): differenza di CO2 stoccata
// tra il DBH attuale e quello dell'anno successivo, dove la crescita annua è
// data dalla fase di sviluppo e ridotta dalla vigoria (un albero deperiente non
// cresce → 0). A differenza dello stock, questo dato dipende dalla vitalità.
export function stimaCO2Annua(specie, dbhCm, altezzaM, faseSviluppo, vigoria) {
  const co2Ora = stimaCO2(specie, dbhCm, altezzaM)
  if (co2Ora == null) return null
  const fattore = vigoria in FATTORE_VIGORIA ? FATTORE_VIGORIA[vigoria] : 1
  const incr = (INCREMENTO_DBH[faseSviluppo] ?? 0.4) * fattore
  if (incr <= 0) return 0
  const co2Dopo = stimaCO2(specie, Number(dbhCm) + incr, altezzaM)
  if (co2Dopo == null) return null
  return Math.max(0, Math.round(co2Dopo - co2Ora))
}

// O2 prodotto all'anno (kg): stechiometria della fotosintesi, l'O2 liberato è
// 32/44 della CO2 fissata nell'anno. Deriva quindi dalla CO2 assorbita annua.
export function stimaO2Annua(specie, dbhCm, altezzaM, faseSviluppo, vigoria) {
  const co2a = stimaCO2Annua(specie, dbhCm, altezzaM, faseSviluppo, vigoria)
  if (co2a == null) return null
  return Math.round(co2a * (32 / 44) * 10) / 10
}

// PM10 rimosso all'anno (g): proporzionale al canopy EFFETTIVO (chioma viva che
// intercetta le polveri). Coefficiente speditivo ~1,5 g/m²·anno, ordine di
// grandezza coerente con la letteratura i-Tree per il particolato in ambito urbano.
const PM10_G_PER_M2_ANNO = 1.5
export function stimaPM10Annuo(diametroChiomaM, vigoria) {
  const cc = canopyCover(diametroChiomaM, vigoria)
  if (cc == null) return null
  return Math.round(cc * PM10_G_PER_M2_ANNO * 10) / 10
}

// ---------------------------------------------------------------------------
// Valore ornamentale (metodo Norma Granada, versione speditiva e trasparente).
// Valore = sezione del fusto (cm²) × prezzo unitario × coeff. specie × coeff. sanitario.
//  - sezione del fusto: dal DBH (o dalla circonferenza), proxy della "quantità" di albero
//  - coeff. specie: pregio/lentezza di crescita
//  - coeff. sanitario: deprezzamento per condizioni fitosanitarie (vigoria)
// I parametri (in particolare il prezzo unitario €/cm²) sono tarabili dal tecnico.
// È una STIMA orientativa a supporto del rapporto costi/benefici, non una perizia.
// ---------------------------------------------------------------------------
const PREZZO_SEZIONE_EUR_CM2 = 3 // €/cm² di sezione del fusto (parametro tarabile)

const COEFF_SPECIE_VALORE = {
  'quercus': 1.3, 'olea': 1.3, 'pinus pinea': 1.2, 'cupressus sempervirens': 1.15,
  'tilia': 1.1, 'celtis': 1.1, 'cupressus': 1.05, 'platanus': 1.0, 'fraxinus': 1.0,
  'cercis': 1.0, 'ulmus': 0.95, 'morus': 0.85, 'ligustrum': 0.8, 'populus': 0.7,
  'eucalyptus': 0.7, 'acer negundo': 0.6, 'robinia': 0.6, 'ailanthus': 0.5, 'melia': 0.7,
}
function coeffSpecieValore(specie) {
  if (!specie) return 1
  const s = specie.trim().toLowerCase()
  for (const k of Object.keys(COEFF_SPECIE_VALORE)) {
    if (s.includes(k)) return COEFF_SPECIE_VALORE[k]
  }
  return 1
}

// deprezzamento sanitario (frazione di valore persa) per condizioni fitosanitarie
const DEPREZZO_SANITARIO = { Buona: 0, Media: 0.3, Scarsa: 0.6, Deperimento: 0.9 }

export function valoreOrnamentale(record) {
  let D = Number(record.dbh_cm)
  if (!Number.isFinite(D) || D <= 0) {
    const circ = Number(record.circonferenza_cm)
    if (Number.isFinite(circ) && circ > 0) D = circ / Math.PI
  }
  if (!Number.isFinite(D) || D <= 0) return null
  const sezione = Math.PI * (D / 2) ** 2 // cm²
  const deprezzo = record.vigoria in DEPREZZO_SANITARIO ? DEPREZZO_SANITARIO[record.vigoria] : 0
  const valore = sezione * PREZZO_SEZIONE_EUR_CM2 * coeffSpecieValore(record.specie_botanica) * (1 - deprezzo)
  return { valore: Math.round(valore), deprezzoPct: Math.round(deprezzo * 100) }
}
