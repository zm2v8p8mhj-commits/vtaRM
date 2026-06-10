import { useMemo, useState } from 'react'
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
  const [sidebarAperta, setSidebarAperta] = useState(true)

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
    const c = { A: 0, B: 0, C: 0, D: 0 }
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
      {/* ----------------------------------------------- barra laterale filtri */}
      <aside
        className={`z-10 flex w-72 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white transition-all ${
          sidebarAperta ? '' : '-ml-72'
        }`}
      >
        <div className="space-y-5 p-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Quadro generale
            </h2>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {CPC_CLASSI.map((c) => (
                <div
                  key={c}
                  className="rounded-lg p-2 text-center"
                  style={{ backgroundColor: CPC_META[c].bg }}
                >
                  <div className="text-lg font-bold" style={{ color: CPC_META[c].color }}>
                    {conteggi[c]}
                  </div>
                  <div className="text-[10px] font-semibold" style={{ color: CPC_META[c].color }}>
                    Classe {c}
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
                onClick={() => setFiltri((f) => ({ ...f, cpc: ['C', 'D'] }))}
              >
                Solo priorità (C+D)
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
        className="absolute left-0 top-3 z-10 rounded-r-lg border border-l-0 border-slate-300 bg-white px-2 py-3 text-sm shadow-md"
        style={{ left: sidebarAperta ? '18rem' : 0 }}
        title={sidebarAperta ? 'Nascondi filtri' : 'Mostra filtri'}
      >
        {sidebarAperta ? '◀' : '▶ Filtri'}
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
