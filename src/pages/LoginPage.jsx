import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

export default function LoginPage() {
  const { utente, login, loginDemo, supabaseEnabled } = useApp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errore, setErrore] = useState('')
  const [inCorso, setInCorso] = useState(false)

  if (utente) return <Navigate to="/mappa" replace />

  const invia = async (e) => {
    e.preventDefault()
    setErrore('')
    setInCorso(true)
    try {
      await login(email, password)
    } catch (err) {
      setErrore('Credenziali non valide: ' + err.message)
    } finally {
      setInCorso(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-green-900 to-green-700 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="GreenCure VTA" className="mx-auto mb-3 h-16 w-16" />
          <h1 className="text-2xl font-bold text-green-900">GreenCure VTA</h1>
          <p className="mt-1 text-sm text-slate-500">
            Web-GIS per il censimento e la gestione del verde pubblico
          </p>
        </div>

        {supabaseEnabled ? (
          <form onSubmit={invia} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Email</label>
              <input
                type="email"
                required
                className="field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email amministratore"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Password</label>
              <input
                type="password"
                required
                className="field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {errore && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errore}</p>
            )}
            <button type="submit" disabled={inCorso} className="btn-primary w-full">
              {inCorso ? 'Accesso in corso…' : 'Accedi'}
            </button>
            <p className="text-center text-xs text-slate-400">
              Area riservata all'amministratore. I committenti consultano la propria mappa dal link
              ricevuto, senza credenziali.
            </p>
          </form>
        ) : (
          <div className="space-y-3">
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <strong>Modalità demo</strong> – Supabase non è configurato: i dati restano sul
              dispositivo.
            </p>
            <button onClick={() => loginDemo()} className="btn-primary w-full">
              👨‍🌾 Entra come Admin (Ruggero Manca)
            </button>
            <p className="text-center text-xs text-slate-400">
              Link pubblici demo: <a className="underline" href="#/v/nardo">mappa Nardò</a> ·{' '}
              <a className="underline" href="#/v/campi">mappa Campi Salentina</a>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
