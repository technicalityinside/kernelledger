import { useEffect, useState } from 'react'
import Plot from 'react-plotly.js'
import { api } from '../api'
import Select from '../components/Select'

const COLOURS = [
  '#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#f97316','#ec4899','#84cc16','#6366f1',
]

const LAYOUT_BASE = {
  paper_bgcolor: 'transparent',
  plot_bgcolor:  'transparent',
  font:  { color: '#e5e7eb', size: 12 },
  xaxis: { gridcolor: '#1f2937', zeroline: false },
  yaxis: { gridcolor: '#1f2937', zeroline: false },
  margin: { t: 20, r: 20, b: 80, l: 80 },
}

function fmt(v) { return v == null ? '—' : v.toFixed(3) }

export default function Systems() {
  const [filters, setFilters] = useState(null)
  const [sel,     setSel]     = useState({ workload: '', metric: '', kernel_id: '', config_preset: '' })
  const [data,    setData]    = useState([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  useEffect(() => { api.filters().then(setFilters).catch(() => {}) }, [])

  useEffect(() => {
    if (!sel.workload || !sel.metric || !sel.kernel_id) { setData([]); return }
    setLoading(true); setError(null)
    api.compareSystems({ workload: sel.workload, metric: sel.metric, kernel_id: sel.kernel_id, config_preset: sel.config_preset })
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [sel])

  const metrics = filters?.metrics?.[sel.workload] ?? []
  const ready   = sel.workload && sel.metric && sel.kernel_id

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-100">System Comparison</h1>

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
          label="Kernel" value={sel.kernel_id}
          onChange={v => setSel(s => ({ ...s, kernel_id: v }))}
          options={(filters?.kernels ?? []).map(k => ({ value: k.id, label: k.version }))}
        />
        <Select
          label="Config" value={sel.config_preset}
          onChange={v => setSel(s => ({ ...s, config_preset: v }))}
          placeholder="All configs"
          options={(filters?.configs ?? []).map(c => ({ value: c, label: c }))}
        />
      </div>

      {!ready && <div className="text-center py-24 text-gray-600">Select a workload, metric, and kernel to compare systems.</div>}
      {ready && loading && <div className="text-center py-24 text-gray-500 animate-pulse">Loading…</div>}
      {error && <div className="text-red-400 text-sm px-4 py-3 bg-red-950/40 rounded-lg border border-red-800">{error}</div>}
      {ready && !loading && !error && data.length === 0 && (
        <div className="text-center py-24 text-gray-600">No data for these filters.</div>
      )}

      {!loading && data.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-6">
          <Plot
            data={[{
              type: 'bar',
              x:    data.map(d => d.system_name),
              y:    data.map(d => d.mean),
              error_y: {
                visible:    true,
                type:       'data',
                array:      data.map(d => d.max - d.mean),
                arrayminus: data.map(d => d.mean - d.min),
                thickness:  1.5,
              },
              marker:        { color: data.map((_, i) => COLOURS[i % COLOURS.length]) },
              hovertemplate: '<b>%{x}</b><br>Mean: %{y:.3f}<extra></extra>',
            }]}
            layout={{
              ...LAYOUT_BASE,
              yaxis: { ...LAYOUT_BASE.yaxis, title: sel.metric },
              bargap: 0.35,
            }}
            style={{ width: '100%', height: 380 }}
            config={{ responsive: true, displayModeBar: false }}
          />

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-800">
                  {['System', 'Mean', 'Min', 'Max', 'Stdev', 'Samples'].map(h => (
                    <th key={h} className={`py-2 pr-4 ${h === 'System' ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((d, i) => (
                  <tr key={d.system_id} className="border-b border-gray-800/60 hover:bg-gray-800/40">
                    <td className="py-2.5 pr-4 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: COLOURS[i % COLOURS.length] }} />
                      {d.system_name}
                    </td>
                    <td className="text-right pr-4 font-mono">{fmt(d.mean)}</td>
                    <td className="text-right pr-4 font-mono text-green-400">{fmt(d.min)}</td>
                    <td className="text-right pr-4 font-mono text-red-400">{fmt(d.max)}</td>
                    <td className="text-right pr-4 font-mono text-gray-500">{fmt(d.stdev)}</td>
                    <td className="text-right pr-4 text-gray-400">{d.samples}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
