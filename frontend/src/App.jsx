import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import Compare from './pages/Compare'
import Regressions from './pages/Regressions'
import Systems from './pages/Systems'
import Runs from './pages/Runs'
import RunDetail from './pages/RunDetail'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <Navbar />
        <main className="max-w-7xl mx-auto px-6 py-8">
          <Routes>
            <Route path="/"            element={<Navigate to="/compare" replace />} />
            <Route path="/compare"     element={<Compare />} />
            <Route path="/regressions" element={<Regressions />} />
            <Route path="/systems"     element={<Systems />} />
            <Route path="/runs"        element={<Runs />} />
            <Route path="/runs/:id"    element={<RunDetail />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
