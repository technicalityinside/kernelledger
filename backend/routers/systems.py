from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import System
from schemas import SystemIn, SystemOut

router = APIRouter(prefix="/systems", tags=["systems"])


@router.get("", response_model=list[SystemOut])
def list_systems(db: Session = Depends(get_db)):
    return db.query(System).order_by(System.name).all()


@router.get("/{system_id}", response_model=SystemOut)
def get_system(system_id: int, db: Session = Depends(get_db)):
    return db.get(System, system_id)
