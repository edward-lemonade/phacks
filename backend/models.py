from pydantic import BaseModel, Field
from typing import List


class Node(BaseModel):
    id: str
    type: str  # thesis | subclaim | evidence | warrant | rebuttal | axiom | fallacy
    label: str
    detail: str
    strength: float
    # Populated by the same /analyze call (not separate graph nodes)
    counterarguments: List[str] = Field(default_factory=list)
    unacknowledged_strengths: List[str] = Field(default_factory=list)
    fallacies: List[str] = Field(default_factory=list)
    strength_score: float = 0.0
    strength_reasoning: str = ""


class Edge(BaseModel):
    id: str
    source: str
    target: str
    relation: str  # supports | contradicts | qualifies | assumes | contains_fallacy


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
    counterarguments: List[str]
    fallacies: List[str]
    strength_score: float
    strength_reasoning: str


class ExpandFactRequest(BaseModel):
    parent_node_id: str
    fact_kind: str  # counterargument | unacknowledged_strength
    fact_text: str
    original_text: str
    parent_label: str
    parent_detail: str
    parent_type: str
