from fastapi import FastAPI

from routes import router

app = FastAPI(title="Flat Layout")

app.include_router(router)


@app.get("/")
def root():
    return {"message": "Hello from flat layout"}
