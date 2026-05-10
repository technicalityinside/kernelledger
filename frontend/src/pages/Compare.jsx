import { useEffect, useState } from 'react'
import Plot from 'react-plotly.js'
import { api } from '../api'
import Select from '../components/Select'

const LAYOUT_BASE = {
  paper_bgcolor: 'transparent',
  plot_bgcolor:  'transparent',
  font:  { color: '#e5e7eb', size: 12 },
  xaxis: { gridcolor: '#1f2937', zeroline: false, tickangle: -30 },
  yaxis: { gridcolor: '#1f2937', zeroline: false },
  margin: { t: 20, r: 20, b: 90, l: 80 },
  hovermode: 'x unified',
}

function fmt(v) { return v == null ? '—' : v.toFixed(3) }
function pct(v)  {
  if (v == null) return '—'
  const s = (v > 0 ? '+' : '') + v.toFixed(1) + '%'
  return s
}

export default function Compare() {
  const [filters,  setFilters]  = useState(null)
  const [sel,      setSel]      = useState({ workload: '', metric: '', system_id: '', config_preset: '' })
  const [data,     setData]     = useState([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  useEffect(() => { api.filters().then(setFilters).catch(() => {}) }, [])

  useEffect(() => {
    if (!sel.workload || !sel.metric || !sel.system_id) { setData([]); return }
    setLoading(true); setError(null)
    api.compare({ workload: sel.workload, metric: sel.metric, system_id: sel.system_id, config_preset: sel.config_preset })
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [sel])

  const metrics = filters?.metrics?.[sel.workload] ?? []
  const ready   = sel.workload && sel.metric && sel.system_id

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-100">Kernel Comparison</h1>

      {/* Selectors */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-gray-900 rounded-xl border border-gray-800">
        <Select
          label="Workload" value={sel.workload}
          onChange={v => setSel(s => ({ ...s, workload: v, metric: '' }))}
          options={(filters?.workloads ?? []).map(w => ({ value: w, label: w }))}
        />
        <Select
          label="Metric" value={sel.metric}
          onChange={v => setSel(s => ({ ...s, metric: v }))}
          options={metrics.map(m => ({ value: m, label: m }))}
          disabled={!sel.workload}
        />
        <Select
          label="System" value={sel.system_id}
          onChange={v => setSel(s => ({ ...s, system_id: v }))}
          options={(filters?.systems ?? []).map(s => ({ value: s.id, label: s.name }))}
        />
        <Select
          label="Config" value={sel.config_preset}
          onChange={v => setSel(s => ({ ...s, config_preset: v }))}
          placeholder="All configs"
          options={(filters?.configs ?? []).map(c => ({ value: c, label: c }))}
        />
      </div>

      {/* States */}
      {!ready && (
        <div className="text-center py-24 text-gray-600">
          Select a workload, metric, and system to view results.
        </div>
      )}
      {ready && loading && (
        <div className="text-center py-24 text-gray-500 animate-pulse">Loading…</div>
      )}
      {error && (
        <div className="text-red-400 text-sm px-4 py-3 bg-red-950/40 rounded-lg border border-red-800">
          {error}
        </div>
      )}
      {ready && !loading && !error && data.length === 0 && (
        <div className="text-center py-24 text-gray-600">No data for these filters.</div>
      )}

      {/* Chart + table */}
      {!loading && data.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-6">
          <Plot
            data={[{
              type: 'scatter',
              mode: 'lines+markers',
              x: data.map(d => d.kernel_version),
              y: data.map(d => d.mean),
              error_y: {
                visible:    true,
                type:       'data',
                array:      data.map(d => d.max - d.mean),
                arrayminus: data.map(d => d.mean - d.min),
                color:      '#3b82f6',
                thickness:  1.5,
              },
              marker:        { color: '#3b82f6', size: 7 },
              line:          { color: '#3b82f6', width: 2 },
              name:           sel.metric,
              hovertemplate: '<b>%{x}</b><br>Mean: %{y:.3f}<extra></extra>',
            }]}
            layout={{
              ...LAYOUT_BASE,
              yaxis: { ...LAYOUT_BASE.yaxis, title: sel.metric },
            }}
            style={{ width: '100%', height: 380 }}
            config={{ responsive: true, displayModeBar: false }}
          />

          {/* Summary table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-800">
                  <th className="text-left py-2 pr-4">Kernel</th>
                  <th className="text-right py-2 pr-4">Mean</th>
                  <th className="text-right py-2 pr-4">Min</th>
                  <th className="text-right py-2 pr-4">Max</th>
                  <th className="text-right py-2 pr-4">Stdev</th>
                  <th className="text-right py-2 pr-4">Samples</th>
                  <th className="text-right py-2">Δ prev</th>
                </tr>
              </thead>
              <tbody>
                {data.map((d, i) => {
                  const prev  = data[i - 1]
                  const delta = prev ? (d.mean - prev.mean) / Math.abs(prev.mean) * 100 : null
                  const deltaClass = delta == null ? 'text-gray-600'
                    : delta > 5  ? 'text-red-400'
                    : delta < -5 ? 'text-green-400'
                    : 'text-gray-400'
                  return (
                    <tr key={d.kernel_id} className="border-b border-gray-800/60 hover:bg-gray-800/40">
                      <td className="py-2.5 pr-4 font-mono text-gray-200">{d.kernel_version}</td>
                      <td className="text-right pr-4 font-mono">{fmt(d.mean)}</td>
                      <td className="text-right pr-4 font-mono text-green-400">{fmt(d.min)}</td>
                      <td className="text-right pr-4 font-mono text-red-400">{fmt(d.max)}</td>
                      <td className="text-right pr-4 font-mono text-gray-500">{fmt(d.stdev)}</td>
                      <td className="text-right pr-4 text-gray-400">{d.samples}</td>
                      <td className={`text-right font-mono font-medium ${deltaClass}`}>{pct(delta)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
