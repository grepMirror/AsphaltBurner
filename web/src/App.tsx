import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { DimensionPage } from './pages/DimensionPage'
import { MatrixOverview } from './pages/MatrixOverview'

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Navigate to="/matrix" replace />} />
        <Route path="/matrix" element={<MatrixOverview />} />
        <Route path="/matrix/:dimensionId" element={<DimensionPage />} />
      </Route>
    </Routes>
  )
}
