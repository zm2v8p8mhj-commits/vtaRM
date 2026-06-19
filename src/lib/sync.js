import { supabase, supabaseEnabled, FOTO_BUCKET } from './supabaseClient'
import * as db from './db'

// ----------------------------------------------------------------------------
// Sincronizzazione offline-first:
// 1. push: invia a Supabase gli alberi con _synced=false e carica le foto
//    locali nello Storage (bucket foto-alberi)
// 2. pull: scarica gli alberi visibili (la RLS filtra già per comune)
// I campi che iniziano con "_" sono di servizio e non vengono inviati.
// ----------------------------------------------------------------------------

function pulisciRecord(record) {
  const out = {}
  for (const [k, v] of Object.entries(record)) {
    if (k.startsWith('_') || k === 'comune_nome') continue
    // stringa vuota -> null: le colonne date/real del DB rifiutano '' e farebbero
    // fallire l'intero upsert (i campi non compilati restano semplicemente nulli)
    out[k] = v === '' ? null : v
  }
  return out
}

export async function sincronizza() {
  if (!supabaseEnabled || !navigator.onLine) {
    return { ok: false, motivo: !supabaseEnabled ? 'Supabase non configurato' : 'Offline' }
  }

  let inviati = 0
  const erroriPush = []
  const locali = await db.getAlberi()

  // --- PUSH ---
  for (const albero of locali.filter((a) => a._synced === false)) {
    const foto = await db.getFotoByAlbero(albero.id)
    const urlFoto = [...(albero.url_foto || [])]

    // si iterano TUTTE le foto: quelle non caricate vengono inviate, ma l'URL
    // pubblico viene aggiunto a url_foto anche per quelle già caricate, così il
    // record resta sempre collegato alle sue immagini (il percorso è deterministico)
    for (const f of foto) {
      // il file nel cloud porta il nome parlante (NAR-2026-008_01.jpg);
      // per le foto salvate prima della rinomina automatica resta l'id
      const path = `${albero.comune_id}/${albero.id}/${f.nome || `${f.id}.jpg`}`
      if (!f.synced) {
        const { error } = await supabase.storage
          .from(FOTO_BUCKET)
          .upload(path, f.blob, { contentType: f.blob.type || 'image/jpeg', upsert: true })
        if (error) {
          erroriPush.push(`foto ${path}: ${error.message}`)
          continue
        }
        await db.putFoto({ ...f, synced: true })
      }
      const { data } = supabase.storage.from(FOTO_BUCKET).getPublicUrl(path)
      if (!urlFoto.includes(data.publicUrl)) urlFoto.push(data.publicUrl)
    }

    const record = pulisciRecord({ ...albero, url_foto: urlFoto })
    const { error } = await supabase.from('alberi').upsert(record)
    if (!error) {
      await db.putAlbero({ ...albero, url_foto: urlFoto, _synced: true })
      inviati++
    } else {
      console.warn('Sync push fallito per', albero.codice, error.message)
      erroriPush.push(`${albero.codice || albero.id}: ${error.message}`)
    }
  }

  // --- PULL ---
  const { data: remoti, error: errPull } = await supabase
    .from('alberi')
    .select('*, comuni(nome)')
  if (errPull) return { ok: false, motivo: errPull.message, inviati }

  const tuttiLocali = await db.getAlberi()
  const localiMap = new Map(tuttiLocali.map((a) => [a.id, a]))
  const daSalvare = []
  for (const r of remoti) {
    const locale = localiMap.get(r.id)
    // non sovrascrivere modifiche locali non ancora inviate
    if (locale && locale._synced === false) continue
    daSalvare.push({ ...r, comune_nome: r.comuni?.nome, comuni: undefined, _synced: true })
  }
  await db.putAlberiBulk(daSalvare)

  // riconciliazione cancellazioni: rimuove in locale i record già sincronizzati
  // che non esistono più sul server (cancellati da un altro dispositivo).
  // I record locali non ancora inviati (_synced === false) restano: sono in coda di upload.
  const idRemoti = new Set(remoti.map((r) => r.id))
  let rimossi = 0
  for (const a of tuttiLocali) {
    if (a._synced !== false && !idRemoti.has(a.id)) {
      await db.deleteAlbero(a.id)
      rimossi++
    }
  }

  return {
    ok: erroriPush.length === 0,
    inviati,
    ricevuti: remoti.length,
    rimossi,
    motivo: erroriPush.length ? `Invio fallito per ${erroriPush.length} rilievi: ${erroriPush[0]}` : null,
  }
}
