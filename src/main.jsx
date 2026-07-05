import React from 'react'
import ReactDOM from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import './index.css'
import App from './App'

// La registrazione del service worker e l'avviso "Nuova versione" sono gestiti
// dal componente <AggiornaApp/> (dentro App), così l'utente aggiorna quando vuole.

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
