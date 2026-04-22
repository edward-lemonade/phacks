made for Diamondhacks 2026 by myself

# Argument Map

Hackathon-grade argument mapping: paste text → Gemini extracts a claim graph → React Flow shows it; click nodes for counterargument analysis. Double-click the canvas to add a node; connect nodes by dragging handles.

## Setup

1. **Backend** — Python 3.10+

   ```bash
   cd backend
   python3 -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   # Add GEMINI_API_KEY to backend/.env
   uvicorn main:app --reload
   ```

2. **Frontend** — Next.js (App Router) + TypeScript

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

Open `http://localhost:3000`. The UI calls the API at `http://localhost:8000` by default. To point elsewhere, set `NEXT_PUBLIC_API_URL` in `frontend/.env.local` (e.g. `NEXT_PUBLIC_API_URL=http://localhost:8000`).

## Stack

FastAPI, Google Gemini (`google-genai`), Next.js, React, [`@xyflow/react`](https://www.npmjs.com/package/@xyflow/react) (React Flow 12), d3-force.
