import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google import genai

from models import (
    AnalyzeRequest,
    ExpandFactRequest,
    GraphResponse,
    NodeAnalysisRequest,
    NodeAnalysisResponse,
)
from prompts import EXPAND_FACT_PROMPT, GRAPH_PROMPT, NODE_ANALYSIS_PROMPT

load_dotenv()

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


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


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


def extract_json(text: str) -> dict:
    """Parse JSON from model output; strip markdown fences if present."""
    text = text.strip()
    fence = re.match(r"^```(?:json)?\s*\n([\s\S]*?)\n```\s*$", text)
    if fence:
        text = fence.group(1).strip()
    return json.loads(text)


def _generate(prompt: str):
    return get_client().models.generate_content(
        model=MODEL_NAME,
        contents=prompt,
    )

def get_AI_response(prompt):
    response = _generate(prompt)
    raw = _response_text(response)
    with open("./test_response.txt", "w") as f:
        f.write(raw)
    return raw

def get_mock_response():
    with open("./test_response.txt", "r") as f:
        raw = f.read()
    return raw


@app.post("/api/analyze", response_model=GraphResponse)
async def analyze(req: AnalyzeRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Empty text")
    prompt = GRAPH_PROMPT.format(text=req.text)
    try:
        raw = get_mock_response()
        #raw = get_AI_response(prompt)
        print(raw)

        if not raw:
            raise ValueError("Empty model response")
        data = extract_json(raw)
        return GraphResponse(**data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/expand-fact", response_model=GraphResponse)
async def expand_fact(req: ExpandFactRequest):
    if not req.fact_text.strip():
        raise HTTPException(status_code=400, detail="Empty fact text")
    prompt = EXPAND_FACT_PROMPT.format(
        parent_node_id=req.parent_node_id,
        parent_type=req.parent_type,
        parent_label=req.parent_label,
        parent_detail=req.parent_detail,
        fact_kind=req.fact_kind,
        fact_text=req.fact_text,
        original_text=req.original_text,
    )
    try:
        response = _generate(prompt)
        raw = _response_text(response)
        if not raw:
            raise ValueError("Empty model response")
        data = extract_json(raw)
        return GraphResponse(**data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/analyze-node", response_model=NodeAnalysisResponse)
async def analyze_node(req: NodeAnalysisRequest):
    prompt = NODE_ANALYSIS_PROMPT.format(
        type=req.type,
        label=req.label,
        detail=req.detail,
        context=req.context,
    )
    try:
        response = _generate(prompt)
        raw = _response_text(response)
        if not raw:
            raise ValueError("Empty model response")
        data = extract_json(raw)
        return NodeAnalysisResponse(**data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
