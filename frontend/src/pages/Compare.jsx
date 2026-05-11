import { useEffect, useRef, useState } from 'react'
import Plot from 'react-plotly.js'
import { api } from '../api'
import Select from '../components/Select'

const PALETTE = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444',
  '#a855f7', '#06b6d4', '#f97316', '#ec4899',
]
const clr = i => PALETTE[i % PALETTE.length]

const LAYOUT_BASE = {
  paper_bgcolor: 'transparent',
  plot_bgcolor:  'transparent',
  font:  { color: '#e5e7eb', size: 12 },
  xaxis: { gridcolor: '#1f2937', zeroline: false, tickangle: -30 },
  yaxis: { gridcolor: '#1f2937', zeroline: false },
  hovermode: 'x unified',
  legend: {
    bgcolor: 'rgba(15,23,42,0.8)',
    bordercolor: '#374151',
    borderwidth: 1,
    orientation: 'h',
    yanchor: 'bottom', y: 1.02,
    xanchor: 'left',   x: 0,
  },
}

let _uid = 0
const nextId = () => ++_uid

function fmt(v, decimals = 3) {
  return v == null ? '—' : Number(v).toFixed(decimals)
}
function pct(v) {
  return v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%'
}
function deltaClass(delta) {
  if (delta == null) return 'text-gray-600'
  if (delta >  5)   return 'text-red-400'
  if (delta < -5)   return 'text-green-400'
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

// Collect the union of kernel versions across all loaded series, ordered by
// first appearance in whichever series has the most data points.
function mergedKernels(series) {
  const seen = new Set()
  const order = []
  const longest = [...series].sort((a, b) => b.data.length - a.data.length)
  for (const s of longest) {
    for (const d of s.data) {
      if (!seen.has(d.kernel_version)) {
        seen.add(d.kernel_version)
        order.push(d.kernel_version)
      }
    }
  }
  return order
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

  // ── Chart traces ────────────────────────────────────────────────────────────
  const loadedSeries = series.filter(s => !s.loading && !s.error && s.data.length > 0)

  const traces = series.map((s, i) => {
    const rows = norm ? normalise(s.data) : s.data
    const c    = clr(i)
    return {
      type: 'scatter', mode: 'lines+markers',
      x: rows.map(d => d.kernel_version),
      y: rows.map(d => d.mean),
      error_y: {
        visible: true, type: 'data',
        array:      rows.map(d => d.max - d.mean),
        arrayminus: rows.map(d => d.mean - d.min),
        color: c, thickness: 1.5, opacity: 0.6,
      },
      marker: { color: c, size: 7 },
      line:   { color: c, width: 2.5 },
      name: `${s.workload} / ${s.metric}`,
      hovertemplate: `<b>%{x}</b><br>${s.workload} / ${s.metric}: %{y:.3f}<extra></extra>`,
    }
  })

  // ── Combined comparison table ────────────────────────────────────────────────
  const kernels = mergedKernels(loadedSeries)

  // Build a lookup: { seriesId → { kernel_version → dataPoint } }
  const lookup = {}
  for (const s of loadedSeries) {
    const rows = norm ? normalise(s.data) : s.data
    lookup[s.id] = Object.fromEntries(rows.map(d => [d.kernel_version, d]))
  }

  const anyLoading = series.some(s => s.loading)
  const mixedUnits = series.length > 1 && new Set(series.map(s => s.metric)).size > 1

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-100">Kernel Comparison</h1>

      {/* ── Controls ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-gray-900 rounded-xl border border-gray-800">
        <Select
          label="System" value={sysId}
          onChange={setSysId}
          options={(filters?.systems ?? []).map(s => ({ value: s.id, label: s.name }))}
        />
        <Select
          label="Config" value={cfg}
          onChange={setCfg}
          placeholder="All configs"
          options={(filters?.configs ?? []).map(c => ({ value: c, label: c }))}
        />
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox" checked={norm}
              onChange={e => setNorm(e.target.checked)}
              className="w-4 h-4 rounded accent-blue-500"
            />
            <div>
              <div className="text-sm text-gray-300">Normalize to baseline</div>
              {mixedUnits && !norm && (
                <div className="text-xs text-amber-500 mt-0.5">
                  Recommended when metrics have different units
                </div>
              )}
            </div>
          </label>
        </div>
      </div>

      {/* ── Series builder ── */}
      <div className="flex flex-wrap gap-3 p-4 bg-gray-900 rounded-xl border border-gray-800 items-end">
        <div className="flex-1 min-w-[140px]">
          <Select
            label="Workload" value={addWl}
            onChange={v => { setAddWl(v); setAddMet('') }}
            options={(filters?.workloads ?? []).map(w => ({ value: w, label: w }))}
            disabled={!sysId}
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <Select
            label="Metric" value={addMet}
            onChange={setAddMet}
            options={wlMetrics.map(m => ({ value: m, label: m }))}
            disabled={!addWl}
          />
        </div>
        <button
          onClick={() => { doAdd(addWl, addMet); setAddMet('') }}
          disabled={!sysId || !addWl || !addMet}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40
                     disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
        >+ Add</button>
        {addWl && wlMetrics.length > 1 && (
          <button
            onClick={addAll}
            disabled={!sysId}
            className="px-4 py-2 text-sm rounded-lg border border-gray-700 text-gray-400
                       hover:border-gray-600 hover:text-gray-300 disabled:opacity-40
                       disabled:cursor-not-allowed transition-colors"
          >Add all metrics</button>
        )}
        {!sysId && (
          <p className="text-xs text-gray-600 w-full">Select a system first.</p>
        )}
      </div>

      {/* ── Series tags ── */}
      {series.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          {series.map((s, i) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm"
              style={{ background: clr(i) + '1a', border: `1px solid ${clr(i)}55`, color: '#e5e7eb' }}
            >
              <span style={{ background: clr(i) }} className="inline-block w-2 h-2 rounded-full flex-shrink-0" />
              {s.workload} / {s.metric}
              {s.loading && <span className="text-xs text-gray-500 ml-1">…</span>}
              {s.error   && <span className="text-xs text-red-400 ml-1">!</span>}
              <button
                onClick={() => setSeries(prev => prev.filter(x => x.id !== s.id))}
                className="ml-1 opacity-50 hover:opacity-100 leading-none"
              >×</button>
            </span>
          ))}
          <button
            onClick={() => setSeries([])}
            className="text-xs text-gray-600 hover:text-red-400 transition-colors px-1"
          >Clear all</button>
        </div>
      )}

      {/* ── Empty state ── */}
      {series.length === 0 && (
        <div className="text-center py-24 text-gray-600">
          Select a system, then add workload / metric series to compare.
        </div>
      )}

      {/* ── Combined chart ── */}
      {series.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          {anyLoading && (
            <p className="text-xs text-gray-500 mb-3 animate-pulse">Loading series data…</p>
          )}
          <Plot
            data={traces}
            layout={{
              ...LAYOUT_BASE,
              yaxis: {
                ...LAYOUT_BASE.yaxis,
                title: norm
                  ? 'Value (% of 1st kernel)'
                  : (series.length === 1 ? series[0].metric : 'Value'),
              },
              margin: { t: 50, r: 20, b: 90, l: 80 },
              height: 460,
            }}
            style={{ width: '100%', height: 460 }}
            config={{ responsive: true, displayModeBar: false }}
          />
        </div>
      )}

      {/* ── Combined comparison table ── */}
      {loadedSeries.length > 0 && kernels.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <h2 className="text-sm font-medium text-gray-400 mb-4 uppercase tracking-wide">
            Per-kernel comparison
            {norm && <span className="ml-2 text-gray-600 normal-case font-normal">(normalised — 1st kernel = 100)</span>}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-2 pr-4 text-gray-500 font-normal">Kernel</th>
                  {loadedSeries.map((s, i) => (
                    <th key={s.id} colSpan={2}
                      className="py-2 px-2 text-center font-medium"
                      style={{ color: clr(i) }}
                    >
                      {s.workload} / {s.metric}
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-gray-800 text-gray-600">
                  <th className="py-1.5 pr-4 font-normal text-left" />
                  {loadedSeries.map(s => (
                    <>
                      <th key={s.id + '-m'} className="py-1.5 px-2 text-right font-normal">Mean</th>
                      <th key={s.id + '-d'} className="py-1.5 px-2 text-right font-normal">Δ prev</th>
                    </>
                  ))}
                </tr>
              </thead>
              <tbody>
                {kernels.map(kver => (
                  <tr key={kver} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30">
                    <td className="py-2 pr-4 font-mono text-gray-300 whitespace-nowrap">{kver}</td>
                    {loadedSeries.map((s, i) => {
                      const byKernel = lookup[s.id] ?? {}
                      const rows     = norm ? normalise(s.data) : s.data
                      const idx      = rows.findIndex(d => d.kernel_version === kver)
                      const d        = idx >= 0 ? rows[idx] : null
                      const prev     = idx > 0 ? rows[idx - 1] : null
                      const delta    = d && prev
                        ? (d.mean - prev.mean) / Math.abs(prev.mean) * 100
                        : null
                      return (
                        <>
                          <td key={s.id + '-m'} className="py-2 px-2 text-right font-mono"
                            style={{ color: d ? clr(i) : '#4b5563' }}>
                            {d ? fmt(d.mean) : '—'}
                          </td>
                          <td key={s.id + '-d'} className={`py-2 px-2 text-right font-mono ${deltaClass(delta)}`}>
                            {pct(delta)}
                          </td>
                        </>
                      )
                    })}
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
