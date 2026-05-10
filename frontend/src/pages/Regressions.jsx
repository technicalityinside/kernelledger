import { useEffect, useState } from 'react'
import Plot from 'react-plotly.js'
import { api } from '../api'
import Select from '../components/Select'

export default function Regressions() {
  const [filters,  setFilters]  = useState(null)
  const [systemId, setSystemId] = useState('')
  const [list,     setList]     = useState([])
  const [matrix,   setMatrix]   = useState(null)
  const [loading,  setLoading]  = useState(false)

  useEffect(() => { api.filters().then(setFilters).catch(() => {}) }, [])

  useEffect(() => {
    setLoading(true)
    const params = systemId ? { system_id: systemId } : {}
    Promise.all([api.regressions(params), api.regressionMatrix(params)])
      .then(([l, m]) => { setList(l); setMatrix(m); setLoading(false) })
      .catch(() => setLoading(false))
  }, [systemId])

  const hasMatrix = matrix?.rows?.length > 0

  // Build a symmetric colour scale centred at 0
  const zMax = matrix
    ? Math.max(...matrix.matrix.flat().filter(v => v != null).map(Math.abs), 10)
    : 20

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-100">Regressions</h1>

      <div className="w-56 p-4 bg-gray-900 rounded-xl border border-gray-800">
        <Select
          label="System" value={systemId}
          onChange={setSystemId}
          placeholder="All systems"
          options={(filters?.systems ?? []).map(s => ({ value: s.id, label: s.name }))}
        />
      </div>

      {loading && <div className="text-center py-16 text-gray-500 animate-pulse">Loading…</div>}

      {/* Heatmap */}
      {!loading && hasMatrix && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">
            Δ% vs previous kernel — red = regression, green = improvement
          </p>
          <Plot
            data={[{
              type:       'heatmap',
              z:           matrix.matrix,
              x:           matrix.columns,
              y:           matrix.rows,
              zmin:       -zMax,
              zmax:        zMax,
              colorscale: [
                [0,    '#16a34a'],
                [0.4,  '#166534'],
                [0.48, '#1f2937'],
                [0.52, '#1f2937'],
                [0.6,  '#7f1d1d'],
                [1,    '#dc2626'],
              ],
              colorbar: { title: 'Δ%', ticksuffix: '%', thickness: 16 },
              hovertemplate: '<b>%{y}</b><br>%{x}<br><b>%{z:.1f}%</b><extra></extra>',
            }]}
            layout={{
              paper_bgcolor: 'transparent',
              plot_bgcolor:  'transparent',
              font:  { color: '#e5e7eb', size: 11 },
              xaxis: { tickangle: -30, side: 'bottom' },
              margin: { t: 10, r: 100, b: 100, l: 220 },
            }}
            style={{ width: '100%', height: Math.max(300, matrix.rows.length * 30 + 130) }}
            config={{ responsive: true, displayModeBar: false }}
          />
        </div>
      )}

      {!loading && !hasMatrix && (
        <div className="text-center py-12 text-gray-600">
          No regressions detected yet. Push results for at least two kernel versions.
        </div>
      )}

      {/* Regression list */}
      {!loading && list.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-800 bg-gray-900/60">
                {['Workload / Metric', 'System', 'Transition', 'Before', 'After', 'Δ%'].map(h => (
                  <th key={h} className={`px-4 py-3 ${h === 'Workload / Metric' || h === 'System' || h === 'Transition' ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(r => (
                <tr key={r.id} className="border-b border-gray-800/60 hover:bg-gray-800/40">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-200">{r.workload}</div>
                    <div className="text-xs text-gray-500">{r.metric_name}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{r.system_name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">
                    {r.kernel_before} → {r.kernel_after}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-400">{r.value_before?.toFixed(3)}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-200">{r.value_after?.toFixed(3)}</td>
                  <td className={`px-4 py-3 text-right font-mono font-semibold ${r.delta_pct > 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {r.delta_pct > 0 ? '+' : ''}{r.delta_pct?.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
