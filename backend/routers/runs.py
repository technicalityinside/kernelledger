from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import Kernel, Result, Run, System
from regression import detect_regressions
from schemas import PushPayload, PushResponse

router = APIRouter(prefix="/runs", tags=["runs"])


@router.post("", response_model=PushResponse, status_code=201)
def push_run(payload: PushPayload, db: Session = Depends(get_db)):
    # Upsert system (match on name)
    system = db.query(System).filter(System.name == payload.system.name).first()
    if not system:
        system = System(**payload.system.model_dump())
        db.add(system)
    else:
        for k, v in payload.system.model_dump().items():
            setattr(system, k, v)
    db.flush()

    # Upsert kernel (match on version + config_name)
    kernel = (
        db.query(Kernel)
        .filter(
            Kernel.version     == payload.kernel.version,
            Kernel.config_name == payload.kernel.config_name,
        )
        .first()
    )
    if not kernel:
        kernel = Kernel(**payload.kernel.model_dump())
        db.add(kernel)
    db.flush()

    # Create run
    run = Run(
        system_id     = system.id,
        kernel_id     = kernel.id,
        workload      = payload.workload,
        config_preset = payload.config_preset,
        workload_args = payload.workload_args,
        ran_at        = payload.ran_at or datetime.utcnow(),
        run_by        = payload.run_by,
    )
    db.add(run)
    db.flush()

    for r in payload.results:
        db.add(Result(
            run_id      = run.id,
            metric_name = r.metric_name,
            value       = r.value,
            iteration   = r.iteration,
        ))

    db.commit()

    detect_regressions(db, system.id, payload.workload, payload.config_preset)

    return PushResponse(run_id=run.id, system_id=system.id, kernel_id=kernel.id)


@router.get("")
def list_runs(
    workload:  Optional[str] = None,
    system_id: Optional[int] = None,
    kernel_id: Optional[int] = None,
    limit:     int = 100,
    db: Session = Depends(get_db),
):
    q = db.query(Run)
    if workload:
        q = q.filter(Run.workload == workload)
    if system_id:
        q = q.filter(Run.system_id == system_id)
    if kernel_id:
        q = q.filter(Run.kernel_id == kernel_id)
    runs = q.order_by(Run.ran_at.desc()).limit(limit).all()
    return [
        {
            "id":            r.id,
            "workload":      r.workload,
            "config_preset": r.config_preset,
            "system":        r.system.name,
            "kernel":        r.kernel.version,
            "ran_at":        r.ran_at,
        }
        for r in runs
    ]
