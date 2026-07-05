import { useRegisterSW } from 'virtual:pwa-register/react'

// Avviso "Nuova versione disponibile": compare quando è stata pubblicata una
// versione più recente. L'utente aggiorna con un tocco (niente più ricarica
// manuale), oppure rimanda. Ricontrolla ogni ora e al ritorno in primo piano.
export default function AggiornaApp() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, r) {
      if (!r) return
      setInterval(() => r.update(), 60 * 60 * 1000)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') r.update()
      })
    },
  })

  if (!needRefresh) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 flex justify-center px-3"
      style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom))', zIndex: 3000 }}
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-green-800 py-2.5 pl-4 pr-2.5 text-white shadow-2xl">
        <span className="text-sm font-medium">🔄 Nuova versione disponibile</span>
        <button
          onClick={() => updateServiceWorker(true)}
          className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-green-800 active:scale-95"
        >
          Aggiorna
        </button>
        <button
          onClick={() => setNeedRefresh(false)}
          className="px-1 text-sm font-medium text-white/70"
          aria-label="Rimanda"
        >
          Dopo
        </button>
      </div>
    </div>
  )
}
