from pathlib import Path

_DIR = Path(__file__).parent


def _load(name: str) -> str:
    return (_DIR / name).read_text(encoding="utf-8")


GRAPH_PROMPT = _load("graph.txt")
NODE_ANALYSIS_PROMPT = _load("node_analysis.txt")
EXPAND_FACT_PROMPT = _load("expand_fact.txt")
ENRICH_EXPAND_NODES_PROMPT = _load("enrich_expand_nodes.txt")
COUNTERARGUMENT_EXPAND_REPAIR_PROMPT = _load("counterargument_expand_repair.txt")
