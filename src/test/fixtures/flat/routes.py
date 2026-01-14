from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["api"])


@router.get("/users")
def list_users():
    return [{"id": 1, "name": "Alice"}]


@router.get("/items")
def list_items():
    return [{"id": 1, "name": "Widget"}]
