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
4. Setup your environment variables in `.env`:
   ```bash
   OPENAI_API_KEY=your_key_here

   # Optional: For Live Demo Send
   REAL_SEND_ALLOWLIST_PHONE="+1234567890,+0987654321"
   REAL_SEND_ALLOWLIST_EMAIL="test@example.com"
   TWILIO_ACCOUNT_SID=your_sid
   TWILIO_AUTH_TOKEN=your_token
   TWILIO_WHATSAPP_FROM="whatsapp:+14155238886"
   TWILIO_VOICE_FROM="+1234567890"
   SENDGRID_API_KEY=your_sendgrid_key
   SENDGRID_FROM_EMAIL="sender@example.com"
   ```
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
- For the batch processing, WhatsApp, Email, and Card Updater calls are mocked with simulated response rates. No real messaging APIs are called in the batch.
- For the "Live Demo Send", real WhatsApp and Email integrations exist but only send to explicitly allowlisted phone numbers (`REAL_SEND_ALLOWLIST_PHONE`).
- **Security Simplification**: The inbound WhatsApp webhook does not currently verify Twilio request signatures. For this judged demo, we rely strictly on verifying the inbound `From` phone number against our environment allowlist. In production, X-Twilio-Signature verification would be required.

## API Surface
- `POST /batch/run?n=500&seed=42` - Generates a batch, runs the pipeline, and returns aggregate summary.
- `GET /batch/{id}/summary` - Returns aggregate at-risk/recovered metrics and baseline info.
- `GET /dashboard/feed?limit=20` - Returns recent individual events for the live feed.
- `GET /audit/{failure_event_id}` - Returns the full plain-English audit trail.
- `POST /demo/send-real` - Trigger a real-world send to an allowlisted contact.
- `GET /demo/status/{id}` - Poll for the status/outcome of a live demo send.
- `POST /webhooks/whatsapp` - Inbound Twilio webhook for WhatsApp replies.
- `GET /health` - Simple liveness check.
