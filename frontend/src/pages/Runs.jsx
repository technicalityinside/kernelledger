import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import Select from '../components/Select'

export default function Runs() {
  const navigate = useNavigate()
  const [runs,     setRuns]     = useState([])
  const [filters,  setFilters]  = useState(null)
  const [sel,      setSel]      = useState({ workload: '', system_id: '', kernel_id: '' })
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  useEffect(() => { api.filters().then(setFilters).catch(() => {}) }, [])

  useEffect(() => {
    setLoading(true); setError(null)
    api.runs({ workload: sel.workload || undefined, system_id: sel.system_id || undefined, kernel_id: sel.kernel_id || undefined })
      .then(d => { setRuns(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [sel])

  function fmtDate(s) {
    if (!s) return '—'
    return new Date(s).toLocaleString()
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-100">Runs</h1>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-gray-900 rounded-xl border border-gray-800">
        <Select
          label="Workload" value={sel.workload}
          onChange={v => setSel(s => ({ ...s, workload: v }))}
          placeholder="All workloads"
          options={(filters?.workloads ?? []).map(w => ({ value: w, label: w }))}
        />
        <Select
          label="System" value={sel.system_id}
          onChange={v => setSel(s => ({ ...s, system_id: v }))}
          placeholder="All systems"
          options={(filters?.systems ?? []).map(s => ({ value: s.id, label: s.name }))}
        />
        <Select
          label="Kernel" value={sel.kernel_id}
          onChange={v => setSel(s => ({ ...s, kernel_id: v }))}
          placeholder="All kernels"
          options={(filters?.kernels ?? []).map(k => ({ value: k.id, label: k.version }))}
        />
      </div>

      {error && (
        <div className="text-red-400 text-sm px-4 py-3 bg-red-950/40 rounded-lg border border-red-800">{error}</div>
      )}
      {loading && (
        <div className="text-center py-24 text-gray-500 animate-pulse">Loading…</div>
      )}

      {!loading && runs.length === 0 && (
        <div className="text-center py-24 text-gray-600">No runs found.</div>
      )}

      {!loading && runs.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-800 bg-gray-900/80">
                <th className="text-left px-4 py-3">Workload</th>
                <th className="text-left px-4 py-3">Config</th>
                <th className="text-left px-4 py-3">System</th>
                <th className="text-left px-4 py-3">Kernel</th>
                <th className="text-left px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(r => (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/runs/${r.id}`)}
                  className="border-b border-gray-800/60 hover:bg-blue-950/30 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-blue-300">{r.workload}</td>
                  <td className="px-4 py-3 text-gray-400">{r.config_preset || '—'}</td>
                  <td className="px-4 py-3 text-gray-300">{r.system}</td>
                  <td className="px-4 py-3 font-mono text-gray-300">{r.kernel}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(r.ran_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
