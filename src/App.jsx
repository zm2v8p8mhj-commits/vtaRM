import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import MapPage from './pages/MapPage'
import SurveyPage from './pages/SurveyPage'
import ArchivePage from './pages/ArchivePage'
import AdminPage from './pages/AdminPage'
import PublicMapPage from './pages/PublicMapPage'

function Protetta({ children }) {
  const { utente, autenticando } = useApp()
  if (autenticando) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500">
        Caricamento…
      </div>
    )
  }
  if (!utente) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* mappa pubblica del singolo comune: nessun login richiesto */}
          <Route path="/v/:token" element={<PublicMapPage />} />
          <Route
            path="/"
            element={
              <Protetta>
                <Layout />
              </Protetta>
            }
          >
            <Route index element={<Navigate to="/mappa" replace />} />
            <Route path="mappa" element={<MapPage />} />
            <Route path="archivio" element={<ArchivePage />} />
            <Route path="rilievo" element={<SurveyPage />} />
            <Route path="rilievo/:id" element={<SurveyPage />} />
            <Route path="amministrazione" element={<AdminPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AppProvider>
  )
}
