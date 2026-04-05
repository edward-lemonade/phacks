import json
import os
import re
from typing import Optional

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
from prompts import (
    COUNTERARGUMENT_EXPAND_REPAIR_PROMPT,
    ENRICH_EXPAND_NODES_PROMPT,
    EXPAND_FACT_PROMPT,
    GRAPH_PROMPT,
    NODE_ANALYSIS_PROMPT,
)

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


def _enrich_expand_nodes_if_needed(data: dict, req: ExpandFactRequest) -> None:
    """Second LLM pass when expand output omits analysis fields needed for further 'Add' actions."""
    nodes = data.get("nodes")
    if not isinstance(nodes, list) or not nodes:
        return
    need_payload = []
    for n in nodes:
        if not isinstance(n, dict) or not n.get("id"):
            continue
        ca = n.get("counterarguments")
        if not isinstance(ca, list):
            ca = []
        us = n.get("further_supports")
        if not isinstance(us, list):
            us = []
        sr = str(n.get("strength_reasoning") or "").strip()
        if len(ca) >= 2 and len(us) >= 1 and sr:
            continue
        need_payload.append(
            {
                "id": n["id"],
                "type": n.get("type", "subclaim"),
                "label": str(n.get("label", "")),
                "detail": str(n.get("detail", "")),
                "strength": str(n.get("strength", "weak")),
            }
        )
    if not need_payload:
        return
    prompt = ENRICH_EXPAND_NODES_PROMPT.format(
        original_text=req.original_text[:16000],
        fact_kind=req.fact_kind,
        fact_text=req.fact_text[:8000],
        parent_node_id=req.parent_node_id,
        parent_type=req.parent_type,
        parent_label=req.parent_label[:2000],
        nodes_json=json.dumps(need_payload, ensure_ascii=False),
    )
    response = _generate(prompt)
    raw = _response_text(response)
    if not raw:
        return
    patch = extract_json(raw)
    if not isinstance(patch, dict):
        return
    by_id = {
        str(n["id"]): n
        for n in nodes
        if isinstance(n, dict) and n.get("id") is not None
    }
    for nid, fields in patch.items():
        nid_s = str(nid)
        if nid_s not in by_id or not isinstance(fields, dict):
            continue
        target = by_id[nid_s]
        ca = fields.get("counterarguments")
        if isinstance(ca, list):
            cleaned = [str(x).strip() for x in ca if str(x).strip()]
            if len(cleaned) >= 2:
                target["counterarguments"] = cleaned[:3]
        us = fields.get("further_supports")
        if isinstance(us, list):
            cleaned = [str(x).strip() for x in us if str(x).strip()]
            if len(cleaned) >= 1:
                target["further_supports"] = cleaned[:3]
        sr = fields.get("strength_reasoning")
        if isinstance(sr, str) and sr.strip():
            target["strength_reasoning"] = sr.strip()


COUNTERARGUMENT_CHILD_TYPES = frozenset({"evidence", "subclaim", "axiom"})


def _validate_counterargument_expand(data: dict, parent_id: str) -> Optional[str]:
    """Return an error message if counterargument expansion does not match required topology."""
    nodes = data.get("nodes")
    edges = data.get("edges")
    if not isinstance(nodes, list) or not nodes:
        return "response must include a non-empty nodes array"
    if not isinstance(edges, list):
        return "response must include an edges array"

    cc_ids = [
        n["id"]
        for n in nodes
        if isinstance(n, dict) and n.get("type") == "counterclaim"
    ]
    if len(cc_ids) != 1:
        return "must include exactly one counterclaim node"
    cc_id = cc_ids[0]

    cc_to_parent = [
        e
        for e in edges
        if isinstance(e, dict)
        and e.get("source") == cc_id
        and e.get("target") == parent_id
        and e.get("relation") == "contradicts"
    ]
    if len(cc_to_parent) != 1:
        return "counterclaim must have exactly one edge to the parent with relation contradicts"

    for e in edges:
        if not isinstance(e, dict):
            continue
        if e.get("target") == parent_id and e.get("source") != cc_id:
            return "only the counterclaim may link to the parent node"

    children = [n for n in nodes if isinstance(n, dict) and n.get("id") != cc_id]
    if len(children) < 1:
        return "must include at least one evidence, subclaim, or axiom node linked to the counterclaim"

    for n in children:
        nid = n.get("id")
        t = (n.get("type") or "").lower()
        if t not in COUNTERARGUMENT_CHILD_TYPES:
            return f"node {nid!r} must be type evidence, subclaim, or axiom (got {t!r})"
        linked = False
        for e in edges:
            if not isinstance(e, dict):
                continue
            if (
                e.get("source") == nid
                and e.get("target") == cc_id
                and e.get("relation") == "supports"
            ):
                linked = True
                break
        if not linked:
            return f"node {nid!r} must link to the counterclaim with supports"

    for e in edges:
        if not isinstance(e, dict):
            continue
        if e.get("source") == cc_id and e.get("target") != parent_id:
            return "counterclaim must only link to the parent in this fragment"

    return None


def _ensure_expand_node_analysis(nodes: list) -> None:
    """Guarantee minimum analysis fields so the client can always offer further expansion."""
    for n in nodes:
        if not isinstance(n, dict):
            continue
        label = str(n.get("label", "this claim")).strip() or "this claim"
        short = label[:80]

        ca = n.get("counterarguments")
        if not isinstance(ca, list):
            ca = []
        ca = [str(x).strip() for x in ca if str(x).strip()]
        if len(ca) < 2:
            ca.append(f"What evidence or reasoning could challenge “{short}”?")
        if len(ca) < 2:
            ca.append("Could a reader reasonably reject this claim on other grounds?")
        n["counterarguments"] = ca[:3]

        us = n.get("further_supports")
        if not isinstance(us, list):
            us = []
        us = [str(x).strip() for x in us if str(x).strip()]
        if len(us) < 1:
            us.append(
                f"What support, data, or clarification would make “{short}” more compelling?"
            )
        n["further_supports"] = us[:3]

        if not str(n.get("strength_reasoning") or "").strip():
            n["strength_reasoning"] = (
                "The strength label reflects how well this claim is supported in the given context."
            )


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
        #raw = get_mock_response()
        raw = get_AI_response(prompt)
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
        fk = (req.fact_kind or "").strip().lower()
        if fk == "counterargument":
            v_err = _validate_counterargument_expand(data, req.parent_node_id)
            if v_err:
                repair = COUNTERARGUMENT_EXPAND_REPAIR_PROMPT.format(
                    validation_error=v_err,
                    parent_node_id=req.parent_node_id,
                    fact_text=req.fact_text[:8000],
                    original_text=req.original_text[:16000],
                ) + json.dumps(data, ensure_ascii=False)
                response2 = _generate(repair)
                raw2 = _response_text(response2)
                if not raw2:
                    raise ValueError("Empty repair model response")
                data = extract_json(raw2)
                v_err2 = _validate_counterargument_expand(
                    data, req.parent_node_id
                )
                if v_err2:
                    raise HTTPException(
                        status_code=422,
                        detail=f"Counterargument expand shape invalid: {v_err2}",
                    )
        try:
            _enrich_expand_nodes_if_needed(data, req)
        except Exception as ex:
            print("expand enrich:", ex)
        nodes = data.get("nodes")
        if isinstance(nodes, list):
            _ensure_expand_node_analysis(nodes)
        return GraphResponse(**data)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/analyze-node", response_model=NodeAnalysisResponse)
async def analyze_node(req: NodeAnalysisRequest):
    prompt = NODE_ANALYSIS_PROMPT.format(
        node_type=req.type,
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
