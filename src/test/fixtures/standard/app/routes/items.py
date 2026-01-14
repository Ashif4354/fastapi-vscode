from fastapi import APIRouter

router = APIRouter(prefix="/items", tags=["items"])


@router.get("/")
def list_items():
    return [{"id": 1, "name": "Widget"}, {"id": 2, "name": "Gadget"}]


@router.get("/{item_id}")
def get_item(item_id: int):
    return {"id": item_id, "name": "Widget"}
