# Cause-Aware Recovery Agent

An intelligent, bounded agent designed for the **Razorpay AI Buildathon (Track 03: AI Revenue Recovery)**.
This project automatically detects failed payments, diagnoses root causes, and executes bounded recovery workflows using a deterministic rules engine and an LLM for specific non-deterministic tasks (classification & copywriting).

## Setup Instructions

### Backend
1. Install dependencies: `pip install -r requirements.txt`
2. Create a `.env` file in the root directory based on the provided `.env` template.
3. The database uses SQLite by default for local development. To use Postgres, update the `DATABASE_URL` in `.env`.
