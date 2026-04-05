from typing import Any, List

from pydantic import BaseModel, Field, field_validator, model_validator

STRENGTH_LABELS = frozenset({"true", "strong", "weak", "fallacious", "false"})


def _coerce_strength(v: Any) -> str:
    if v is None:
        return "weak"
    if isinstance(v, (int, float)):
        x = float(v)
        if x >= 0.9:
            return "true"
        if x >= 0.75:
            return "strong"
        if x >= 0.45:
            return "weak"
        if x >= 0.2:
            return "fallacious"
        return "false"
    s = str(v).lower().strip()
    if s in STRENGTH_LABELS:
        return s
    return "weak"


class Node(BaseModel):
    """Graph + embedded analysis. Node types: thesis | subclaim | evidence | axiom | counterclaim."""

    @model_validator(mode="before")
    @classmethod
    def _strip_legacy_node_fields(cls, data: Any):
        if isinstance(data, dict):
            data = dict(data)
            data.pop("fallacies", None)
            if "strength_score" in data and "strength" not in data:
                data["strength"] = data.pop("strength_score")
            else:
                data.pop("strength_score", None)
        return data

    id: str
    type: str
    label: str
    detail: str
    strength: str = "weak"
    counterarguments: List[str] = Field(default_factory=list)
    unacknowledged_strengths: List[str] = Field(default_factory=list)
    strength_reasoning: str = ""

    @field_validator("strength", mode="before")
    @classmethod
    def _normalize_strength(cls, v):
        return _coerce_strength(v)


class Edge(BaseModel):
    id: str
    source: str
    target: str
    relation: str  # supports | contradicts | qualifies | assumes


class GraphResponse(BaseModel):
    nodes: List[Node]
    edges: List[Edge]


class AnalyzeRequest(BaseModel):
    text: str


class NodeAnalysisRequest(BaseModel):
    node_id: str
    label: str
    detail: str
    type: str
    context: str


class NodeAnalysisResponse(BaseModel):
    @model_validator(mode="before")
    @classmethod
    def _strip_legacy_analysis(cls, data: Any):
        if isinstance(data, dict):
            data = dict(data)
            data.pop("fallacies", None)
            if "strength_score" in data and "strength" not in data:
                data["strength"] = data.pop("strength_score")
            else:
                data.pop("strength_score", None)
        return data

    counterarguments: List[str] = Field(default_factory=list)
    strength: str = "weak"
    strength_reasoning: str = ""

    @field_validator("strength", mode="before")
    @classmethod
    def _normalize_strength_analysis(cls, v):
        return _coerce_strength(v)


class ExpandFactRequest(BaseModel):
    parent_node_id: str
    fact_kind: str  # counterargument | unacknowledged_strength
    fact_text: str
    original_text: str
    parent_label: str
    parent_detail: str
    parent_type: str
