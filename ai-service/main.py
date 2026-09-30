import re
from difflib import SequenceMatcher

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="Campus Loop Match Service", version="1.0.0")


class MatchRequest(BaseModel):
    lost_text: str = Field(max_length=4000)
    found_text: str = Field(max_length=4000)


def normalize(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.casefold()))


def similarity(lost_text: str, found_text: str) -> float:
    lost = normalize(lost_text)
    found = normalize(found_text)
    if not lost or not found:
        return 0.0

    sequence_score = SequenceMatcher(None, lost, found).ratio()
    lost_words = set(lost.split())
    found_words = set(found.split())
    token_score = len(lost_words & found_words) / len(lost_words | found_words)
    return round((sequence_score * 0.7 + token_score * 0.3) * 100, 1)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/match-score")
def match_score(request: MatchRequest) -> dict[str, float | bool]:
    score = similarity(request.lost_text, request.found_text)
    return {"similarity_score": score, "is_match": score > 65}