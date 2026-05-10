import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'

// Section titles matching collect_system_snapshot() keys
const SECTION_LABELS = {
  system:      'System',
  cpu_power:   'CPU power & frequency',
  scheduler:   'Scheduler',
  memory_vm:   'Memory / VM',
  isolation:   'CPU isolation & tickless',
  io_schedulers: 'I/O schedulers',
  network:     'Network',
  kernel_boot: 'Kernel / boot',
  mitigations: 'Security mitigations',
}

// For the mitigations section, suppress "Not affected" rows and summarise them
function MitigationsSection({ data }) {
  if (!data || Object.keys(data).length === 0) return null
  const active      = Object.entries(data).filter(([, v]) => !v.toLowerCase().startsWith('not affected'))
  const notAffected = Object.keys(data).filter(k => data[k].toLowerCase().startsWith('not affected'))
  const keyW = Math.max(...Object.keys(data).map(k => k.length))

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-800 text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Security mitigations
      </div>
      <div className="divide-y divide-gray-800/60">
        {active.map(([k, v]) => (
          <div key={k} className="flex gap-4 px-4 py-2 text-sm">
            <span className="w-48 shrink-0 text-gray-400 font-mono">{k}</span>
            <span className="text-yellow-300 break-all">{v}</span>
          </div>
        ))}
        {notAffected.length > 0 && (
          <div className="flex gap-4 px-4 py-2 text-sm">
            <span className="w-48 shrink-0 text-gray-400 font-mono">not affected</span>
            <span className="text-green-400 break-words">{notAffected.join(', ')}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function KvSection({ title, data }) {
  if (!data || Object.keys(data).length === 0) return null
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-800 text-xs font-semibold text-gray-400 uppercase tracking-wider">
        {title}
      </div>
      <div className="divide-y divide-gray-800/60">
        {Object.entries(data).map(([k, v]) => (
          <div key={k} className="flex gap-4 px-4 py-2 text-sm">
            <span className="w-48 shrink-0 text-gray-400 font-mono">{k}</span>
            <span className="text-gray-200 break-all">{String(v)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MetricsTable({ results }) {
  if (!results || results.length === 0) return null

  // Group by metric_name
  const byMetric = {}
  for (const r of results) {
    if (!byMetric[r.metric_name]) byMetric[r.metric_name] = []
    byMetric[r.metric_name].push(r)
  }

  // Compute summary stats per metric
  const metrics = Object.entries(byMetric).map(([name, rows]) => {
    const vals = rows.map(r => r.value)
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length
    const min  = Math.min(...vals)
    const max  = Math.max(...vals)
    const std  = vals.length > 1
      ? Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length)
      : 0
    return { name, vals, mean, min, max, std, n: vals.length }
  })

  function fmt(v) { return v == null ? '—' : Number(v.toPrecision(4)).toString() }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-800 text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Metrics
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-800">
              <th className="text-left px-4 py-2">Metric</th>
              <th className="text-right px-4 py-2">Mean</th>
              <th className="text-right px-4 py-2">Min</th>
              <th className="text-right px-4 py-2">Max</th>
              <th className="text-right px-4 py-2">Stdev</th>
              <th className="text-right px-4 py-2">Samples</th>
              <th className="text-left px-4 py-2">Iterations</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map(m => (
              <tr key={m.name} className="border-b border-gray-800/60">
                <td className="px-4 py-2.5 font-mono text-blue-300">{m.name}</td>
                <td className="px-4 py-2.5 text-right font-mono">{fmt(m.mean)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-green-400">{fmt(m.min)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-red-400">{fmt(m.max)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-gray-500">{fmt(m.std)}</td>
                <td className="px-4 py-2.5 text-right text-gray-400">{m.n}</td>
                <td className="px-4 py-2.5 font-mono text-gray-500 text-xs">
                  {m.vals.map((v, i) => `[${i}] ${fmt(v)}`).join('  ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function RunDetail() {
  const { id }       = useParams()
  const navigate     = useNavigate()
  const [run,        setRun]     = useState(null)
  const [loading,    setLoading] = useState(true)
  const [error,      setError]   = useState(null)

  useEffect(() => {
    setLoading(true); setError(null)
    api.runDetail(id)
      .then(d => { setRun(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [id])

  if (loading) return <div className="text-center py-24 text-gray-500 animate-pulse">Loading…</div>
  if (error)   return (
    <div className="text-red-400 text-sm px-4 py-3 bg-red-950/40 rounded-lg border border-red-800">{error}</div>
  )
  if (!run) return null

  const snap = run.system_snapshot || {}

  function fmtDate(s) {
    return s ? new Date(s).toLocaleString() : '—'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/runs')}
          className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
        >
          ← Runs
        </button>
        <h1 className="text-xl font-semibold text-gray-100">
          <span className="text-blue-400 font-mono">{run.workload}</span>
          {run.config_preset && <span className="text-gray-500"> / {run.config_preset}</span>}
        </h1>
      </div>

      {/* Identity card */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          ['System',  run.system?.name],
          ['Kernel',  run.kernel?.version],
          ['Config',  run.kernel?.config_name],
          ['Run at',  fmtDate(run.ran_at)],
        ].map(([label, value]) => (
          <div key={label} className="bg-gray-900 rounded-xl border border-gray-800 px-4 py-3">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</div>
            <div className="font-mono text-gray-200 text-sm truncate">{value || '—'}</div>
          </div>
        ))}
      </div>

      {/* Metrics */}
      <MetricsTable results={run.results} />

      {/* System snapshot sections */}
      {Object.keys(SECTION_LABELS)
        .filter(k => k !== 'mitigations' && snap[k] && Object.keys(snap[k]).length > 0)
        .map(key => (
          <KvSection key={key} title={SECTION_LABELS[key]} data={snap[key]} />
        ))
      }
      {snap.mitigations && <MitigationsSection data={snap.mitigations} />}

      {/* Workload args (if any) */}
      {run.workload_args && Object.keys(run.workload_args).length > 0 && (
        <KvSection title="Workload arguments" data={run.workload_args} />
      )}
    </div>
  )
}
