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
