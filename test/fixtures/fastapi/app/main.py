from fastapi import FastAPI

app = FastAPI()


@app.get("/health", status_code=200)
def health():
    return {"ok": True}
