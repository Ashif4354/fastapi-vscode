from fastapi import APIRouter

router = APIRouter(tags=["items"])


@router.get("/")
def list_items():
    return []


@router.get("/{item_id}")
def get_item(item_id: int):
    return {"id": item_id}


@router.post("/")
def create_item():
    return {"id": 1}
