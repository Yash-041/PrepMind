from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.lib.config import settings
from backend.lib.db import init_db, SessionLocal
from backend.services.llm import default_model, model_available
from backend.services.seed_bank import seed_initial_data
from backend.routers import auth, chats, daily_practice, exams, progress


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with SessionLocal() as db:
        seed_initial_data(db)
    yield


app = FastAPI(
    title="PrepMind AI Backend API",
    version="1.0.0",
    description="JEE Main & JEE Advanced AI Preparation Platform with LangGraph RAG, Daily 20, and Exam Simulator.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(chats.router)
app.include_router(daily_practice.router)
app.include_router(exams.router)
app.include_router(progress.router)


@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "llm_provider": settings.LLM_PROVIDER,
        "default_chat_model": default_model(),
        "demo_fallback_active": not model_available(),
    }