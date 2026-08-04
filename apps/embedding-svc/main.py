"""
Self-hosted embedding microservice (docs/rag-chatbot-plan.md §3).

CPU-only, multilingual (including Burmese) embeddings for apps/chatbot's RAG pipeline,
using intfloat/multilingual-e5-small so the company avoids per-call embedding API costs
and Pinecone (the vector store itself is Postgres+pgvector, written by the Node side).
"""

import os

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

MODEL_NAME = os.environ.get("EMBEDDING_MODEL", "intfloat/multilingual-e5-small")
SHARED_SECRET = os.environ.get("EMBEDDING_SERVICE_SECRET")
MAX_BATCH_SIZE = int(os.environ.get("EMBEDDING_MAX_BATCH_SIZE", "128"))

app = FastAPI(title="chatbot-embedding-svc")
model = SentenceTransformer(MODEL_NAME, device="cpu")


class EmbedRequest(BaseModel):
    texts: list[str]
    type: str = "passage"  # "query" or "passage" — see the E5 model card


class EmbedResponse(BaseModel):
    vectors: list[list[float]]
    model: str
    dimensions: int


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_NAME}


@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest, x_embedding_secret: str | None = Header(default=None)):
    if SHARED_SECRET and x_embedding_secret != SHARED_SECRET:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Embedding-Secret header")

    if not req.texts:
        return EmbedResponse(vectors=[], model=MODEL_NAME, dimensions=model.get_sentence_embedding_dimension())

    if len(req.texts) > MAX_BATCH_SIZE:
        raise HTTPException(status_code=400, detail=f"Batch of {len(req.texts)} exceeds max {MAX_BATCH_SIZE} — split the request")

    if req.type not in ("query", "passage"):
        raise HTTPException(status_code=400, detail="type must be 'query' or 'passage'")

    # multilingual-e5 models expect this prefix convention for good retrieval quality —
    # dropping it noticeably hurts results, it's not just cosmetic.
    prefixed = [f"{req.type}: {t}" for t in req.texts]

    vectors = model.encode(prefixed, normalize_embeddings=True, convert_to_numpy=True)

    return EmbedResponse(
        vectors=vectors.tolist(),
        model=MODEL_NAME,
        dimensions=model.get_sentence_embedding_dimension()
    )
