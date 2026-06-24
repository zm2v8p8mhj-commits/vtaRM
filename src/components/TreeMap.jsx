import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { CPC_META } from '../lib/constants'
import { sintesiStato } from '../lib/cpc'
import { generaSchedaPDF } from '../lib/pdf'

// punto dentro poligono (ray casting). poly = array di [lat, lng]
function dentroPoligono(lat, lng, poly) {
  let dentro = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i][0], xi = poly[i][1]
    const yj = poly[j][0], xj = poly[j][1]
    const taglia = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (taglia) dentro = !dentro
  }
  return dentro
}

// Mappa Leaflet condivisa tra cruscotto admin e mappa pubblica dei comuni.
// onModifica e onReportArea sono presenti solo nel cruscotto admin.
export default function TreeMap({ alberi, fotoDi, fotoDettagli, nomeComune = '', onModifica, onReportArea }) {
  const mapRef = useRef(null)
  const mapEl = useRef(null)
  const markersRef = useRef(null)

  // disegno area: fase off | disegno | pronta
  const [fase, setFase] = useState('off')
  const [nPunti, setNPunti] = useState(0)
  const [nDentro, setNDentro] = useState(0)
  const puntiRef = useRef([])
  const dentroRef = useRef([])
  const disegnoRef = useRef(null) // layerGroup di vertici, linea e poligono

  useEffect(() => {
    if (mapRef.current) return
    const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    })
    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: '© Esri World Imagery' }
    )
    const map = L.map(mapEl.current, {
      center: [40.1765, 18.0322], // Nardò
      zoom: 14,
      layers: [osm],
      zoomControl: false,
    })
    L.control.zoom({ position: 'bottomleft' }).addTo(map)
    L.control.layers({ 'Mappa stradale': osm, Satellite: satellite }, null, {
      position: 'topright',
    }).addTo(map)
    markersRef.current = L.layerGroup().addTo(map)
    disegnoRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    // etichette accanto ai pallini visibili solo da zoom 16 in su (meno confusione)
    const aggiornaEtichette = () => {
      mapEl.current?.classList.toggle('nascondi-etichette', map.getZoom() < 16)
    }
    aggiornaEtichette()
    map.on('zoomend', aggiornaEtichette)

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize({ animate: false })
    })
    resizeObserver.observe(mapEl.current)

    return () => {
      resizeObserver.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const gruppo = markersRef.current
    if (!gruppo) return
    gruppo.clearLayers()

    for (const albero of alberi) {
      const meta = CPC_META[albero.cpc] || CPC_META.A
      const marker = L.circleMarker([albero.lat, albero.lng], {
        radius: 9,
        color: '#ffffff',
        weight: 2,
        fillColor: meta.color,
        fillOpacity: 0.95,
      })
      marker.bindPopup(() => creaPopup(albero), { maxWidth: 280 })
      // etichetta permanente: ultime 3 cifre del codice (es. NAR-2026-008 -> 008)
      const etichetta = (albero.codice || '').split('-').pop()
      if (etichetta) {
        marker.bindTooltip(etichetta, {
          permanent: true,
          direction: 'right',
          offset: [7, 0],
          className: 'etichetta-albero',
        })
      }
      gruppo.addLayer(marker)
    }

    if (alberi.length) {
      const bounds = L.latLngBounds(alberi.map((a) => [a.lat, a.lng]))
      mapRef.current.fitBounds(bounds.pad(0.2), { maxZoom: 17 })
    }
  }, [alberi]) // eslint-disable-line react-hooks/exhaustive-deps

  // ----------------------------------------------------- disegno area report
  const ridisegna = () => {
    const g = disegnoRef.current
    if (!g) return
    g.clearLayers()
    const punti = puntiRef.current
    if (punti.length) {
      L.polyline(fase === 'pronta' ? [...punti, punti[0]] : punti, {
        color: '#15803d',
        weight: 2,
        dashArray: fase === 'pronta' ? null : '5,5',
      }).addTo(g)
      if (fase === 'pronta') {
        L.polygon(punti, { color: '#15803d', weight: 2, fillColor: '#15803d', fillOpacity: 0.1 }).addTo(g)
      }
      punti.forEach((p) =>
        L.circleMarker(p, { radius: 4, color: '#15803d', weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(g)
      )
    }
  }

  const onClickArea = (e) => {
    puntiRef.current = [...puntiRef.current, [e.latlng.lat, e.latlng.lng]]
    setNPunti(puntiRef.current.length)
    ridisegna()
  }

  const iniziaDisegno = () => {
    puntiRef.current = []
    dentroRef.current = []
    setNPunti(0)
    setNDentro(0)
    setFase('disegno')
    disegnoRef.current?.clearLayers()
    mapRef.current.getContainer().style.cursor = 'crosshair'
    mapRef.current.on('click', onClickArea)
  }

  const chiudiArea = () => {
    if (puntiRef.current.length < 3) return
    mapRef.current.off('click', onClickArea)
    mapRef.current.getContainer().style.cursor = ''
    setFase('pronta')
    const poly = puntiRef.current
    const dentro = alberi.filter((a) => a.lat != null && dentroPoligono(a.lat, a.lng, poly))
    dentroRef.current = dentro
    setNDentro(dentro.length)
    setTimeout(ridisegna, 0)
  }

  const annullaArea = () => {
    mapRef.current?.off('click', onClickArea)
    if (mapRef.current) mapRef.current.getContainer().style.cursor = ''
    puntiRef.current = []
    dentroRef.current = []
    setNPunti(0)
    setNDentro(0)
    setFase('off')
    disegnoRef.current?.clearLayers()
  }

  function creaPopup(albero) {
    const meta = CPC_META[albero.cpc] || CPC_META.A
    const foto = fotoDi(albero)
    const div = document.createElement('div')
    div.className = 'text-sm'
    div.innerHTML = `
      ${
        foto[0]
          ? `<img src="${foto[0]}" alt="" style="width:100%;height:130px;object-fit:cover" />`
          : `<div style="width:100%;height:60px;background:${meta.bg};display:flex;align-items:center;justify-content:center;color:${meta.color};font-weight:700">🌳 Nessuna foto</div>`
      }
      <div style="padding:10px 12px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
          <strong>${albero.codice || ''}</strong>
          <span style="background:${meta.bg};color:${meta.color};font-weight:700;border-radius:999px;padding:1px 8px;font-size:11px">CPC ${albero.cpc}</span>
        </div>
        <div style="font-style:italic;color:#475569;margin-top:2px">${albero.specie_botanica || ''}</div>
        <div style="color:#475569;font-size:12px;margin-top:6px;max-height:64px;overflow:auto">${sintesiStato(albero)}</div>
        ${albero.prescrizioni_gestionali ? `<div style="font-size:12px;margin-top:6px"><strong>Prescrizioni:</strong> ${albero.prescrizioni_gestionali}</div>` : ''}
        <div style="display:flex;gap:6px;margin-top:10px">
          <button data-azione="pdf" style="flex:1;background:#15803d;color:#fff;border:none;border-radius:8px;padding:7px 0;font-weight:600;cursor:pointer;font-size:12px">📄 Scheda PDF</button>
          ${onModifica ? `<button data-azione="modifica" style="flex:1;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:8px;padding:7px 0;font-weight:600;cursor:pointer;font-size:12px">✏️ Modifica</button>` : ''}
        </div>
      </div>`
    div.querySelector('[data-azione="pdf"]').onclick = () =>
      generaSchedaPDF(
        albero,
        fotoDettagli ? fotoDettagli(albero) : foto,
        albero.comune_nome || nomeComune || ''
      )
    const btnMod = div.querySelector('[data-azione="modifica"]')
    if (btnMod) btnMod.onclick = () => onModifica(albero)
    return div
  }

  return (
    <div className="relative h-full min-w-0 flex-1">
      <div ref={mapEl} className="h-full w-full" />

      {/* controlli disegno area (solo cruscotto admin) */}
      {onReportArea && (
        <div className="absolute left-1/2 top-3 z-[1020] flex -translate-x-1/2 flex-col items-center gap-2">
          {fase === 'off' && (
            <button
              onClick={iniziaDisegno}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-green-800 shadow-lg active:scale-95"
            >
              ✏️ Report per zona
            </button>
          )}

          {fase === 'disegno' && (
            <div className="flex flex-col items-center gap-1.5 rounded-2xl bg-white/95 px-3 py-2 shadow-lg">
              <p className="text-xs font-medium text-slate-600">
                Tocca la mappa per disegnare l'area · {nPunti} punti
              </p>
              <div className="flex gap-2">
                <button
                  onClick={chiudiArea}
                  disabled={nPunti < 3}
                  className="rounded-full bg-green-700 px-4 py-1.5 text-sm font-semibold text-white shadow disabled:opacity-40"
                >
                  ✓ Chiudi area
                </button>
                <button
                  onClick={annullaArea}
                  className="rounded-full bg-slate-100 px-4 py-1.5 text-sm font-semibold text-slate-600"
                >
                  Annulla
                </button>
              </div>
            </div>
          )}

          {fase === 'pronta' && (
            <div className="flex flex-col items-center gap-1.5 rounded-2xl bg-white/95 px-3 py-2 shadow-lg">
              <p className="text-xs font-medium text-slate-600">
                {nDentro} alberi nell'area selezionata
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => onReportArea(dentroRef.current)}
                  disabled={nDentro === 0}
                  className="rounded-full bg-green-700 px-4 py-1.5 text-sm font-semibold text-white shadow disabled:opacity-40"
                >
                  📄 Genera report ({nDentro})
                </button>
                <button
                  onClick={iniziaDisegno}
                  className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600"
                >
                  Ridisegna
                </button>
                <button
                  onClick={annullaArea}
                  className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600"
                >
                  Chiudi
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
