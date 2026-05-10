# Garuda Kernel Ledger

A web application for tracking, visualising, and comparing benchmark results across kernel versions, hardware configurations, and system setups. Results are pushed from the Garuda toolkit CLI and stored in PostgreSQL. Each run stores a full snapshot of the kernel configuration at the time it was executed — THP policy, scheduler knobs, CPU frequency governor, security mitigations, and more — so regressions can be traced back to the exact system state that produced them.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Garuda CLI  (python3 main.py push ...)              │
│  Auto-detects: system info, kernel version,          │
│  and a full kernel configuration snapshot            │
└──────────────────────┬───────────────────────────────┘
                       │ POST /api/runs
                       │ Authorization: Bearer <api-key>
                       ▼
┌──────────────────────────────────────────────────────┐
│  Backend  (FastAPI + SQLAlchemy)   port 8000         │
│  • Validates API key on every push                   │
│  • Upserts system + kernel records                   │
│  • Stores per-iteration metric values + snapshot     │
│  • Detects regressions on every push                 │
└──────────────────────┬───────────────────────────────┘
                       │ PostgreSQL
┌──────────────────────┴───────────────────────────────┐
│  Database  (PostgreSQL 16)                           │
│  Tables: systems, kernels, runs,                     │
│           results, regressions                       │
└──────────────────────────────────────────────────────┘
                       ▲
                       │ /api/*  (GET endpoints — public)
┌──────────────────────────────────────────────────────┐
│  Frontend  (React + Vite + Plotly.js)  port 3000     │
│  • Compare    — metric vs kernel versions            │
│  • Regressions — heatmap + flagged list              │
│  • Systems    — side-by-side hardware view           │
│  • Runs       — filterable run list                  │
│  • Run detail — full report + kernel snapshot        │
└──────────────────────────────────────────────────────┘
```

---

## Pages

### Compare
Select a workload, metric, system, and (optionally) a config preset. The page renders a line chart of the metric mean across kernel versions with min/max error bars, plus a summary table with per-kernel statistics and a Δ% column showing change relative to the previous kernel.

### Regressions
Shows a heatmap where rows are `workload / metric` combinations and columns are kernel transitions (`6.1 → 6.6`). Cells are colour-coded — red for regressions, green for improvements. A sortable list below the heatmap shows all flagged regressions with before/after values.

A regression is flagged when a metric changes by more than **5%** between consecutive kernel versions. Direction is inferred from the metric name:
- Suffixes `_us`, `_ms`, `_ns`, `_sec`, `_lat`, `_latency` → lower is better
- Everything else (throughput, bandwidth, ops/s) → higher is better

### Systems
Select a workload, metric, and kernel version to compare the same benchmark across different machines. Useful for spotting hardware-specific regressions or validating performance parity across instance types.

### Runs
A filterable table of all ingested runs. Filter by workload, system, or kernel version. Click any row to open the full run detail view.

### Run Detail
Shows everything captured for a single run:
- Identity card: system, kernel version, kernel config label, timestamp
- Metrics table: mean, min, max, stdev, sample count, and per-iteration values
- Full kernel configuration snapshot captured at push time, organised into sections:

| Section | What it covers |
|---|---|
| CPU power & frequency | pstate driver/mode, governor, turbo boost, EPP, freq range, SMT control, C-state latencies |
| Scheduler | Preemption model, autogroup, energy-aware scheduling, timer migration, NUMA balancing, RT period/runtime, util clamp bounds |
| Memory / VM | THP mode and defrag policy, hugepage counts, overcommit policy, zone reclaim, swappiness, dirty ratios and timings, compaction, watermark |
| CPU isolation & tickless | Isolated CPUs, nohz_full, rcu_nocbs, irqbalance status, IRQ affinity mask |
| I/O schedulers | Active scheduler per block device |
| Network | TCP congestion control, socket buffer sizes, netdev backlog, timestamps, SACK |
| Kernel / boot | Preemption model (from kernel config), RCU expedited/normal, NMI watchdog, full kernel cmdline |
| Security mitigations | Active mitigations listed individually; unaffected CVEs summarised on one line |

---

## Authentication

`POST /api/runs` (the push endpoint) requires an API key. All `GET` endpoints are public.

The key is passed as an HTTP Bearer token:

```
Authorization: Bearer <your-api-key>
```

The server reads the key from the `PUSH_API_KEY` environment variable. If `PUSH_API_KEY` is not set, the backend returns `503` on every push attempt — it will never accept unauthenticated pushes.

---

## Deployment

### Prerequisites

- Docker Engine ≥ 24 and Docker Compose v2
- Ports 3000 (frontend) and 8000 (backend) available on the host

### 1. Clone and enter the portal directory

```bash
git clone git@github.com:technicalityinside/kernelledger.git
cd kernelledger
```

### 2. Set the push API key

```bash
export PUSH_API_KEY="$(openssl rand -hex 32)"
echo "PUSH_API_KEY=$PUSH_API_KEY" >> .env
```

The docker-compose stack refuses to start if `PUSH_API_KEY` is unset.

### 3. Start all services

```bash
docker compose up -d --build
```

This starts three containers:
- `db` — PostgreSQL 16 (data persisted in a named volume `pgdata`)
- `backend` — FastAPI on port 8000 (tables auto-created on first start)
- `frontend` — nginx on port 3000, proxies `/api` requests to the backend

### 4. Verify

```bash
# Backend health check (no auth required)
curl http://localhost:8000/api/health

# Push without a key — should return 401
curl -X POST http://localhost:8000/api/runs -H 'Content-Type: application/json' -d '{}'

# Open the frontend
open http://localhost:3000
```

### 5. Stop / tear down

```bash
# Stop containers (data preserved)
docker compose down

# Stop and delete the database volume
docker compose down -v
```

---

## Running Without Docker

Useful for local development.

### Backend

```bash
cd backend

pip install -r requirements.txt

export DATABASE_URL="postgresql://garuda:garuda@localhost:5432/garuda"
export PUSH_API_KEY="dev-secret"

uvicorn main:app --reload --port 8000
```

Tables are created automatically on startup.

### Frontend

```bash
cd frontend

npm install

# The dev server proxies /api to localhost:8000 automatically (see vite.config.js)
npm run dev
```

The dev server starts at `http://localhost:5173`.

---

## Pushing Results from Garuda

After running any benchmark, push results to the portal with the `push` subcommand:

```bash
# Set the key once in your shell
export GARUDA_API_KEY="your-api-key"

# Push the most recent run (kernel version auto-detected from uname -r)
python3 main.py push --url http://localhost:8000

# Push a specific run
python3 main.py push --url http://localhost:8000 \
  --run-id 20260510_093347_hackbench_single_core

# Override system name and kernel version
python3 main.py push --url http://localhost:8000 \
  --system-name "lab-server-01" \
  --kernel 6.12.0 \
  --kernel-config defconfig

# Pass the key inline (takes precedence over env var)
python3 main.py push --url http://localhost:8000 --api-key your-api-key
```

The command reads `results/<run-id>/results.json`, auto-detects:

| Field | Source | Override |
|---|---|---|
| System name | `hostname` | `--system-name` |
| CPU model | `/proc/cpuinfo` / `lscpu` | — |
| Memory | `/proc/meminfo` | — |
| NUMA nodes | topology detection | — |
| Kernel version | `uname -r` | `--kernel` |
| Kernel config label | — | `--kernel-config` |
| API key | `$GARUDA_API_KEY` | `--api-key` |

In addition, the full kernel configuration snapshot is captured at push time and stored alongside the results. This snapshot covers CPU power management, scheduler settings, memory/VM knobs, CPU isolation, I/O schedulers, network settings, kernel boot parameters, and security mitigation status.

Each `(workload, config_preset)` combination within the run is pushed as a separate entry and appears independently in the portal's selectors.

### Automating pushes after every run

```bash
#!/bin/bash
export GARUDA_API_KEY="your-api-key"
python3 main.py run --workload schbench --config 4c4t --iterations 5 "$@"
python3 main.py push --url http://perf.example.com
```

---

## API Reference

The backend exposes a self-documenting OpenAPI interface at `http://localhost:8000/docs`.

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/runs` | Required | Ingest a benchmark run with kernel snapshot |
| `GET` | `/api/runs` | — | Recent runs with optional workload/system/kernel filters |
| `GET` | `/api/runs/{id}` | — | Full run detail including kernel snapshot and all iterations |
| `GET` | `/api/filters` | — | All selector options (workloads, systems, kernels, configs, metrics) |
| `GET` | `/api/compare` | — | Metric aggregated by kernel version for one system |
| `GET` | `/api/compare/systems` | — | Metric aggregated by system for one kernel |
| `GET` | `/api/regressions` | — | List of detected regressions |
| `GET` | `/api/regressions/matrix` | — | Heatmap data (rows × columns × delta_pct) |
| `GET` | `/api/systems` | — | All registered systems |
| `GET` | `/api/kernels` | — | All registered kernel versions |
| `GET` | `/api/health` | — | Health check |

---

## Configuration

### Backend environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string (default: `postgresql://garuda:garuda@localhost:5432/garuda`) |
| `PUSH_API_KEY` | Yes | Secret key that authorises `POST /api/runs`. Backend returns 503 if unset. |

### Frontend environment variables

Create `frontend/.env.local` to override the API base URL when the backend is not on the same host:

```bash
VITE_API_URL=http://perf.example.com
```

When using the nginx Docker image, `/api` requests are proxied to the `backend` container automatically — no env override needed.

---

## Directory Structure

```
kernelledger/
├── backend/
│   ├── main.py           # FastAPI app + lifespan (auto-creates tables)
│   ├── database.py       # SQLAlchemy engine + session factory
│   ├── models.py         # ORM models: System, Kernel, Run, Result, Regression
│   ├── schemas.py        # Pydantic request/response schemas
│   ├── auth.py           # API key validation dependency
│   ├── regression.py     # Regression detection logic (runs on every push)
│   ├── routers/
│   │   ├── runs.py       # POST /api/runs  •  GET /api/runs  •  GET /api/runs/{id}
│   │   ├── systems.py    # GET  /api/systems
│   │   ├── kernels.py    # GET  /api/kernels
│   │   ├── compare.py    # GET  /api/compare, /api/compare/systems, /api/filters
│   │   └── regressions.py# GET  /api/regressions, /api/regressions/matrix
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api.js        # Fetch wrappers for all backend endpoints
│   │   ├── pages/
│   │   │   ├── Compare.jsx
│   │   │   ├── Regressions.jsx
│   │   │   ├── Systems.jsx
│   │   │   ├── Runs.jsx
│   │   │   └── RunDetail.jsx
│   │   └── components/
│   │       ├── Navbar.jsx
│   │       └── Select.jsx
│   ├── nginx.conf        # SPA routing + /api proxy to backend
│   ├── package.json
│   └── Dockerfile
└── docker-compose.yml    # postgres + backend + frontend
```
