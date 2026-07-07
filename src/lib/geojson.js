// ----------------------------------------------------------------------------
// Import/Export GeoJSON: ogni albero è una Feature Point con le proprietà del
// modello dati master. Formato direttamente caricabile in Leaflet/QGIS.
// ----------------------------------------------------------------------------

const CAMPI_PROPRIETA = [
  'id', 'codice', 'comune_id', 'comune_nome', 'data_rilievo', 'localizzazione',
  'indirizzo', 'rilevatore', 'specie_botanica',
  'altezza_m', 'dbh_cm', 'circonferenza_cm', 'diametro_chioma_m',
  'diametro_branca_cm', 'lunghezza_branca_m', 'altezza_branca_m', 'altezza_bersaglio_m',
  'fase_sviluppo', 'vigoria', 'fitopatie', 'agente_cariogeno',
  'bersagli', 'frequenza_occupazione', 'conflitti', 'conformita_cam',
  'zolla', 'colletto', 'fusto', 'castello', 'branche', 'chioma', 'radici',
  'note_osservazioni', 'cpc', 'classe_rischio', 'intervento_emergenza',
  'richiesta_indagine_strumentale', 'tipo_indagine_richiesta', 'urgenza_indagine',
  'data_prossimo_controllo', 'prescrizioni_gestionali', 'urgenza_intervento',
  'mitigazione_bersaglio', 'urgenza_mitigazione',
  'co2_stoccata_kg', 'co2_kg_anno', 'canopy_cover_m2', 'valore_economico_eur',
  'compartimentazione', 'apc_m', 'suolo_zpa', 'limiti_valutazione',
  'data_ultimo_intervento', 'note_gestione',
  'url_foto', 'foto_difetti',
]

export function alberiToGeoJSON(alberi) {
  return {
    type: 'FeatureCollection',
    name: 'censimento_vta',
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
    features: alberi
      .filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lng))
      .map((a) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [a.lng, a.lat] },
        properties: Object.fromEntries(
          CAMPI_PROPRIETA.map((k) => [k, a[k] ?? null])
        ),
      })),
  }
}

export function downloadGeoJSON(alberi, nomeFile = 'censimento_vta') {
  const blob = new Blob([JSON.stringify(alberiToGeoJSON(alberi), null, 2)], {
    type: 'application/geo+json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nomeFile}_${new Date().toISOString().slice(0, 10)}.geojson`
  a.click()
  URL.revokeObjectURL(url)
}

// Converte un file GeoJSON (o JSON con array di record) in record "albero".
export function parseGeoJSON(testo, comuneIdDefault) {
  const dati = JSON.parse(testo)
  const features = dati.type === 'FeatureCollection' ? dati.features
    : Array.isArray(dati) ? dati.map((p) => ({ properties: p, geometry: null }))
    : [dati]

  return features.map((f) => {
    const p = f.properties || {}
    const [lng, lat] = f.geometry?.type === 'Point' ? f.geometry.coordinates : [p.lng, p.lat]
    return {
      ...p,
      id: p.id || crypto.randomUUID(),
      comune_id: p.comune_id || comuneIdDefault,
      lat: Number(lat),
      lng: Number(lng),
      bersagli: p.bersagli || [],
      url_foto: p.url_foto || [],
      radici: p.radici || { difetti: [], gravita: 0 },
      fusto: p.fusto || { difetti: [], gravita: 0 },
      chioma: p.chioma || { difetti: [], gravita: 0 },
      _synced: false,
    }
  }).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng))
}
