from fastapi import FastAPI

# Import from namespace package (no __init__.py in namespace_routes)
from .namespace_routes import items, users

app = FastAPI(title="Namespace Package Layout")

app.include_router(users.router)
app.include_router(items.router)


@app.get("/")
def root():
    return {"message": "Hello from namespace package layout"}
