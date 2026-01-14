from fastapi import FastAPI

# Import router that is re-exported from __init__.py
from .integrations import router

app = FastAPI(title="Re-export Layout")

app.include_router(router)


@app.get("/")
def root():
    return {"message": "Hello from re-export layout"}
