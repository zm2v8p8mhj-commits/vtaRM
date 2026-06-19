import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase, supabaseEnabled } from '../lib/supabaseClient'
import * as db from '../lib/db'
import { sincronizza } from '../lib/sync'
import { ALBERI_DEMO } from '../lib/demoData'
import { COMUNI_DEMO } from '../lib/constants'

// Accesso riservato al solo admin (Ruggero Manca). I comuni committenti non
// hanno credenziali: consultano la mappa pubblica dal link con token segreto.

const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)

// "Fusto · Cavità" -> "fusto-cavita" per nomi file auto-descrittivi
function slugDifetto(tag) {
  return tag
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export function AppProvider({ children }) {
  const [utente, setUtente] = useState(null)
  const [autenticando, setAutenticando] = useState(true)
  const [alberi, setAlberi] = useState([])
  const [comuni, setComuni] = useState([])
  const [fotoLocali, setFotoLocali] = useState({}) // alberoId -> [{id,url}]
  const [syncInfo, setSyncInfo] = useState({ inCorso: false, esito: null })

  // ------------------------------------------------------------------ auth
  useEffect(() => {
    if (!supabaseEnabled) {
      const salvato = localStorage.getItem('greencure-demo-utente')
      if (salvato) setUtente(JSON.parse(salvato))
      setAutenticando(false)
      return
    }
    const caricaProfilo = async (session) => {
      if (!session?.user) {
        setUtente(null)
        setAutenticando(false)
        return
      }
      const { data: profilo } = await supabase
        .from('profiles')
        .select('nome, role')
        .eq('id', session.user.id)
        .single()
      if (profilo?.role !== 'admin') {
        // utente senza profilo admin: nessun accesso
        await supabase.auth.signOut()
        setUtente(null)
        setAutenticando(false)
        return
      }
      setUtente({
        id: session.user.id,
        email: session.user.email,
        nome: profilo.nome || session.user.email,
        role: 'admin',
      })
      setAutenticando(false)
    }
    supabase.auth.getSession().then(({ data }) => caricaProfilo(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => caricaProfilo(session))
    return () => sub.subscription.unsubscribe()
  }, [])

  const loginDemo = () => {
    const u = {
      id: 'demo-admin',
      email: 'admin@greencure.demo',
      nome: 'Ruggero Manca (Admin)',
      role: 'admin',
    }
    localStorage.setItem('greencure-demo-utente', JSON.stringify(u))
    setUtente(u)
  }

  const login = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
  }

  const logout = async () => {
    if (supabaseEnabled) await supabase.auth.signOut()
    localStorage.removeItem('greencure-demo-utente')
    setUtente(null)
  }

  // ------------------------------------------------------------------ dati
  const ricaricaLocale = useCallback(async () => {
    const tutti = await db.getAlberi()
    setAlberi(tutti)
    const mappa = {}
    for (const a of tutti) {
      const foto = await db.getFotoByAlbero(a.id)
      if (foto.length) {
        mappa[a.id] = foto.map((f) => ({ id: f.id, url: URL.createObjectURL(f.blob), difetto: f.difetto || '' }))
      }
    }
    setFotoLocali(mappa)
  }, [])

  const caricaComuni = useCallback(async () => {
    if (!supabaseEnabled) {
      const extra = (await db.getMeta('comuni-extra')) || []
      setComuni([...COMUNI_DEMO, ...extra])
      return
    }
    const { data } = await supabase.from('comuni').select('*').order('nome')
    setComuni(data || [])
  }, [])

  const avviaSync = useCallback(async () => {
    if (!supabaseEnabled) return
    setSyncInfo({ inCorso: true, esito: null })
    const esito = await sincronizza()
    setSyncInfo({ inCorso: false, esito })
    await ricaricaLocale() // sempre, così url_foto/_synced si aggiornano anche dopo invii parziali
  }, [ricaricaLocale])

  // Storage persistente: chiede al browser di NON sgomberare IndexedDB (su iOS
  // i dati dei siti vengono altrimenti cancellati dopo inattività). Sulle PWA
  // installate il permesso è quasi sempre concesso → i rilievi non si perdono.
  useEffect(() => {
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {})
  }, [])

  useEffect(() => {
    if (!utente) return
    ;(async () => {
      // primo avvio demo: semina i dati di esempio
      if (!supabaseEnabled && !(await db.getMeta('demo-seeded'))) {
        await db.putAlberiBulk(ALBERI_DEMO)
        await db.setMeta('demo-seeded', true)
      }
      await ricaricaLocale()
      await caricaComuni()
      avviaSync()
    })()
    // sincronizza al ritorno online e quando si riapre l'app (riporta in primo piano)
    const alRitorno = () => {
      if (document.visibilityState === 'visible') avviaSync()
    }
    window.addEventListener('online', avviaSync)
    document.addEventListener('visibilitychange', alRitorno)
    return () => {
      window.removeEventListener('online', avviaSync)
      document.removeEventListener('visibilitychange', alRitorno)
    }
  }, [utente, ricaricaLocale, caricaComuni, avviaSync])

  const fotoDi = useCallback(
    (albero) => [
      ...(albero.url_foto || []),
      ...(fotoLocali[albero.id]?.map((f) => f.url) || []),
    ],
    [fotoLocali]
  )

  // come fotoDi ma con la didascalia del difetto: per le foto remote la prende
  // dalla mappa foto_difetti (chiave = nome file), per le locali dal record foto
  const fotoDettagli = useCallback(
    (albero) => {
      const mappa = albero.foto_difetti || {}
      const nomeFile = (u) => decodeURIComponent((u.split('/').pop() || '').split('?')[0])
      const remote = (albero.url_foto || []).map((u) => ({ url: u, caption: mappa[nomeFile(u)] || '' }))
      const locali = (fotoLocali[albero.id] || []).map((f) => ({ url: f.url, caption: f.difetto || '' }))
      return [...remote, ...locali]
    },
    [fotoLocali]
  )

  const salvaAlbero = useCallback(
    async (record, nuoveFoto = []) => {
      // numerazione progressiva proseguendo dalle foto già presenti
      let progressivo =
        (record.url_foto || []).length + (await db.getFotoByAlbero(record.id)).length
      const fotoDifetti = { ...(record.foto_difetti || {}) }
      for (const f of nuoveFoto) {
        progressivo += 1
        const num = String(progressivo).padStart(2, '0')
        // nel nome file mettiamo anche il difetto (archivio auto-descrittivo)
        const suffisso = f.tag ? `_${slugDifetto(f.tag)}` : ''
        const nome = `${record.codice}_${num}${suffisso}.jpg`
        if (f.tag) fotoDifetti[nome] = f.tag
        await db.putFoto({
          id: crypto.randomUUID(),
          albero_id: record.id,
          nome,
          difetto: f.tag || '',
          blob: f.blob,
          created_at: new Date().toISOString(),
          synced: false,
        })
      }
      await db.putAlbero({ ...record, foto_difetti: fotoDifetti, _synced: false })
      await ricaricaLocale()
      avviaSync()
    },
    [ricaricaLocale, avviaSync]
  )

  const eliminaAlbero = useCallback(
    async (id) => {
      // prima dal server (così la cancellazione si propaga agli altri dispositivi
      // alla loro prossima sincronizzazione), poi in locale
      if (supabaseEnabled) {
        const { error } = await supabase.from('alberi').delete().eq('id', id)
        if (error) console.warn('Cancellazione remota fallita:', error.message)
      }
      await db.deleteAlbero(id)
      await ricaricaLocale()
    },
    [ricaricaLocale]
  )

  const importaAlberi = useCallback(
    async (records) => {
      await db.putAlberiBulk(records)
      await ricaricaLocale()
      avviaSync()
    },
    [ricaricaLocale, avviaSync]
  )

  // ------------------------------------------------------------ admin enti
  // Crea un committente (comune, scuola, privato…) e ne restituisce l'id,
  // così il rilievo può partire subito con il nuovo ente selezionato.
  const creaComune = useCallback(
    async (nuovo) => {
      let idNuovo
      if (supabaseEnabled) {
        const { data, error } = await supabase.from('comuni').insert(nuovo).select('id').single()
        if (error) throw new Error(error.message)
        idNuovo = data.id
      } else {
        idNuovo = crypto.randomUUID()
        const extra = (await db.getMeta('comuni-extra')) || []
        await db.setMeta('comuni-extra', [
          ...extra,
          { ...nuovo, id: idNuovo, share_token: crypto.randomUUID() },
        ])
      }
      await caricaComuni()
      return idNuovo
    },
    [caricaComuni]
  )

  // Rigenera il token: il vecchio link smette di funzionare (revoca).
  const rigeneraToken = useCallback(
    async (comuneId) => {
      const nuovoToken = crypto.randomUUID()
      if (supabaseEnabled) {
        const { error } = await supabase
          .from('comuni')
          .update({ share_token: nuovoToken })
          .eq('id', comuneId)
        if (error) throw new Error(error.message)
      } else {
        const extra = (await db.getMeta('comuni-extra')) || []
        const idx = extra.findIndex((c) => c.id === comuneId)
        if (idx === -1) {
          throw new Error('I link dei comuni demo predefiniti sono fissi (#/v/nardo, #/v/campi).')
        }
        extra[idx] = { ...extra[idx], share_token: nuovoToken }
        await db.setMeta('comuni-extra', extra)
      }
      await caricaComuni()
    },
    [caricaComuni]
  )

  const value = {
    supabaseEnabled,
    utente,
    autenticando,
    login,
    loginDemo,
    logout,
    comuni,
    alberi,
    fotoDi,
    fotoDettagli,
    salvaAlbero,
    eliminaAlbero,
    importaAlberi,
    creaComune,
    rigeneraToken,
    syncInfo,
    avviaSync,
    nonSincronizzati: alberi.filter((a) => a._synced === false).length,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
