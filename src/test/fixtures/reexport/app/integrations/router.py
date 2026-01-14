from fastapi import APIRouter

router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.get("/github")
def github_integration():
    return {"provider": "github", "status": "connected"}


@router.get("/slack")
def slack_integration():
    return {"provider": "slack", "status": "connected"}


@router.post("/webhook")
def webhook():
    return {"received": True}
