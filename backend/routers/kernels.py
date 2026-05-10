from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import Kernel
from schemas import KernelOut

router = APIRouter(prefix="/kernels", tags=["kernels"])


@router.get("", response_model=list[KernelOut])
def list_kernels(db: Session = Depends(get_db)):
    return db.query(Kernel).order_by(Kernel.id).all()
