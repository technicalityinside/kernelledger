# Garuda Performance Portal

A web application for tracking, visualising, and comparing benchmark results across kernel versions, hardware configurations, and system setups. Results are pushed from the Garuda toolkit CLI and stored in PostgreSQL. The frontend provides three interactive views built with React and Plotly.

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  Garuda CLI  (python3 main.py push ...)     │
│  Auto-detects: system info, kernel version  │
└───────────────────┬─────────────────────────┘
                    │ POST /api/runs (JSON)
                    ▼
┌─────────────────────────────────────────────┐
│  Backend  (FastAPI + SQLAlchemy)            │
│  port 8000                                  │
│  • Upserts system + kernel records          │
│  • Stores per-iteration metric values       │
│  • Detects regressions on every push        │
└───────────────┬─────────────────────────────┘
                │ PostgreSQL
┌───────────────┴─────────────────────────────┐
│  Database  (PostgreSQL 16)                  │
│  Tables: systems, kernels, runs,            │
│           results, regressions              │
└─────────────────────────────────────────────┘
                    ▲
                    │ /api/*
┌─────────────────────────────────────────────┐
│  Frontend  (React + Vite + Plotly.js)       │
│  port 3000  (served by nginx)               │
│  • Compare    — metric vs kernel versions   │
│  • Regressions — heatmap + flagged list     │
│  • Systems    — side-by-side hardware view  │
└─────────────────────────────────────────────┘
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

---

## Deployment

### Prerequisites

- Docker Engine ≥ 24 and Docker Compose v2
- Ports 3000 (frontend) and 8000 (backend) available on the host

### 1. Clone and enter the portal directory

```bash
git clone git@github.com:technicalityinside/garuda.git
cd garuda/portal
```

### 2. Start all services

```bash
docker compose up -d --build
```

This starts three containers:
- `db` — PostgreSQL 16 (data persisted in a named volume `pgdata`)
- `backend` — FastAPI on port 8000 (tables are auto-created on first start)
- `frontend` — nginx on port 3000, proxies `/api` requests to the backend

### 3. Verify

```bash
# Backend health check
curl http://localhost:8000/api/health

# Open the frontend
open http://localhost:3000
```

### 4. Stop / tear down

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
cd portal/backend

# Install dependencies
pip install -r requirements.txt

# Start a local PostgreSQL instance (or set DATABASE_URL to an existing one)
export DATABASE_URL="postgresql://garuda:garuda@localhost:5432/garuda"

uvicorn main:app --reload --port 8000
```

Tables are created automatically on startup.

### Frontend

```bash
cd portal/frontend

npm install

# The dev server proxies /api to localhost:8000 automatically (see vite.config.js)
npm run dev
```

The dev server starts at `http://localhost:5173`.

---

## Pushing Results from Garuda

After running any benchmark, push results to the portal with the `push` subcommand:

```bash
# Push the most recent run (kernel version auto-detected from uname -r)
python3 main.py push --url http://localhost:8000

# Push a specific run
python3 main.py push --url http://localhost:8000 \
  --run-id 20260510_schbench_4c4t

# Override system name and kernel version
python3 main.py push --url http://localhost:8000 \
  --system-name "lab-server-01" \
  --kernel 6.12.0 \
  --kernel-config defconfig
```

The command reads `results/<run-id>/results.json`, auto-detects:
- **System name** — hostname (override with `--system-name`)
- **CPU model** — from `lscpu`
- **Memory** — from `/proc/meminfo`
- **NUMA nodes** — from topology detection
- **Kernel version** — from `uname -r` (override with `--kernel`)

Each `(workload, config_preset)` combination within the run is pushed as a separate entry and appears independently in the portal's selectors.

### Automating pushes after every run

Add `--push-url` is not yet a flag on `run`/`scaling`, so the simplest automation is a shell wrapper:

```bash
#!/bin/bash
python3 main.py run --workload schbench --config 4c4t --iterations 5 "$@"
python3 main.py push --url http://perf.example.com
```

---

## API Reference

The backend exposes a self-documenting OpenAPI interface at:

```
http://localhost:8000/docs
```

Key endpoints:

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/runs` | Ingest a benchmark run (upserts system + kernel) |
| `GET` | `/api/filters` | All selector options (workloads, systems, kernels, configs, metrics) |
| `GET` | `/api/compare` | Metric aggregated by kernel version for one system |
| `GET` | `/api/compare/systems` | Metric aggregated by system for one kernel |
| `GET` | `/api/regressions` | List of detected regressions |
| `GET` | `/api/regressions/matrix` | Heatmap data (rows × columns × delta_pct) |
| `GET` | `/api/systems` | All registered systems |
| `GET` | `/api/kernels` | All registered kernel versions |
| `GET` | `/api/runs` | Recent runs with optional filters |

---

## Configuration

### Backend environment variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://garuda:garuda@localhost:5432/garuda` | PostgreSQL connection string |

### Frontend environment variables

Create `portal/frontend/.env.local` to override the API base URL (needed when the backend is not on the same host):

```bash
VITE_API_URL=http://perf.example.com
```

When using the nginx Docker image, `/api` requests are proxied to the `backend` container automatically — no env override needed.

---

## Directory Structure

```
portal/
├── backend/
│   ├── main.py           # FastAPI app + lifespan (auto-creates tables)
│   ├── database.py       # SQLAlchemy engine + session factory
│   ├── models.py         # ORM models: System, Kernel, Run, Result, Regression
│   ├── schemas.py        # Pydantic request/response schemas
│   ├── regression.py     # Regression detection logic (runs on every push)
│   ├── routers/
│   │   ├── runs.py       # POST /api/runs
│   │   ├── systems.py    # GET  /api/systems
│   │   ├── kernels.py    # GET  /api/kernels
│   │   ├── compare.py    # GET  /api/compare, /api/compare/systems, /api/filters
│   │   └── regressions.py# GET  /api/regressions, /api/regressions/matrix
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api.js        # Typed fetch wrappers for all backend endpoints
│   │   ├── pages/
│   │   │   ├── Compare.jsx
│   │   │   ├── Regressions.jsx
│   │   │   └── Systems.jsx
│   │   └── components/
│   │       ├── Navbar.jsx
│   │       └── Select.jsx
│   ├── nginx.conf        # SPA routing + /api proxy to backend
│   ├── package.json
│   └── Dockerfile
└── docker-compose.yml    # postgres + backend + frontend
```
