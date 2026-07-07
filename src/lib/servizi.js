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
// Valore ornamentale — MODELLO DELLO STUDIO (indipendente, coefficienti nostri
// e tarabili; fonti pubbliche: metodi Granada/Svizzero + dati ISTAT provinciali).
// Passi:
//   1) monumentalità (0–1): curva sigmoide su circonferenza, altezza, chioma;
//      il dominante pesa di più, con contributo dell'insieme.
//   2) qualità ornamentale: la monumentalità è arricchita dagli aspetti di
//      contesto (dimora, posizione sociale, localizzazione, vincolo).
//   3) valore = valmax (tetto locale, ancorabile al reddito provinciale) ×
//      qualità × rango della specie (adattabilità fitoclimatica) × (1 − deprezzo).
// I coefficienti qui sotto sono scelte dello studio, modificabili.
// ---------------------------------------------------------------------------
const VALMAX_DEFAULT = 70000 // € tetto di riferimento (tarabile per provincia)
const sigmoide = (x, x0, k) => 1 / (1 + Math.exp(-k * (x - x0)))

// pesi (frazione di valore aggiunta) degli aspetti funzionali — coefficienti dello studio
const PESO_DIMORA = { 'Buca / pavimentato': 0.01, Aiuola: 0.04, 'Giardino / parco': 0.09, 'Parco storico / di pregio': 0.15 }
const PESO_POSIZIONE = { Dominata: 0.02, Intermedia: 0.06, Codominante: 0.1, 'Isolata / predominante': 0.15 }
const PESO_LOCALIZZAZIONE = { 'Aree rurali': 0.02, Periurbano: 0.06, Urbano: 0.1, 'Centro storico': 0.15 }
const PESO_VINCOLO = { Nessuno: 0, Paesaggistico: 0.1, Monumentale: 0.22 }

// rango della specie: adattabilità fitoclimatica al contesto mediterraneo (0.6–1)
const RANGO_ALTO = ['quercus ilex', 'quercus pubescens', 'olea', 'pinus halepensis', 'pinus pinea', 'cupressus', 'celtis', 'fraxinus ornus', 'cercis', 'chamaerops']
const RANGO_BASSO = ['populus', 'acer negundo', 'robinia', 'ailanthus', 'eucalyptus', 'ligustrum', 'washingtonia', 'phoenix', 'jacaranda', 'ficus', 'schinus', 'melia']
function rangoSpecie(specie) {
  if (!specie) return 0.8
  const s = specie.trim().toLowerCase()
  if (RANGO_ALTO.some((k) => s.includes(k))) return 1
  if (RANGO_BASSO.some((k) => s.includes(k))) return 0.65
  return 0.85
}

// deprezzamento fitosanitario (frazione di valore persa) dalla vigoria
const DEPREZZO_SANITARIO = { Buona: 0, Media: 0.3, Scarsa: 0.5, Deperimento: 0.9 }

export function valoreOrnamentale(record) {
  let circ = Number(record.circonferenza_cm)
  const dbh = Number(record.dbh_cm)
  if ((!Number.isFinite(circ) || circ <= 0) && Number.isFinite(dbh) && dbh > 0) circ = Math.PI * dbh
  const H = Number(record.altezza_m)
  const Dch = Number(record.diametro_chioma_m)

  const V = []
  if (Number.isFinite(circ) && circ > 0) V.push(sigmoide(circ, 180, 0.018))
  if (Number.isFinite(H) && H > 0) V.push(sigmoide(H, 16, 0.28))
  if (Number.isFinite(Dch) && Dch > 0) V.push(sigmoide(Dch, 10, 0.33))
  if (!V.length) return null

  const max = Math.max(...V)
  const media = V.reduce((a, b) => a + b, 0) / V.length
  const qMon = 0.6 * max + 0.4 * media // il dominante conta di più, ma pesa l'insieme

  const funz =
    (PESO_DIMORA[record.contesto_dimora] || 0) +
    (PESO_POSIZIONE[record.posizione_sociale] || 0) +
    (PESO_LOCALIZZAZIONE[record.contesto_localizzazione] || 0) +
    (PESO_VINCOLO[record.vincolo] || 0)
  const qOrn = qMon + (1 - qMon) * Math.min(1, funz)

  const valmax = Number(record.valore_max_rif) > 0 ? Number(record.valore_max_rif) : VALMAX_DEFAULT
  const deprezzo = record.vigoria in DEPREZZO_SANITARIO ? DEPREZZO_SANITARIO[record.vigoria] : 0
  const valore = valmax * qOrn * rangoSpecie(record.specie_botanica) * (1 - deprezzo)
  return { valore: Math.round(valore), deprezzoPct: Math.round(deprezzo * 100), qOrn: Math.round(qOrn * 100) }
}
