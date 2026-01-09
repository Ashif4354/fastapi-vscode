from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def list_users():
    return []


@router.get("/{user_id}")
def get_user(user_id: int):
    return {"id": user_id}


@router.post("/")
def create_user():
    return {"id": 1}


@router.put("/{user_id}")
def update_user(user_id: int):
    return {"id": user_id}


@router.delete("/{user_id}")
def delete_user(user_id: int):
    return {"deleted": True}
