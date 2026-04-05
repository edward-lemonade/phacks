from pathlib import Path

_DIR = Path(__file__).parent


def _load(name: str) -> str:
    return (_DIR / name).read_text(encoding="utf-8")


_SCHEMA = _load("context.txt")


def _with_schema(name: str) -> str:
    return _load(name) + "\n" + _SCHEMA


GRAPH_PROMPT = _with_schema("graph.txt")
EXPAND_FACT_PROMPT = _with_schema("expand_fact.txt")
ENRICH_EXPAND_NODES_PROMPT = _with_schema("enrich_expand_nodes.txt")
COUNTERARGUMENT_EXPAND_REPAIR_PROMPT = _load("counterargument_expand_repair.txt")
USER_FACT_PROMPT = _with_schema("user_fact.txt")