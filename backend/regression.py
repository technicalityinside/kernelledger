"""
Regression detection: compare consecutive kernel versions for a given
(system, workload, config, metric) combination and write Regression rows.

Direction heuristic
-------------------
Metrics whose names end with a latency/time suffix are "lower is better".
Everything else (throughput, bandwidth, ops/s) is "higher is better".
A regression is flagged when the change exceeds THRESHOLD (5 % by default).
"""

import statistics
from datetime import datetime
from typing import List, Optional

from sqlalchemy.orm import Session

from models import Kernel, Regression, Result, Run

THRESHOLD = 0.05  # 5 %

_LOWER_IS_BETTER = (
    "_us", "_ms", "_ns", "_sec", "_time", "_latency", "_lat",
    "time_sec", "latency",
)


def _lower_is_better(metric: str) -> bool:
    return any(metric.endswith(s) or metric == s for s in _LOWER_IS_BETTER)


def _mean_for(
    db: Session,
    system_id: int,
    kernel_id: int,
    workload: str,
    metric: str,
    config_preset: Optional[str],
) -> Optional[float]:
    q = (
        db.query(Result.value)
        .join(Run, Run.id == Result.run_id)
        .filter(
            Run.system_id == system_id,
            Run.kernel_id == kernel_id,
            Run.workload == workload,
            Result.metric_name == metric,
        )
    )
    if config_preset:
        q = q.filter(Run.config_preset == config_preset)
    values = [r[0] for r in q.all()]
    return statistics.mean(values) if values else None


def detect_regressions(
    db: Session,
    system_id: int,
    workload: str,
    config_preset: Optional[str],
) -> None:
    # Ordered list of kernel IDs that have runs for this system+workload
    kernel_ids: List[int] = [
        r[0]
        for r in (
            db.query(Run.kernel_id)
            .filter(Run.system_id == system_id, Run.workload == workload)
            .distinct()
            .order_by(Run.kernel_id)
            .all()
        )
    ]
    if len(kernel_ids) < 2:
        return

    metrics: List[str] = [
        r[0]
        for r in (
            db.query(Result.metric_name)
            .join(Run, Run.id == Result.run_id)
            .filter(Run.system_id == system_id, Run.workload == workload)
            .distinct()
            .all()
        )
    ]

    for metric in metrics:
        lib = _lower_is_better(metric)

        for i in range(len(kernel_ids) - 1):
            k_before, k_after = kernel_ids[i], kernel_ids[i + 1]

            v_before = _mean_for(db, system_id, k_before, workload, metric, config_preset)
            v_after  = _mean_for(db, system_id, k_after,  workload, metric, config_preset)

            if v_before is None or v_after is None or v_before == 0:
                continue

            # delta_pct > 0  → value went up
            delta_pct = (v_after - v_before) / abs(v_before)

            is_regression = (
                (lib     and delta_pct >  THRESHOLD) or   # latency went up
                (not lib and delta_pct < -THRESHOLD)       # throughput went down
            )
            if not is_regression:
                continue

            existing = (
                db.query(Regression)
                .filter(
                    Regression.system_id        == system_id,
                    Regression.workload         == workload,
                    Regression.metric_name      == metric,
                    Regression.kernel_before_id == k_before,
                    Regression.kernel_after_id  == k_after,
                    Regression.config_preset    == config_preset,
                )
                .first()
            )
            if existing:
                existing.value_before = v_before
                existing.value_after  = v_after
                existing.delta_pct    = delta_pct * 100
                existing.detected_at  = datetime.utcnow()
            else:
                db.add(Regression(
                    workload         = workload,
                    metric_name      = metric,
                    system_id        = system_id,
                    config_preset    = config_preset,
                    kernel_before_id = k_before,
                    kernel_after_id  = k_after,
                    value_before     = v_before,
                    value_after      = v_after,
                    delta_pct        = delta_pct * 100,
                    detected_at      = datetime.utcnow(),
                ))

        db.commit()
