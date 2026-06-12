import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { CPC_CLASSI, CPC_META } from '../lib/constants'
import { downloadGeoJSON } from '../lib/geojson'
import TreeMap from '../components/TreeMap'
import CpcBadge from '../components/CpcBadge'

const FILTRI_INIZIALI = { cpc: [...CPC_CLASSI], specie: '', comune: '', ricerca: '' }

export default function MapPage() {
  const { alberi, comuni, fotoDi } = useApp()
  const navigate = useNavigate()
  const [filtri, setFiltri] = useState(FILTRI_INIZIALI)
  // su telefono la sidebar parte chiusa e si apre sopra la mappa (overlay)
  const [sidebarAperta, setSidebarAperta] = useState(() => window.innerWidth >= 640)

  useEffect(() => {
    const media = window.matchMedia('(min-width: 640px)')
    const aggiornaLayout = (evento) => setSidebarAperta(evento.matches)
    media.addEventListener('change', aggiornaLayout)
    return () => media.removeEventListener('change', aggiornaLayout)
  }, [])

  const specieDisponibili = useMemo(
    () => [...new Set(alberi.map((a) => a.specie_botanica).filter(Boolean))].sort(),
    [alberi]
  )

  const filtrati = useMemo(
    () =>
      alberi.filter(
        (a) =>
          filtri.cpc.includes(a.cpc) &&
          (!filtri.specie || a.specie_botanica === filtri.specie) &&
          (!filtri.comune || a.comune_id === filtri.comune) &&
          (!filtri.ricerca ||
            a.codice?.toLowerCase().includes(filtri.ricerca.toLowerCase()) ||
            a.localizzazione?.toLowerCase().includes(filtri.ricerca.toLowerCase()))
      ),
    [alberi, filtri]
  )

  const conteggi = useMemo(() => {
    const c = { A: 0, B: 0, C: 0, 'C/D': 0, D: 0 }
    for (const a of alberi) if (c[a.cpc] != null) c[a.cpc]++
    return c
  }, [alberi])

  const toggleCpc = (classe) =>
    setFiltri((f) => ({
      ...f,
      cpc: f.cpc.includes(classe) ? f.cpc.filter((c) => c !== classe) : [...f.cpc, classe],
    }))

  return (
    <div className="relative flex h-full">
      {sidebarAperta && (
        <button
          type="button"
          aria-label="Chiudi filtri"
          className="absolute inset-0 z-20 bg-slate-950/35 sm:hidden"
          onClick={() => setSidebarAperta(false)}
        />
      )}

      {/* ----------------------------------------------- barra laterale filtri */}
      <aside
        className={`absolute inset-x-0 bottom-0 z-30 flex max-h-[78%] shrink-0 flex-col overflow-hidden rounded-t-2xl border-t border-slate-200 bg-white shadow-2xl transition-transform duration-200 sm:relative sm:inset-auto sm:z-10 sm:max-h-none sm:w-72 sm:rounded-none sm:border-r sm:border-t-0 sm:shadow-none ${
          sidebarAperta
            ? 'translate-y-0'
            : 'translate-y-full sm:-ml-72 sm:translate-y-0'
        }`}
      >
        <div className="relative border-b border-slate-100 px-4 pb-2 pt-3 sm:hidden">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-300" />
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-green-900">Filtri mappa</h2>
              <p className="text-xs text-slate-500">{filtrati.length} alberi visualizzati</p>
            </div>
            <button
              type="button"
              className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600"
              onClick={() => setSidebarAperta(false)}
            >
              Chiudi
            </button>
          </div>
        </div>

        <div className="space-y-5 overflow-y-auto p-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Quadro generale
            </h2>
            <div className="mt-2 grid grid-cols-5 gap-1">
              {CPC_CLASSI.map((c) => (
                <div
                  key={c}
                  className="rounded-lg p-1.5 text-center"
                  style={{ backgroundColor: CPC_META[c].bg }}
                >
                  <div className="text-base font-bold leading-tight" style={{ color: CPC_META[c].color }}>
                    {conteggi[c]}
                  </div>
                  <div className="text-[10px] font-bold leading-tight" style={{ color: CPC_META[c].color }}>
                    {c}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {filtrati.length} alberi visualizzati su {alberi.length} censiti
            </p>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              Classe di propensione al cedimento
            </h3>
            <div className="space-y-1.5">
              {CPC_CLASSI.map((c) => (
                <label key={c} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={filtri.cpc.includes(c)}
                    onChange={() => toggleCpc(c)}
                    className="h-4 w-4 accent-green-700"
                  />
                  <CpcBadge cpc={c} esteso />
                </label>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <button
                className="text-xs font-semibold text-red-700 underline"
                onClick={() => setFiltri((f) => ({ ...f, cpc: ['C', 'C/D', 'D'] }))}
              >
                Solo priorità
              </button>
              <button
                className="text-xs text-slate-500 underline"
                onClick={() => setFiltri(FILTRI_INIZIALI)}
              >
                Azzera filtri
              </button>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              Specie botanica
            </h3>
            <select
              className="field"
              value={filtri.specie}
              onChange={(e) => setFiltri((f) => ({ ...f, specie: e.target.value }))}
            >
              <option value="">Tutte le specie</option>
              {specieDisponibili.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              Committente
            </h3>
            <select
              className="field"
              value={filtri.comune}
              onChange={(e) => setFiltri((f) => ({ ...f, comune: e.target.value }))}
            >
              <option value="">Tutti i committenti</option>
              {comuni.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              Ricerca
            </h3>
            <input
              className="field"
              placeholder="Codice o localizzazione…"
              value={filtri.ricerca}
              onChange={(e) => setFiltri((f) => ({ ...f, ricerca: e.target.value }))}
            />
          </div>

          <button
            className="btn-secondary w-full"
            onClick={() =>
              downloadGeoJSON(
                filtrati,
                !filtri.comune
                  ? 'censimento_globale'
                  : `censimento_${(comuni.find((c) => c.id === filtri.comune)?.nome || 'comune').toLowerCase().replaceAll(' ', '_')}`
              )
            }
          >
            ⬇️ Esporta GeoJSON ({filtrati.length})
          </button>
        </div>
      </aside>

      <button
        onClick={() => setSidebarAperta(!sidebarAperta)}
        className={`absolute left-3 top-3 z-10 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-lg sm:left-0 sm:rounded-l-none ${
          sidebarAperta ? 'hidden sm:block' : ''
        }`}
        style={{ left: sidebarAperta ? '18rem' : undefined }}
        title={sidebarAperta ? 'Nascondi filtri' : 'Mostra filtri'}
      >
        {sidebarAperta ? '◀' : `Filtri · ${filtrati.length}`}
      </button>

      {/* ------------------------------------------------------------- mappa */}
      <TreeMap
        alberi={filtrati}
        fotoDi={fotoDi}
        onModifica={(albero) => navigate(`/rilievo/${albero.id}`)}
      />
    </div>
  )
}
