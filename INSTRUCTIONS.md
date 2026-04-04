# Argument Map — Cursor Blueprint

## Project Overview
A hackathon-grade argument mapping tool. User pastes text → backend (FastAPI + Gemini) returns structured argument nodes → frontend (React + React Flow) renders a force-directed graph. Nodes are clickable for AI-powered counterargument analysis. Users can also manually add nodes and edges on the canvas.

---

## Stack
| Layer | Choice | Reason |
|-------|--------|--------|
| Frontend | React + Vite | Fast setup, no CRA bloat |
| Graph | React Flow (`reactflow`) | Best-in-class for interactive node graphs; built-in drag, connect, zoom |
| Force layout | `d3-force` (via `@reactflow/d3-force` or manual) | Positions nodes; structured for future top-down toggle |
| Backend | FastAPI (Python) | Minimal, async-ready |
| AI | Google Gemini API (`google-generativeai`) | As specified |
| Styling | Plain CSS (CSS variables) | No Tailwind needed for minimal UI |

---

## Repository Structure

```
argument-map/
├── backend/
│   ├── main.py
│   ├── prompts.py
│   ├── models.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── components/
│   │   │   ├── TextInput.jsx        # Text area + submit button
│   │   │   ├── GraphCanvas.jsx      # React Flow wrapper
│   │   │   ├── ArgumentNode.jsx     # Custom node renderer
│   │   │   └── AnalysisPopup.jsx    # Click popup with AI analysis
│   │   ├── hooks/
│   │   │   └── useForceLayout.js    # d3-force layout logic (isolated for future toggle)
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
└── README.md
```

---

## Data Structures

### Node Types
```ts
type NodeType =
  | "thesis"      // The root/central claim
  | "subclaim"    // A claim that supports the thesis or another subclaim
  | "evidence"    // A fact, statistic, or cited source
  | "warrant"     // The logical bridge explaining WHY evidence supports a claim
  | "rebuttal"    // A counterargument or objection
  | "axiom"       // An assumed truth / unstated premise
  | "fallacy";    // A detected logical error
```

### Backend JSON Response — `/api/analyze`
```json
{
  "nodes": [
    {
      "id": "n1",
      "type": "thesis",
      "label": "Short title of the claim",
      "detail": "Full sentence or excerpt from the original text",
      "strength": 0.85
    },
    {
      "id": "n2",
      "type": "subclaim",
      "label": "...",
      "detail": "...",
      "strength": 0.6
    }
  ],
  "edges": [
    {
      "id": "e1",
      "source": "n2",
      "target": "n1",
      "relation": "supports"
    }
  ]
}
```

**Field notes:**
- `strength` — float 0–1; used to visually encode node opacity/border weight
- `relation` — `"supports"` | `"contradicts"` | `"qualifies"` | `"assumes"` | `"contains_fallacy"`
- Edges always point FROM child TO parent (evidence → claim it supports)

### Node Click — `/api/analyze-node`
Request:
```json
{
  "node_id": "n2",
  "label": "Short title",
  "detail": "Full sentence",
  "type": "subclaim",
  "context": "...full original text for context..."
}
```
Response:
```json
{
  "counterarguments": [
    "This claim assumes X without evidence...",
    "A utilitarian would counter that..."
  ],
  "fallacies": [
    "Possible appeal to authority in the phrasing..."
  ],
  "strength_score": 0.6,
  "strength_reasoning": "The claim is plausible but relies on an unstated premise."
}
```

---

## Backend Implementation

### `requirements.txt`
```
fastapi
uvicorn
google-generativeai
pydantic
python-dotenv
```

### `models.py`
```python
from pydantic import BaseModel
from typing import List, Optional

class Node(BaseModel):
    id: str
    type: str  # thesis | subclaim | evidence | warrant | rebuttal | axiom | fallacy
    label: str
    detail: str
    strength: float

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
```

### `prompts.py`
```python
GRAPH_PROMPT = """
You are an argument analysis engine. Given the following text, extract the argument structure as a directed graph.

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
- Assign strength (0.0–1.0) based on how well-supported the claim is
- Keep labels short (max 8 words)
- Detail should be the relevant excerpt or a concise paraphrase

TEXT:
{text}

Return this exact JSON shape:
{{
  "nodes": [
    {{"id": "n1", "type": "thesis", "label": "...", "detail": "...", "strength": 0.9}}
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
```

### `main.py`
```python
import os
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import google.generativeai as genai

from models import AnalyzeRequest, GraphResponse, NodeAnalysisRequest, NodeAnalysisResponse
from prompts import GRAPH_PROMPT, NODE_ANALYSIS_PROMPT

load_dotenv()
genai.configure(api_key=os.environ["GEMINI_API_KEY"])
model = genai.GenerativeModel("gemini-1.5-flash")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/analyze", response_model=GraphResponse)
async def analyze(req: AnalyzeRequest):
    prompt = GRAPH_PROMPT.format(text=req.text)
    try:
        response = model.generate_content(prompt)
        data = json.loads(response.text)
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
        response = model.generate_content(prompt)
        data = json.loads(response.text)
        return NodeAnalysisResponse(**data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

---

## Frontend Implementation

### `package.json` (deps only)
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "reactflow": "^11.11.0",
    "d3-force": "^3.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.0",
    "vite": "^5.0.0"
  }
}
```

### `useForceLayout.js`
```js
// hooks/useForceLayout.js
// Isolated here so a top-down (dagre) toggle can be added later
// by swapping this hook without touching GraphCanvas

import { useEffect } from "react";
import { useReactFlow } from "reactflow";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from "d3-force";

export function useForceLayout(nodes, edges, options = {}) {
  const { setNodes } = useReactFlow();
  const { width = 900, height = 600 } = options;

  useEffect(() => {
    if (!nodes.length) return;

    const simNodes = nodes.map((n) => ({ id: n.id, x: width / 2, y: height / 2 }));
    const simEdges = edges.map((e) => ({ source: e.source, target: e.target }));

    const sim = forceSimulation(simNodes)
      .force("link", forceLink(simEdges).id((d) => d.id).distance(160))
      .force("charge", forceManyBody().strength(-400))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collide", forceCollide(80))
      .stop();

    // Run synchronously for initial render (no flicker)
    for (let i = 0; i < 300; i++) sim.tick();

    setNodes((prev) =>
      prev.map((n) => {
        const sim_n = simNodes.find((s) => s.id === n.id);
        return sim_n
          ? { ...n, position: { x: sim_n.x - 75, y: sim_n.y - 25 } }
          : n;
      })
    );
  }, [nodes.length, edges.length]);
}
```

### `ArgumentNode.jsx`
```jsx
// components/ArgumentNode.jsx
import { Handle, Position } from "reactflow";

const TYPE_COLORS = {
  thesis:   { bg: "#0f0f0f", border: "#e2e2e2", label: "#e2e2e2" },
  subclaim: { bg: "#1a1a2e", border: "#7b8cde", label: "#a5b4ff" },
  evidence: { bg: "#0d2b1e", border: "#3ecf8e", label: "#6ee7b7" },
  warrant:  { bg: "#1e1a0d", border: "#d4a017", label: "#fcd34d" },
  rebuttal: { bg: "#2b0d0d", border: "#e05c5c", label: "#fca5a5" },
  axiom:    { bg: "#1a0d2b", border: "#a78bfa", label: "#c4b5fd" },
  fallacy:  { bg: "#2b1a0d", border: "#f97316", label: "#fdba74" },
};

export default function ArgumentNode({ data, selected }) {
  const colors = TYPE_COLORS[data.type] || TYPE_COLORS.subclaim;
  const opacity = 0.5 + data.strength * 0.5; // strength drives visual weight

  return (
    <div
      onClick={() => data.onNodeClick(data)}
      style={{
        background: colors.bg,
        border: `1.5px solid ${colors.border}`,
        borderRadius: 8,
        padding: "10px 14px",
        width: 180,
        cursor: "pointer",
        opacity,
        boxShadow: selected ? `0 0 0 2px ${colors.border}` : "none",
        transition: "box-shadow 0.15s",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: colors.label, marginBottom: 4 }}>
        {data.type}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#f0f0f0", lineHeight: 1.35 }}>
        {data.label}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}
```

### `AnalysisPopup.jsx`
```jsx
// components/AnalysisPopup.jsx
import { useEffect, useState } from "react";

export default function AnalysisPopup({ node, context, onClose }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://localhost:8000/api/analyze-node", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        node_id: node.id,
        label: node.label,
        detail: node.detail,
        type: node.type,
        context,
      }),
    })
      .then((r) => r.json())
      .then((d) => { setAnalysis(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [node.id]);

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.6)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}
      onClick={onClose}
    >
      <div style={{
        background: "#111", border: "1px solid #333", borderRadius: 12,
        padding: 28, maxWidth: 480, width: "90%", color: "#e0e0e0",
      }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "#888", marginBottom: 6 }}>
          {node.type}
        </div>
        <h3 style={{ margin: "0 0 8px", fontSize: 16, color: "#fff" }}>{node.label}</h3>
        <p style={{ fontSize: 13, color: "#aaa", marginBottom: 20, lineHeight: 1.6 }}>{node.detail}</p>

        {loading && <p style={{ color: "#666", fontSize: 13 }}>Analyzing…</p>}

        {analysis && (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                Counterarguments
              </div>
              {analysis.counterarguments.map((c, i) => (
                <p key={i} style={{ fontSize: 13, color: "#d0d0d0", lineHeight: 1.6, marginBottom: 8, paddingLeft: 12, borderLeft: "2px solid #e05c5c" }}>
                  {c}
                </p>
              ))}
            </div>

            {analysis.fallacies.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                  Fallacies
                </div>
                {analysis.fallacies.map((f, i) => (
                  <p key={i} style={{ fontSize: 13, color: "#fdba74", lineHeight: 1.6, marginBottom: 6, paddingLeft: 12, borderLeft: "2px solid #f97316" }}>
                    {f}
                  </p>
                ))}
              </div>
            )}

            <div style={{ borderTop: "1px solid #222", paddingTop: 14 }}>
              <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                Strength — {Math.round(analysis.strength_score * 100)}%
              </div>
              <div style={{ height: 4, background: "#222", borderRadius: 2, marginBottom: 8 }}>
                <div style={{ height: "100%", width: `${analysis.strength_score * 100}%`, background: "#3ecf8e", borderRadius: 2 }} />
              </div>
              <p style={{ fontSize: 13, color: "#aaa", lineHeight: 1.6 }}>{analysis.strength_reasoning}</p>
            </div>
          </>
        )}

        <button onClick={onClose} style={{
          marginTop: 20, background: "none", border: "1px solid #333",
          color: "#888", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12,
        }}>
          Close
        </button>
      </div>
    </div>
  );
}
```

### `GraphCanvas.jsx`
```jsx
// components/GraphCanvas.jsx
import { useCallback, useState } from "react";
import ReactFlow, {
  Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";

import ArgumentNode from "./ArgumentNode";
import AnalysisPopup from "./AnalysisPopup";
import { useForceLayout } from "../hooks/useForceLayout";

const nodeTypes = { argument: ArgumentNode };

const RELATION_COLORS = {
  supports: "#3ecf8e",
  contradicts: "#e05c5c",
  qualifies: "#d4a017",
  assumes: "#a78bfa",
  contains_fallacy: "#f97316",
};

function FlowInner({ initialNodes, initialEdges, originalText }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState(null);

  useForceLayout(nodes, edges);

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, animated: false }, eds)),
    []
  );

  const handleNodeClick = useCallback((nodeData) => {
    setSelectedNode(nodeData);
  }, []);

  // Inject click handler into node data
  const enrichedNodes = nodes.map((n) => ({
    ...n,
    type: "argument",
    data: { ...n.data, onNodeClick: handleNodeClick },
  }));

  const styledEdges = edges.map((e) => ({
    ...e,
    style: { stroke: RELATION_COLORS[e.data?.relation] || "#555", strokeWidth: 1.5 },
    markerEnd: { type: "arrowclosed", color: RELATION_COLORS[e.data?.relation] || "#555" },
  }));

  // Add blank node on double-click canvas
  const onPaneDoubleClick = useCallback((event) => {
    const id = `user-${Date.now()}`;
    const newNode = {
      id,
      type: "argument",
      position: { x: event.clientX - 100, y: event.clientY - 60 },
      data: {
        type: "subclaim",
        label: "New node",
        detail: "",
        strength: 0.5,
        onNodeClick: handleNodeClick,
      },
    };
    setNodes((nds) => [...nds, newNode]);
  }, []);

  return (
    <>
      <ReactFlow
        nodes={enrichedNodes}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={() => {}}
        onDoubleClick={onPaneDoubleClick}
        nodeTypes={nodeTypes}
        fitView
        style={{ background: "#0a0a0a" }}
      >
        <Background color="#1a1a1a" gap={24} />
        <Controls />
        <MiniMap nodeColor={() => "#333"} style={{ background: "#111" }} />
      </ReactFlow>

      {selectedNode && (
        <AnalysisPopup
          node={selectedNode}
          context={originalText}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </>
  );
}

export default function GraphCanvas({ graphData, originalText }) {
  if (!graphData) return null;

  const initialNodes = graphData.nodes.map((n) => ({
    id: n.id,
    type: "argument",
    position: { x: 0, y: 0 }, // force layout sets real positions
    data: { ...n, onNodeClick: () => {} },
  }));

  const initialEdges = graphData.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    data: { relation: e.relation },
  }));

  return (
    <ReactFlowProvider>
      <FlowInner
        initialNodes={initialNodes}
        initialEdges={initialEdges}
        originalText={originalText}
      />
    </ReactFlowProvider>
  );
}
```

### `TextInput.jsx`
```jsx
// components/TextInput.jsx
export default function TextInput({ onSubmit, loading }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(e.target.text.value);
      }}
      style={{ display: "flex", flexDirection: "column", gap: 12, padding: "24px 28px", borderBottom: "1px solid #1e1e1e" }}
    >
      <textarea
        name="text"
        placeholder="Paste any text — a sentence, paragraph, or full essay…"
        rows={4}
        style={{
          background: "#111", border: "1px solid #2a2a2a", borderRadius: 8,
          color: "#e0e0e0", padding: "12px 14px", fontSize: 14,
          resize: "vertical", fontFamily: "inherit", lineHeight: 1.6,
          outline: "none",
        }}
      />
      <button
        type="submit"
        disabled={loading}
        style={{
          alignSelf: "flex-end", background: loading ? "#1e1e1e" : "#e2e2e2",
          color: loading ? "#555" : "#0a0a0a", border: "none", borderRadius: 6,
          padding: "8px 20px", fontSize: 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
          transition: "background 0.15s",
        }}
      >
        {loading ? "Analyzing…" : "Analyze →"}
      </button>
    </form>
  );
}
```

### `App.jsx`
```jsx
import { useState } from "react";
import TextInput from "./components/TextInput";
import GraphCanvas from "./components/GraphCanvas";
import "./App.css";

export default function App() {
  const [graphData, setGraphData] = useState(null);
  const [originalText, setOriginalText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (text) => {
    setLoading(true);
    setError(null);
    setOriginalText(text);
    try {
      const res = await fetch("http://localhost:8000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("Backend error");
      const data = await res.json();
      setGraphData(data);
    } catch (e) {
      setError("Failed to analyze. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0a0a0a", color: "#e0e0e0", fontFamily: "'IBM Plex Mono', monospace" }}>
      <TextInput onSubmit={handleSubmit} loading={loading} />
      {error && <p style={{ color: "#e05c5c", padding: "12px 28px", fontSize: 13 }}>{error}</p>}
      <div style={{ flex: 1 }}>
        {graphData
          ? <GraphCanvas graphData={graphData} originalText={originalText} />
          : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#333", fontSize: 13 }}>
              Graph will appear here
            </div>
          )
        }
      </div>
    </div>
  );
}
```

### `App.css`
```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #root { height: 100%; }
body { background: #0a0a0a; }

/* Scrollbar */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: #111; }
::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }

/* React Flow overrides */
.react-flow__controls button { background: #1a1a1a; border-color: #2a2a2a; color: #888; }
.react-flow__controls button:hover { background: #222; }
.react-flow__minimap { border: 1px solid #1e1e1e; }
```

### `index.html` (add font)
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet">
```

---

## `.env` (backend root)
```
GEMINI_API_KEY=your_key_here
```

---

## Running Locally

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

---

## Future Toggle (not in this draft)
When adding layout toggle, replace `useForceLayout` with a `useLayout(mode)` hook that:
- `mode = "force"` → runs d3-force (current behavior)
- `mode = "hierarchical"` → runs dagre top-down layout

The rest of `GraphCanvas` stays untouched.

---

## Key Design Decisions
1. **Force layout runs synchronously** (300 ticks, `.stop()`) so nodes appear already positioned — no jitter on load.
2. **Node click handler is injected via `data`** so React Flow's custom node stays stateless and re-usable for user-created nodes too.
3. **Edges carry `data.relation`** so color coding works and the relation is available if you later want edge labels.
4. **Double-click on canvas** creates a blank user node — minimal interaction model, no toolbar needed.
5. **`originalText` is threaded through** to the node analysis endpoint so Gemini has full context for counterarguments.