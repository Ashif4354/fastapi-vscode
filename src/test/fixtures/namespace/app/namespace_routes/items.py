# Note: namespace_routes has NO __init__.py (namespace package)
from fastapi import APIRouter

router = APIRouter(prefix="/items", tags=["items"])


@router.get("/")
def list_items():
    return [{"id": 1, "name": "Widget"}]
