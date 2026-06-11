import { NavLink, Outlet } from 'react-router-dom'
import { useApp } from '../context/AppContext'

const voci = [
  { to: '/mappa', label: 'Mappa', icona: '🗺️' },
  { to: '/archivio', label: 'Archivio', icona: '📋' },
  { to: '/rilievo', label: 'Nuovo rilievo', icona: '🌳' },
  { to: '/amministrazione', label: 'Enti e link', icona: '⚙️' },
]

export default function Layout() {
  const { utente, logout, supabaseEnabled, syncInfo, avviaSync } = useApp()
  const visibili = voci

  return (
    <div className="flex h-dvh flex-col">
      <header className="safe-top z-20 flex items-center gap-3 bg-green-800 px-4 py-2 text-white shadow-md">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="h-8 w-8" />
        <div className="min-w-0">
          <h1 className="truncate text-sm font-bold leading-tight sm:text-base">GreenCure VTA</h1>
          <p className="truncate text-[11px] text-green-200">
            {utente.nome}
            {!supabaseEnabled && ' · modalità demo (dati locali)'}
          </p>
        </div>

        <nav className="ml-auto hidden items-center gap-1 sm:flex">
          {visibili.map((v) => (
            <NavLink
              key={v.to}
              to={v.to}
              className={({ isActive }) =>
                `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  isActive ? 'bg-white text-green-800' : 'text-green-100 hover:bg-green-700'
                }`
              }
            >
              {v.label}
            </NavLink>
          ))}
        </nav>

        {supabaseEnabled && (
          <button
            onClick={avviaSync}
            title="Sincronizza con il server"
            className="rounded-lg bg-green-700 px-2 py-1.5 text-xs hover:bg-green-600"
          >
            {syncInfo.inCorso ? '⏳' : '🔄'} Sync
          </button>
        )}
        <button
          onClick={logout}
          className="rounded-lg bg-green-900 px-3 py-1.5 text-xs font-medium hover:bg-green-950"
        >
          Esci
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden pb-[calc(3.5rem+env(safe-area-inset-bottom))] sm:pb-0">
        <Outlet />
      </main>

      {/* barra di navigazione mobile (uso in campo) */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 flex border-t border-slate-200 bg-white sm:hidden">
        {visibili.map((v) => (
          <NavLink
            key={v.to}
            to={v.to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                isActive ? 'text-green-700' : 'text-slate-500'
              }`
            }
          >
            <span className="text-lg leading-none">{v.icona}</span>
            {v.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
