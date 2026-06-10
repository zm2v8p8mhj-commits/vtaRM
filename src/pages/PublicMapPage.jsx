import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase, supabaseEnabled } from '../lib/supabaseClient'
import * as db from '../lib/db'
import { COMUNI_DEMO, CPC_CLASSI, CPC_META } from '../lib/constants'
import { downloadGeoJSON } from '../lib/geojson'
import TreeMap from '../components/TreeMap'
import CpcBadge from '../components/CpcBadge'

// ----------------------------------------------------------------------------
// Mappa pubblica di consultazione per il singolo comune, raggiungibile dal
// link con token segreto (#/v/<token>) senza alcun login. Sola lettura.
// ----------------------------------------------------------------------------

export default function PublicMapPage() {
  const { token } = useParams()
  const [comune, setComune] = useState(null)
  const [alberi, setAlberi] = useState([])
  const [fotoLocali, setFotoLocali] = useState({})
  const [stato, setStato] = useState('caricamento') // caricamento | ok | errore
  const [filtri, setFiltri] = useState({ cpc: [...CPC_CLASSI], specie: '', ricerca: '' })
  const [filtriAperti, setFiltriAperti] = useState(() => window.innerWidth >= 640)

  useEffect(() => {
    const media = window.matchMedia('(min-width: 640px)')
    const aggiornaLayout = (evento) => setFiltriAperti(evento.matches)
    media.addEventListener('change', aggiornaLayout)
    return () => media.removeEventListener('change', aggiornaLayout)
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        if (supabaseEnabled) {
          const { data, error } = await supabase.rpc('mappa_pubblica', { token })
          if (error || !data) throw new Error(error?.message || 'Link non valido')
          setComune(data.comune)
          setAlberi(data.alberi.map((a) => ({ ...a, comune_nome: data.comune.nome })))
        } else {
          // modalità demo: lettura dall'archivio locale del dispositivo
          const extra = (await db.getMeta('comuni-extra')) || []
          const c = [...COMUNI_DEMO, ...extra].find((x) => x.share_token === token)
          if (!c) throw new Error('Link non valido')
          setComune(c)
          const tutti = (await db.getAlberi()).filter((a) => a.comune_id === c.id)
          setAlberi(tutti)
          const mappa = {}
          for (const a of tutti) {
            const foto = await db.getFotoByAlbero(a.id)
            if (foto.length) mappa[a.id] = foto.map((f) => URL.createObjectURL(f.blob))
          }
          setFotoLocali(mappa)
        }
        setStato('ok')
      } catch {
        setStato('errore')
      }
    })()
  }, [token])

  const fotoDi = (albero) => [...(albero.url_foto || []), ...(fotoLocali[albero.id] || [])]

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

  if (stato === 'caricamento') {
    return <div className="flex h-dvh items-center justify-center text-slate-500">Caricamento mappa…</div>
  }
  if (stato === 'errore') {
    return (
      <div className="flex h-dvh items-center justify-center p-4">
        <div className="card max-w-md text-center">
          <div className="text-5xl">🔒</div>
          <h1 className="mt-3 text-lg font-bold">Link non valido</h1>
          <p className="mt-1 text-sm text-slate-500">
            Questo collegamento non corrisponde ad alcuna mappa pubblicata. Verifica il link
            ricevuto dal tecnico incaricato.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="safe-top z-20 flex items-center gap-3 bg-green-800 px-4 py-2.5 text-white shadow-md">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="h-9 w-9" />
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold leading-tight">
            {comune.nome} · Censimento del verde pubblico
          </h1>
          <p className="truncate text-[11px] text-green-200">
            Mappa di consultazione (sola lettura) · {alberi.length} alberi censiti ·
            Rilievi VTA: Dott. Agr. Ruggero Manca
          </p>
        </div>
        <button
          onClick={() => setFiltriAperti((v) => !v)}
          className="ml-auto rounded-lg bg-green-700 px-3 py-1.5 text-xs font-medium hover:bg-green-600 sm:hidden"
        >
          {filtriAperti ? 'Nascondi filtri' : 'Filtri'}
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {filtriAperti && (
          <button
            type="button"
            aria-label="Chiudi filtri"
            className="absolute inset-0 z-20 bg-slate-950/35 sm:hidden"
            onClick={() => setFiltriAperti(false)}
          />
        )}

        <aside
          className={`absolute inset-x-0 bottom-0 z-30 flex max-h-[78%] shrink-0 flex-col overflow-hidden rounded-t-2xl border-t border-slate-200 bg-white shadow-2xl transition-transform duration-200 sm:relative sm:inset-auto sm:z-10 sm:max-h-none sm:w-72 sm:rounded-none sm:border-r sm:border-t-0 sm:shadow-none ${
            filtriAperti ? 'translate-y-0' : 'translate-y-full sm:translate-y-0'
          }`}
        >
          <div className="border-b border-slate-100 px-4 pb-2 pt-3 sm:hidden">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-300" />
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-green-900">Filtri mappa</h2>
                <p className="text-xs text-slate-500">{filtrati.length} alberi visualizzati</p>
              </div>
              <button
                type="button"
                className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600"
                onClick={() => setFiltriAperti(false)}
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
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {CPC_CLASSI.map((c) => (
                  <div key={c} className="rounded-lg p-2 text-center" style={{ backgroundColor: CPC_META[c].bg }}>
                    <div className="text-lg font-bold" style={{ color: CPC_META[c].color }}>{conteggi[c]}</div>
                    <div className="text-[10px] font-semibold" style={{ color: CPC_META[c].color }}>Classe {c}</div>
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
                    <input type="checkbox" checked={filtri.cpc.includes(c)} onChange={() => toggleCpc(c)} className="h-4 w-4 accent-green-700" />
                    <CpcBadge cpc={c} esteso />
                  </label>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <button className="text-xs font-semibold text-red-700 underline"
                  onClick={() => setFiltri((f) => ({ ...f, cpc: ['C', 'D'] }))}>
                  Solo priorità (C+D)
                </button>
                <button className="text-xs text-slate-500 underline"
                  onClick={() => setFiltri({ cpc: [...CPC_CLASSI], specie: '', ricerca: '' })}>
                  Azzera filtri
                </button>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Specie botanica</h3>
              <select className="field" value={filtri.specie} onChange={(e) => setFiltri((f) => ({ ...f, specie: e.target.value }))}>
                <option value="">Tutte le specie</option>
                {specieDisponibili.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Ricerca</h3>
              <input className="field" placeholder="Codice o localizzazione…" value={filtri.ricerca}
                onChange={(e) => setFiltri((f) => ({ ...f, ricerca: e.target.value }))} />
            </div>

            <button className="btn-secondary w-full"
              onClick={() => downloadGeoJSON(filtrati, `censimento_${comune.nome.toLowerCase().replaceAll(' ', '_')}`)}>
              ⬇️ Esporta GeoJSON ({filtrati.length})
            </button>
          </div>
        </aside>

        <TreeMap alberi={filtrati} fotoDi={fotoDi} nomeComune={comune.nome} />
      </div>
    </div>
  )
}
