import { useEffect, useRef, useState } from 'react'
import Plot from 'react-plotly.js'
import { api } from '../api'
import Select from '../components/Select'

// Series tags colour (workload/metric chips in the UI)
const SERIES_PALETTE = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444',
  '#a855f7', '#06b6d4', '#f97316', '#ec4899',
]
// Bar colours — one per kernel version, consistent across all workload groups
const KERNEL_PALETTE = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#14b8a6', '#f97316', '#e879f9',
]
const kclr = i => KERNEL_PALETTE[i % KERNEL_PALETTE.length]

let _uid = 0
const nextId = () => ++_uid

function fmt(v)  { return v == null ? '—' : Number(v).toFixed(3) }
function pct(v)  { return v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%' }
function dcls(d) {
  if (d == null) return 'text-gray-600'
  if (d >  5)   return 'text-red-400'
  if (d < -5)   return 'text-green-400'
  return 'text-gray-500'
}

function normalise(data) {
  if (!data.length) return data
  const base = data[0].mean
  if (!base) return data
  return data.map(d => ({
    ...d,
    mean:  d.mean  / base * 100,
    min:   d.min   / base * 100,
    max:   d.max   / base * 100,
    stdev: d.stdev / base * 100,
  }))
}

function fetchOne(id, workload, metric, system_id, config_preset, setSeries) {
  setSeries(s => s.map(x => x.id === id ? { ...x, loading: true, error: null } : x))
  api.compare({ workload, metric, system_id, config_preset })
    .then(data => setSeries(s => s.map(x => x.id === id ? { ...x, data, loading: false } : x)))
    .catch(e   => setSeries(s => s.map(x => x.id === id ? { ...x, error: e.message, loading: false } : x)))
}

// Union of kernel versions ordered by first appearance (longest series wins)
function allKernels(series) {
  const seen = new Set(), order = []
  for (const s of [...series].sort((a, b) => b.data.length - a.data.length))
    for (const d of s.data)
      if (!seen.has(d.kernel_version)) { seen.add(d.kernel_version); order.push(d.kernel_version) }
  return order
}

// Sort series: group by workload name, then alphabetically by metric within each workload
function groupedSeries(series) {
  return [...series].sort((a, b) =>
    a.workload !== b.workload
      ? a.workload.localeCompare(b.workload)
      : a.metric.localeCompare(b.metric)
  )
}

// Find indices in sorted series where the workload name changes — separator positions
function separatorPositions(sorted) {
  const pos = []
  for (let i = 1; i < sorted.length; i++)
    if (sorted[i].workload !== sorted[i - 1].workload) pos.push(i - 0.5)
  return pos
}

export default function Compare() {
  const [filters, setFilters] = useState(null)
  const [sysId,  setSysId]   = useState('')
  const [cfg,    setCfg]     = useState('')
  const [addWl,  setAddWl]   = useState('')
  const [addMet, setAddMet]  = useState('')
  const [series, setSeries]  = useState([])
  const [norm,   setNorm]    = useState(false)

  const seriesRef = useRef(series)
  seriesRef.current = series

  useEffect(() => { api.filters().then(setFilters).catch(() => {}) }, [])

  useEffect(() => {
    if (!sysId) return
    seriesRef.current.forEach(s => fetchOne(s.id, s.workload, s.metric, sysId, cfg, setSeries))
  }, [sysId, cfg])

  const wlMetrics = filters?.metrics?.[addWl] ?? []

  function doAdd(wl, met) {
    if (!sysId || !wl || !met) return
    if (seriesRef.current.some(s => s.workload === wl && s.metric === met)) return
    const id = nextId()
    setSeries(prev => [...prev, { id, workload: wl, metric: met, data: [], loading: true, error: null }])
    fetchOne(id, wl, met, sysId, cfg, setSeries)
  }

  function addAll() {
    if (!sysId || !addWl) return
    const toAdd = wlMetrics.filter(m => !seriesRef.current.some(s => s.workload === addWl && s.metric === m))
    if (!toAdd.length) return
    const entries = toAdd.map(m => ({ id: nextId(), workload: addWl, metric: m, data: [], loading: true, error: null }))
    setSeries(prev => [...prev, ...entries])
    entries.forEach(e => fetchOne(e.id, e.workload, e.metric, sysId, cfg, setSeries))
  }

  // ── Derived chart data ───────────────────────────────────────────────────────
  const loadedSeries   = series.filter(s => !s.loading && !s.error && s.data.length > 0)
  const sorted         = groupedSeries(loadedSeries)
  const kernelVersions = allKernels(sorted)
  const mixedUnits     = series.length > 1 && new Set(series.map(s => s.metric)).size > 1

  // Nested categorical x-axis: outer = workload, inner = metric
  const outerLabels = sorted.map(s => s.workload)
  const innerLabels = sorted.map(s => s.metric)

  // One Plotly trace per kernel version
  const traces = kernelVersions.map((kver, ki) => {
    const c = kclr(ki)
    const pts = sorted.map(s => {
      const rows = norm ? normalise(s.data) : s.data
      return rows.find(d => d.kernel_version === kver) ?? null
    })
    return {
      type: 'bar',
      name: kver,
      x: [outerLabels, innerLabels],
      y: pts.map(d => d?.mean ?? null),
      error_y: {
        visible: true, type: 'data',
        array:      pts.map(d => d ? d.max - d.mean : 0),
        arrayminus: pts.map(d => d ? d.mean - d.min  : 0),
        color: c, thickness: 1.2,
      },
      marker: { color: c, opacity: 0.82 },
      hovertemplate: '<b>%{x[1]}</b><br>' + kver + ': %{y:.3f}<extra>' + kver + '</extra>',
    }
  })

  // Vertical separator lines between workload groups
  const sepPositions = separatorPositions(sorted)
  const shapes = sepPositions.map(x0 => ({
    type: 'line',
    xref: 'x', yref: 'paper',
    x0, x1: x0, y0: 0, y1: 1,
    line: { color: '#374151', width: 1.5, dash: 'dot' },
  }))

  // ── Comparison table: rows = series, cols = kernel versions ─────────────────
  function seriesMap(s) {
    const rows = norm ? normalise(s.data) : s.data
    return Object.fromEntries(rows.map((d, i) => [
      d.kernel_version,
      { mean: d.mean, delta: i > 0 ? (d.mean - rows[i-1].mean) / Math.abs(rows[i-1].mean) * 100 : null },
    ]))
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-100">Kernel Comparison</h1>

      {/* ── Controls ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-gray-900 rounded-xl border border-gray-800">
        <Select label="System" value={sysId} onChange={setSysId}
          options={(filters?.systems ?? []).map(s => ({ value: s.id, label: s.name }))} />
        <Select label="Config" value={cfg} onChange={setCfg} placeholder="All configs"
          options={(filters?.configs ?? []).map(c => ({ value: c, label: c }))} />
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input type="checkbox" checked={norm} onChange={e => setNorm(e.target.checked)}
              className="w-4 h-4 rounded accent-blue-500" />
            <div>
              <div className="text-sm text-gray-300">Normalize to baseline</div>
              {mixedUnits && !norm && (
                <div className="text-xs text-amber-500 mt-0.5">Recommended — metrics have different units</div>
              )}
            </div>
          </label>
        </div>
      </div>

      {/* ── Series builder ── */}
      <div className="flex flex-wrap gap-3 p-4 bg-gray-900 rounded-xl border border-gray-800 items-end">
        <div className="flex-1 min-w-[140px]">
          <Select label="Workload" value={addWl}
            onChange={v => { setAddWl(v); setAddMet('') }}
            options={(filters?.workloads ?? []).map(w => ({ value: w, label: w }))}
            disabled={!sysId} />
        </div>
        <div className="flex-1 min-w-[140px]">
          <Select label="Metric" value={addMet} onChange={setAddMet}
            options={wlMetrics.map(m => ({ value: m, label: m }))}
            disabled={!addWl} />
        </div>
        <button onClick={() => { doAdd(addWl, addMet); setAddMet('') }}
          disabled={!sysId || !addWl || !addMet}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40
                     disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors">
          + Add
        </button>
        {addWl && wlMetrics.length > 1 && (
          <button onClick={addAll} disabled={!sysId}
            className="px-4 py-2 text-sm rounded-lg border border-gray-700 text-gray-400
                       hover:border-gray-600 hover:text-gray-300 disabled:opacity-40
                       disabled:cursor-not-allowed transition-colors">
            Add all metrics
          </button>
        )}
        {!sysId && <p className="text-xs text-gray-600 w-full">Select a system first.</p>}
      </div>

      {/* ── Series tags ── */}
      {series.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          {series.map((s, i) => (
            <span key={s.id}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm"
              style={{ background: SERIES_PALETTE[i % SERIES_PALETTE.length] + '1a',
                       border: `1px solid ${SERIES_PALETTE[i % SERIES_PALETTE.length]}55`,
                       color: '#e5e7eb' }}>
              <span style={{ background: SERIES_PALETTE[i % SERIES_PALETTE.length] }}
                className="inline-block w-2 h-2 rounded-full flex-shrink-0" />
              {s.workload} / {s.metric}
              {s.loading && <span className="text-xs text-gray-500 ml-1">…</span>}
              {s.error   && <span className="text-xs text-red-400 ml-1" title={s.error}>!</span>}
              <button onClick={() => setSeries(prev => prev.filter(x => x.id !== s.id))}
                className="ml-1 opacity-50 hover:opacity-100 leading-none">×</button>
            </span>
          ))}
          <button onClick={() => setSeries([])}
            className="text-xs text-gray-600 hover:text-red-400 transition-colors px-1">
            Clear all
          </button>
        </div>
      )}

      {/* ── Empty state ── */}
      {series.length === 0 && (
        <div className="text-center py-24 text-gray-600">
          Select a system, then add workload / metric entries to compare.
        </div>
      )}

      {/* ── Grouped bar chart ── */}
      {series.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          {series.some(s => s.loading) && (
            <p className="text-xs text-gray-500 mb-2 animate-pulse">Fetching data…</p>
          )}
          {loadedSeries.length > 0 ? (
            <Plot
              data={traces}
              layout={{
                paper_bgcolor: 'transparent',
                plot_bgcolor:  'transparent',
                font:    { color: '#e5e7eb', size: 12 },
                barmode: 'group',
                bargap:       0.55,   // wide gap between metric groups → thinner bars
                bargroupgap:  0.12,   // small gap between kernel bars within a metric
                xaxis: {
                  gridcolor:   '#1f2937',
                  zeroline:    false,
                  tickangle:   0,
                  automargin:  true,
                  // push the outer (workload) label down a bit
                  tickfont:    { size: 11 },
                },
                yaxis: {
                  gridcolor: '#1f2937',
                  zeroline:  false,
                  title: norm
                    ? 'Value (% of 1st kernel)'
                    : (sorted.length === 1 ? sorted[0].metric : 'Value'),
                },
                legend: {
                  bgcolor:     'rgba(15,23,42,0.85)',
                  bordercolor: '#374151',
                  borderwidth: 1,
                  title: { text: 'Kernel', font: { color: '#9ca3af', size: 11 } },
                },
                shapes,
                margin: { t: 20, r: 20, b: 130, l: 80 },
                height: 480,
                hovermode: 'closest',
              }}
              style={{ width: '100%', height: 480 }}
              config={{ responsive: true, displayModeBar: false }}
            />
          ) : (
            !series.some(s => s.loading) && (
              <div className="py-16 text-center text-gray-600 text-sm">
                No data returned for the selected filters.
              </div>
            )
          )}
        </div>
      )}

      {/* ── Comparison table: rows = workload/metric, cols = kernels ── */}
      {sorted.length > 0 && kernelVersions.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <h2 className="text-sm font-medium text-gray-400 mb-4 uppercase tracking-wide">
            Per-kernel breakdown
            {norm && <span className="ml-2 text-gray-600 normal-case font-normal">(normalised — 1st kernel = 100)</span>}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-2 pr-6 text-gray-500 font-normal">Workload / Metric</th>
                  {kernelVersions.map((kver, ki) => (
                    <th key={kver} colSpan={2}
                      className="py-2 px-2 text-center font-semibold whitespace-nowrap"
                      style={{ color: kclr(ki) }}>
                      {kver}
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-gray-800 text-gray-600">
                  <th className="py-1.5 pr-6 font-normal" />
                  {kernelVersions.map(kver => (
                    <>
                      <th key={kver + '-m'} className="py-1.5 px-2 text-right font-normal">Mean</th>
                      <th key={kver + '-d'} className="py-1.5 px-2 text-right font-normal">Δ prev</th>
                    </>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Group rows by workload with a subtle separator row */}
                {sorted.reduce((acc, s, si) => {
                  const prev = sorted[si - 1]
                  if (si > 0 && s.workload !== prev.workload) {
                    acc.push(
                      <tr key={`sep-${si}`}>
                        <td colSpan={1 + kernelVersions.length * 2}
                          className="py-0 border-t border-gray-700/60" />
                      </tr>
                    )
                  }
                  const byKernel = seriesMap(s)
                  acc.push(
                    <tr key={s.id} className="hover:bg-gray-800/30">
                      <td className="py-2 pr-6 whitespace-nowrap">
                        <div className="font-semibold text-gray-200">{s.workload}</div>
                        <div className="font-mono text-gray-500">{s.metric}</div>
                      </td>
                      {kernelVersions.map((kver, ki) => {
                        const cell = byKernel[kver]
                        return (
                          <>
                            <td key={kver + '-m'} className="py-2 px-2 text-right font-mono"
                              style={{ color: cell ? kclr(ki) : '#4b5563' }}>
                              {cell ? fmt(cell.mean) : '—'}
                            </td>
                            <td key={kver + '-d'} className={`py-2 px-2 text-right font-mono ${dcls(cell?.delta ?? null)}`}>
                              {pct(cell?.delta ?? null)}
                            </td>
                          </>
                        )
                      })}
                    </tr>
                  )
                  return acc
                }, [])}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
