from fastapi import FastAPI
from app.api.main import api_router

app = FastAPI(title="Test API")

app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
def health_check():
    return {"status": "ok"}
