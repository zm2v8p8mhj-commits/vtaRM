// ----------------------------------------------------------------------------
// Conformità ai CAM Verde Urbano (DM CAM gestione del verde) suggerita dalla
// specie. Criterio principale e oggettivo:
//  - esotiche invasive / sconsigliate (Reg. UE 1143/2014 e liste nazionali) → Non conforme
//  - autoctone o tipiche mediterranee idonee → Conforme
//  - ornamentali alloctone non invasive → Da verificare (ammesse con motivazione)
// È un SUGGERIMENTO: la valutazione finale e l'eventuale verifica delle liste
// regionali restano al tecnico.
// ----------------------------------------------------------------------------

const NON_CONFORMI = {
  'robinia pseudoacacia': 'esotica invasiva (Reg. UE 1143/2014)',
  'ailanthus altissima': 'esotica invasiva (Reg. UE 1143/2014)',
  'acer negundo': 'esotica invasiva',
  'ligustrum lucidum': 'esotica naturalizzata/invasiva',
  'melia azedarach': 'esotica potenzialmente invasiva',
}

const CONFORMI = {
  'pinus pinea': 'autoctona mediterranea',
  'pinus halepensis': 'autoctona mediterranea',
  'quercus ilex': 'autoctona',
  'quercus pubescens': 'autoctona',
  'quercus': 'genere prevalentemente autoctono',
  'olea europaea': 'tipica mediterranea',
  'tilia': 'autoctona',
  'celtis australis': 'autoctona',
  'cupressus sempervirens': 'tipica del paesaggio mediterraneo',
  'chamaerops humilis': 'unica palma autoctona italiana',
  'populus alba': 'autoctona',
  'fraxinus ornus': 'autoctona',
  'fraxinus': 'genere prevalentemente autoctono',
  'cercis siliquastrum': 'mediterranea',
  'nerium oleander': 'mediterranea',
  'ulmus minor': 'autoctona',
  'acer campestre': 'autoctona',
  'crataegus': 'autoctona',
}

const DA_VERIFICARE = {
  'cupressus arizonica': 'conifera ornamentale alloctona (Nord America), non invasiva',
  'platanus': 'ibrido ornamentale alloctono (non invasivo)',
  'washingtonia': 'palma ornamentale alloctona',
  'phoenix': 'palma ornamentale alloctona',
  'eucalyptus': 'esotica alloctona, valutare idoneità al sito',
  'ficus': 'ornamentale alloctona',
  'schinus': 'ornamentale alloctona',
  'jacaranda': 'ornamentale alloctona',
  'morus': 'naturalizzata storica',
  'lagerstroemia': 'ornamentale alloctona (non invasiva)',
}

function trova(specie, tabella) {
  for (const chiave of Object.keys(tabella)) {
    if (specie.includes(chiave)) return tabella[chiave]
  }
  return null
}

export function valutaConformitaCAM(specieBotanica) {
  if (!specieBotanica) return null
  const s = specieBotanica.trim().toLowerCase()
  let motivo = trova(s, NON_CONFORMI)
  if (motivo) return { esito: 'Non conforme', motivo }
  motivo = trova(s, CONFORMI)
  if (motivo) return { esito: 'Conforme', motivo }
  motivo = trova(s, DA_VERIFICARE)
  if (motivo) return { esito: 'Da verificare', motivo }
  return null // specie non in elenco: scelta manuale
}
