import { openDB } from 'idb'

// ----------------------------------------------------------------------------
// IndexedDB: archivio locale "offline-first".
// - alberi: record completi del rilievo (con flag _synced per la coda di sync)
// - foto:   blob delle immagini scattate in campo, legati all'albero
// ----------------------------------------------------------------------------

const dbPromise = openDB('greencure-vta', 1, {
  upgrade(db) {
    const alberi = db.createObjectStore('alberi', { keyPath: 'id' })
    alberi.createIndex('comune_id', 'comune_id')
    const foto = db.createObjectStore('foto', { keyPath: 'id' })
    foto.createIndex('albero_id', 'albero_id')
    db.createObjectStore('meta')
  },
})

export async function getAlberi() {
  return (await dbPromise).getAll('alberi')
}

export async function putAlbero(record) {
  return (await dbPromise).put('alberi', record)
}

export async function putAlberiBulk(records) {
  const tx = (await dbPromise).transaction('alberi', 'readwrite')
  await Promise.all(records.map((r) => tx.store.put(r)))
  await tx.done
}

export async function deleteAlbero(id) {
  const db = await dbPromise
  await db.delete('alberi', id)
  const foto = await db.getAllFromIndex('foto', 'albero_id', id)
  const tx = db.transaction('foto', 'readwrite')
  await Promise.all(foto.map((f) => tx.store.delete(f.id)))
  await tx.done
}

export async function putFoto(fotoRecord) {
  return (await dbPromise).put('foto', fotoRecord)
}

export async function getFotoByAlbero(alberoId) {
  return (await dbPromise).getAllFromIndex('foto', 'albero_id', alberoId)
}

export async function deleteFoto(id) {
  return (await dbPromise).delete('foto', id)
}

export async function getMeta(key) {
  return (await dbPromise).get('meta', key)
}

export async function setMeta(key, value) {
  return (await dbPromise).put('meta', value, key)
}
