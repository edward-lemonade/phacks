"""
Parse the structured plain-text format returned by the model.

Each record is separated by '---' and starts with NODE, EDGE, or NODE_ANALYSIS.
List fields (counterarguments, further_supports) have items prefixed with '- '.
"""

from typing import Any


def _parse_record(block: str) -> dict[str, Any]:
    """Parse a single record block into a dict."""
    lines = block.strip().splitlines()
    result: dict[str, Any] = {}
    current_list_key: str | None = None

    for line in lines:
        # List item
        if line.startswith("- "):
            if current_list_key:
                result[current_list_key].append(line[2:].strip())
            continue

        # Key: value line
        if ":" in line:
            key, _, value = line.partition(":")
            key = key.strip().lower().replace(" ", "_")
            value = value.strip()

            if value == "":
                # Start of a list field
                result[key] = []
                current_list_key = key
            else:
                current_list_key = None
                result[key] = value
        # else: ignore (record type header line like NODE / EDGE)

    return result


def parse_graph_response(text: str) -> dict:
    """Parse a NODE/EDGE delimited response into {nodes, edges}."""
    nodes = []
    edges = []

    for block in text.split("---"):
        block = block.strip()
        if not block:
            continue

        lines = block.splitlines()
        record_type = lines[0].strip().upper() if lines else ""
        body = "\n".join(lines[1:])
        record = _parse_record(body)

        if record_type == "NODE":
            nodes.append(record)
        elif record_type == "EDGE":
            edges.append(record)

    return {"nodes": nodes, "edges": edges}


def parse_node_analysis(text: str) -> dict:
    """Parse the flat node-analysis format into a dict."""
    return _parse_record(text)


def parse_enrich_response(text: str) -> dict:
    """Parse NODE_ANALYSIS blocks into {node_id: fields} patch dict."""
    patch: dict[str, Any] = {}

    for block in text.split("---"):
        block = block.strip()
        if not block:
            continue

        lines = block.splitlines()
        if not lines or lines[0].strip().upper() != "NODE_ANALYSIS":
            continue

        record = _parse_record("\n".join(lines[1:]))
        node_id = record.pop("id", None)
        if node_id:
            patch[node_id] = record

    return patch