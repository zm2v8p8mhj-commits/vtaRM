import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { CPC_CLASSI } from '../lib/constants'
import { downloadGeoJSON, parseGeoJSON } from '../lib/geojson'
import { esportaExcel } from '../lib/excel'
import { generaSchedaPDF } from '../lib/pdf'
import CpcBadge from '../components/CpcBadge'

export default function ArchivePage() {
  const { alberi, comuni, fotoDi, fotoDettagli, eliminaAlbero, importaAlberi, supabaseEnabled } = useApp()
  const navigate = useNavigate()
  const [filtroCpc, setFiltroCpc] = useState('')
  const [filtroComune, setFiltroComune] = useState('')
  const [soloSenzaFoto, setSoloSenzaFoto] = useState(false)
  const [messaggio, setMessaggio] = useState('')
  const fileRef = useRef(null)

  const filtrati = useMemo(
    () =>
      alberi
        .filter(
          (a) =>
            (!filtroCpc || a.cpc === filtroCpc) &&
            (!filtroComune || a.comune_id === filtroComune) &&
            (!soloSenzaFoto || fotoDi(a).length === 0)
        )
        .sort((a, b) => (a.cpc < b.cpc ? 1 : a.cpc > b.cpc ? -1 : (a.codice || '').localeCompare(b.codice || ''))),
    [alberi, filtroCpc, filtroComune, soloSenzaFoto, fotoDi]
  )

  const senzaFoto = useMemo(() => alberi.filter((a) => fotoDi(a).length === 0).length, [alberi, fotoDi])
  const nonSincronizzati = useMemo(() => alberi.filter((a) => a._synced === false).length, [alberi])

  const importa = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const records = parseGeoJSON(await file.text(), filtroComune || comuni[0]?.id)
      await importaAlberi(records)
      setMessaggio(`✅ Importati ${records.length} alberi da ${file.name}`)
    } catch (err) {
      setMessaggio(`❌ File non valido: ${err.message}`)
    }
    e.target.value = ''
  }

  const nomeExport = () =>
    !filtroComune
      ? 'censimento_globale'
      : `censimento_${(comuni.find((c) => c.id === filtroComune)?.nome || 'comune')
          .toLowerCase()
          .replaceAll(' ', '_')}`

  const esporta = () => downloadGeoJSON(filtrati, nomeExport())

  const esportaXlsx = () =>
    esportaExcel(filtrati, comuni, (a) => fotoDi(a).length, nomeExport())

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-green-900">Archivio rilievi</h2>
            <p className="text-sm text-slate-500">
              {alberi.length} alberi censiti · {senzaFoto > 0 && <span className="font-semibold text-amber-600">{senzaFoto} senza foto</span>}
              {supabaseEnabled && nonSincronizzati > 0 && (
                <span className="ml-2 font-semibold text-blue-600">{nonSincronizzati} da sincronizzare</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => fileRef.current?.click()}>
              ⬆️ Importa GeoJSON
            </button>
            <button className="btn-primary" onClick={esporta}>
              ⬇️ Esporta GeoJSON ({filtrati.length})
            </button>
            <button className="btn-primary" onClick={esportaXlsx}>
              📊 Esporta Excel ({filtrati.length})
            </button>
            <input ref={fileRef} type="file" accept=".geojson,.json" className="hidden" onChange={importa} />
          </div>
        </div>

        {messaggio && (
          <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm" onClick={() => setMessaggio('')}>
            {messaggio}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <select className="field max-w-44" value={filtroCpc} onChange={(e) => setFiltroCpc(e.target.value)}>
            <option value="">Tutte le classi CPC</option>
            {CPC_CLASSI.map((c) => (
              <option key={c} value={c}>Classe {c}</option>
            ))}
          </select>
          <select className="field max-w-52" value={filtroComune} onChange={(e) => setFiltroComune(e.target.value)}>
            <option value="">Tutti i committenti</option>
            {comuni.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-green-700" checked={soloSenzaFoto} onChange={(e) => setSoloSenzaFoto(e.target.checked)} />
            Solo rilievi senza foto
          </label>
        </div>

        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5">Codice</th>
                <th className="px-3 py-2.5">Data</th>
                <th className="px-3 py-2.5">Specie</th>
                <th className="px-3 py-2.5">Committente</th>
                <th className="px-3 py-2.5">CPC</th>
                <th className="px-3 py-2.5">Prossimo controllo</th>
                <th className="px-3 py-2.5">Foto</th>
                <th className="px-3 py-2.5 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filtrati.map((a) => {
                const nFoto = fotoDi(a).length
                return (
                  <tr key={a.id} className="border-b border-slate-100 hover:bg-green-50/40">
                    <td className="px-3 py-2 font-semibold">{a.codice}</td>
                    <td className="px-3 py-2">{a.data_rilievo ? new Date(a.data_rilievo).toLocaleDateString('it-IT') : '—'}</td>
                    <td className="px-3 py-2 italic">{a.specie_botanica}</td>
                    <td className="px-3 py-2">{a.comune_nome || comuni.find((c) => c.id === a.comune_id)?.nome || '—'}</td>
                    <td className="px-3 py-2"><CpcBadge cpc={a.cpc} /></td>
                    <td className="px-3 py-2">{a.data_prossimo_controllo ? new Date(a.data_prossimo_controllo).toLocaleDateString('it-IT') : '—'}</td>
                    <td className="px-3 py-2">{nFoto > 0 ? `📷 ${nFoto}` : <span className="font-semibold text-amber-600">⚠️ 0</span>}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        <button title="Scheda PDF" className="rounded-lg bg-slate-100 px-2 py-1 hover:bg-slate-200"
                          onClick={() => generaSchedaPDF(a, fotoDettagli(a), a.comune_nome || '')}>📄</button>
                        <button title="Modifica" className="rounded-lg bg-slate-100 px-2 py-1 hover:bg-slate-200"
                          onClick={() => navigate(`/rilievo/${a.id}`)}>✏️</button>
                        <button title="Elimina" className="rounded-lg bg-red-50 px-2 py-1 text-red-700 hover:bg-red-100"
                          onClick={() => { if (confirm(`Eliminare il rilievo ${a.codice}?`)) eliminaAlbero(a.id) }}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtrati.length === 0 && (
                <tr>
                  <td colSpan="8" className="px-3 py-8 text-center text-slate-400">
                    Nessun rilievo corrisponde ai filtri.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
