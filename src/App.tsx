import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { useAppStore } from './store/useAppStore'
import DashboardView from './views/DashboardView'
import ImportView from './views/ImportView'
import PlayView from './views/PlayView'
import ReviewView from './views/ReviewView'
import SettingsView from './views/SettingsView'

export default function App() {
  const init = useAppStore((s) => s.init)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    init().then(() => setReady(true))
  }, [init])

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-(--color-text-muted)">
        Lade ChessAnalyzer…
      </div>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<ImportView />} />
        <Route path="dashboard" element={<DashboardView />} />
        <Route path="play" element={<PlayView />} />
        <Route path="game/:id" element={<ReviewView />} />
        <Route path="settings" element={<SettingsView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
