import os
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Wafilife AI service")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "nomic-embed-text")


class EmbedRequest(BaseModel):
    texts: list[str]


class RecommendRequest(BaseModel):
    query: str
    candidates: list[dict[str, Any]]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ai"}


@app.post("/embeddings")
async def embeddings(request: EmbedRequest) -> dict[str, Any]:
    """Keep Ollama behind one small boundary so the API can swap providers later."""
    vectors = []
    async with httpx.AsyncClient(timeout=60) as client:
        for text in request.texts:
            response = await client.post(
                f"{OLLAMA_BASE_URL}/api/embeddings",
                json={"model": OLLAMA_MODEL, "prompt": text},
            )
            if response.is_error:
                raise HTTPException(status_code=502, detail="Embedding provider unavailable")
            vectors.append(response.json().get("embedding", []))
    return {"model": OLLAMA_MODEL, "embeddings": vectors}


@app.post("/recommend")
def recommend(request: RecommendRequest) -> dict[str, Any]:
    """Placeholder contract for Chroma-backed ranking; ranking remains API-owned."""
    query_terms = set(request.query.lower().split())
    ranked = sorted(
        request.candidates,
        key=lambda candidate: sum(
            term in str(candidate.get(field, "")).lower()
            for term in query_terms
            for field in ("name", "author", "publisher", "subject")
        ),
        reverse=True,
    )
    return {"books": ranked[:6]}
