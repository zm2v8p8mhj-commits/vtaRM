import JSZip from 'jszip'
import * as db from './db'

// ----------------------------------------------------------------------------
// Backup completo: un unico file .zip auto-contenuto con TUTTI i dati del
// censimento (alberi, comuni, foto locali e cloud, manifest, metadati).
// Rete di sicurezza indipendente da telefono / Supabase / sync / browser.
// ----------------------------------------------------------------------------

const nomeFileFoto = (url) => decodeURIComponent((url.split('/').pop() || '').split('?')[0])

export async function generaBackup(alberi, comuni, onProgress) {
  const zip = new JSZip()
  zip.file('alberi.json', JSON.stringify(alberi, null, 2))
  zip.file('comuni.json', JSON.stringify(comuni, null, 2))

  const cartellaFoto = zip.folder('foto')
  const manifest = []
  let nFoto = 0
  let nFotoMancanti = 0

  for (let i = 0; i < alberi.length; i++) {
    const a = alberi[i]
    onProgress?.(i + 1, alberi.length)

    // 1) foto locali (blob in IndexedDB): copia diretta, sempre recuperabili
    const locali = await db.getFotoByAlbero(a.id)
    const nomiPresi = new Set()
    for (const f of locali) {
      const nome = f.nome || `${a.codice || a.id}_${f.id}.jpg`
      cartellaFoto.file(nome, f.blob)
      nomiPresi.add(nome)
      manifest.push({ albero: a.codice, file: `foto/${nome}`, difetto: f.difetto || '', origine: 'locale' })
      nFoto++
    }

    // 2) foto solo sul cloud (non già presenti in locale): scaricate
    for (const url of a.url_foto || []) {
      const nome = nomeFileFoto(url)
      if (nomiPresi.has(nome)) continue
      try {
        const resp = await fetch(`${url}${url.includes('?') ? '&' : '?'}b=${Date.now()}`, {
          mode: 'cors',
          cache: 'no-store',
        })
        if (!resp.ok) throw new Error('HTTP ' + resp.status)
        cartellaFoto.file(nome, await resp.blob())
        manifest.push({
          albero: a.codice,
          file: `foto/${nome}`,
          difetto: (a.foto_difetti || {})[nome] || '',
          origine: 'cloud',
        })
        nFoto++
      } catch {
        manifest.push({ albero: a.codice, file: nome, origine: 'cloud', errore: 'non scaricata' })
        nFotoMancanti++
      }
    }
  }

  zip.file('foto_manifest.json', JSON.stringify(manifest, null, 2))
  zip.file(
    'metadata.json',
    JSON.stringify(
      {
        applicazione: 'GreenCure VTA',
        generato_il: new Date().toISOString(),
        n_alberi: alberi.length,
        n_comuni: comuni.length,
        n_foto: nFoto,
        n_foto_non_recuperate: nFotoMancanti,
        non_sincronizzati: alberi.filter((a) => a._synced === false).length,
      },
      null,
      2
    )
  )

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  const url = URL.createObjectURL(blob)
  const el = document.createElement('a')
  el.href = url
  el.download = `Backup_GreenCure_VTA_${new Date().toISOString().slice(0, 10)}.zip`
  el.click()
  URL.revokeObjectURL(url)

  return { nAlberi: alberi.length, nFoto, nFotoMancanti }
}
