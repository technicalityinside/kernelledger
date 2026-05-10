from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import engine
from models import Base
from routers import compare, kernels, regressions, runs, systems


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="Garuda Performance Portal",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(systems.router,     prefix="/api")
app.include_router(kernels.router,     prefix="/api")
app.include_router(runs.router,        prefix="/api")
app.include_router(compare.router,     prefix="/api")
app.include_router(regressions.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
