import { useEffect, useState } from 'react'

// Inclinometro: legge l'inclinazione dalla verticale usando i sensori di movimento
// del telefono (accelerometro). Si appoggia il telefono in piano contro il fusto,
// con il lato lungo lungo il tronco: l'angolo dell'asse lungo dalla verticale è
// l'inclinazione dell'albero. Il permesso iOS va richiesto dal chiamante (gesto).
export default function Inclinometro({ onRegistra, onChiudi }) {
  const [angolo, setAngolo] = useState(null)
  const [stato, setStato] = useState('attesa') // attesa | attivo | nondati

  useEffect(() => {
    if (typeof DeviceMotionEvent === 'undefined') {
      setStato('nondati')
      return
    }
    const handler = (e) => {
      const a = e.accelerationIncludingGravity
      if (!a || a.x == null) return
      const g = Math.hypot(a.x, a.y, a.z) || 1
      // angolo dell'asse lungo (y) del telefono rispetto alla verticale (gravità)
      const ang = (Math.acos(Math.min(1, Math.abs(a.y) / g)) * 180) / Math.PI
      setAngolo(ang)
      setStato('attivo')
    }
    window.addEventListener('devicemotion', handler)
    const t = setTimeout(() => setStato((s) => (s === 'attesa' ? 'nondati' : s)), 1800)
    return () => {
      window.removeEventListener('devicemotion', handler)
      clearTimeout(t)
    }
  }, [])

  const colore = angolo == null ? '#334155' : angolo >= 20 ? '#dc2626' : angolo >= 15 ? '#ea580c' : '#15803d'

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate-950/70 p-4" onClick={onChiudi}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-green-900">📐 Inclinometro</h3>
        <p className="mt-1 text-xs text-slate-500">
          Appoggia il telefono <strong>in piano contro il fusto</strong>, con il lato lungo lungo il tronco, e tieni fermo.
        </p>

        {stato === 'nondati' ? (
          <p className="my-6 text-sm text-amber-700">
            Sensore di movimento non disponibile su questo dispositivo (o permesso negato). Inserisci il valore a mano.
          </p>
        ) : (
          <div className="my-6">
            <div className="text-6xl font-black tabular-nums" style={{ color: colore }}>
              {angolo == null ? '—' : `${angolo.toFixed(0)}°`}
            </div>
            <div className="text-xs text-slate-500">inclinazione dalla verticale</div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            className="btn-primary flex-1"
            disabled={angolo == null}
            onClick={() => onRegistra(Math.round(angolo))}
          >
            {angolo == null ? 'Registra' : `Registra ${Math.round(angolo)}°`}
          </button>
          <button className="btn-secondary" onClick={onChiudi}>Chiudi</button>
        </div>
      </div>
    </div>
  )
}
