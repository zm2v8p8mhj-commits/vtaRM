import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { CPC_META } from '../lib/constants'
import { sintesiStato } from '../lib/cpc'
import { generaSchedaPDF } from '../lib/pdf'

// Mappa Leaflet condivisa tra cruscotto admin e mappa pubblica dei comuni.
// onModifica è presente solo nel cruscotto admin.
export default function TreeMap({ alberi, fotoDi, nomeComune = '', onModifica }) {
  const mapRef = useRef(null)
  const mapEl = useRef(null)
  const markersRef = useRef(null)

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
    mapRef.current = map

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
      marker.bindTooltip(`${albero.codice} – ${albero.specie_botanica}`, { direction: 'top' })
      gruppo.addLayer(marker)
    }

    if (alberi.length) {
      const bounds = L.latLngBounds(alberi.map((a) => [a.lat, a.lng]))
      mapRef.current.fitBounds(bounds.pad(0.2), { maxZoom: 17 })
    }
  }, [alberi]) // eslint-disable-line react-hooks/exhaustive-deps

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
      generaSchedaPDF(albero, foto, albero.comune_nome || nomeComune || '')
    const btnMod = div.querySelector('[data-azione="modifica"]')
    if (btnMod) btnMod.onclick = () => onModifica(albero)
    return div
  }

  return <div ref={mapEl} className="h-full min-w-0 flex-1" />
}
