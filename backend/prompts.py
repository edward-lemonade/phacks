GRAPH_PROMPT = """
You are an argument analysis engine. Given the following text, extract the argument structure as a directed graph.
For EVERY node, also provide critical analysis used for UI (not as separate graph nodes).

Return ONLY valid JSON. No explanation, no markdown, no code fences.

Node types:
- "thesis": the central/root claim
- "subclaim": a claim that supports the thesis or another subclaim
- "evidence": a fact, statistic, or cited data point
- "warrant": the logical bridge explaining why evidence supports a claim
- "rebuttal": a counterargument or objection raised in the text
- "axiom": an assumed truth or unstated premise
- "fallacy": a detected logical error

Edge relations:
- "supports": source supports target
- "contradicts": source contradicts target
- "qualifies": source limits or nuances target
- "assumes": source is an assumed premise of target
- "contains_fallacy": source contains a logical error relevant to target

Rules:
- Edges point FROM supporting node TO the node it supports (child → parent)
- There must be exactly one "thesis" node
- Assign strength (0.0–1.0) based on how well-supported the claim is in the text
- Keep labels short (max 8 words)
- Detail should be the relevant excerpt or a concise paraphrase

Per-node analysis (same array as nodes, keyed by id — include these fields on each node object):
- counterarguments: 2–3 short strings — plausible objections or attacks someone could raise against THIS node (not in the graph as nodes)
- unacknowledged_strengths: 1–3 short strings — ways the claim could be stronger or evidence/premises the text does not mention but would help
- fallacies: logical issues in THIS node's wording or reasoning (empty list if none)
- strength_score: float 0.0–1.0 — epistemic quality / defensibility of this claim
- strength_reasoning: one sentence explaining strength_score

TEXT:
{text}

Return this exact JSON shape (example structure; fill every node with all fields):
{{
  "nodes": [
    {{
      "id": "n1",
      "type": "thesis",
      "label": "...",
      "detail": "...",
      "strength": 0.9,
      "counterarguments": ["...", "..."],
      "unacknowledged_strengths": ["..."],
      "fallacies": [],
      "strength_score": 0.85,
      "strength_reasoning": "..."
    }}
  ],
  "edges": [
    {{"id": "e1", "source": "n2", "target": "n1", "relation": "supports"}}
  ]
}}
"""

NODE_ANALYSIS_PROMPT = """
You are a critical thinking assistant. Analyze the following argument node.

Node type: {type}
Label: {label}
Full text: {detail}

Original text context:
{context}

Return ONLY valid JSON with this exact shape:
{{
  "counterarguments": ["...", "..."],
  "fallacies": ["..." ],
  "strength_score": 0.0,
  "strength_reasoning": "..."
}}

- counterarguments: 2–3 specific arguments someone could make against this node
- fallacies: list any logical fallacies present (empty list if none)
- strength_score: float 0.0–1.0
- strength_reasoning: one sentence explaining the score
"""

EXPAND_FACT_PROMPT = """
You expand one analytical point (a counterargument or an unacknowledged strength) into a small argument subgraph
that will be merged into an existing map. The user clicked "Add" on this point to grow the graph.

Parent node id (must appear as target in edges from new nodes): {parent_node_id}
Parent node type: {parent_type}
Parent label: {parent_label}
Parent detail: {parent_detail}

Kind of fact: {fact_kind}
Fact text to expand: {fact_text}

Original passage for context:
{original_text}

Return ONLY valid JSON. No markdown, no code fences.

Create 1–3 NEW nodes only (use new ids like "x1", "x2", not existing ids). Types: subclaim, rebuttal, evidence, or warrant as fits.
Each new node must include the same shape as in graph extraction, including empty analysis lists and neutral strength fields if needed:
- counterarguments, unacknowledged_strengths, fallacies (arrays), strength_score, strength_reasoning, strength, label, detail, type, id

Edges: point FROM each new child TO the parent node id above (child → parent). Use relation "contradicts" or "qualifies" for counterargument-style facts; "supports" for unacknowledged strength facts when the new material supports the parent.

Shape:
{{
  "nodes": [...],
  "edges": [
    {{"id": "xe1", "source": "x1", "target": "{parent_node_id}", "relation": "contradicts"}}
  ]
}}
"""
