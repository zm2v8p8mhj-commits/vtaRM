import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import 'leaflet/dist/leaflet.css'
import './index.css'
import App from './App'

// Auto-aggiornamento: applica subito la nuova versione e ricontrolla a ogni
// ritorno in primo piano (essenziale per le PWA installate su iOS, che
// altrimenti restano sulla versione in cache).
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true)
  },
  onRegisteredSW(_url, r) {
    if (!r) return
    setInterval(() => r.update(), 60 * 60 * 1000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') r.update()
    })
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
