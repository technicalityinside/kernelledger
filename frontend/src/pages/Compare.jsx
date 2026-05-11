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
  legend: { bgcolor: 'transparent', bordercolor: '#374151', borderwidth: 1 },
}

let _uid = 0
const nextId = () => ++_uid

function fmt(v) { return v == null ? '—' : Number(v).toFixed(3) }
function pct(v) { return v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%' }

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

function SeriesCard({ s, colorIdx, norm }) {
  const rows = norm ? normalise(s.data) : s.data
  const c    = clr(colorIdx)
  const yTitle = norm ? `${s.metric} (% of 1st kernel)` : s.metric

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <span style={{ background: c }} className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" />
        <span className="text-sm font-semibold text-gray-200">{s.workload}</span>
        <span className="text-gray-700">/</span>
        <span className="text-sm text-gray-400 font-mono">{s.metric}</span>
      </div>

      {s.loading && (
        <div className="py-10 text-center text-gray-500 text-sm animate-pulse">Loading…</div>
      )}
      {s.error && (
        <div className="text-red-400 text-sm py-4">{s.error}</div>
      )}
      {!s.loading && !s.error && s.data.length === 0 && (
        <div className="py-10 text-center text-gray-600 text-sm">No data for this selection.</div>
      )}

      {!s.loading && !s.error && rows.length > 0 && (
        <>
          <Plot
            data={[{
              type: 'scatter', mode: 'lines+markers',
              x: rows.map(d => d.kernel_version),
              y: rows.map(d => d.mean),
              error_y: {
                visible: true, type: 'data',
                array:      rows.map(d => d.max - d.mean),
                arrayminus: rows.map(d => d.mean - d.min),
                color: c, thickness: 1.5,
              },
              marker: { color: c, size: 6 },
              line:   { color: c, width: 2 },
              name: `${s.workload}/${s.metric}`,
              hovertemplate: '<b>%{x}</b><br>%{y:.3f}<extra></extra>',
            }]}
            layout={{
              ...LAYOUT_BASE,
              yaxis: { ...LAYOUT_BASE.yaxis, title: yTitle },
              margin: { t: 10, r: 10, b: 80, l: 70 },
              showlegend: false,
            }}
            style={{ width: '100%', height: 260 }}
            config={{ responsive: true, displayModeBar: false }}
          />

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-gray-600 border-b border-gray-800">
                  <th className="text-left py-1.5 pr-3 font-normal">Kernel</th>
                  <th className="text-right pr-3 font-normal">Mean</th>
                  <th className="text-right pr-3 font-normal">Min</th>
                  <th className="text-right pr-3 font-normal">Max</th>
                  <th className="text-right pr-3 font-normal">Stdev</th>
                  <th className="text-right font-normal">Δ prev</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d, i) => {
                  const prev  = rows[i - 1]
                  const delta = prev ? (d.mean - prev.mean) / Math.abs(prev.mean) * 100 : null
                  const dc    = delta == null ? 'text-gray-600'
                    : delta > 5  ? 'text-red-400'
                    : delta < -5 ? 'text-green-400'
                    : 'text-gray-400'
                  return (
                    <tr key={d.kernel_id} className="border-b border-gray-800/40 last:border-0">
                      <td className="py-1.5 pr-3 font-mono text-gray-300">{d.kernel_version}</td>
                      <td className="py-1.5 pr-3 text-right font-mono">{fmt(d.mean)}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-green-500">{fmt(d.min)}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-red-400">{fmt(d.max)}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-gray-500">{fmt(d.stdev)}</td>
                      <td className={`py-1.5 text-right font-mono ${dc}`}>{pct(delta)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

export default function Compare() {
  const [filters, setFilters] = useState(null)
  const [sysId,   setSysId]   = useState('')
  const [cfg,     setCfg]     = useState('')
  const [addWl,   setAddWl]   = useState('')
  const [addMet,  setAddMet]  = useState('')
  const [series,  setSeries]  = useState([])
  const [norm,    setNorm]    = useState(false)
  const [view,    setView]    = useState('grid')   // 'grid' | 'overlay'

  // Always-current reference used by effects that run after state updates
  const seriesRef = useRef(series)
  seriesRef.current = series

  useEffect(() => { api.filters().then(setFilters).catch(() => {}) }, [])

  // Re-fetch all series when system or config changes
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

  const overlayTraces = series.map((s, i) => {
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
        color: c, thickness: 1, opacity: 0.5,
      },
      marker: { color: c, size: 6 },
      line:   { color: c, width: 2 },
      name: `${s.workload} / ${s.metric}`,
    }
  })

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-100">Kernel Comparison</h1>

      {/* ── Top controls ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-gray-900 rounded-xl border border-gray-800">
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
            <span className="text-sm text-gray-300">Normalize to baseline</span>
          </label>
        </div>
        <div className="flex items-end gap-2">
          {['grid', 'overlay'].map(v => (
            <button key={v}
              onClick={() => setView(v)}
              className={`flex-1 py-2 text-sm rounded-lg border capitalize transition-colors
                ${view === v
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-transparent border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'}`}
            >{v}</button>
          ))}
        </div>
      </div>

      {/* ── Add series ── */}
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

      {/* ── Active series tags ── */}
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

      {/* ── Grid view ── */}
      {series.length > 0 && view === 'grid' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {series.map((s, i) => (
            <SeriesCard key={s.id} s={s} colorIdx={i} norm={norm} />
          ))}
        </div>
      )}

      {/* ── Overlay view ── */}
      {series.length > 0 && view === 'overlay' && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-3">
          {norm ? (
            <p className="text-xs text-gray-500">
              Each series' first kernel = 100. Values show % relative to that baseline.
            </p>
          ) : series.length > 1 && (
            <p className="text-xs text-amber-600/80">
              Tip: enable "Normalize to baseline" to compare series with different units on the same scale.
            </p>
          )}
          <Plot
            data={overlayTraces}
            layout={{
              ...LAYOUT_BASE,
              yaxis: { ...LAYOUT_BASE.yaxis, title: norm ? 'Value (% of 1st kernel)' : 'Value' },
              margin: { t: 20, r: 20, b: 90, l: 80 },
              height: 500,
            }}
            style={{ width: '100%', height: 500 }}
            config={{ responsive: true, displayModeBar: false }}
          />
        </div>
      )}
    </div>
  )
}
