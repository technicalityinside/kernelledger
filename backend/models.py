from datetime import datetime

from sqlalchemy import (
    Column, DateTime, Float, ForeignKey, Integer, JSON, String, UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class System(Base):
    __tablename__ = "systems"

    id            = Column(Integer, primary_key=True, index=True)
    name          = Column(String, unique=True, nullable=False, index=True)
    cpu_model     = Column(String)
    arch          = Column(String)
    memory_gb     = Column(Integer)
    numa_nodes    = Column(Integer, default=1)
    cloud_provider = Column(String)
    instance_type = Column(String)
    extra         = Column(JSON, default=dict)

    runs        = relationship("Run", back_populates="system")
    regressions = relationship("Regression", foreign_keys="Regression.system_id", back_populates="system")


class Kernel(Base):
    __tablename__ = "kernels"
    __table_args__ = (
        UniqueConstraint("version", "config_name", name="uq_kernel_version_config"),
    )

    id          = Column(Integer, primary_key=True, index=True)
    version     = Column(String, nullable=False, index=True)
    config_name = Column(String, nullable=False, default="unknown")
    config_sha  = Column(String)
    extra       = Column(JSON, default=dict)

    runs = relationship("Run", back_populates="kernel")


class Run(Base):
    __tablename__ = "runs"

    id            = Column(Integer, primary_key=True, index=True)
    system_id     = Column(Integer, ForeignKey("systems.id"), nullable=False)
    kernel_id     = Column(Integer, ForeignKey("kernels.id"), nullable=False)
    workload      = Column(String, nullable=False, index=True)
    config_preset = Column(String)
    workload_args = Column(JSON, default=dict)
    ran_at        = Column(DateTime, default=datetime.utcnow)
    run_by        = Column(String)

    system  = relationship("System", back_populates="runs")
    kernel  = relationship("Kernel", back_populates="runs")
    results = relationship("Result", back_populates="run", cascade="all, delete-orphan")


class Result(Base):
    __tablename__ = "results"

    id          = Column(Integer, primary_key=True, index=True)
    run_id      = Column(Integer, ForeignKey("runs.id"), nullable=False)
    metric_name = Column(String, nullable=False, index=True)
    value       = Column(Float, nullable=False)
    iteration   = Column(Integer, default=0)

    run = relationship("Run", back_populates="results")


class Regression(Base):
    __tablename__ = "regressions"

    id               = Column(Integer, primary_key=True, index=True)
    workload         = Column(String, nullable=False, index=True)
    metric_name      = Column(String, nullable=False)
    system_id        = Column(Integer, ForeignKey("systems.id"))
    config_preset    = Column(String)
    kernel_before_id = Column(Integer, ForeignKey("kernels.id"))
    kernel_after_id  = Column(Integer, ForeignKey("kernels.id"))
    value_before     = Column(Float)
    value_after      = Column(Float)
    delta_pct        = Column(Float)
    detected_at      = Column(DateTime, default=datetime.utcnow)

    system = relationship("System", foreign_keys=[system_id], back_populates="regressions")
