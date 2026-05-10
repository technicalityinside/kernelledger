const BASE = import.meta.env.VITE_API_URL ?? ''

async function get(path, params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
  )
  const url = `${BASE}/api${path}${qs.toString() ? '?' + qs : ''}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

export const api = {
  filters:         ()       => get('/filters'),
  compare:         (p)      => get('/compare',          p),
  compareSystems:  (p)      => get('/compare/systems',  p),
  regressions:     (p = {}) => get('/regressions',      p),
  regressionMatrix:(p = {}) => get('/regressions/matrix', p),
  systems:         ()       => get('/systems'),
  kernels:         ()       => get('/kernels'),
  runs:            (p = {}) => get('/runs',              p),
  runDetail:       (id)     => get(`/runs/${id}`),
}
