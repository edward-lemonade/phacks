import os

from fastapi import HTTPException
from google import genai

MODEL_NAME = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
_client = None


def get_client():
    global _client
    if _client is not None:
        return _client
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY is not set. Add it to backend/.env",
        )
    _client = genai.Client(api_key=api_key)
    return _client

def run(prompt):
    return _response_text(_generate(prompt))

def _response_text(resp) -> str:
    try:
        t = getattr(resp, "text", None)
        if t:
            return t.strip()
    except Exception:
        pass
    parts = []
    for c in getattr(resp, "candidates", []) or []:
        content = getattr(c, "content", None)
        if content and getattr(content, "parts", None):
            for p in content.parts:
                if getattr(p, "text", None):
                    parts.append(p.text)
    return "\n".join(parts).strip()

def _generate(prompt: str):
    return get_client().models.generate_content(
        model=MODEL_NAME,
        contents=prompt,
    )