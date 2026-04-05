import json
import os
import re
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from client import run
from models import (
    AnalyzeRequest,
    ExpandFactRequest,
    GraphResponse,
    UserFactRequest,
)
from parser import parse_enrich_response, parse_graph_response, parse_node_analysis
from prompts import (
    COUNTERARGUMENT_EXPAND_REPAIR_PROMPT,
    ENRICH_EXPAND_NODES_PROMPT,
    EXPAND_FACT_PROMPT,
    GRAPH_PROMPT,
    USER_FACT_PROMPT,
)

load_dotenv()
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

# -- Config ---------------------------------------

MOCK_ANALYSIS = True

# -- Helpers ---------------------------------------

COUNTERARGUMENT_CHILD_TYPES = frozenset({"evidence", "subclaim", "axiom"})
def _validate_counterargument_expand(data: dict, parent_id: str) -> Optional[str]:
    nodes = data.get("nodes")
    edges = data.get("edges")
    if not isinstance(nodes, list) or not nodes:
        return "response must include a non-empty nodes array"
    if not isinstance(edges, list):
        return "response must include an edges array"

    cc_ids = [n["id"] for n in nodes if isinstance(n, dict) and n.get("type") == "counterclaim"]
    if len(cc_ids) != 1:
        return "must include exactly one counterclaim node"
    cc_id = cc_ids[0]

    cc_to_parent = [
        e for e in edges
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
        linked = any(
            isinstance(e, dict)
            and e.get("source") == nid
            and e.get("target") == cc_id
            and e.get("relation") == "supports"
            for e in edges
        )
        if not linked:
            return f"node {nid!r} must link to the counterclaim with supports"

    for e in edges:
        if not isinstance(e, dict):
            continue
        if e.get("source") == cc_id and e.get("target") != parent_id:
            return "counterclaim must only link to the parent in this fragment"

    return None

def _enrich_expand_nodes_if_needed(data: dict, req) -> None:
    nodes = data.get("nodes")
    if not isinstance(nodes, list) or not nodes:
        return

    need_payload = []
    for n in nodes:
        if not isinstance(n, dict) or not n.get("id"):
            continue
        ca = n.get("counterarguments") or []
        us = n.get("further_supports") or []
        sr = str(n.get("strength_reasoning") or "").strip()
        if len(ca) >= 2 and len(us) >= 1 and sr:
            continue
        need_payload.append({
            "id": n["id"],
            "type": n.get("type", "subclaim"),
            "label": str(n.get("label", "")),
            "detail": str(n.get("detail", "")),
            "strength": str(n.get("strength", "weak")),
        })

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
    raw = _response_text(_generate(prompt))
    if not raw:
        return

    patch = parse_enrich_response(raw)
    by_id = {str(n["id"]): n for n in nodes if isinstance(n, dict) and n.get("id")}

    for nid, fields in patch.items():
        target = by_id.get(str(nid))
        if not target or not isinstance(fields, dict):
            continue
        ca = fields.get("counterarguments")
        if isinstance(ca, list):
            cleaned = [str(x).strip() for x in ca if str(x).strip()]
            if len(cleaned) >= 2:
                target["counterarguments"] = cleaned[:3]
        us = fields.get("further_supports")
        if isinstance(us, list):
            cleaned = [str(x).strip() for x in us if str(x).strip()]
            if cleaned:
                target["further_supports"] = cleaned[:3]
        sr = fields.get("strength_reasoning")
        if isinstance(sr, str) and sr.strip():
            target["strength_reasoning"] = sr.strip()

def _ensure_expand_node_analysis(nodes: list) -> None:
    for n in nodes:
        if not isinstance(n, dict):
            continue
        label = str(n.get("label", "this claim")).strip() or "this claim"
        short = label[:80]

        ca = [str(x).strip() for x in (n.get("counterarguments") or []) if str(x).strip()]
        if len(ca) < 2:
            ca.append(f'What reasoning could challenge "{short}"?')
        if len(ca) < 2:
            ca.append("Could a reader reasonably reject this claim on other grounds?")
        n["counterarguments"] = ca[:3]

        us = [str(x).strip() for x in (n.get("further_supports") or []) if str(x).strip()]
        if not us:
            us.append(f'What support would make "{short}" more compelling?')
        n["further_supports"] = us[:3]

        if not str(n.get("strength_reasoning") or "").strip():
            n["strength_reasoning"] = (
                "The strength label reflects how well this claim is supported in context."
            )

def _run_expand_pipeline(data: dict, req, fact_kind: str) -> GraphResponse:
    if fact_kind == "counterargument":
        v_err = _validate_counterargument_expand(data, req.parent_node_id)
        if v_err:
            repair_prompt = (
                COUNTERARGUMENT_EXPAND_REPAIR_PROMPT.format(
                    validation_error=v_err,
                    parent_node_id=req.parent_node_id,
                    fact_text=req.fact_text[:8000],
                    original_text=req.original_text[:16000],
                )
                + json.dumps(data, ensure_ascii=False)
            )
            raw2 = run(repair_prompt)
            if not raw2:
                raise ValueError("Empty repair model response")
            data = parse_graph_response(raw2)
            v_err2 = _validate_counterargument_expand(data, req.parent_node_id)
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


# -- Routes --------------------------------------------------------------------

@app.post("/api/analyze", response_model=GraphResponse)
async def analyze(req: AnalyzeRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Empty text")
    try:
        prompt = GRAPH_PROMPT.format(
            text=req.text
        )

        def RUN_MOCK():
            with open("output.txt", "r") as f:
                raw = f.read()
            f.close()
            
            return raw
        def RUN_AI():
            raw = run(prompt)
            with open("output.txt", "w") as f:
                f.write(raw)
            f.close()
            return raw
        
        if (MOCK_ANALYSIS):
            raw = RUN_MOCK()
        else:
            raw = RUN_AI()

        if not raw:
            raise ValueError("Empty model response")
        return GraphResponse(**parse_graph_response(raw))
    except Exception as e:
        print("[Error]", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/expand-fact", response_model=GraphResponse)
async def expand_fact(req: ExpandFactRequest):
    if not req.fact_text.strip():
        raise HTTPException(status_code=400, detail="Empty fact text")
    try:
        prompt = EXPAND_FACT_PROMPT.format(
            parent_node_id=req.parent_node_id,
            parent_type=req.parent_type,
            parent_label=req.parent_label,
            parent_detail=req.parent_detail,
            fact_kind=req.fact_kind,
            fact_text=req.fact_text,
            original_text=req.original_text,
        )
        raw = run(prompt)
        if not raw:
            raise ValueError("Empty model response")
        data = parse_graph_response(raw)
        return _run_expand_pipeline(data, req, req.fact_kind.strip().lower())
    except HTTPException:
        raise
    except Exception as e:
        print("[Error]", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/user-fact", response_model=GraphResponse)
async def user_fact(req: UserFactRequest):
    if not req.fact_text.strip():
        raise HTTPException(status_code=400, detail="Empty fact text")
    try:
        prompt = USER_FACT_PROMPT.format(
            parent_node_id=req.parent_node_id,
            parent_type=req.parent_type,
            parent_label=req.parent_label,
            parent_detail=req.parent_detail,
            fact_kind=req.fact_kind,
            fact_text=req.fact_text,
            original_text=req.original_text,
        )
        raw = run(prompt)
        if not raw:
            raise ValueError("Empty model response")
        data = parse_graph_response(raw)
        return _run_expand_pipeline(data, req, req.fact_kind.strip().lower())
    except HTTPException:
        raise
    except Exception as e:
        print("[Error]", e)
        raise HTTPException(status_code=500, detail=str(e))