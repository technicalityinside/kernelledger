import statistics
from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import Kernel, Result, Run, System

router = APIRouter(tags=["compare"])


# ── /api/filters ──────────────────────────────────────────────────────────────

@router.get("/filters")
def get_filters(db: Session = Depends(get_db)):
    """All available selector options for the frontend."""
    workloads = sorted({r[0] for r in db.query(Run.workload).distinct().all()})
    systems   = db.query(System).order_by(System.name).all()
    kernels   = db.query(Kernel).order_by(Kernel.id).all()
    configs   = sorted({
        r[0] for r in db.query(Run.config_preset).distinct().all() if r[0]
    })

    metrics: dict = {}
    for workload in workloads:
        rows = (
            db.query(Result.metric_name)
            .join(Run, Run.id == Result.run_id)
            .filter(Run.workload == workload)
            .distinct()
            .all()
        )
        metrics[workload] = sorted({r[0] for r in rows})

    return {
        "workloads": workloads,
        "systems":   [{"id": s.id, "name": s.name} for s in systems],
        "kernels":   [{"id": k.id, "version": k.version, "config_name": k.config_name} for k in kernels],
        "configs":   configs,
        "metrics":   metrics,
    }


# ── /api/compare  (kernel comparison for one system) ─────────────────────────

def _aggregate(values: List[float]) -> dict:
    return {
        "mean":    statistics.mean(values),
        "min":     min(values),
        "max":     max(values),
        "stdev":   statistics.stdev(values) if len(values) > 1 else 0.0,
        "samples": len(values),
    }


@router.get("/compare")
def compare_kernels(
    workload:      str,
    metric:        str,
    system_id:     int,
    config_preset: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Returns aggregated metric values for each kernel version,
    for a fixed system + workload + config.
    """
    q = (
        db.query(Kernel.id, Kernel.version, Kernel.config_name, Result.value)
        .join(Run,    Run.kernel_id  == Kernel.id)
        .join(Result, Result.run_id  == Run.id)
        .filter(
            Run.system_id       == system_id,
            Run.workload        == workload,
            Result.metric_name  == metric,
        )
    )
    if config_preset:
        q = q.filter(Run.config_preset == config_preset)

    grouped: dict = {}
    for kernel_id, version, config_name, value in q.all():
        grouped.setdefault((kernel_id, version, config_name), []).append(value)

    return [
        {"kernel_id": kid, "kernel_version": ver, "config_name": cfg, **_aggregate(vals)}
        for (kid, ver, cfg), vals in sorted(grouped.items(), key=lambda x: x[0][0])
    ]


# ── /api/compare/systems  (system comparison for one kernel) ─────────────────

@router.get("/compare/systems")
def compare_systems(
    workload:      str,
    metric:        str,
    kernel_id:     int,
    config_preset: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Returns aggregated metric values for each system,
    for a fixed kernel + workload + config.
    """
    q = (
        db.query(System.id, System.name, Result.value)
        .join(Run,    Run.system_id  == System.id)
        .join(Result, Result.run_id  == Run.id)
        .filter(
            Run.kernel_id       == kernel_id,
            Run.workload        == workload,
            Result.metric_name  == metric,
        )
    )
    if config_preset:
        q = q.filter(Run.config_preset == config_preset)

    grouped: dict = {}
    for sys_id, sys_name, value in q.all():
        grouped.setdefault((sys_id, sys_name), []).append(value)

    return sorted(
        [
            {"system_id": sid, "system_name": sname, **_aggregate(vals)}
            for (sid, sname), vals in grouped.items()
        ],
        key=lambda x: x["mean"],
    )
