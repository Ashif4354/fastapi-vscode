from fastapi import FastAPI

from app.main import app as sub_app

app = FastAPI(title="Root App")


@app.get("/health")
def health_check():
    return {"status": "ok"}


app.mount("/v1", sub_app)
