import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import L from 'leaflet'
import { useApp } from '../context/AppContext'
import {
  BERSAGLI, CPC_CLASSI, CPC_META, DIFETTI_CHIOMA, DIFETTI_FUSTO, DIFETTI_RADICI,
  FASI_SVILUPPO, FREQUENZE, LOCALIZZAZIONI, PRESCRIZIONI_SUGGERITE,
  RILEVATORE_DEFAULT, SPECIE, TIPI_INDAGINE, GRAVITA,
} from '../lib/constants'
import { dataProssimoControllo, generaCodice, sintesiStato, suggerisciCPC } from '../lib/cpc'
import { getFotoByAlbero } from '../lib/db'
import CpcBadge from '../components/CpcBadge'

const PASSI = ['Identificazione', 'Biometria', 'Contesto', 'Difetti', 'Sintesi', 'Riepilogo']

function recordVuoto() {
  return {
    id: crypto.randomUUID(),
    codice: '',
    comune_id: '',
    data_rilievo: new Date().toISOString(),
    lat: null,
    lng: null,
    localizzazione: '',
    rilevatore: RILEVATORE_DEFAULT,
    specie_botanica: '',
    altezza_m: '',
    dbh_cm: '',
    diametro_chioma_m: '',
    fase_sviluppo: '',
    bersagli: [],
    frequenza_occupazione: '',
    radici: { difetti: [], gravita: 0 },
    fusto: { difetti: [], gravita: 0 },
    chioma: { difetti: [], gravita: 0 },
    note_osservazioni: '',
    cpc: '',
    richiesta_indagine_strumentale: false,
    tipo_indagine_richiesta: 'Nessuna',
    data_prossimo_controllo: '',
    intervento_emergenza: false,
    prescrizioni_gestionali: '',
    url_foto: [],
  }
}

export default function SurveyPage() {
  const { id } = useParams()
  const { alberi, comuni, salvaAlbero, creaComune } = useApp()
  const navigate = useNavigate()
  const [passo, setPasso] = useState(0)
  const [r, setR] = useState(recordVuoto)
  const [nuoveFoto, setNuoveFoto] = useState([]) // [{blob, url}]
  const [numFotoLocali, setNumFotoLocali] = useState(0) // foto locali già salvate (per la numerazione)
  // testo libero per le voci "Altro" (localizzazione e bersagli)
  const [altroLoc, setAltroLoc] = useState('')
  const [altroBersaglio, setAltroBersaglio] = useState('')
  // scelta del committente prima di iniziare il rilievo (ricorda l'ultimo usato)
  const [scelta, setScelta] = useState(() => localStorage.getItem('vta-ultimo-committente') || '')
  const [mostraNuovo, setMostraNuovo] = useState(false)
  const [nuovoCom, setNuovoCom] = useState({ nome: '', codice: '' })
  const [codiceManuale, setCodiceManuale] = useState(false)
  const [erroreCom, setErroreCom] = useState('')
  const [gps, setGps] = useState({ stato: 'inattivo', accuratezza: null })
  const [errori, setErrori] = useState([])
  const [salvato, setSalvato] = useState(false)
  const watchRef = useRef(null)
  const miniMapRef = useRef(null)
  const miniMapEl = useRef(null)
  const miniMarkerRef = useRef(null) // punto blu: ultima lettura GPS
  const accCircleRef = useRef(null) // cerchio di accuratezza GPS
  const programmaticRef = useRef(false) // distingue i movimenti mappa nostri da quelli dell'utente

  const set = (campo, valore) => setR((prev) => ({ ...prev, [campo]: valore }))

  // modifica di un rilievo esistente: i valori "Altro – testo" tornano
  // nella casella di testo libero
  useEffect(() => {
    if (!id) return
    const esistente = alberi.find((a) => a.id === id)
    if (!esistente) return
    getFotoByAlbero(id).then((f) => setNumFotoLocali(f.length))
    const caricato = { ...recordVuoto(), ...esistente }
    if (caricato.localizzazione?.startsWith('Altro – ')) {
      setAltroLoc(caricato.localizzazione.slice('Altro – '.length))
      caricato.localizzazione = 'Altro'
    }
    caricato.bersagli = (caricato.bersagli || []).map((b) => {
      if (b.startsWith('Altro – ')) {
        setAltroBersaglio(b.slice('Altro – '.length))
        return 'Altro'
      }
      return b
    })
    setR(caricato)
  }, [id, alberi])

  // ------------------------------------------------------------ committente
  // Sintesi della campagna in corso per il committente selezionato:
  // quanti alberi censiti, prossimo codice, data ultimo rilievo.
  const infoCampagna = useMemo(() => {
    const c = comuni.find((x) => x.id === scelta)
    if (!c) return null
    const suoi = alberi.filter((a) => a.comune_id === c.id)
    const ultimo = suoi.length
      ? new Date(Math.max(...suoi.map((a) => +new Date(a.data_rilievo)))).toLocaleDateString('it-IT')
      : null
    return { nome: c.nome, count: suoi.length, prossimo: generaCodice(c.codice, alberi), ultimo }
  }, [scelta, comuni, alberi])

  const avviaConCommittente = (comuneId) => {
    localStorage.setItem('vta-ultimo-committente', comuneId)
    setScelta(comuneId)
    set('comune_id', comuneId)
  }

  // codice breve proposto dal nome (es. "Asilo Nido Mazzini" -> ASI), modificabile
  const suggerisciCodice = (nome) =>
    nome
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/^comune di\s+/i, '')
      .replace(/[^a-zA-Z]/g, '')
      .slice(0, 3)
      .toUpperCase()

  const creaNuovoCommittente = async (e) => {
    e.preventDefault()
    setErroreCom('')
    try {
      const idNuovo = await creaComune({
        nome: nuovoCom.nome.trim(),
        codice: nuovoCom.codice.trim().toUpperCase(),
      })
      setNuovoCom({ nome: '', codice: '' })
      setMostraNuovo(false)
      avviaConCommittente(idNuovo)
    } catch (err) {
      setErroreCom(err.message)
    }
  }

  // valori definitivi salvati nel record (e mostrati nel riepilogo)
  const localizzazioneFinale = () =>
    r.localizzazione === 'Altro' ? `Altro – ${altroLoc.trim()}` : r.localizzazione
  const bersagliFinali = () =>
    r.bersagli.map((b) => (b === 'Altro' ? `Altro – ${altroBersaglio.trim()}` : b))

  // ------------------------------------------------------------------- GPS
  // watchPosition per ~12s tenendo la lettura più accurata, poi correzione
  // manuale trascinando il marker sulla minimappa.
  const acquisisciGPS = () => {
    if (!navigator.geolocation) {
      setGps({ stato: 'errore', accuratezza: null, messaggio: 'Geolocalizzazione non supportata' })
      return
    }
    setGps({ stato: 'acquisizione', accuratezza: null })
    let migliore = null
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (!migliore || pos.coords.accuracy < migliore.coords.accuracy) {
          migliore = pos
          const fix = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            acc: pos.coords.accuracy,
          }
          setR((prev) => ({ ...prev, lat: fix.lat, lng: fix.lng }))
          setGps({ stato: 'acquisizione', accuratezza: Math.round(fix.acc), fix })
        }
      },
      (err) => setGps({ stato: 'errore', accuratezza: null, messaggio: err.message }),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    )
    setTimeout(() => {
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current)
      setGps((g) => (g.stato === 'acquisizione' ? { ...g, stato: 'acquisito' } : g))
    }, 12000)
  }

  useEffect(() => () => {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current)
  }, [])

  // ----------------------- minimappa di perfezionamento con mirino centrale
  // Il GPS centra automaticamente la mappa; poi l'operatore TRASCINA LA MAPPA
  // (non un marker, che col dito sarebbe impreciso) fino a portare il mirino
  // esattamente sull'albero. La posizione salvata è il centro del mirino.
  const haPosizione = r.lat != null
  useEffect(() => {
    if (passo !== 0 || !haPosizione || !miniMapEl.current || miniMapRef.current) return
    const map = L.map(miniMapEl.current, { center: [r.lat, r.lng], zoom: 19 })
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: '© Esri' }
    ).addTo(map)
    map.on('moveend', () => {
      if (programmaticRef.current) {
        programmaticRef.current = false
        return
      }
      const c = map.getCenter()
      setR((prev) => ({ ...prev, lat: c.lat, lng: c.lng }))
    })
    miniMapRef.current = map
  }, [passo, haPosizione]) // eslint-disable-line react-hooks/exhaustive-deps

  // punto blu + cerchio di accuratezza sull'ultima lettura GPS; finché
  // l'acquisizione è in corso la mappa segue il GPS
  useEffect(() => {
    const map = miniMapRef.current
    if (!map || !gps.fix) return
    const { lat, lng, acc } = gps.fix
    if (!miniMarkerRef.current) {
      accCircleRef.current = L.circle([lat, lng], {
        radius: acc, color: '#2563eb', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.12,
      }).addTo(map)
      miniMarkerRef.current = L.circleMarker([lat, lng], {
        radius: 6, color: '#ffffff', weight: 2, fillColor: '#2563eb', fillOpacity: 1,
      }).addTo(map).bindTooltip('Lettura GPS')
    } else {
      miniMarkerRef.current.setLatLng([lat, lng])
      accCircleRef.current.setLatLng([lat, lng]).setRadius(acc)
    }
    if (gps.stato === 'acquisizione') {
      programmaticRef.current = true
      map.setView([lat, lng], map.getZoom())
    }
  }, [gps])

  // riporta mirino e posizione sull'ultima lettura GPS
  const tornaAlGps = () => {
    const f = gps.fix
    if (!f || !miniMapRef.current) return
    programmaticRef.current = true
    miniMapRef.current.setView([f.lat, f.lng], 19)
    setR((prev) => ({ ...prev, lat: f.lat, lng: f.lng }))
  }

  useEffect(() => () => {
    miniMapRef.current?.remove()
    miniMapRef.current = null
    miniMarkerRef.current = null
    accCircleRef.current = null
  }, [passo])

  // ------------------------------------------------------------------ foto
  // Le foto vengono ridimensionate e ricompresse sul dispositivo (max 1600 px,
  // JPEG ~80%): da ~5-8 MB a ~300-500 KB, senza perdita visibile ai fini VTA.
  // Meno spazio in IndexedDB, sync più veloce, PDF più leggeri.
  const comprimiFoto = async (file, maxLato = 1600, qualita = 0.82) => {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      const scala = Math.min(1, maxLato / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bitmap.width * scala)
      canvas.height = Math.round(bitmap.height * scala)
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', qualita))
      return blob || file
    } catch {
      return file // formato non leggibile dal canvas: salva l'originale
    }
  }

  const aggiungiFoto = async (e) => {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    for (const f of files) {
      const blob = await comprimiFoto(f)
      setNuoveFoto((prev) => [...prev, { blob, url: URL.createObjectURL(blob) }])
    }
  }

  // ----------------------------------------------------------- validazione
  // Tutti i campi del modello master sono obbligatori per garantire la
  // qualità del dato nel Web-GIS finale.
  const validaPasso = (n) => {
    const e = []
    if (n === 0) {
      if (!r.comune_id) e.push('Seleziona il committente')
      if (r.lat == null) e.push('Acquisisci la posizione GPS')
      if (!r.localizzazione) e.push('Indica la localizzazione')
      if (r.localizzazione === 'Altro' && !altroLoc.trim())
        e.push('Specifica la localizzazione nella casella "Altro"')
      if (!r.rilevatore) e.push('Indica il rilevatore')
    }
    if (n === 1) {
      if (!r.specie_botanica) e.push('Indica la specie botanica')
      if (!r.altezza_m) e.push("Indica l'altezza")
      if (!r.dbh_cm) e.push('Indica il diametro del fusto (DBH)')
      if (!r.diametro_chioma_m) e.push('Indica il diametro della chioma')
      if (!r.fase_sviluppo) e.push('Indica la fase di sviluppo')
    }
    if (n === 2) {
      if (!r.frequenza_occupazione) e.push('Indica la frequenza di occupazione')
      if (r.bersagli.includes('Altro') && !altroBersaglio.trim())
        e.push('Specifica il bersaglio nella casella "Altro"')
    }
    if (n === 4) {
      if (!r.cpc) e.push('Assegna la classe CPC')
      if (!r.prescrizioni_gestionali) e.push('Indica le prescrizioni gestionali')
      if (r.richiesta_indagine_strumentale && (!r.tipo_indagine_richiesta || r.tipo_indagine_richiesta === 'Nessuna'))
        e.push("Indica il tipo di indagine strumentale")
    }
    setErrori(e)
    return e.length === 0
  }

  const avanti = () => {
    if (!validaPasso(passo)) return
    // entrando in Sintesi: precompila CPC suggerita, codice e prossimo controllo
    if (passo === 3) {
      setR((prev) => {
        const cpc = prev.intervento_emergenza ? 'D' : (prev.cpc || suggerisciCPC(prev))
        const comune = comuni.find((c) => c.id === prev.comune_id)
        return {
          ...prev,
          cpc,
          codice: prev.codice || generaCodice(comune?.codice || 'XXX', alberi),
          data_prossimo_controllo: dataProssimoControllo(cpc, new Date(prev.data_rilievo)),
        }
      })
    }
    setErrori([])
    setPasso((p) => Math.min(p + 1, PASSI.length - 1))
  }

  const salva = async () => {
    const record = {
      ...r,
      localizzazione: localizzazioneFinale(),
      bersagli: bersagliFinali(),
      altezza_m: Number(r.altezza_m),
      dbh_cm: Number(r.dbh_cm),
      diametro_chioma_m: Number(r.diametro_chioma_m),
      comune_nome: comuni.find((c) => c.id === r.comune_id)?.nome,
    }
    await salvaAlbero(record, nuoveFoto.map((f) => f.blob))
    setSalvato(true)
  }

  const cpcSuggerita = useMemo(() => suggerisciCPC(r), [r])

  // ------------------------------------------------------- sezione difetti
  const SezioneDifetti = ({ campo, titolo, opzioni }) => {
    const sez = r[campo]
    const toggle = (d) =>
      set(campo, {
        ...sez,
        difetti: sez.difetti.includes(d) ? sez.difetti.filter((x) => x !== d) : [...sez.difetti, d],
      })
    return (
      <div className="card space-y-3">
        <h3 className="font-bold text-green-900">{titolo}</h3>
        <div>
          <label className="text-sm font-medium">Gravità del difetto (valutazione speditiva)</label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {GRAVITA.map((g) => {
              const attivo = (sez.gravita || 0) === g.v
              return (
                <button
                  key={g.v}
                  type="button"
                  onClick={() => set(campo, { ...sez, gravita: g.v })}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold transition"
                  style={{
                    backgroundColor: attivo ? CPC_META[g.cpc].color : '#f1f5f9',
                    color: attivo ? '#ffffff' : '#475569',
                  }}
                  title={`→ Classe ${g.cpc}`}
                >
                  {g.label}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Difetti rilevati (dettaglio)</label>
          <div className="mt-1 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {opzioni.map((d) => (
              <label key={d} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-green-700"
                  checked={sez.difetti.includes(d)}
                  onChange={() => toggle(d)}
                />
                {d}
              </label>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (salvato) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="card max-w-md text-center">
          <div className="text-5xl">✅</div>
          <h2 className="mt-3 text-xl font-bold">Rilievo salvato</h2>
          <p className="mt-1 text-sm text-slate-500">
            {r.codice} – {r.specie_botanica} · <CpcBadge cpc={r.cpc} esteso />
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <button className="btn-primary" onClick={() => { setR({ ...recordVuoto(), comune_id: r.comune_id }); setNuoveFoto([]); setNumFotoLocali(0); setAltroLoc(''); setAltroBersaglio(''); setPasso(0); setSalvato(false); setGps({ stato: 'inattivo', accuratezza: null }) }}>
              🌳 Nuovo rilievo
            </button>
            <button className="btn-secondary" onClick={() => navigate('/mappa')}>Vai alla mappa</button>
          </div>
        </div>
      </div>
    )
  }

  // ------------------------- schermata iniziale: scelta del committente
  if (!id && !r.comune_id) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-md space-y-4 p-4">
          <div>
            <h2 className="text-lg font-bold text-green-900">Nuovo rilievo · Committente</h2>
            <p className="mt-1 text-sm text-slate-500">
              Per chi stai eseguendo la valutazione? Selezionando un committente già inserito
              riprendi la campagna da dove l'avevi lasciata.
            </p>
          </div>

          <div className="card space-y-3">
            <label className="block text-sm font-medium">Committente</label>
            <select className="field" value={scelta} onChange={(e) => setScelta(e.target.value)}>
              <option value="">Seleziona…</option>
              {comuni.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>

            {infoCampagna && (
              <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">
                {infoCampagna.count > 0 ? (
                  <>
                    <div>
                      <strong>{infoCampagna.count}</strong> alberi già censiti
                      {infoCampagna.ultimo && <> · ultimo rilievo il {infoCampagna.ultimo}</>}
                    </div>
                    <div>Prossimo codice: <strong>{infoCampagna.prossimo}</strong></div>
                  </>
                ) : (
                  <div>Nessun albero ancora censito · primo codice: <strong>{infoCampagna.prossimo}</strong></div>
                )}
              </div>
            )}

            <button
              className="btn-primary w-full"
              disabled={!infoCampagna}
              onClick={() => avviaConCommittente(scelta)}
            >
              ▶ {infoCampagna?.count ? 'Riprendi la valutazione' : 'Inizia la valutazione'}
            </button>
          </div>

          <div className="card space-y-3">
            {!mostraNuovo ? (
              <button className="btn-secondary w-full" onClick={() => setMostraNuovo(true)}>
                ＋ Nuovo committente (prima volta)
              </button>
            ) : (
              <form onSubmit={creaNuovoCommittente} className="space-y-2">
                <label className="block text-sm font-medium">Nuovo committente</label>
                <input
                  className="field"
                  required
                  autoFocus
                  placeholder="es. Comune di Nardò, Asilo Nido Mazzini…"
                  value={nuovoCom.nome}
                  onChange={(e) =>
                    setNuovoCom({
                      nome: e.target.value,
                      codice: codiceManuale ? nuovoCom.codice : suggerisciCodice(e.target.value),
                    })
                  }
                />
                <div>
                  <input
                    className="field"
                    required
                    maxLength="4"
                    placeholder="Codice breve (es. NAR)"
                    value={nuovoCom.codice}
                    onChange={(e) => {
                      setCodiceManuale(true)
                      setNuovoCom({ ...nuovoCom, codice: e.target.value.toUpperCase() })
                    }}
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    Usato per numerare gli alberi (es. {nuovoCom.codice || 'NAR'}-{new Date().getFullYear()}-001)
                  </p>
                </div>
                {erroreCom && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erroreCom}</p>
                )}
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary flex-1" onClick={() => setMostraNuovo(false)}>
                    Annulla
                  </button>
                  <button type="submit" className="btn-primary flex-1">
                    Crea e inizia
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        {/* indicatore passi */}
        <div className="flex items-center gap-1">
          {PASSI.map((p, i) => (
            <div key={p} className="flex-1">
              <div className={`h-1.5 rounded-full ${i <= passo ? 'bg-green-700' : 'bg-slate-200'}`} />
              <div className={`mt-1 hidden text-[10px] font-medium sm:block ${i === passo ? 'text-green-800' : 'text-slate-400'}`}>{p}</div>
            </div>
          ))}
        </div>
        <h2 className="text-lg font-bold text-green-900">
          {id ? `Modifica ${r.codice}` : 'Nuovo rilievo'} · {PASSI[passo]}
        </h2>

        {/* ============================== PASSO 0: identificazione + GPS + foto */}
        {passo === 0 && (
          <div className="space-y-4">
            <div className="card space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-green-700">Committente</div>
                  <div className="font-semibold text-green-900">
                    {comuni.find((c) => c.id === r.comune_id)?.nome || '—'}
                  </div>
                </div>
                {!id && (
                  <button
                    type="button"
                    className="text-xs font-semibold text-green-700 underline"
                    onClick={() => set('comune_id', '')}
                  >
                    cambia
                  </button>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Localizzazione *</label>
                <select className="field" value={r.localizzazione} onChange={(e) => set('localizzazione', e.target.value)}>
                  <option value="">Seleziona…</option>
                  {LOCALIZZAZIONI.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
                {r.localizzazione === 'Altro' && (
                  <input
                    className="field mt-2"
                    autoFocus
                    placeholder="Specifica la localizzazione (es. Rotatoria SS101)…"
                    value={altroLoc}
                    onChange={(e) => setAltroLoc(e.target.value)}
                  />
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Rilevatore *</label>
                <input className="field" value={r.rilevatore} onChange={(e) => set('rilevatore', e.target.value)} />
              </div>
              <p className="text-xs text-slate-400">
                Data rilievo: {new Date(r.data_rilievo).toLocaleString('it-IT')} (automatica) ·
                Codice albero generato al passo Sintesi
              </p>
            </div>

            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-green-900">Posizione GPS *</h3>
                <button type="button" className="btn-primary" onClick={acquisisciGPS}>
                  📡 {gps.stato === 'acquisizione' ? 'Acquisizione…' : r.lat ? 'Riacquisisci' : 'Acquisisci GPS'}
                </button>
              </div>
              {gps.stato === 'errore' && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{gps.messaggio}</p>
              )}
              {r.lat != null && (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-mono text-slate-700">
                      {r.lat.toFixed(6)}, {r.lng.toFixed(6)}
                    </span>
                    {gps.accuratezza && (
                      <span className={`font-semibold ${gps.accuratezza <= 8 ? 'text-green-700' : 'text-amber-600'}`}>
                        GPS ± {gps.accuratezza} m
                      </span>
                    )}
                  </div>
                  {gps.stato === 'acquisizione' && (
                    <p className="text-xs font-medium text-blue-600">
                      📡 Miglioramento della precisione in corso… puoi già sistemare la mappa
                    </p>
                  )}
                  <div className="relative h-72 overflow-hidden rounded-lg border border-slate-200">
                    <div ref={miniMapEl} className="h-full w-full" />
                    {/* mirino fisso al centro: la posizione salvata è questa */}
                    <svg
                      className="pointer-events-none absolute left-1/2 top-1/2 z-[500] -translate-x-1/2 -translate-y-1/2"
                      width="46" height="46" viewBox="0 0 46 46"
                    >
                      <circle cx="23" cy="23" r="14" fill="none" stroke="#ffffff" strokeWidth="5" />
                      <circle cx="23" cy="23" r="14" fill="none" stroke="#dc2626" strokeWidth="2.5" />
                      <line x1="23" y1="1" x2="23" y2="9" stroke="#ffffff" strokeWidth="5" />
                      <line x1="23" y1="37" x2="23" y2="45" stroke="#ffffff" strokeWidth="5" />
                      <line x1="1" y1="23" x2="9" y2="23" stroke="#ffffff" strokeWidth="5" />
                      <line x1="37" y1="23" x2="45" y2="23" stroke="#ffffff" strokeWidth="5" />
                      <line x1="23" y1="1" x2="23" y2="9" stroke="#dc2626" strokeWidth="2.5" />
                      <line x1="23" y1="37" x2="23" y2="45" stroke="#dc2626" strokeWidth="2.5" />
                      <line x1="1" y1="23" x2="9" y2="23" stroke="#dc2626" strokeWidth="2.5" />
                      <line x1="37" y1="23" x2="45" y2="23" stroke="#dc2626" strokeWidth="2.5" />
                      <circle cx="23" cy="23" r="2" fill="#dc2626" />
                    </svg>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs text-slate-400">
                      🎯 Trascina e zooma la mappa fino a portare il mirino esattamente
                      sull'albero: viene salvata la posizione del mirino. Il punto blu è la
                      lettura GPS, il cerchio la sua incertezza.
                    </p>
                    {gps.fix && (
                      <button
                        type="button"
                        className="shrink-0 text-xs font-semibold text-blue-700 underline"
                        onClick={tornaAlGps}
                      >
                        ↩ Torna al GPS
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

          </div>
        )}

        {/* ========================================== PASSO 1: dati biometrici */}
        {passo === 1 && (
          <div className="card space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Specie botanica * (auto-completamento)</label>
              <input className="field" list="specie" value={r.specie_botanica} onChange={(e) => set('specie_botanica', e.target.value)} placeholder="es. Pinus pinea" />
              <datalist id="specie">
                {SPECIE.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </datalist>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Altezza (m) *</label>
                <input type="number" step="0.5" min="0" className="field" value={r.altezza_m} onChange={(e) => set('altezza_m', e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">DBH (cm) *</label>
                <input type="number" step="1" min="0" className="field" value={r.dbh_cm} onChange={(e) => set('dbh_cm', e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Ø chioma (m) *</label>
                <input type="number" step="0.5" min="0" className="field" value={r.diametro_chioma_m} onChange={(e) => set('diametro_chioma_m', e.target.value)} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Fase di sviluppo *</label>
              <div className="flex flex-wrap gap-2">
                {FASI_SVILUPPO.map((f) => (
                  <button key={f} type="button" onClick={() => set('fase_sviluppo', f)}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium ${r.fase_sviluppo === f ? 'bg-green-700 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===================================== PASSO 2: contesto e bersagli */}
        {passo === 2 && (
          <div className="space-y-4">
            <div className="card">
              <h3 className="mb-2 font-bold text-green-900">Bersagli presenti nell'area di caduta</h3>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {BERSAGLI.map((b) => (
                  <label key={b} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-green-700"
                      checked={r.bersagli.includes(b)}
                      onChange={() => set('bersagli', r.bersagli.includes(b) ? r.bersagli.filter((x) => x !== b) : [...r.bersagli, b])} />
                    {b}
                  </label>
                ))}
              </div>
              {r.bersagli.includes('Altro') && (
                <input
                  className="field mt-3"
                  autoFocus
                  placeholder="Specifica il bersaglio (es. Pista ciclabile)…"
                  value={altroBersaglio}
                  onChange={(e) => setAltroBersaglio(e.target.value)}
                />
              )}
            </div>
            <div className="card">
              <h3 className="mb-2 font-bold text-green-900">Frequenza di occupazione *</h3>
              <div className="space-y-1.5">
                {FREQUENZE.map((f) => (
                  <label key={f} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="radio" name="freq" className="h-4 w-4 accent-green-700"
                      checked={r.frequenza_occupazione === f}
                      onChange={() => set('frequenza_occupazione', f)} />
                    {f}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ============================================= PASSO 3: difetti VTA */}
        {passo === 3 && (
          <div className="space-y-4">
            <SezioneDifetti campo="radici" titolo="Radici e colletto" opzioni={DIFETTI_RADICI} />
            <SezioneDifetti campo="fusto" titolo="Fusto" opzioni={DIFETTI_FUSTO} />
            <SezioneDifetti campo="chioma" titolo="Chioma e branche" opzioni={DIFETTI_CHIOMA} />
            <div className="card border-2 border-red-200 bg-red-50/50">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input type="checkbox" className="mt-0.5 h-5 w-5 accent-red-600"
                  checked={r.intervento_emergenza}
                  onChange={(e) => set('intervento_emergenza', e.target.checked)} />
                <span className="text-sm">
                  <strong className="text-red-700">Intervento di emergenza</strong> — segni gravissimi di
                  cedimento imminente (albero morto, grande cavità aperta, ribaltamento della zolla in atto…).
                  Forza la <strong>Classe D</strong> e segnala messa in sicurezza o abbattimento immediato.
                </span>
              </label>
            </div>
            <div className="card">
              <label className="mb-1 block font-bold text-green-900">Note e osservazioni</label>
              <textarea className="field" rows="3" value={r.note_osservazioni} onChange={(e) => set('note_osservazioni', e.target.value)} placeholder="Osservazioni libere sul soggetto…" />
            </div>
          </div>
        )}

        {/* ===================================== PASSO 4: sintesi e gestione */}
        {passo === 4 && (
          <div className="space-y-4">
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-green-900">Classe di Propensione al Cedimento *</h3>
                <span className="text-xs text-slate-500">Suggerita: <CpcBadge cpc={cpcSuggerita} /></span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {CPC_CLASSI.map((c) => (
                  <button key={c} type="button" onClick={() => { set('cpc', c); set('data_prossimo_controllo', dataProssimoControllo(c, new Date(r.data_rilievo))) }}
                    className="rounded-xl border-2 p-2 text-center transition"
                    style={{
                      borderColor: r.cpc === c ? CPC_META[c].color : '#e2e8f0',
                      backgroundColor: r.cpc === c ? CPC_META[c].bg : 'white',
                    }}>
                    <div className="text-base font-black leading-tight" style={{ color: CPC_META[c].color }}>{c}</div>
                    <div className="text-[9px] font-semibold leading-tight text-slate-500">{CPC_META[c].breve}</div>
                  </button>
                ))}
              </div>
              {r.intervento_emergenza && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                  🚨 Override di emergenza attivo: classe forzata a D.
                </p>
              )}
              <p className="text-xs text-slate-400">
                Regola del valore peggiore (VTA Livello 1): la classe suggerita deriva dalla gravità massima
                tra i tre distretti. La decisione finale spetta al valutatore.
              </p>
            </div>

            <div className="card space-y-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input type="checkbox" className="h-4 w-4 accent-green-700"
                  checked={r.richiesta_indagine_strumentale}
                  onChange={(e) => set('richiesta_indagine_strumentale', e.target.checked)} />
                Richiesta indagine strumentale
              </label>
              {r.richiesta_indagine_strumentale && (
                <select className="field" value={r.tipo_indagine_richiesta} onChange={(e) => set('tipo_indagine_richiesta', e.target.value)}>
                  {TIPI_INDAGINE.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium">Prescrizioni gestionali *</label>
                <input className="field" list="prescrizioni" value={r.prescrizioni_gestionali} onChange={(e) => set('prescrizioni_gestionali', e.target.value)} placeholder="es. Potatura di rimonda" />
                <datalist id="prescrizioni">
                  {PRESCRIZIONI_SUGGERITE.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </datalist>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Data prossimo controllo (calcolata dalla CPC)</label>
                <input type="date" className="field" value={r.data_prossimo_controllo} onChange={(e) => set('data_prossimo_controllo', e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* ================================================ PASSO 5: riepilogo */}
        {passo === 5 && (
          <div className="space-y-4">
            <div className="card" style={{ backgroundColor: CPC_META[r.cpc]?.bg }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-black" style={{ color: CPC_META[r.cpc]?.color }}>
                    CPC {CPC_META[r.cpc]?.label}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-700">
                    {r.codice} · <em>{r.specie_botanica}</em>
                  </div>
                </div>
                <div className="text-5xl">{r.cpc === 'D' || r.cpc === 'C/D' ? '⚠️' : r.cpc === 'C' ? '🔶' : '🌳'}</div>
              </div>
              {['C', 'C/D', 'D'].includes(r.cpc) && (
                <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-sm font-bold text-red-800">
                  🚨 INTERVENTO PRIORITARIO: {r.prescrizioni_gestionali}
                </p>
              )}
            </div>
            <div className="card space-y-1.5 text-sm">
              <Riga k="Comune" v={comuni.find((c) => c.id === r.comune_id)?.nome} />
              <Riga k="Localizzazione" v={localizzazioneFinale()} />
              <Riga k="Posizione" v={`${r.lat?.toFixed(6)}, ${r.lng?.toFixed(6)}`} />
              <Riga k="Biometria" v={`H ${r.altezza_m} m · DBH ${r.dbh_cm} cm · chioma ${r.diametro_chioma_m} m · ${r.fase_sviluppo}`} />
              <Riga k="Bersagli" v={r.bersagli.length ? bersagliFinali().join(', ') : 'Nessuno'} />
              <Riga k="Frequentazione" v={r.frequenza_occupazione} />
              <Riga k="Stato" v={sintesiStato(r)} />
              <Riga k="Indagine strumentale" v={r.richiesta_indagine_strumentale ? `Sì – ${r.tipo_indagine_richiesta}` : 'No'} />
              <Riga k="Prossimo controllo" v={r.data_prossimo_controllo ? new Date(r.data_prossimo_controllo).toLocaleDateString('it-IT') : '—'} />
              <Riga k="Prescrizioni" v={r.prescrizioni_gestionali} />
              <Riga k="Foto" v={`${(r.url_foto?.length || 0) + nuoveFoto.length} allegate`} />
            </div>

            {/* documentazione fotografica: ultimo passaggio prima del salvataggio */}
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-green-900">📷 Documentazione fotografica</h3>
                <span className="text-xs text-slate-400">
                  {(r.url_foto?.length || 0) + nuoveFoto.length} foto
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Consigliate: panoramica intera, colletto, particolare dei difetti rilevati.
                Suggerimento: scatta con la fotocamera nativa e scegli "Libreria foto" — gli
                originali in alta risoluzione restano nel Rullino, l'app archivia la copia
                compressa per mappe e schede.
              </p>
              <label className="btn-secondary w-full cursor-pointer">
                📷 Scatta / carica foto
                <input type="file" accept="image/*" multiple className="hidden" onChange={aggiungiFoto} />
              </label>
              <div className="flex flex-wrap gap-2">
                {r.url_foto?.map((u) => (
                  <figure key={u} className="w-24">
                    <img src={u} alt="" className="h-24 w-24 rounded-lg object-cover" />
                    <figcaption className="mt-0.5 truncate text-center text-[10px] text-slate-400">
                      {decodeURIComponent(u.split('/').pop() || '')}
                    </figcaption>
                  </figure>
                ))}
                {nuoveFoto.map((f, i) => (
                  <figure key={f.url} className="relative w-24">
                    <img src={f.url} alt="" className="h-24 w-24 rounded-lg object-cover" />
                    <figcaption className="mt-0.5 truncate text-center text-[10px] text-slate-400">
                      {`${r.codice}_${String((r.url_foto?.length || 0) + numFotoLocali + i + 1).padStart(2, '0')}.jpg`}
                    </figcaption>
                    <button
                      type="button"
                      onClick={() => setNuoveFoto((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full bg-red-600 text-xs font-bold text-white"
                    >
                      ×
                    </button>
                  </figure>
                ))}
                {(r.url_foto?.length || 0) + nuoveFoto.length === 0 && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    ⚠️ Nessuna foto: il rilievo si può salvare comunque, ma resterà segnalato
                    in Archivio tra quelli da completare.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {errori.length > 0 && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {errori.map((e) => (
              <div key={e}>• {e}</div>
            ))}
          </div>
        )}

        {/* navigazione */}
        <div className="flex justify-between gap-3 pb-4">
          <button type="button" className="btn-secondary" disabled={passo === 0} onClick={() => { setErrori([]); setPasso((p) => p - 1) }}>
            ← Indietro
          </button>
          {passo < PASSI.length - 1 ? (
            <button type="button" className="btn-primary" onClick={avanti}>
              Avanti →
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={salva}>
              💾 Conferma e salva
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Riga({ k, v }) {
  return (
    <div className="flex gap-2 border-b border-slate-100 pb-1.5 last:border-0">
      <span className="w-40 shrink-0 font-semibold text-slate-500">{k}</span>
      <span>{v || '—'}</span>
    </div>
  )
}
