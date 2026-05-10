from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


# ── System ────────────────────────────────────────────────────────────────────

class SystemIn(BaseModel):
    name:           str
    cpu_model:      Optional[str] = None
    arch:           Optional[str] = None
    memory_gb:      Optional[int] = None
    numa_nodes:     Optional[int] = 1
    cloud_provider: Optional[str] = None
    instance_type:  Optional[str] = None
    extra:          Dict[str, Any] = {}

class SystemOut(SystemIn):
    id: int
    model_config = {"from_attributes": True}


# ── Kernel ────────────────────────────────────────────────────────────────────

class KernelIn(BaseModel):
    version:     str
    config_name: str = "unknown"
    config_sha:  Optional[str] = None
    extra:       Dict[str, Any] = {}

class KernelOut(KernelIn):
    id: int
    model_config = {"from_attributes": True}


# ── Results / push ────────────────────────────────────────────────────────────

class ResultIn(BaseModel):
    metric_name: str
    value:       float
    iteration:   int = 0


class PushPayload(BaseModel):
    system:        SystemIn
    kernel:        KernelIn
    workload:      str
    config_preset: Optional[str] = None
    workload_args: Dict[str, Any] = {}
    ran_at:        Optional[datetime] = None
    run_by:        Optional[str] = None
    results:       List[ResultIn]


class PushResponse(BaseModel):
    run_id:    int
    system_id: int
    kernel_id: int
