# Cause-Aware Recovery Agent

An intelligent, bounded agent designed for the **Razorpay AI Buildathon (Track 03: AI Revenue Recovery)**.
This project automatically detects failed payments, diagnoses root causes, and executes bounded recovery workflows using a deterministic rules engine and an LLM for specific non-deterministic tasks (classification & copywriting).

## Project Summary
This is a functional, demo-ready hackathon project built for the **Razorpay AI Buildathon (Track 03: AI Revenue Recovery)**. The agent detects failed payments, diagnoses root causes, and executes bounded recovery workflows using a deterministic rules engine. 

## The LLM / Rules-Engine Boundary (Architecture)
To ensure safety and explainability, this project enforces a strict boundary:
1. **The LLM** is ONLY used to classify noisy/unrecognized decline codes into a known category, and to generate the friendly human-facing WhatsApp/Email copy.
2. **The Rules Engine** is a deterministic, plain Python function that decides the timing, channel, and action. It strictly enforces a 7-day grace period, a 3-attempt retry cap, and a 21-day abandonment window. The LLM **never** touches these decisions.

## Setup Instructions

### Prerequisites
- Python 3.9+
- Node.js 18+

### 1. Backend Setup
1. Open a terminal and navigate to the project root.
2. Install dependencies: `pip install -r requirements.txt`
3. Create a `.env` file in the root directory based on the provided `.env` template.
4. Add your OpenAI API key as `OPENAI_API_KEY` in the `.env` file.
5. Start the backend:
   ```bash
   uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
   ```

### 2. Frontend Setup
1. Open a second terminal and navigate to the `frontend/` directory.
2. Install dependencies: `npm install`
3. Start the Vite server:
   ```bash
   npm run dev
   ```
4. Open the provided Local URL (usually `http://localhost:5173`) in your browser.

## Reproducibility
The batch generation uses a seeded RNG (`seed=42`). Running the batch will always produce the exact same 500 events with the identical distributions, retry-counts, and simulated outcomes.

## Known Limitations
- The LLM calls for `generate_nudge_copy` use a fast/cheap model (`gpt-4o-mini`) and will fall back to a hardcoded string if rate-limited.
- WhatsApp, Email, and Card Updater calls are mocked with simulated response rates (0.68, 0.22, 0.55 respectively). No real messaging APIs are called.

## API Surface
- `POST /batch/run?n=500&seed=42` - Generates a batch, runs the pipeline, and returns aggregate summary.
- `GET /batch/{id}/summary` - Returns aggregate at-risk/recovered metrics and baseline info.
- `GET /dashboard/feed?limit=20` - Returns recent individual events for the live feed.
- `GET /audit/{failure_event_id}` - Returns the full plain-English audit trail.
- `GET /health` - Simple liveness check.
