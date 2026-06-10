import { useState } from 'react'
import { useApp } from '../context/AppContext'

function linkPubblico(comune) {
  return `${location.origin}${location.pathname}#/v/${comune.share_token}`
}

export default function AdminPage() {
  const { comuni, creaComune, rigeneraToken, supabaseEnabled } = useApp()
  const [nuovoComune, setNuovoComune] = useState({ nome: '', codice: '' })
  const [msg, setMsg] = useState(null)
  const [copiato, setCopiato] = useState(null)

  const salvaComune = async (e) => {
    e.preventDefault()
    setMsg(null)
    try {
      await creaComune({ nome: nuovoComune.nome.trim(), codice: nuovoComune.codice.trim().toUpperCase() })
      setNuovoComune({ nome: '', codice: '' })
      setMsg({ tipo: 'ok', testo: 'Committente creato: il suo link pubblico è pronto qui sotto.' })
    } catch (err) {
      setMsg({ tipo: 'errore', testo: err.message })
    }
  }

  const copia = async (comune) => {
    await navigator.clipboard.writeText(linkPubblico(comune))
    setCopiato(comune.id)
    setTimeout(() => setCopiato(null), 2000)
  }

  const rigenera = async (comune) => {
    if (!confirm(`Rigenerare il link di ${comune.nome}?\nIl link attuale smetterà di funzionare: dovrai inviare quello nuovo.`)) return
    setMsg(null)
    try {
      await rigeneraToken(comune.id)
      setMsg({ tipo: 'ok', testo: `Nuovo link generato per ${comune.nome}. Quello vecchio è stato revocato.` })
    } catch (err) {
      setMsg({ tipo: 'errore', testo: err.message })
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 p-4">
        <div>
          <h2 className="text-lg font-bold text-green-900">Amministrazione enti</h2>
          <p className="text-sm text-slate-500">
            I committenti (comuni, scuole, privati…) non hanno credenziali: a ciascuno invii il{' '}
            <strong>link pubblico</strong> della sua mappa, di sola consultazione. Il link contiene
            un token segreto e mostra esclusivamente gli alberi di quel committente. Se serve
            revocarlo (es. cambio amministrazione), rigeneralo e invia quello nuovo.
          </p>
        </div>

        {msg && (
          <p className={`rounded-lg px-3 py-2 text-sm ${msg.tipo === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
            {msg.testo}
          </p>
        )}

        {!supabaseEnabled && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <strong>Modalità demo:</strong> i link funzionano solo su questo dispositivo
            (dati in locale). Con Supabase attivo i link sono consultabili da chiunque li riceva.
          </p>
        )}

        <div className="card space-y-4">
          <h3 className="font-bold text-green-900">🏛️ Committenti e link di consultazione</h3>
          <ul className="divide-y divide-slate-100">
            {comuni.map((c) => (
              <li key={c.id} className="space-y-1.5 py-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{c.nome}</span>
                  <code className="rounded bg-slate-100 px-2 py-0.5 text-xs">{c.codice}</code>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
                    {linkPubblico(c)}
                  </code>
                  <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => copia(c)}>
                    {copiato === c.id ? '✅ Copiato' : '📋 Copia link'}
                  </button>
                  <a className="btn-secondary !px-3 !py-1.5 text-xs" href={linkPubblico(c)} target="_blank" rel="noreferrer">
                    👁️ Apri
                  </a>
                  <button className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                    onClick={() => rigenera(c)}>
                    🔄 Rigenera
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <form onSubmit={salvaComune} className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <input className="field min-w-40 flex-1" required placeholder="Nome committente (es. Comune di Galatone)"
              value={nuovoComune.nome} onChange={(e) => setNuovoComune({ ...nuovoComune, nome: e.target.value })} />
            <input className="field w-28" required maxLength="4" placeholder="Codice (GAL)"
              value={nuovoComune.codice} onChange={(e) => setNuovoComune({ ...nuovoComune, codice: e.target.value.toUpperCase() })} />
            <button className="btn-primary">+ Aggiungi comune</button>
          </form>
        </div>
      </div>
    </div>
  )
}
