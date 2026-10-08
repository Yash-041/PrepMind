import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from lib.db import client, db, ensure_indexes  # noqa: E402
from routers.chats import router as chats_router  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.index_task = asyncio.create_task(ensure_indexes())
    yield
    client.close()


app = FastAPI(title="PrepMind AI API", lifespan=lifespan)
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "PrepMind AI API", "status": "ready"}


api_router.include_router(chats_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")