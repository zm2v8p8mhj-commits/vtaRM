import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import L from 'leaflet'
import { useApp } from '../context/AppContext'
import {
  BERSAGLI, CPC_CLASSI, CPC_META, CLASSE_RISCHIO_META, CONFORMITA_CAM,
  CONFLITTI, DISTRETTI, FASI_SVILUPPO, FREQUENZE, LOCALIZZAZIONI,
  PRESCRIZIONI_SUGGERITE, RILEVATORE_DEFAULT, SPECIE, TIPI_INDAGINE, GRAVITA,
  URGENZE, VIGORIA, POSIZIONE_SOCIALE, CONTESTO_DIMORA, CONTESTO_LOCALIZZAZIONE, VINCOLI,
} from '../lib/constants'
import { dataProssimoControllo, generaCodice, sintesiStato, suggerisciCPC, suggerisciRischio, accettabilitaRischio, rischioResiduo, descriviConseguenza, nudgeConseguenza } from '../lib/cpc'
import { valutaConformitaCAM } from '../lib/cam'
import { canopyCover, stimaCO2, stimaCO2Annua, stimaO2Annua, stimaPM10Annuo, valoreOrnamentale } from '../lib/servizi'
import { getFotoByAlbero } from '../lib/db'
import CpcBadge from '../components/CpcBadge'
import Inclinometro from '../components/Inclinometro'

const PASSI = ['Identificazione', 'Biometria', 'Contesto', 'Difetti', 'Sintesi', 'Riepilogo']

const distrettoVuoto = () => ({ difetti: [] })

function recordVuoto() {
  return {
    id: crypto.randomUUID(),
    codice: '',
    data_rilievo: new Date().toISOString(),
    lat: null,
    lng: null,
    // committente pre-selezionato in automatico dall'ultimo usato:
    // la schermata di scelta compare solo se non c'è (prima volta) o con "cambia"
    comune_id: localStorage.getItem('vta-ultimo-committente') || '',
    localizzazione: '',
    indirizzo: '',
    rilevatore: RILEVATORE_DEFAULT,
    specie_botanica: '',
    // biometria estesa
    altezza_m: '',
    dbh_cm: '',
    circonferenza_cm: '',
    diametro_chioma_m: '',
    diametro_branca_cm: '',
    lunghezza_branca_m: '',
    altezza_branca_m: '',
    altezza_bersaglio_m: '',
    fase_sviluppo: '',
    // contesto e vincoli
    bersagli: [],
    frequenza_occupazione: '',
    conflitti: [],
    conformita_cam: '',
    // servizi ecosistemici e gestione (sezione d'ufficio)
    co2_stoccata_kg: '',
    canopy_cover_m2: '',
    data_ultimo_intervento: '',
    note_gestione: '',
    // difetti: 6 distretti (radici resta per i record vecchi)
    zolla: distrettoVuoto(),
    colletto: distrettoVuoto(),
    fusto: distrettoVuoto(),
    castello: distrettoVuoto(),
    branche: distrettoVuoto(),
    chioma: distrettoVuoto(),
    // salute / vigoria
    vigoria: '',
    fitopatie: '',
    agente_cariogeno: '',
    note_osservazioni: '',
    // sintesi tecnica
    cpc: '',
    classe_rischio: '',
    richiesta_indagine_strumentale: false,
    tipo_indagine_richiesta: 'Nessuna',
    urgenza_indagine: '',
    data_prossimo_controllo: '',
    intervento_emergenza: false,
    prescrizioni_gestionali: '',
    urgenza_intervento: '',
    mitigazione_bersaglio: '',
    urgenza_mitigazione: '',
    // valori
    co2_kg_anno: '',
    valore_economico_eur: '',
    // valore ornamentale — contesto (modello dello studio)
    posizione_sociale: '',
    contesto_dimora: '',
    contesto_localizzazione: '',
    vincolo: '',
    valore_max_rif: '',
    // inclinazione (modulo pericolo)
    inclinazione_tipo: '',
    inclinazione_gradi: '',
    curvatura_correttiva: false,
    instabilita_suolo: false,
    // elementi per relazione (linee guida CONAF)
    compartimentazione: '',
    apc_m: '',
    suolo_zpa: '',
    limiti_valutazione: '',
    motivazione_scelte: '',
    url_foto: [],
    foto_difetti: {},
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
  const [altroConflitto, setAltroConflitto] = useState('')
  // distinzione campo/ufficio: alcune voci si completano in studio al PC
  const [isDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024)
  // scelta del committente prima di iniziare il rilievo (ricorda l'ultimo usato)
  const [scelta, setScelta] = useState(() => localStorage.getItem('vta-ultimo-committente') || '')
  const [mostraNuovo, setMostraNuovo] = useState(false)
  const [nuovoCom, setNuovoCom] = useState({ nome: '', codice: '' })
  const [codiceManuale, setCodiceManuale] = useState(false)
  const [erroreCom, setErroreCom] = useState('')
  const [gps, setGps] = useState({ stato: 'inattivo', accuratezza: null })
  const [inclinometroAperto, setInclinometroAperto] = useState(false)

  // apre l'inclinometro; su iOS 13+ il permesso ai sensori va chiesto nel gesto
  const apriInclinometro = async () => {
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        const esito = await DeviceMotionEvent.requestPermission()
        if (esito !== 'granted') return
      }
    } catch {
      /* alcuni browser lanciano fuori da un gesto: proviamo comunque ad aprire */
    }
    setInclinometroAperto(true)
  }

  // toggle di un bersaglio; selezionando un "sito sensibile" imposta in automatico
  // la frequentazione al massimo (recettori vulnerabili: scuole, asili, RSA…)
  const toggleBersaglio = (b) => {
    const presente = r.bersagli.includes(b)
    const nuovi = presente ? r.bersagli.filter((x) => x !== b) : [...r.bersagli, b]
    setR((prev) => {
      const patch = { ...prev, bersagli: nuovi }
      if (!presente && /sensibile|scuola|asilo|rsa/i.test(b)) patch.frequenza_occupazione = 'Area costantemente occupata'
      return patch
    })
  }
  const [errori, setErrori] = useState([])
  const [salvato, setSalvato] = useState(false)
  const watchRef = useRef(null)
  const miniMapRef = useRef(null)
  const miniMapEl = useRef(null)
  const miniMarkerRef = useRef(null) // punto blu: ultima lettura GPS
  const accCircleRef = useRef(null) // cerchio di accuratezza GPS
  const [indirizzoStato, setIndirizzoStato] = useState('inattivo')
  const autoIndRef = useRef(false)
  const camManualeRef = useRef(false) // true = conformità CAM scelta a mano (non sovrascrivere)
  const programmaticRef = useRef(false) // distingue i movimenti mappa nostri da quelli dell'utente

  const set = (campo, valore) => setR((prev) => ({ ...prev, [campo]: valore }))

  // Cambio della specie: la conformità CAM torna a seguire la specie (anche su
  // un rilievo già salvato), salvo poi ri-modificarla a mano. Es. correggendo
  // "Cupressus sempervirens" → "Cupressus arizonica" il CAM passa da Conforme a
  // Da verificare automaticamente.
  const cambiaSpecie = (valore) => {
    const sug = valutaConformitaCAM(valore)
    camManualeRef.current = false
    setR((prev) => ({
      ...prev,
      specie_botanica: valore,
      conformita_cam: sug ? sug.esito : prev.conformita_cam,
    }))
  }

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
    caricato.conflitti = (caricato.conflitti || []).map((c) => {
      if (c.startsWith('Altro – ')) {
        setAltroConflitto(c.slice('Altro – '.length))
        return 'Altro'
      }
      return c
    })
    // normalizza i difetti (stringhe → oggetti) su tutti i distretti
    for (const k of ['radici', 'zolla', 'colletto', 'fusto', 'castello', 'branche', 'chioma']) {
      const sez = caricato[k]
      if (sez?.difetti?.length && typeof sez.difetti[0] === 'string') {
        caricato[k] = { difetti: sez.difetti.map((nome) => ({ nome, gravita: sez.gravita || 1 })) }
      }
    }
    // record vecchi (3 distretti): porta "radici" nella nuova "zolla radicale"
    if (caricato.radici?.difetti?.length && !caricato.zolla?.difetti?.length) {
      caricato.zolla = caricato.radici
    }
    // garantisce che i 6 distretti esistano sempre
    for (const d of DISTRETTI) {
      if (!caricato[d.key]) caricato[d.key] = distrettoVuoto()
    }
    camManualeRef.current = true // su un rilievo esistente non sovrascrivere la conformità salvata
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

  // se il committente memorizzato non è più tra quelli disponibili, torna a chiederlo
  useEffect(() => {
    if (!id && r.comune_id && comuni.length && !comuni.find((c) => c.id === r.comune_id)) {
      set('comune_id', '')
    }
  }, [comuni, id]) // eslint-disable-line react-hooks/exhaustive-deps

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
  const conflittiFinali = () =>
    r.conflitti.map((c) => (c === 'Altro' ? `Altro – ${altroConflitto.trim()}` : c))

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

  // ------------------------------------------------ indirizzo via/piazza
  // Reverse geocoding con Nominatim (OpenStreetMap): dalle coordinate ricava
  // il nome della via o piazza. Best-effort: offline o senza esito resta
  // modificabile a mano. Non sovrascrive un indirizzo già digitato.
  const rilevaIndirizzo = async () => {
    if (r.lat == null) return
    setIndirizzoStato('caricamento')
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${r.lat}&lon=${r.lng}&zoom=18&addressdetails=1&accept-language=it`
      )
      const j = await res.json()
      const ad = j.address || {}
      const via = ad.road || ad.pedestrian || ad.footway || ad.square ||
        ad.neighbourhood || ad.suburb || ad.hamlet || ''
      const civico = ad.house_number ? ` ${ad.house_number}` : ''
      const testo = via ? `${via}${civico}` : (j.display_name?.split(',')[0] || '')
      if (testo) set('indirizzo', testo)
      setIndirizzoStato(testo ? 'ok' : 'errore')
    } catch {
      setIndirizzoStato('errore')
    }
  }

  useEffect(() => {
    if (r.lat != null && !autoIndRef.current && !r.indirizzo && navigator.onLine) {
      autoIndRef.current = true
      rilevaIndirizzo()
    }
  }, [r.lat]) // eslint-disable-line react-hooks/exhaustive-deps

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
  const comprimiFoto = async (file, maxLato = 2000, qualita = 0.85) => {
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

  // tag = null per le foto generali; "Distretto · Difetto" per quelle di un difetto
  const aggiungiFoto = async (e, tag = null) => {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    for (const f of files) {
      const blob = await comprimiFoto(f)
      setNuoveFoto((prev) => [...prev, { blob, url: URL.createObjectURL(blob), tag }])
    }
  }
  const rimuoviFoto = (url) => setNuoveFoto((prev) => prev.filter((f) => f.url !== url))

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
          classe_rischio: prev.classe_rischio || suggerisciRischio(cpc, prev.frequenza_occupazione),
          codice: prev.codice || generaCodice(comune?.codice || 'XXX', alberi),
          data_prossimo_controllo: dataProssimoControllo(cpc, new Date(prev.data_rilievo)),
        }
      })
    }
    setErrori([])
    setPasso((p) => Math.min(p + 1, PASSI.length - 1))
  }

  const salva = async () => {
    const num = (v) => (v === '' || v == null ? null : Number(v))
    const record = {
      ...r,
      localizzazione: localizzazioneFinale(),
      bersagli: bersagliFinali(),
      conflitti: conflittiFinali(),
      altezza_m: num(r.altezza_m),
      dbh_cm: num(r.dbh_cm),
      circonferenza_cm: num(r.circonferenza_cm),
      diametro_chioma_m: num(r.diametro_chioma_m),
      diametro_branca_cm: num(r.diametro_branca_cm),
      lunghezza_branca_m: num(r.lunghezza_branca_m),
      altezza_branca_m: num(r.altezza_branca_m),
      altezza_bersaglio_m: num(r.altezza_bersaglio_m),
      apc_m: num(r.apc_m),
      valore_max_rif: num(r.valore_max_rif),
      inclinazione_gradi: num(r.inclinazione_gradi),
      // l'instabilità al suolo è un segno di cedimento imminente: attiva l'emergenza
      intervento_emergenza: r.intervento_emergenza || r.instabilita_suolo,
      valore_economico_eur: num(r.valore_economico_eur),
      // servizi ecosistemici: usa il valore inserito a mano (PC) o la stima automatica
      co2_stoccata_kg: num(r.co2_stoccata_kg) ?? co2Stimata,
      // canopy effettivo: sempre ricalcolato (dipende da chioma + vigoria), così
      // ri-salvando un rilievo esistente si aggiorna alla vigoria corrente
      canopy_cover_m2: canopyStimato,
      co2_kg_anno: co2AnnuaStimata,
      // su mobile la parte gestionale resta da confermare in studio
      note_gestione: r.note_gestione || (!isDesktop ? 'Da confermare in studio' : ''),
      comune_nome: comuni.find((c) => c.id === r.comune_id)?.nome,
    }
    await salvaAlbero(record, nuoveFoto)
    setSalvato(true)
  }

  const cpcSuggerita = useMemo(() => suggerisciCPC(r), [r])
  const rischioSuggerito = useMemo(
    () => suggerisciRischio(r.cpc || cpcSuggerita, r.frequenza_occupazione),
    [r.cpc, cpcSuggerita, r.frequenza_occupazione]
  )

  // conformità ai CAM suggerita dalla specie; pre-compila il campo finché il
  // valutatore non sceglie a mano (camManualeRef)
  const camSuggerito = useMemo(() => valutaConformitaCAM(r.specie_botanica), [r.specie_botanica])
  useEffect(() => {
    if (!camManualeRef.current && camSuggerito) set('conformita_cam', camSuggerito.esito)
  }, [camSuggerito]) // eslint-disable-line react-hooks/exhaustive-deps

  // servizi ecosistemici calcolati dai dati biometrici
  const co2Stimata = useMemo(() => stimaCO2(r.specie_botanica, r.dbh_cm, r.altezza_m), [r.specie_botanica, r.dbh_cm, r.altezza_m])
  const canopyStimato = useMemo(() => canopyCover(r.diametro_chioma_m, r.vigoria), [r.diametro_chioma_m, r.vigoria])
  const co2AnnuaStimata = useMemo(
    () => stimaCO2Annua(r.specie_botanica, r.dbh_cm, r.altezza_m, r.fase_sviluppo, r.vigoria),
    [r.specie_botanica, r.dbh_cm, r.altezza_m, r.fase_sviluppo, r.vigoria]
  )
  const o2Stimato = useMemo(
    () => stimaO2Annua(r.specie_botanica, r.dbh_cm, r.altezza_m, r.fase_sviluppo, r.vigoria),
    [r.specie_botanica, r.dbh_cm, r.altezza_m, r.fase_sviluppo, r.vigoria]
  )
  const pm10Stimato = useMemo(() => stimaPM10Annuo(r.diametro_chioma_m, r.vigoria), [r.diametro_chioma_m, r.vigoria])
  const valoreStimato = useMemo(
    () => valoreOrnamentale(r),
    [r.dbh_cm, r.circonferenza_cm, r.altezza_m, r.diametro_chioma_m, r.specie_botanica, r.vigoria,
      r.posizione_sociale, r.contesto_dimora, r.contesto_localizzazione, r.vincolo, r.valore_max_rif]
  )

  // ------------------------------------------------------- sezione difetti
  const SezioneDifetti = ({ campo, titolo, opzioni }) => {
    const sez = r[campo]
    const difetti = sez.difetti || []
    const trova = (nome) => difetti.find((d) => (d.nome ?? d) === nome)
    const toggle = (nome) => {
      const presente = trova(nome)
      set(campo, {
        ...sez,
        difetti: presente
          ? difetti.filter((d) => (d.nome ?? d) !== nome)
          : [...difetti, { nome, gravita: 1 }],
      })
    }
    const setGrav = (nome, g) =>
      set(campo, {
        ...sez,
        difetti: difetti.map((d) => ((d.nome ?? d) === nome ? { nome, gravita: g } : d)),
      })
    return (
      <div className="card space-y-2">
        <h3 className="font-bold text-green-900">{titolo}</h3>
        <p className="text-xs text-slate-500">
          Spunta i difetti presenti e assegna a ciascuno la gravità.
        </p>
        <div className="space-y-1.5">
          {opzioni.map((nome) => {
            const sel = trova(nome)
            return (
              <div key={nome} className={`rounded-lg border p-2 ${sel ? 'border-slate-300 bg-slate-50' : 'border-slate-200'}`}>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-green-700"
                    checked={!!sel}
                    onChange={() => toggle(nome)}
                  />
                  {nome}
                </label>
                {sel && (
                  <>
                  <div className="mt-1.5 flex flex-wrap gap-1 pl-6">
                    {GRAVITA.filter((g) => g.v > 0).map((g) => {
                      const attivo = (sel.gravita || 1) === g.v
                      return (
                        <button
                          key={g.v}
                          type="button"
                          onClick={() => setGrav(nome, g.v)}
                          className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition"
                          style={{
                            backgroundColor: attivo ? CPC_META[g.cpc].color : '#ffffff',
                            color: attivo ? '#ffffff' : '#475569',
                            border: attivo ? 'none' : '1px solid #cbd5e1',
                          }}
                          title={`→ Classe ${g.cpc}`}
                        >
                          {g.label}
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-2 pl-6">
                    <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-green-700">
                      📷 Foto del difetto
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => aggiungiFoto(e, `${titolo} · ${nome}`)}
                      />
                    </label>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {nuoveFoto
                        .filter((f) => f.tag === `${titolo} · ${nome}`)
                        .map((f) => (
                          <div key={f.url} className="relative">
                            <img src={f.url} alt="" className="h-14 w-14 rounded object-cover" />
                            <button
                              type="button"
                              onClick={() => rimuoviFoto(f.url)}
                              className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-red-600 text-[10px] font-bold leading-none text-white"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>
                  </>
                )}
              </div>
            )
          })}
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
            <button className="btn-primary" onClick={() => { setR({ ...recordVuoto(), comune_id: r.comune_id }); setNuoveFoto([]); setNumFotoLocali(0); setAltroLoc(''); setAltroBersaglio(''); setAltroConflitto(''); autoIndRef.current = false; camManualeRef.current = false; setIndirizzoStato('inattivo'); setPasso(0); setSalvato(false); setGps({ stato: 'inattivo', accuratezza: null }) }}>
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

                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      Indirizzo (via / piazza) <span className="font-normal text-slate-400">— rilevato automaticamente</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        className="field"
                        value={r.indirizzo}
                        onChange={(e) => set('indirizzo', e.target.value)}
                        placeholder="es. Piazza Salandra"
                      />
                      <button
                        type="button"
                        className="btn-secondary shrink-0 !px-3"
                        onClick={rilevaIndirizzo}
                        title="Rileva l'indirizzo dalla posizione attuale del mirino"
                      >
                        📍
                      </button>
                    </div>
                    {indirizzoStato === 'caricamento' && (
                      <p className="mt-1 text-xs text-blue-600">Rilevamento indirizzo in corso…</p>
                    )}
                    {indirizzoStato === 'errore' && (
                      <p className="mt-1 text-xs text-amber-600">Indirizzo non rilevato: scrivilo a mano.</p>
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
              <input className="field" list="specie" value={r.specie_botanica} onChange={(e) => cambiaSpecie(e.target.value)} placeholder="es. Pinus pinea" />
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
                <label className="mb-1 block text-sm font-medium">Circonferenza (cm)</label>
                <input type="number" step="1" min="0" className="field" value={r.circonferenza_cm} onChange={(e) => set('circonferenza_cm', e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Ø chioma (m) *</label>
                <input type="number" step="0.5" min="0" className="field" value={r.diametro_chioma_m} onChange={(e) => set('diametro_chioma_m', e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">H bersaglio (m)</label>
                <input type="number" step="0.5" min="0" className="field" value={r.altezza_bersaglio_m} onChange={(e) => set('altezza_bersaglio_m', e.target.value)} />
              </div>
            </div>
            <details className="rounded-lg border border-slate-200 p-3 text-sm">
              <summary className="cursor-pointer font-medium text-slate-600">Dati branca principale (opzionale)</summary>
              <div className="mt-2 grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium">Ø branca (cm)</label>
                  <input type="number" step="1" min="0" className="field" value={r.diametro_branca_cm} onChange={(e) => set('diametro_branca_cm', e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Lungh. branca (m)</label>
                  <input type="number" step="0.5" min="0" className="field" value={r.lunghezza_branca_m} onChange={(e) => set('lunghezza_branca_m', e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">H branca (m)</label>
                  <input type="number" step="0.5" min="0" className="field" value={r.altezza_branca_m} onChange={(e) => set('altezza_branca_m', e.target.value)} />
                </div>
              </div>
            </details>
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
                      onChange={() => toggleBersaglio(b)} />
                    {b}
                  </label>
                ))}
              </div>
              {r.bersagli.some((b) => /sensibile|scuola|asilo|rsa/i.test(b)) && (
                <p className="mt-2 rounded-lg bg-orange-100 px-3 py-2 text-xs text-orange-800">
                  ⚠️ Sito sensibile: frequentazione impostata a «costantemente occupata» e conseguenza maggiorata
                  (recettori vulnerabili) — il rischio sale anche con difetti moderati.
                </p>
              )}
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
            <div className="card">
              <h3 className="mb-2 font-bold text-green-900">Conflitti con le strutture <span className="font-normal text-slate-400">(max 2 principali)</span></h3>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {CONFLITTI.map((c) => {
                  const sel = r.conflitti.includes(c)
                  return (
                    <label key={c} className={`flex cursor-pointer items-center gap-2 text-sm ${!sel && r.conflitti.length >= 2 ? 'opacity-40' : ''}`}>
                      <input type="checkbox" className="h-4 w-4 accent-green-700"
                        checked={sel}
                        disabled={!sel && r.conflitti.length >= 2}
                        onChange={() => set('conflitti', sel ? r.conflitti.filter((x) => x !== c) : [...r.conflitti, c])} />
                      {c}
                    </label>
                  )
                })}
              </div>
              {r.conflitti.includes('Altro') && (
                <input
                  className="field mt-3"
                  autoFocus
                  placeholder="Specifica il conflitto (es. Pista ciclabile)…"
                  value={altroConflitto}
                  onChange={(e) => setAltroConflitto(e.target.value)}
                />
              )}
            </div>
            <div className="card">
              <label className="mb-1 block text-sm font-medium">Conformità ai CAM Verde Urbano</label>
              <p className="mb-2 text-xs text-slate-500">
                La specie è coerente con i Criteri Ambientali Minimi per il verde urbano rispetto a questo sito?
              </p>
              <div className="flex flex-wrap gap-2">
                {CONFORMITA_CAM.map((c) => (
                  <button key={c} type="button"
                    onClick={() => { camManualeRef.current = true; set('conformita_cam', r.conformita_cam === c ? '' : c) }}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium ${r.conformita_cam === c ? 'bg-green-700 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {c}
                  </button>
                ))}
              </div>
              {camSuggerito ? (
                <p className="mt-2 text-xs text-slate-500">
                  🤖 Suggerito dalla specie <em>{r.specie_botanica}</em>:{' '}
                  <strong>{camSuggerito.esito}</strong> — {camSuggerito.motivo}.
                </p>
              ) : r.specie_botanica ? (
                <p className="mt-2 text-xs text-slate-400">
                  Specie non in elenco automatico: valuta manualmente la conformità.
                </p>
              ) : null}
            </div>
          </div>
        )}

        {/* ============================================= PASSO 3: difetti VTA */}
        {passo === 3 && (
          <div className="space-y-4">
            {DISTRETTI.map((d) => (
              <SezioneDifetti key={d.key} campo={d.key} titolo={d.label} opzioni={d.opzioni} />
            ))}

            <div className="card space-y-3">
              <h3 className="font-bold text-green-900">Salute e vigoria</h3>
              <div>
                <label className="mb-1 block text-sm font-medium">Vigoria generale</label>
                <div className="flex flex-wrap gap-2">
                  {VIGORIA.map((v) => (
                    <button key={v} type="button" onClick={() => set('vigoria', v)}
                      className={`rounded-full px-4 py-1.5 text-sm font-medium ${r.vigoria === v ? 'bg-green-700 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Fitopatie</label>
                  <input className="field" value={r.fitopatie} onChange={(e) => set('fitopatie', e.target.value)} placeholder="es. nessun segno / oidio…" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Agente cariogeno</label>
                  <input className="field" value={r.agente_cariogeno} onChange={(e) => set('agente_cariogeno', e.target.value)} placeholder="es. nessun segno / Ganoderma…" />
                </div>
              </div>
            </div>

            <div className="card space-y-3">
              <h3 className="font-bold text-green-900">Inclinazione del fusto</h3>
              <div>
                <label className="mb-1 block text-sm font-medium">Tipo di inclinazione</label>
                <div className="flex flex-wrap gap-2">
                  {['Assente', 'Lineare', 'Arcuata', 'Sciabolata/Sinuosa'].map((t) => (
                    <button key={t} type="button" onClick={() => set('inclinazione_tipo', r.inclinazione_tipo === t ? '' : t)}
                      className={`rounded-full px-4 py-1.5 text-sm font-medium ${r.inclinazione_tipo === t ? 'bg-green-700 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      {t}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Lineare = spesso recente/attiva (pericolosa). Arcuata / Sciabolata / Sinuosa = di norma compensata.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Gradi di inclinazione (°)</label>
                  <div className="flex gap-2">
                    <input type="number" step="1" min="0" max="90"
                      className={`field ${Number(r.inclinazione_gradi) >= 20 ? 'border-red-400 bg-red-50' : Number(r.inclinazione_gradi) >= 15 ? 'border-orange-400 bg-orange-50' : ''}`}
                      value={r.inclinazione_gradi} onChange={(e) => set('inclinazione_gradi', e.target.value)} placeholder="es. 12" />
                    <button type="button" onClick={apriInclinometro}
                      className="shrink-0 rounded-lg bg-green-700 px-3 text-sm font-semibold text-white active:scale-95"
                      title="Misura con la livella del telefono">📐 Misura</button>
                  </div>
                  {Number(r.inclinazione_gradi) >= 15 && (
                    <p className={`mt-1 text-xs font-semibold ${Number(r.inclinazione_gradi) >= 20 ? 'text-red-700' : 'text-orange-600'}`}>
                      ⚠️ Inclinazione {Number(r.inclinazione_gradi) >= 20 ? 'marcata' : 'significativa'} — verificare la risposta adattativa.
                    </p>
                  )}
                </div>
                <label className="flex items-center gap-2 text-sm sm:mt-7">
                  <input type="checkbox" className="h-4 w-4 accent-green-700"
                    checked={r.curvatura_correttiva} onChange={(e) => set('curvatura_correttiva', e.target.checked)} />
                  Curvatura correttiva presente (risposta gravitropica a S/C)
                </label>
              </div>
              {r.inclinazione_tipo === 'Lineare' && !r.curvatura_correttiva && Number(r.inclinazione_gradi) >= 15 && (
                <p className="rounded-lg bg-orange-100 px-3 py-2 text-xs text-orange-800">
                  Inclinazione lineare attiva senza curvatura correttiva → la propensione suggerita viene <strong>elevata di una classe</strong>.
                </p>
              )}
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border-2 border-red-200 bg-red-50/60 p-2.5">
                <input type="checkbox" className="mt-0.5 h-5 w-5 accent-red-600"
                  checked={r.instabilita_suolo} onChange={(e) => set('instabilita_suolo', e.target.checked)} />
                <span className="text-sm">
                  <strong className="text-red-700">Instabilità al suolo</strong> — sollevamento della zolla o cretti/fessure sul lato sopravento.
                  <strong> Override: Classe D</strong> e abbattimento/messa in sicurezza immediata.
                </span>
              </label>
            </div>

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
                tra i distretti. La decisione finale spetta al valutatore.
              </p>
            </div>

            {/* Rischio Liv.2: propensione (CPC) × bersaglio (frequentazione) */}
            <div className="card space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-green-900">Classe di rischio</h3>
                <span className="text-xs text-slate-500">
                  Suggerita: <strong style={{ color: CLASSE_RISCHIO_META[rischioSuggerito]?.color }}>{rischioSuggerito}</strong>
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {Object.keys(CLASSE_RISCHIO_META).map((k) => (
                  <button key={k} type="button" onClick={() => set('classe_rischio', k)}
                    className="rounded-xl border-2 p-2 text-center text-xs font-bold transition"
                    style={{
                      borderColor: r.classe_rischio === k ? CLASSE_RISCHIO_META[k].color : '#e2e8f0',
                      backgroundColor: r.classe_rischio === k ? CLASSE_RISCHIO_META[k].bg : 'white',
                      color: CLASSE_RISCHIO_META[k].color,
                    }}>
                    {k}
                  </button>
                ))}
              </div>
              {r.classe_rischio && (
                <p className="text-xs text-slate-500">{CLASSE_RISCHIO_META[r.classe_rischio]?.nota}</p>
              )}
              <p className="text-xs text-slate-400">
                Incrocia la propensione (CPC) con il bersaglio (frequentazione: {r.frequenza_occupazione || '—'}).
              </p>
            </div>

            {/* Prescrizioni strutturate con urgenza */}
            <div className="card space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Interventi colturali *</label>
                <input className="field" list="prescrizioni" value={r.prescrizioni_gestionali} onChange={(e) => set('prescrizioni_gestionali', e.target.value)} placeholder="es. Potatura di rimonda del secco" />
                <datalist id="prescrizioni">
                  {PRESCRIZIONI_SUGGERITE.map((p) => (<option key={p}>{p}</option>))}
                </datalist>
                <UrgenzaScelta valore={r.urgenza_intervento} onScegli={(u) => set('urgenza_intervento', u)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Mitigazione del bersaglio</label>
                <input className="field" value={r.mitigazione_bersaglio} onChange={(e) => set('mitigazione_bersaglio', e.target.value)} placeholder="es. transennamento, divieto di sosta, pannello informativo" />
                <UrgenzaScelta valore={r.urgenza_mitigazione} onScegli={(u) => set('urgenza_mitigazione', u)} />
              </div>
              <div>
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <input type="checkbox" className="h-4 w-4 accent-green-700"
                    checked={r.richiesta_indagine_strumentale}
                    onChange={(e) => set('richiesta_indagine_strumentale', e.target.checked)} />
                  Indagine strumentale di approfondimento
                </label>
                {r.richiesta_indagine_strumentale && (
                  <>
                    <select className="field mt-2" value={r.tipo_indagine_richiesta} onChange={(e) => set('tipo_indagine_richiesta', e.target.value)}>
                      {TIPI_INDAGINE.map((t) => (<option key={t}>{t}</option>))}
                    </select>
                    <UrgenzaScelta valore={r.urgenza_indagine} onScegli={(u) => set('urgenza_indagine', u)} />
                  </>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Data prossimo controllo (calcolata dalla CPC)</label>
                <input type="date" className="field" value={r.data_prossimo_controllo} onChange={(e) => set('data_prossimo_controllo', e.target.value)} />
              </div>
            </div>

            {/* Servizi ecosistemici e gestione: parte calcolata in automatico +
                parte da confermare/completare in studio (PC) */}
            <div className="card space-y-3">
              <h3 className="font-bold text-green-900">Servizi ecosistemici e gestione</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-green-50 px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-green-700">CO₂ stoccata (stima)</div>
                  <div className="text-lg font-bold text-green-900">
                    {co2Stimata != null ? `${co2Stimata.toLocaleString('it-IT')} kg` : '—'}
                  </div>
                  <div className="text-[10px] text-slate-500">da specie + DBH + altezza</div>
                </div>
                <div className="rounded-lg bg-green-50 px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-green-700">Canopy cover effettivo</div>
                  <div className="text-lg font-bold text-green-900">
                    {canopyStimato != null ? `${canopyStimato.toLocaleString('it-IT')} m²` : '—'}
                  </div>
                  <div className="text-[10px] text-slate-500">chioma corretta per vigoria</div>
                </div>
                <div className="rounded-lg bg-green-50 px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-green-700">CO₂ assorbita / anno</div>
                  <div className="text-lg font-bold text-green-900">
                    {co2AnnuaStimata != null ? `${co2AnnuaStimata.toLocaleString('it-IT')} kg/anno` : '—'}
                  </div>
                  <div className="text-[10px] text-slate-500">crescita annua · corretta per vigoria</div>
                </div>
                <div className="rounded-lg bg-green-50 px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-green-700">O₂ prodotto / anno</div>
                  <div className="text-lg font-bold text-green-900">
                    {o2Stimato != null ? `${o2Stimato.toLocaleString('it-IT')} kg/anno` : '—'}
                  </div>
                  <div className="text-[10px] text-slate-500">da CO₂ assorbita (fotosintesi)</div>
                </div>
                <div className="rounded-lg bg-green-50 px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-green-700">PM10 rimosso / anno</div>
                  <div className="text-lg font-bold text-green-900">
                    {pm10Stimato != null ? `${pm10Stimato.toLocaleString('it-IT')} g/anno` : '—'}
                  </div>
                  <div className="text-[10px] text-slate-500">da canopy effettivo</div>
                </div>
              </div>
              <p className="text-xs text-slate-400">
                Stime calcolate automaticamente dai dati biometrici (speditive, per il monitoraggio
                regionale). La CO₂ è una stima allometrica, non sostituisce i-Tree.
              </p>

              {isDesktop ? (
                <div className="space-y-3 border-t border-slate-100 pt-3">
                  <p className="text-xs font-semibold text-slate-500">Gestione (completamento in studio)</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium">Data ultimo intervento</label>
                      <input type="date" className="field" value={r.data_ultimo_intervento} onChange={(e) => set('data_ultimo_intervento', e.target.value)} />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Valore ornamentale (€)</label>
                      <input type="number" step="1" min="0" className="field" value={r.valore_economico_eur} onChange={(e) => set('valore_economico_eur', e.target.value)} />
                      {valoreStimato && (
                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                          <span>
                            Stima (modello studio): <strong>€ {valoreStimato.valore.toLocaleString('it-IT')}</strong>
                            {valoreStimato.deprezzoPct > 0 ? ` (deprezzo sanitario ${valoreStimato.deprezzoPct}%)` : ''}
                          </span>
                          <button type="button" className="rounded bg-green-700 px-2 py-0.5 font-semibold text-white"
                            onClick={() => set('valore_economico_eur', String(valoreStimato.valore))}>usa</button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Contesto per il valore ornamentale (modello dello studio) */}
                  <p className="pt-1 text-xs font-semibold text-slate-500">Valore ornamentale — contesto</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium">Posizione sociale</label>
                      <select className="field" value={r.posizione_sociale} onChange={(e) => set('posizione_sociale', e.target.value)}>
                        <option value="">—</option>
                        {POSIZIONE_SOCIALE.map((o) => (<option key={o}>{o}</option>))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Dimora</label>
                      <select className="field" value={r.contesto_dimora} onChange={(e) => set('contesto_dimora', e.target.value)}>
                        <option value="">—</option>
                        {CONTESTO_DIMORA.map((o) => (<option key={o}>{o}</option>))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Localizzazione</label>
                      <select className="field" value={r.contesto_localizzazione} onChange={(e) => set('contesto_localizzazione', e.target.value)}>
                        <option value="">—</option>
                        {CONTESTO_LOCALIZZAZIONE.map((o) => (<option key={o}>{o}</option>))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Vincolo</label>
                      <select className="field" value={r.vincolo} onChange={(e) => set('vincolo', e.target.value)}>
                        <option value="">—</option>
                        {VINCOLI.map((o) => (<option key={o}>{o}</option>))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Valore massimo di riferimento (€) <span className="font-normal text-slate-400">— tetto locale, tarabile</span></label>
                    <input type="number" step="1000" min="0" className="field" value={r.valore_max_rif}
                      onChange={(e) => set('valore_max_rif', e.target.value)} placeholder="default 70.000" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Note gestione / cronologia interventi</label>
                    <textarea className="field" rows="2" value={r.note_gestione} onChange={(e) => set('note_gestione', e.target.value)} placeholder="es. potatura 2024, irrigazione di soccorso…" />
                  </div>

                  {/* Elementi per relazione secondo le linee guida CONAF */}
                  <p className="pt-1 text-xs font-semibold text-slate-500">Elementi per relazione (linee guida CONAF)</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium">Compartimentazione (CODIT)</label>
                      <select className="field" value={r.compartimentazione} onChange={(e) => set('compartimentazione', e.target.value)}>
                        <option value="">—</option>
                        <option>Buona</option>
                        <option>Media</option>
                        <option>Scarsa</option>
                        <option>Non valutabile</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">APC – Area Potenziale di Caduta (raggio, m)</label>
                      <input type="number" step="0.5" min="0" className="field" value={r.apc_m}
                        onChange={(e) => set('apc_m', e.target.value)}
                        placeholder={r.altezza_m ? `indicativo ≈ ${r.altezza_m}` : 'raggio in metri'} />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Condizioni del suolo nella ZPA (Zona di Protezione dell'Albero)</label>
                    <input className="field" value={r.suolo_zpa} onChange={(e) => set('suolo_zpa', e.target.value)}
                      placeholder="es. suolo compattato, pavimentato, scavi/trincee recenti, ristagno…" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Limiti della valutazione</label>
                    <textarea className="field" rows="2" value={r.limiti_valutazione} onChange={(e) => set('limiti_valutazione', e.target.value)}
                      placeholder="es. parti non visibili, difetti ipogei non indagabili visivamente, limitazioni stagionali (chioma spoglia)…" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Motivazione delle scelte</label>
                    <textarea className="field" rows="2" value={r.motivazione_scelte} onChange={(e) => set('motivazione_scelte', e.target.value)}
                      placeholder="es. indagine strumentale non eseguita per restrizioni di sicurezza del sito; abbattimento urgente motivato dai segnali premonitori rilevati…" />
                  </div>

                  <label className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    <input type="checkbox" className="h-4 w-4 accent-green-700"
                      checked={Number.isFinite(Number(r.co2_stoccata_kg)) && r.co2_stoccata_kg !== ''}
                      onChange={(e) => set('co2_stoccata_kg', e.target.checked ? (co2Stimata ?? '') : '')} />
                    Conferma la stima CO₂ (altrimenti resta il valore calcolato)
                  </label>
                </div>
              ) : (
                <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  📋 Data ultimo intervento, note di gestione e conferma dei valori si completano
                  <strong> in studio dal PC</strong>: questo rilievo verrà salvato con la dicitura
                  «Da confermare in studio».
                </div>
              )}
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
              <Riga k="Indirizzo" v={r.indirizzo} />
              <Riga k="Posizione" v={`${r.lat?.toFixed(6)}, ${r.lng?.toFixed(6)}`} />
              <Riga k="Biometria" v={`H ${r.altezza_m} m · DBH ${r.dbh_cm} cm · chioma ${r.diametro_chioma_m} m · ${r.fase_sviluppo}`} />
              <Riga k="Bersagli" v={r.bersagli.length ? bersagliFinali().join(', ') : 'Nessuno'} />
              <Riga k="Frequentazione" v={r.frequenza_occupazione} />
              {r.conflitti.length > 0 && <Riga k="Conflitti" v={conflittiFinali().join(', ')} />}
              {r.conformita_cam && <Riga k="Conformità CAM" v={r.conformita_cam} />}
              <Riga k="Vigoria" v={r.vigoria} />
              <Riga k="Stato" v={sintesiStato(r)} />
              <Riga k="Classe di rischio" v={r.classe_rischio ? `${r.classe_rischio}${accettabilitaRischio(r.classe_rischio) ? ` — ${accettabilitaRischio(r.classe_rischio)}` : ''}` : '—'} />
              {rischioResiduo(r) && rischioResiduo(r) !== r.classe_rischio && (
                <Riga k="Rischio residuo atteso" v={`${rischioResiduo(r)} (indicativo, a interventi eseguiti)`} />
              )}
              <Riga k="Conseguenza attesa" v={descriviConseguenza(r)} />
              {nudgeConseguenza(r) && <Riga k="Nota cautelativa" v={nudgeConseguenza(r)} />}
              <Riga k="Indagine strumentale" v={r.richiesta_indagine_strumentale ? `Sì – ${r.tipo_indagine_richiesta}${r.urgenza_indagine ? ` (${r.urgenza_indagine})` : ''}` : 'No'} />
              <Riga k="Prossimo controllo" v={r.data_prossimo_controllo ? new Date(r.data_prossimo_controllo).toLocaleDateString('it-IT') : '—'} />
              <Riga k="Interventi colturali" v={r.prescrizioni_gestionali ? `${r.prescrizioni_gestionali}${r.urgenza_intervento ? ` (${r.urgenza_intervento})` : ''}` : '—'} />
              {r.mitigazione_bersaglio && <Riga k="Mitigazione bersaglio" v={`${r.mitigazione_bersaglio}${r.urgenza_mitigazione ? ` (${r.urgenza_mitigazione})` : ''}`} />}
              <Riga k="CO₂ stoccata (stima)" v={co2Stimata != null ? `${co2Stimata.toLocaleString('it-IT')} kg` : '—'} />
              <Riga k="Canopy cover effettivo" v={canopyStimato != null ? `${canopyStimato.toLocaleString('it-IT')} m²` : '—'} />
              <Riga k="CO₂ assorbita / anno" v={co2AnnuaStimata != null ? `${co2AnnuaStimata.toLocaleString('it-IT')} kg/anno` : '—'} />
              <Riga k="O₂ prodotto / anno" v={o2Stimato != null ? `${o2Stimato.toLocaleString('it-IT')} kg/anno` : '—'} />
              <Riga k="PM10 rimosso / anno" v={pm10Stimato != null ? `${pm10Stimato.toLocaleString('it-IT')} g/anno` : '—'} />
              <Riga k="Valore ornamentale" v={r.valore_economico_eur ? `€ ${Number(r.valore_economico_eur).toLocaleString('it-IT')}` : (valoreStimato ? `€ ${valoreStimato.valore.toLocaleString('it-IT')} (stima)` : '—')} />
              {r.inclinazione_tipo && (
                <Riga k="Inclinazione" v={`${r.inclinazione_tipo}${r.inclinazione_gradi !== '' && r.inclinazione_gradi != null ? ` · ${r.inclinazione_gradi}°` : ''}${r.curvatura_correttiva ? ' · curvatura correttiva' : ''}`} />
              )}
              {r.instabilita_suolo && <Riga k="Instabilità al suolo" v="Sì — override Classe D" />}
              {r.compartimentazione && <Riga k="Compartimentazione (CODIT)" v={r.compartimentazione} />}
              {r.apc_m !== '' && r.apc_m != null && <Riga k="APC (raggio)" v={`~ ${r.apc_m} m`} />}
              {r.suolo_zpa && <Riga k="Suolo nella ZPA" v={r.suolo_zpa} />}
              {r.limiti_valutazione && <Riga k="Limiti della valutazione" v={r.limiti_valutazione} />}
              {r.motivazione_scelte && <Riga k="Motivazione delle scelte" v={r.motivazione_scelte} />}
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
                {nuoveFoto.map((f) => (
                  <figure key={f.url} className="relative w-24">
                    <img src={f.url} alt="" className="h-24 w-24 rounded-lg object-cover" />
                    <figcaption className="mt-0.5 truncate text-center text-[10px] text-slate-400" title={f.tag || 'Foto generale'}>
                      {f.tag || 'Foto generale'}
                    </figcaption>
                    <button
                      type="button"
                      onClick={() => rimuoviFoto(f.url)}
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

      {inclinometroAperto && (
        <Inclinometro
          onRegistra={(gradi) => {
            set('inclinazione_gradi', String(gradi))
            if (!r.inclinazione_tipo) set('inclinazione_tipo', 'Lineare')
            setInclinometroAperto(false)
          }}
          onChiudi={() => setInclinometroAperto(false)}
        />
      )}
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

// selettore compatto dell'urgenza per le prescrizioni
function UrgenzaScelta({ valore, onScegli }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {URGENZE.map((u) => (
        <button
          key={u}
          type="button"
          onClick={() => onScegli(valore === u ? '' : u)}
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            valore === u ? 'bg-green-700 text-white' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {u}
        </button>
      ))}
    </div>
  )
}
