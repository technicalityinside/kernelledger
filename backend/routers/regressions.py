from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import Kernel, Regression, System

router = APIRouter(prefix="/regressions", tags=["regressions"])


@router.get("")
def list_regressions(
    system_id: Optional[int] = None,
    workload:  Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Regression)
    if system_id:
        q = q.filter(Regression.system_id == system_id)
    if workload:
        q = q.filter(Regression.workload == workload)

    rows = q.order_by(Regression.delta_pct.desc()).all()

    result = []
    for r in rows:
        kb  = db.get(Kernel, r.kernel_before_id)
        ka  = db.get(Kernel, r.kernel_after_id)
        sys = db.get(System,  r.system_id)
        result.append({
            "id":            r.id,
            "workload":      r.workload,
            "metric_name":   r.metric_name,
            "system_name":   sys.name   if sys else "unknown",
            "config_preset": r.config_preset,
            "kernel_before": kb.version if kb  else "unknown",
            "kernel_after":  ka.version if ka  else "unknown",
            "value_before":  r.value_before,
            "value_after":   r.value_after,
            "delta_pct":     r.delta_pct,
            "detected_at":   r.detected_at,
        })
    return result


@router.get("/matrix")
def regression_matrix(
    system_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """
    Returns a heatmap-ready matrix:
      rows    = workload/metric combinations
      columns = kernel transitions  (e.g. "6.1→6.6")
      values  = delta_pct  (positive = regression, negative = improvement)
    """
    q = db.query(Regression)
    if system_id:
        q = q.filter(Regression.system_id == system_id)

    regressions = q.all()
    if not regressions:
        return {"rows": [], "columns": [], "matrix": []}

    # Collect unique rows and columns
    row_keys = sorted({f"{r.workload} / {r.metric_name}" for r in regressions})

    col_info: dict = {}
    for r in regressions:
        kb = db.get(Kernel, r.kernel_before_id)
        ka = db.get(Kernel, r.kernel_after_id)
        if kb and ka:
            label = f"{kb.version} → {ka.version}"
            col_info[label] = r.kernel_before_id   # for sort order

    col_labels = sorted(col_info.keys(), key=lambda c: col_info[c])

    # Build value lookup
    lookup: dict = {}
    for r in regressions:
        kb = db.get(Kernel, r.kernel_before_id)
        ka = db.get(Kernel, r.kernel_after_id)
        if kb and ka:
            col = f"{kb.version} → {ka.version}"
            row = f"{r.workload} / {r.metric_name}"
            lookup[(row, col)] = r.delta_pct

    matrix = [
        [lookup.get((row, col)) for col in col_labels]
        for row in row_keys
    ]

    return {"rows": row_keys, "columns": col_labels, "matrix": matrix}
